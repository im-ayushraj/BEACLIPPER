"""Centralized Credit Service for SaaS Credit Accounting, Consumption, and Safety."""
from __future__ import annotations

import json
import time
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session

from clipper.db import (
    get_db_session,
    CreditAccount,
    CreditTransaction,
    CreditRule,
    User,
)


class InsufficientCreditsError(Exception):
    """Raised when a user account has fewer credits than required."""
    def __init__(self, required: float, available: float, message: str = "Insufficient credits for this operation."):
        self.required = required
        self.available = available
        self.message = message
        super().__init__(f"{message} (Required: {required}, Available: {available})")


class CreditService:
    """Provides atomic, idempotent, and thread-safe credit management."""

    DEFAULT_STARTER_CREDITS = 100.0

    @classmethod
    def get_or_create_account(cls, user_id: str, session: Optional[Session] = None) -> CreditAccount:
        """Fetch existing credit account or create one with starter credits."""
        own_session = False
        if session is None:
            session = get_db_session()
            own_session = True

        try:
            account = session.query(CreditAccount).filter_by(user_id=user_id).first()
            if not account:
                user = session.query(User).filter_by(id=user_id).first()
                if not user:
                    user = User(id=user_id)
                    session.add(user)

                account = CreditAccount(
                    user_id=user_id,
                    balance=cls.DEFAULT_STARTER_CREDITS
                )
                session.add(account)
                session.flush()

                # Record welcome allocation transaction
                tx = CreditTransaction(
                    user_id=user_id,
                    type="CREDIT",
                    amount=cls.DEFAULT_STARTER_CREDITS,
                    balance_after=cls.DEFAULT_STARTER_CREDITS,
                    source="PLAN_ALLOCATION",
                    reference_id="welcome_starter_grant",
                    metadata_json=json.dumps({"reason": "Welcome starter credits"})
                )
                session.add(tx)
                session.commit()

                # Sync starter credits to Clerk publicMetadata
                try:
                    from clipper.clerk_service import sync_credits_to_clerk_background
                    sync_credits_to_clerk_background(user_id, cls.DEFAULT_STARTER_CREDITS, "free")
                except Exception:
                    pass
            
            # Refresh and expunge if closing own session
            if own_session:
                session.refresh(account)
                session.expunge(account)
            return account
        finally:
            if own_session:
                session.close()

    @classmethod
    def get_balance(cls, user_id: str) -> float:
        """Get current credit balance for user directly from database with Clerk admin override sync."""
        session = get_db_session()
        try:
            account = session.query(CreditAccount).filter_by(user_id=user_id).first()
            if not account:
                account = cls.get_or_create_account(user_id, session=session)

            # Check Clerk publicMetadata for external admin override
            if user_id and user_id.startswith("user_"):
                try:
                    from clipper.clerk_service import get_clerk_user_metadata
                    meta = get_clerk_user_metadata(user_id)
                    if meta and "credits" in meta:
                        clerk_credits = round(float(meta["credits"]), 2)
                        current_db = round(float(account.balance), 2)
                        # If Clerk metadata has a different value, admin modified it in Clerk Dashboard!
                        if current_db != clerk_credits:
                            diff = clerk_credits - current_db
                            account.balance = clerk_credits
                            tx = CreditTransaction(
                                user_id=user_id,
                                type="CREDIT" if diff > 0 else "DEBIT",
                                amount=abs(round(diff, 2)),
                                balance_after=clerk_credits,
                                source="CLERK_ADMIN_DASHBOARD",
                                reference_id=f"clerk_override_{int(time.time())}",
                                metadata_json=json.dumps({"reason": "Synchronized from Clerk Dashboard edit", "previous_balance": current_db})
                            )
                            session.add(tx)
                            session.commit()
                except Exception:
                    pass

            return round(float(account.balance), 2)
        finally:
            session.close()

    @classmethod
    def estimate_cost(cls, operation: str, duration_seconds: float) -> Dict[str, Any]:
        """
        Calculate credit cost based on configured rules before processing begins.
        Operations: AI_CLIPPER, TRANSCRIPTION
        """
        session = get_db_session()
        try:
            rule = session.query(CreditRule).filter_by(operation=operation.upper(), active=True).first()
            if not rule:
                # Default fallbacks
                if operation.upper() == "AI_CLIPPER":
                    rate = 2.0
                    min_charge = 5.0
                else:
                    rate = 1.0
                    min_charge = 2.0
                max_charge = None
            else:
                rate = float(rule.credits_per_unit)
                min_charge = float(rule.minimum_charge or 1.0)
                max_charge = float(rule.maximum_charge) if rule.maximum_charge else None

            duration_minutes = max(0.0, float(duration_seconds) / 60.0)
            calculated_credits = round(duration_minutes * rate, 2)
            final_credits = max(min_charge, calculated_credits)
            if max_charge is not None:
                final_credits = min(max_charge, final_credits)

            return {
                "operation": operation.upper(),
                "duration_seconds": round(duration_seconds, 2),
                "duration_minutes": round(duration_minutes, 2),
                "credits_per_minute": rate,
                "minimum_charge": min_charge,
                "maximum_charge": max_charge,
                "estimated_credits": round(final_credits, 2)
            }
        finally:
            session.close()

    @classmethod
    def check_balance(cls, user_id: str, required_credits: float) -> bool:
        """Check if user has at least required_credits."""
        balance = cls.get_balance(user_id)
        return balance >= required_credits

    @classmethod
    def reserve_and_consume(
        cls,
        user_id: str,
        amount: float,
        reference_id: str,
        source: str = "AI_CLIPPER",
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Atomically debit credits from user account.
        Idempotent: If reference_id was already debited, returns previous transaction without double-charging.
        """
        if amount <= 0:
            return {"status": "skipped", "amount": 0.0, "balance": cls.get_balance(user_id)}

        session = get_db_session()
        try:
            # 1. Idempotency check: Has this reference_id already been debited?
            existing_tx = session.query(CreditTransaction).filter_by(
                user_id=user_id,
                reference_id=reference_id,
                type="DEBIT"
            ).first()

            if existing_tx:
                account = session.query(CreditAccount).filter_by(user_id=user_id).first()
                return {
                    "status": "already_debited",
                    "transaction_id": existing_tx.id,
                    "amount": existing_tx.amount,
                    "balance": round(account.balance, 2) if account else 0.0,
                    "idempotent": True
                }

            # 2. Lock account row for update
            account = session.query(CreditAccount).filter_by(user_id=user_id).with_for_update().first()
            if not account:
                cls.get_or_create_account(user_id, session=session)
                account = session.query(CreditAccount).filter_by(user_id=user_id).with_for_update().first()

            if account.balance < amount:
                raise InsufficientCreditsError(
                    required=amount,
                    available=round(account.balance, 2),
                    message=f"You need {amount} credits but only have {round(account.balance, 2)}."
                )

            # 3. Deduct balance
            new_balance = round(account.balance - amount, 2)
            account.balance = new_balance

            # 4. Insert audit transaction
            tx = CreditTransaction(
                user_id=user_id,
                type="DEBIT",
                amount=amount,
                balance_after=new_balance,
                source=source,
                reference_id=reference_id,
                metadata_json=json.dumps(metadata or {})
            )
            session.add(tx)
            session.commit()

            # Sync to Clerk metadata
            try:
                from clipper.clerk_service import sync_credits_to_clerk_background
                sync_credits_to_clerk_background(user_id, new_balance)
            except Exception:
                pass

            return {
                "status": "debited",
                "transaction_id": tx.id,
                "amount": amount,
                "balance": new_balance,
                "idempotent": False
            }
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    @classmethod
    def refund_credits(
        cls,
        user_id: str,
        reference_id: str,
        reason: str = "Processing failed",
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Safely refunds credits for a previously debited reference_id.
        Idempotent: Prevents double-refunds if already refunded.
        """
        session = get_db_session()
        try:
            # 1. Check if original debit exists
            original_debit = session.query(CreditTransaction).filter_by(
                user_id=user_id,
                reference_id=reference_id,
                type="DEBIT"
            ).first()

            if not original_debit:
                return None  # Nothing to refund

            # 2. Check if already refunded (prevent double refund)
            existing_refund = session.query(CreditTransaction).filter_by(
                user_id=user_id,
                reference_id=reference_id,
                type="REFUND"
            ).first()

            if existing_refund:
                account = session.query(CreditAccount).filter_by(user_id=user_id).first()
                return {
                    "status": "already_refunded",
                    "transaction_id": existing_refund.id,
                    "amount": existing_refund.amount,
                    "balance": round(account.balance, 2) if account else 0.0,
                    "idempotent": True
                }

            # 3. Lock account and refund
            account = session.query(CreditAccount).filter_by(user_id=user_id).with_for_update().first()
            if not account:
                return None

            refund_amount = original_debit.amount
            new_balance = round(account.balance + refund_amount, 2)
            account.balance = new_balance

            # 4. Insert refund transaction
            refund_meta = metadata or {}
            refund_meta["reason"] = reason
            refund_meta["original_debit_tx"] = original_debit.id

            tx = CreditTransaction(
                user_id=user_id,
                type="REFUND",
                amount=refund_amount,
                balance_after=new_balance,
                source="REFUND",
                reference_id=reference_id,
                metadata_json=json.dumps(refund_meta)
            )
            session.add(tx)
            session.commit()

            # Sync to Clerk metadata
            try:
                from clipper.clerk_service import sync_credits_to_clerk_background
                sync_credits_to_clerk_background(user_id, new_balance)
            except Exception:
                pass

            return {
                "status": "refunded",
                "transaction_id": tx.id,
                "amount": refund_amount,
                "balance": new_balance,
                "idempotent": False
            }
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    @classmethod
    def add_credits(
        cls,
        user_id: str,
        amount: float,
        source: str = "CREDIT_PURCHASE",
        reference_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Credit funds to user account (e.g. top-up, admin grant, monthly allocation)."""
        if amount <= 0:
            raise ValueError("Amount to add must be positive.")

        session = get_db_session()
        try:
            account = session.query(CreditAccount).filter_by(user_id=user_id).with_for_update().first()
            if not account:
                cls.get_or_create_account(user_id, session=session)
                account = session.query(CreditAccount).filter_by(user_id=user_id).with_for_update().first()

            new_balance = round(account.balance + amount, 2)
            account.balance = new_balance

            tx = CreditTransaction(
                user_id=user_id,
                type="CREDIT",
                amount=amount,
                balance_after=new_balance,
                source=source,
                reference_id=reference_id,
                metadata_json=json.dumps(metadata or {})
            )
            session.add(tx)
            session.commit()

            # Sync to Clerk metadata
            try:
                from clipper.clerk_service import sync_credits_to_clerk_background
                sync_credits_to_clerk_background(user_id, new_balance)
            except Exception:
                pass

            return {
                "status": "credited",
                "transaction_id": tx.id,
                "amount": amount,
                "balance": new_balance
            }
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    @classmethod
    def get_transactions(cls, user_id: str, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """Retrieve paginated audit trail of credit transactions for a user."""
        session = get_db_session()
        try:
            txs = session.query(CreditTransaction).filter_by(
                user_id=user_id
            ).order_by(
                CreditTransaction.created_at.desc()
            ).limit(limit).offset(offset).all()

            results = []
            for t in txs:
                meta = {}
                if t.metadata_json:
                    try:
                        meta = json.loads(t.metadata_json)
                    except Exception:
                        pass

                results.append({
                    "id": t.id,
                    "type": t.type,
                    "amount": round(t.amount, 2),
                    "balance_after": round(t.balance_after, 2),
                    "source": t.source,
                    "reference_id": t.reference_id,
                    "metadata": meta,
                    "created_at": t.created_at.isoformat() if t.created_at else None
                })
            return results
        finally:
            session.close()

    @classmethod
    def admin_adjust_credits(
        cls,
        user_id: str,
        amount: float,
        action: str = "add",  # "add", "deduct", "set"
        reason: str = "Admin manual adjustment"
    ) -> Dict[str, Any]:
        """Manually adjust credits for a user (Admin operation)."""
        session = get_db_session()
        try:
            account = session.query(CreditAccount).filter_by(user_id=user_id).with_for_update().first()
            if not account:
                cls.get_or_create_account(user_id, session=session)
                account = session.query(CreditAccount).filter_by(user_id=user_id).with_for_update().first()

            old_balance = float(account.balance)
            if action == "add":
                new_balance = round(old_balance + float(amount), 2)
                tx_type = "CREDIT"
                tx_amount = float(amount)
            elif action == "deduct":
                new_balance = max(0.0, round(old_balance - float(amount), 2))
                tx_type = "DEBIT"
                tx_amount = float(amount)
            elif action == "set":
                new_balance = round(float(amount), 2)
                diff = new_balance - old_balance
                tx_type = "CREDIT" if diff >= 0 else "DEBIT"
                tx_amount = abs(round(diff, 2))
            else:
                raise ValueError(f"Unknown action: {action}. Must be 'add', 'deduct', or 'set'.")

            account.balance = new_balance

            tx = CreditTransaction(
                user_id=user_id,
                type=tx_type,
                amount=tx_amount,
                balance_after=new_balance,
                source="ADMIN_ADJUSTMENT",
                reference_id=f"admin_{int(time.time())}",
                metadata_json=json.dumps({"reason": reason, "previous_balance": old_balance})
            )
            session.add(tx)
            session.commit()

            # Sync to Clerk metadata
            try:
                from clipper.clerk_service import sync_credits_to_clerk_background
                sync_credits_to_clerk_background(user_id, new_balance)
            except Exception:
                pass

            return {
                "user_id": user_id,
                "previous_balance": old_balance,
                "new_balance": new_balance,
                "adjusted_by": tx_amount,
                "action": action,
                "reason": reason
            }
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

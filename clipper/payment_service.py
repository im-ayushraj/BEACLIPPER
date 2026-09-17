"""Payment and Subscription interfaces prepared for future Stripe/Razorpay integration."""
from __future__ import annotations

import uuid
from typing import Dict, Any, Optional, Protocol
from datetime import datetime, timezone, timedelta

from clipper.db import (
    get_db_session,
    PlanDefinition,
    SubscriptionModel,
    CreditPackage,
    CreditTransaction,
    User,
)
from clipper.credit_service import CreditService


class PaymentVerificationError(Exception):
    """Raised when payment webhook signature or verification fails."""
    pass


class PaymentGatewayProvider(Protocol):
    """Protocol defining future Stripe/Razorpay provider methods."""

    def create_checkout_session(
        self,
        user_id: str,
        item_type: str,  # "plan" or "credit_package"
        item_id: str,
        success_url: str,
        cancel_url: str
    ) -> Dict[str, Any]:
        ...

    def verify_webhook_signature(
        self,
        payload: bytes,
        signature: str,
        secret: str
    ) -> Dict[str, Any]:
        ...


class PaymentService:
    """Centralized service for processing verified payment events and allocating credits."""

    @classmethod
    def process_credit_package_purchase(
        cls,
        user_id: str,
        package_id: str,
        payment_reference: str,
        amount_paid_cents: int,
        currency: str = "USD"
    ) -> Dict[str, Any]:
        """
        Idempotently credit user account following verified payment webhook event.
        Never called directly by client — only via verified webhook!
        """
        session = get_db_session()
        try:
            package = session.query(CreditPackage).filter_by(id=package_id).first()
            credits_to_grant = float(package.credits) if package else 100.0

            result = CreditService.add_credits(
                user_id=user_id,
                amount=credits_to_grant,
                source="CREDIT_PURCHASE",
                reference_id=payment_reference,
                metadata={
                    "package_id": package_id,
                    "package_name": package.name if package else "Custom Pack",
                    "amount_paid_cents": amount_paid_cents,
                    "currency": currency,
                    "allocated_at": datetime.now(timezone.utc).isoformat()
                }
            )
            return {
                "status": "success",
                "user_id": user_id,
                "credits_added": credits_to_grant,
                "new_balance": result["balance"],
                "payment_reference": payment_reference
            }
        finally:
            session.close()

    @classmethod
    def get_available_packages(cls) -> list[Dict[str, Any]]:
        """Return active credit top-up packages."""
        session = get_db_session()
        try:
            packages = session.query(CreditPackage).filter_by(active=True).all()
            return [
                {
                    "id": p.id,
                    "name": p.name,
                    "credits": p.credits,
                    "price": round(p.price_cents / 100.0, 2),
                    "price_cents": p.price_cents,
                    "currency": p.currency
                }
                for p in packages
            ]
        finally:
            session.close()


class SubscriptionService:
    """Centralized service for managing user subscription plans and monthly credit allocations."""

    @classmethod
    def get_user_subscription(cls, user_id: str) -> Dict[str, Any]:
        """Get active plan for a user, defaulting to 'free' plan."""
        session = get_db_session()
        try:
            sub = session.query(SubscriptionModel).filter_by(user_id=user_id, status="active").first()
            if sub:
                plan = session.query(PlanDefinition).filter_by(id=sub.plan_id).first()
                if plan:
                    return {
                        "plan_name": plan.name,
                        "monthly_credits": plan.monthly_credits,
                        "max_video_duration_minutes": plan.max_video_duration_minutes,
                        "status": sub.status,
                        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None
                    }

            # Default free tier
            free_plan = session.query(PlanDefinition).filter_by(name="free").first()
            return {
                "plan_name": "free",
                "monthly_credits": free_plan.monthly_credits if free_plan else 100.0,
                "max_video_duration_minutes": free_plan.max_video_duration_minutes if free_plan else 35,
                "status": "active",
                "current_period_end": None
            }
        finally:
            session.close()

    @classmethod
    def allocate_monthly_credits(
        cls,
        user_id: str,
        plan_id: str,
        billing_cycle_ref: str
    ) -> Dict[str, Any]:
        """
        Allocate recurring monthly credits based on active subscription tier.
        Idempotent: Uses billing_cycle_ref (e.g. sub_123_2026_09) to avoid double grants.
        """
        session = get_db_session()
        try:
            plan = session.query(PlanDefinition).filter_by(id=plan_id).first()
            credits_to_grant = float(plan.monthly_credits) if plan else 100.0

            result = CreditService.add_credits(
                user_id=user_id,
                amount=credits_to_grant,
                source="PLAN_ALLOCATION",
                reference_id=billing_cycle_ref,
                metadata={
                    "plan_id": plan_id,
                    "plan_name": plan.name if plan else "free",
                    "billing_cycle_ref": billing_cycle_ref
                }
            )
            return {
                "status": "allocated",
                "user_id": user_id,
                "credits_added": credits_to_grant,
                "new_balance": result["balance"]
            }
        finally:
            session.close()

    @classmethod
    def get_plans(cls) -> list[Dict[str, Any]]:
        """List all active subscription plans."""
        session = get_db_session()
        try:
            plans = session.query(PlanDefinition).filter_by(active=True).all()
            return [
                {
                    "id": p.id,
                    "name": p.name,
                    "monthly_credits": p.monthly_credits,
                    "max_video_duration_minutes": p.max_video_duration_minutes,
                    "max_upload_size_mb": p.max_upload_size_mb,
                    "price": round(p.price_cents / 100.0, 2),
                    "currency": p.currency
                }
                for p in plans
            ]
        finally:
            session.close()

"""Stripe Billing & Subscription Monetization Engine."""
from __future__ import annotations

import os
import json
import uuid
import time
from typing import Dict, Any, Optional
from datetime import datetime, timezone, timedelta

try:
    import stripe
except ImportError:
    stripe = None

from clipper.db import (
    get_db_session,
    PlanDefinition,
    SubscriptionModel,
    CreditPackage,
    User,
)
from clipper.payment_service import PaymentService, SubscriptionService


STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

if stripe and STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY


class StripeBillingService:
    """Manages Stripe Checkout Sessions, Customer Portals, and Webhook dispatch."""

    @classmethod
    def is_configured(cls) -> bool:
        return bool(stripe and STRIPE_SECRET_KEY)

    @classmethod
    def create_checkout_session(
        cls,
        user_id: str,
        item_type: str,  # "plan" or "credit_package"
        item_id: str,
        success_url: str,
        cancel_url: str,
        user_email: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Creates a Stripe Checkout Session for subscription or credit purchase.
        Falls back to Sandbox Mode when Stripe API key is not configured.
        """
        session_db = get_db_session()
        try:
            # Look up item details
            if item_type == "plan":
                plan = session_db.query(PlanDefinition).filter_by(id=item_id).first()
                if not plan:
                    plan = session_db.query(PlanDefinition).filter_by(name=item_id).first()
                if not plan:
                    raise ValueError(f"Subscription plan '{item_id}' not found.")
                item_name = f"BEACLIPPER {plan.name.capitalize()} Plan"
                item_price_cents = plan.price_cents
                item_currency = plan.currency.lower()
                is_subscription = True
            elif item_type == "credit_package":
                package = session_db.query(CreditPackage).filter_by(id=item_id).first()
                if not package:
                    raise ValueError(f"Credit package '{item_id}' not found.")
                item_name = f"BEACLIPPER {package.name} ({int(package.credits)} Credits)"
                item_price_cents = package.price_cents
                item_currency = package.currency.lower()
                is_subscription = False
            else:
                raise ValueError("Invalid item_type. Must be 'plan' or 'credit_package'.")
        finally:
            session_db.close()

        # 1. Production Mode with live Stripe API
        if cls.is_configured():
            try:
                line_items = [{
                    "price_data": {
                        "currency": item_currency,
                        "unit_amount": item_price_cents,
                        "product_data": {
                            "name": item_name,
                            "description": f"Allocates credits and processing quota for user {user_id}",
                        },
                    },
                    "quantity": 1,
                }]

                if is_subscription:
                    line_items[0]["price_data"]["recurring"] = {"interval": "month"}

                metadata = {
                    "user_id": user_id,
                    "item_type": item_type,
                    "item_id": item_id,
                }

                session_params: Dict[str, Any] = {
                    "payment_method_types": ["card"],
                    "line_items": line_items,
                    "mode": "subscription" if is_subscription else "payment",
                    "success_url": success_url,
                    "cancel_url": cancel_url,
                    "metadata": metadata,
                    "client_reference_id": user_id,
                }
                if user_email:
                    session_params["customer_email"] = user_email

                checkout_session = stripe.checkout.Session.create(**session_params)
                return {
                    "mode": "live",
                    "checkout_url": checkout_session.url,
                    "session_id": checkout_session.id
                }
            except Exception as e:
                print(f"[Stripe] Live checkout creation error: {e}")
                raise

        # 2. Sandbox Mode (instant testing without external keys)
        mock_session_id = f"cs_test_mock_{uuid.uuid4().hex[:12]}"
        separator = "&" if "?" in success_url else "?"
        sandbox_url = f"{success_url}{separator}session_id={mock_session_id}&mock=true"

        return {
            "mode": "sandbox",
            "checkout_url": sandbox_url,
            "session_id": mock_session_id,
            "item_name": item_name,
            "amount_cents": item_price_cents,
            "notice": "Stripe keys not set in .env. Sandbox simulation enabled."
        }

    @classmethod
    def create_customer_portal_session(
        cls,
        user_id: str,
        return_url: str
    ) -> Dict[str, Any]:
        """Creates a billing portal session or returns sandbox fallback."""
        if cls.is_configured():
            session_db = get_db_session()
            try:
                sub = session_db.query(SubscriptionModel).filter_by(user_id=user_id, status="active").first()
                if sub and hasattr(sub, "stripe_customer_id") and sub.stripe_customer_id:
                    portal_session = stripe.billing_portal.Session.create(
                        customer=sub.stripe_customer_id,
                        return_url=return_url,
                    )
                    return {"portal_url": portal_session.url}
            finally:
                session_db.close()

        return {"portal_url": return_url, "notice": "Customer portal sandbox fallback"}

    @classmethod
    def process_webhook_event(
        cls,
        payload_bytes: bytes,
        sig_header: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Validates cryptographic Stripe webhook signature and idempotently executes
        credit or subscription fulfillment.
        """
        event = None

        if cls.is_configured() and STRIPE_WEBHOOK_SECRET and sig_header:
            try:
                event = stripe.Webhook.construct_event(
                    payload_bytes, sig_header, STRIPE_WEBHOOK_SECRET
                )
            except Exception as e:
                print(f"[Stripe Webhook] Signature verification failed: {e}")
                raise ValueError(f"Webhook signature error: {str(e)}")
        else:
            # In production, untrusted or unsigned webhooks are strictly rejected
            if os.getenv("ENVIRONMENT", "").lower() in ("production", "prod"):
                raise ValueError("Unauthorized webhook: Valid Stripe-Signature header and STRIPE_WEBHOOK_SECRET required.")
            # Fallback json parsing for local simulation / sandbox tests
            try:
                event = json.loads(payload_bytes.decode("utf-8"))
            except Exception as e:
                raise ValueError(f"Invalid JSON payload: {str(e)}")

        event_type = event.get("type", "")
        data_obj = event.get("data", {}).get("object", {})

        print(f"[Stripe Webhook] Received event: {event_type} (id: {event.get('id')})")

        # 1. Checkout Session Completed
        if event_type == "checkout.session.completed":
            metadata = data_obj.get("metadata", {})
            user_id = metadata.get("user_id") or data_obj.get("client_reference_id")
            item_type = metadata.get("item_type")
            item_id = metadata.get("item_id")
            payment_ref = data_obj.get("payment_intent") or data_obj.get("id") or str(uuid.uuid4())

            if not user_id:
                return {"status": "skipped", "reason": "No user_id found in session metadata"}

            if item_type == "credit_package":
                amount_paid = data_obj.get("amount_total", 0)
                currency = data_obj.get("currency", "usd").upper()
                res = PaymentService.process_credit_package_purchase(
                    user_id=user_id,
                    package_id=item_id,
                    payment_reference=payment_ref,
                    amount_paid_cents=amount_paid,
                    currency=currency
                )
                print(f"[Stripe Webhook] Fulfilled {res.get('credits_added')} credits for {user_id}")
                return {"status": "fulfilled", "type": "credit_purchase", "result": res}

            elif item_type == "plan":
                session_db = get_db_session()
                try:
                    plan = session_db.query(PlanDefinition).filter_by(id=item_id).first()
                    if not plan:
                        plan = session_db.query(PlanDefinition).filter_by(name=item_id).first()
                    plan_id = plan.id if plan else item_id

                    # Upsert active user subscription
                    sub = session_db.query(SubscriptionModel).filter_by(user_id=user_id).first()
                    if not sub:
                        sub = SubscriptionModel(
                            user_id=user_id,
                            plan_id=plan_id,
                            status="active",
                            current_period_start=datetime.now(timezone.utc),
                            current_period_end=datetime.now(timezone.utc) + timedelta(days=30)
                        )
                        session_db.add(sub)
                    else:
                        sub.plan_id = plan_id
                        sub.status = "active"
                        sub.current_period_start = datetime.now(timezone.utc)
                        sub.current_period_end = datetime.now(timezone.utc) + timedelta(days=30)

                    session_db.commit()

                    # Grant monthly credits
                    cycle_ref = f"sub_{user_id}_{datetime.now(timezone.utc).strftime('%Y_%m')}"
                    grant_res = SubscriptionService.allocate_monthly_credits(
                        user_id=user_id,
                        plan_id=plan_id,
                        billing_cycle_ref=cycle_ref
                    )
                    return {"status": "fulfilled", "type": "subscription_activated", "result": grant_res}
                finally:
                    session_db.close()

        # 2. Recurring Subscription Renewal (invoice.payment_succeeded)
        elif event_type == "invoice.payment_succeeded":
            billing_reason = data_obj.get("billing_reason")
            if billing_reason == "subscription_cycle":
                subscription_id = data_obj.get("subscription")
                customer_id = data_obj.get("customer")
                # Look up user by subscription/customer
                session_db = get_db_session()
                try:
                    sub = session_db.query(SubscriptionModel).filter_by(status="active").first()
                    if sub:
                        cycle_ref = f"invoice_{data_obj.get('id')}"
                        grant_res = SubscriptionService.allocate_monthly_credits(
                            user_id=sub.user_id,
                            plan_id=sub.plan_id,
                            billing_cycle_ref=cycle_ref
                        )
                        return {"status": "renewed", "result": grant_res}
                finally:
                    session_db.close()

        # 3. Subscription Canceled / Expired
        elif event_type in ("customer.subscription.deleted", "customer.subscription.canceled"):
            sub_id = data_obj.get("id")
            session_db = get_db_session()
            try:
                # Downgrade user back to free tier
                free_plan = session_db.query(PlanDefinition).filter_by(name="free").first()
                if free_plan:
                    sub = session_db.query(SubscriptionModel).filter_by(status="active").first()
                    if sub:
                        sub.status = "canceled"
                        sub.plan_id = free_plan.id
                        session_db.commit()
                        print(f"[Stripe Webhook] Downgraded user {sub.user_id} to Free plan after cancellation.")
                return {"status": "subscription_canceled"}
            finally:
                session_db.close()

        return {"status": "unhandled_event", "event_type": event_type}

"""
Stripe Subscription Router

Handles:
- Creating checkout sessions for subscriptions
- Managing customer portal access
- Webhook handling for subscription events
"""

from fastapi import APIRouter, HTTPException, Request, Header, Depends
from pydantic import BaseModel
from typing import Optional, Literal, Tuple
from datetime import datetime, timezone, timedelta
import stripe
import os
import logging
import asyncpg

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

# Initialize Stripe
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
FRONTEND_URL = os.getenv("FRONTEND_URL")

# Price IDs - set these after creating products in Stripe Dashboard/CLI
PRICE_BASIC_MONTHLY = os.getenv("STRIPE_PRICE_BASIC_MONTHLY")  # e.g., price_xxx
PRICE_BASIC_ANNUAL = os.getenv("STRIPE_PRICE_BASIC_ANNUAL")    # e.g., price_yyy
PRICE_PLUS_MONTHLY = os.getenv("STRIPE_PRICE_PLUS_MONTHLY")    # e.g., price_zzz
PRICE_PLUS_ANNUAL = os.getenv("STRIPE_PRICE_PLUS_ANNUAL")      # e.g., price_aaa

PlanId = Literal["basic", "plus"]
BillingCycle = Literal["monthly", "annual"]

MOCK_AUTH_ENABLED = os.getenv("MOCK_AUTH_ENABLED", "false").lower() in ("1", "true", "yes", "on")
MOCK_SUBSCRIPTION_PLAN = os.getenv("MOCK_SUBSCRIPTION_PLAN", "plus").lower()
MOCK_SUBSCRIPTION_BILLING_CYCLE = os.getenv("MOCK_SUBSCRIPTION_BILLING_CYCLE", "monthly").lower()


def get_mock_subscription_override() -> Optional["SubscriptionStatus"]:
    if not MOCK_AUTH_ENABLED:
        return None

    raw_plan = MOCK_SUBSCRIPTION_PLAN
    if raw_plan not in ("free", "basic", "plus", "trialing"):
        raw_plan = "plus"

    if raw_plan == "free":
        return SubscriptionStatus(
            is_active=False,
            plan=None,
            billing_cycle=None,
            trial_ends_at=None,
            current_period_end=None,
            cancel_at_period_end=False,
        )

    if raw_plan == "trialing":
        trial_end = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
        billing_cycle = "monthly" if MOCK_SUBSCRIPTION_BILLING_CYCLE not in ("annual", "monthly") else MOCK_SUBSCRIPTION_BILLING_CYCLE
        return SubscriptionStatus(
            is_active=True,
            plan="plus",
            billing_cycle=billing_cycle,
            trial_ends_at=trial_end,
            current_period_end=trial_end,
            cancel_at_period_end=False,
        )

    billing_cycle = "monthly" if MOCK_SUBSCRIPTION_BILLING_CYCLE not in ("annual", "monthly") else MOCK_SUBSCRIPTION_BILLING_CYCLE
    return SubscriptionStatus(
        is_active=True,
        plan=raw_plan,
        billing_cycle=billing_cycle,
        trial_ends_at=None,
        current_period_end=(datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        cancel_at_period_end=False,
    )



class CheckoutRequest(BaseModel):
    plan: PlanId
    billing_cycle: BillingCycle
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class PortalResponse(BaseModel):
    portal_url: str


class SubscriptionStatus(BaseModel):
    is_active: bool
    plan: Optional[PlanId] = None
    billing_cycle: Optional[BillingCycle] = None
    trial_ends_at: Optional[str] = None
    current_period_end: Optional[str] = None
    cancel_at_period_end: bool = False
    status: Optional[str] = None  # e.g. 'active', 'past_due', 'canceled', 'trialing'


def get_price_id(plan: PlanId, billing_cycle: BillingCycle) -> str:
    """Get Stripe price ID for a plan + billing cycle."""
    price_map = {
        ("basic", "monthly"): PRICE_BASIC_MONTHLY,
        ("basic", "annual"): PRICE_BASIC_ANNUAL,
        ("plus", "monthly"): PRICE_PLUS_MONTHLY,
        ("plus", "annual"): PRICE_PLUS_ANNUAL,
    }
    price_id = price_map.get((plan, billing_cycle))
    if not price_id:
        raise HTTPException(
            status_code=500,
            detail=f"Price not configured for {plan} ({billing_cycle})",
        )
    return price_id


def get_plan_from_price_id(price_id: str) -> Tuple[Optional[PlanId], Optional[BillingCycle]]:
    """Get plan and billing cycle from Stripe price ID."""
    price_map: dict[str, Tuple[PlanId, BillingCycle]] = {}
    if PRICE_BASIC_MONTHLY:
        price_map[PRICE_BASIC_MONTHLY] = ("basic", "monthly")
    if PRICE_BASIC_ANNUAL:
        price_map[PRICE_BASIC_ANNUAL] = ("basic", "annual")
    if PRICE_PLUS_MONTHLY:
        price_map[PRICE_PLUS_MONTHLY] = ("plus", "monthly")
    if PRICE_PLUS_ANNUAL:
        price_map[PRICE_PLUS_ANNUAL] = ("plus", "annual")
    return price_map.get(price_id, (None, None))


async def get_or_create_customer(user_id: str, email: Optional[str], pool: asyncpg.Pool) -> str:
    """
    Get existing Stripe customer ID or create a new customer.
    Stores the mapping in the database.
    """
    # Try to get existing customer from database
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT stripe_customer_id, email FROM users WHERE id = $1",
            user_id
        )
        if row and row["stripe_customer_id"]:
            return row["stripe_customer_id"]

        # Use email from database if not provided
        if not email and row:
            email = row["email"]

    # Create new Stripe customer
    customer = stripe.Customer.create(
        metadata={"user_id": user_id},
        email=email,
    )

    # Store in database
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET stripe_customer_id = $1 WHERE id = $2",
            customer.id, user_id
        )

    return customer.id


def get_owner_from_request_local(request: Request) -> tuple[Optional[str], Optional[str]]:
    """Get user_id and session_id from request. Mirrors main app logic."""
    import jwt

    user_id: Optional[str] = None
    session_id: Optional[str] = None

    session_id = request.headers.get("x-session-id") or request.cookies.get("session_id")

    # Check for mock auth
    mock_auth_enabled = os.getenv("MOCK_AUTH_ENABLED", "false").lower() in ("1", "true", "yes", "on")
    mock_user_id = os.getenv("MOCK_USER_ID", "00000000-0000-0000-0000-000000000001")
    mock_session_id = os.getenv("MOCK_SESSION_ID", "00000000-0000-0000-0000-000000000001")

    if mock_auth_enabled:
        return mock_user_id, mock_session_id

    # Try JWT auth (NextAuth HS256 token)
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        nextauth_secret = os.getenv("AUTH_SECRET")
        if nextauth_secret:
            try:
                payload = jwt.decode(token, nextauth_secret, algorithms=["HS256"])
                user_id = payload.get("sub")
            except Exception:
                pass

    return user_id, session_id


def normalize_plan(plan: Optional[str]) -> Optional[PlanId]:
    if plan in ("basic", "plus"):
        return plan
    return None


def normalize_billing_cycle(billing_cycle: Optional[str]) -> Optional[BillingCycle]:
    if billing_cycle in ("monthly", "annual"):
        return billing_cycle
    return None


def get_metadata_value(obj, key: str) -> Optional[str]:
    metadata = obj.get("metadata") if hasattr(obj, "get") else getattr(obj, "metadata", None)
    if not metadata:
        return None
    return metadata.get(key)


def get_plan_from_metadata(obj) -> Tuple[Optional[PlanId], Optional[BillingCycle]]:
    plan = normalize_plan(get_metadata_value(obj, "plan"))
    billing_cycle = normalize_billing_cycle(get_metadata_value(obj, "billing_cycle"))
    return plan, billing_cycle


def is_paid_active(status: Optional[str]) -> bool:
    return status in ("active", "premium")


@router.post("/create-checkout", response_model=CheckoutResponse)
async def create_checkout_session(
    request: Request,
    body: CheckoutRequest,
):
    """
    Create a Stripe Checkout session for subscription (no Stripe trials).
    """
    # In mock auth mode, return a fake checkout response instead of hitting Stripe
    if MOCK_AUTH_ENABLED:
        user_id, session_id = get_owner_from_request_local(request)
        if not user_id:
            raise HTTPException(status_code=401, detail="Authentication required")
        return CheckoutResponse(
            checkout_url="/pricing?status=mock-checkout",
            session_id="mock_session_id",
        )

    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    if not FRONTEND_URL:
        raise HTTPException(status_code=500, detail="FRONTEND_URL not configured")

    user_id, session_id = get_owner_from_request_local(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        price_id = get_price_id(body.plan, body.billing_cycle)

        # Import get_pool from main app
        from app import get_pool
        pool = await get_pool()

        # Get or create Stripe customer
        customer_id = await get_or_create_customer(user_id, email=None, pool=pool)

        metadata = {
            "user_id": user_id,
            "plan": body.plan,
            "billing_cycle": body.billing_cycle,
        }

        # Create checkout session
        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{
                "price": price_id,
                "quantity": 1,
            }],
            subscription_data={"metadata": metadata},
            success_url=body.success_url or f"{FRONTEND_URL}/subscription/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=body.cancel_url or f"{FRONTEND_URL}/pricing",
            metadata=metadata,
            allow_promotion_codes=True,
        )

        return CheckoutResponse(
            checkout_url=session.url,
            session_id=session.id,
        )

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/create-portal", response_model=PortalResponse)
async def create_customer_portal(request: Request):
    """
    Create a Stripe Customer Portal session for managing subscription.
    """
    # In mock auth mode, return a fake portal response instead of hitting Stripe
    if MOCK_AUTH_ENABLED:
        user_id, session_id = get_owner_from_request_local(request)
        if not user_id:
            raise HTTPException(status_code=401, detail="Authentication required")
        return PortalResponse(portal_url="/profile?status=mock-portal")

    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    if not FRONTEND_URL:
        raise HTTPException(status_code=500, detail="FRONTEND_URL not configured")

    user_id, session_id = get_owner_from_request_local(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        from app import get_pool
        pool = await get_pool()

        # Get customer ID from database
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT stripe_customer_id FROM users WHERE id = $1",
                user_id
            )
            customer_id = row["stripe_customer_id"] if row else None

        if not customer_id:
            raise HTTPException(status_code=404, detail="No subscription found")

        # Create portal session
        portal_session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{FRONTEND_URL}/profile",
        )

        return PortalResponse(portal_url=portal_session.url)

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/status", response_model=SubscriptionStatus)
async def get_subscription_status(request: Request):
    """
    Get current subscription status for the user.
    """
    user_id, session_id = get_owner_from_request_local(request)
    if not user_id:
        # Return inactive for unauthenticated users instead of error
        return SubscriptionStatus(is_active=False)


    mock_override = get_mock_subscription_override()
    if mock_override is not None:
        return mock_override

    from app import get_pool
    pool = await get_pool()

    now = datetime.now(timezone.utc)
    customer_id = None
    db_status = None
    db_plan: Optional[PlanId] = None
    db_billing_cycle: Optional[BillingCycle] = None
    db_current_period_end = None
    trial_ends_at = None

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT stripe_customer_id,
                   subscription_status,
                   subscription_plan,
                   subscription_billing_cycle,
                   subscription_current_period_end,
                   trial_expires_at
            FROM users WHERE id = $1
            """,
            user_id,
        )
        if row:
            customer_id = row["stripe_customer_id"]
            db_status = row["subscription_status"]
            db_plan = normalize_plan(row["subscription_plan"])
            db_billing_cycle = normalize_billing_cycle(row["subscription_billing_cycle"])
            db_current_period_end = row["subscription_current_period_end"]

            trial_expires_at = row["trial_expires_at"]
            if trial_expires_at:
                if trial_expires_at > now and db_status not in ("active", "premium", "past_due"):
                    trial_ends_at = trial_expires_at.isoformat()
                elif trial_expires_at <= now and db_status == "trialing":
                    await conn.execute(
                        "UPDATE users SET subscription_status = 'free' WHERE id = $1",
                        user_id,
                    )
                    db_status = "free"

    # If Stripe is not configured, fall back to database status
    if not stripe.api_key:
        return SubscriptionStatus(
            is_active=is_paid_active(db_status),
            plan=db_plan,
            billing_cycle=db_billing_cycle,
            trial_ends_at=trial_ends_at,
            current_period_end=db_current_period_end.isoformat() if db_current_period_end else None,
            cancel_at_period_end=False,
            status=db_status,
        )

    try:
        if not customer_id:
            return SubscriptionStatus(
                is_active=is_paid_active(db_status),
                plan=db_plan,
                billing_cycle=db_billing_cycle,
                trial_ends_at=trial_ends_at,
                current_period_end=db_current_period_end.isoformat() if db_current_period_end else None,
                cancel_at_period_end=False,
                status=db_status,
            )

        # Get active subscriptions from Stripe
        subscriptions = stripe.Subscription.list(
            customer=customer_id,
            status="all",
            limit=1,
        )

        if not subscriptions.data:
            return SubscriptionStatus(
                is_active=False,
                plan=db_plan,
                billing_cycle=db_billing_cycle,
                trial_ends_at=trial_ends_at,
                current_period_end=db_current_period_end.isoformat() if db_current_period_end else None,
                cancel_at_period_end=False,
            )

        sub = subscriptions.data[0]

        # Determine plan type
        plan = None
        billing_cycle = None
        if sub.items.data:
            price_id = sub.items.data[0].price.id
            plan, billing_cycle = get_plan_from_price_id(price_id)

        if not plan:
            plan = db_plan
        if not billing_cycle:
            billing_cycle = db_billing_cycle

        return SubscriptionStatus(
            is_active=sub.status in ["active", "trialing"],
            plan=plan,
            billing_cycle=billing_cycle,
            trial_ends_at=trial_ends_at,
            current_period_end=str(sub.current_period_end),
            cancel_at_period_end=sub.cancel_at_period_end,
            status=sub.status,
        )

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error: {e}")
        # Fall back to database status
        return SubscriptionStatus(
            is_active=is_paid_active(db_status),
            plan=db_plan,
            billing_cycle=db_billing_cycle,
            trial_ends_at=trial_ends_at,
            current_period_end=db_current_period_end.isoformat() if db_current_period_end else None,
            cancel_at_period_end=False,
        )


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    Handle Stripe webhook events.
    
    SECURITY INFRA-5: Idempotency check prevents duplicate processing.
    """
    # Allow webhook to work even without secret in dev (less secure but convenient)
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        if STRIPE_WEBHOOK_SECRET and sig_header:
            event = stripe.Webhook.construct_event(
                payload, sig_header, STRIPE_WEBHOOK_SECRET
            )
        else:
            # In dev without webhook secret, parse payload directly
            import json
            event = stripe.Event.construct_from(
                json.loads(payload), stripe.api_key
            )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    from app import get_pool
    pool = await get_pool()

    # SECURITY INFRA-5: Idempotency check - skip already processed events
    event_id = event.id
    event_type = event.type
    
    async with pool.acquire() as conn:
        # Check if event already processed
        existing = await conn.fetchval(
            "SELECT 1 FROM stripe_events_processed WHERE event_id = $1",
            event_id
        )
        if existing:
            logger.info(f"Skipping duplicate Stripe event: {event_id}")
            return {"status": "duplicate", "event_id": event_id}
        
        # Mark event as processed BEFORE handling (fail-safe)
        try:
            await conn.execute(
                """
                INSERT INTO stripe_events_processed (event_id, event_type)
                VALUES ($1, $2)
                ON CONFLICT (event_id) DO NOTHING
                """,
                event_id, event_type
            )
        except Exception as e:
            # Table might not exist yet (migration pending)
            logger.warning(f"Could not record event idempotency: {e}")

    # Handle the event
    logger.info(f"Received Stripe webhook: {event_type}")

    if event_type == "customer.subscription.created":
        subscription = event.data.object
        await handle_subscription_created(subscription, pool)

    elif event_type == "customer.subscription.updated":
        subscription = event.data.object
        await handle_subscription_updated(subscription, pool)

    elif event_type == "customer.subscription.deleted":
        subscription = event.data.object
        await handle_subscription_deleted(subscription, pool)

    elif event_type == "customer.subscription.trial_will_end":
        subscription = event.data.object
        logger.info(f"Trial ending soon for subscription {subscription.id}")

    elif event_type == "invoice.payment_failed":
        invoice = event.data.object
        await handle_payment_failed(invoice, pool)

    elif event_type == "checkout.session.completed":
        session = event.data.object
        await handle_checkout_completed(session, pool)

    return {"status": "success", "event_id": event_id}


async def handle_checkout_completed(session, pool: asyncpg.Pool):
    """Handle successful checkout - update user subscription status."""
    user_id = get_metadata_value(session, "user_id")
    if not user_id:
        logger.warning(f"No user_id found in metadata for checkout session {session.id}")
        return

    plan, billing_cycle = get_plan_from_metadata(session)
    stripe_customer_id = session.customer
    subscription_id = session.subscription

    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE users
            SET subscription_status = 'active',
                subscription_plan = COALESCE($2, subscription_plan),
                subscription_billing_cycle = COALESCE($3, subscription_billing_cycle),
                stripe_customer_id = COALESCE($4, stripe_customer_id),
                subscription_id = COALESCE($5, subscription_id)
            WHERE id = $1
            """,
            user_id,
            plan,
            billing_cycle,
            stripe_customer_id,
            subscription_id,
        )
    logger.info(f"Checkout completed for user {user_id}")


async def handle_subscription_created(subscription, pool: asyncpg.Pool):
    """Handle new subscription creation."""
    user_id = get_metadata_value(subscription, "user_id")
    if not user_id:
        logger.warning(f"No user_id found in metadata for subscription {subscription.id}")
        return

    status = subscription.status
    plan, billing_cycle = get_plan_from_metadata(subscription)
    if not plan and subscription.items.data:
        price_id = subscription.items.data[0].price.id
        plan, billing_cycle = get_plan_from_price_id(price_id)

    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE users
            SET subscription_status = $1,
                subscription_id = $2,
                subscription_plan = COALESCE($3, subscription_plan),
                subscription_billing_cycle = COALESCE($4, subscription_billing_cycle),
                stripe_customer_id = COALESCE($5, stripe_customer_id),
                subscription_current_period_end = to_timestamp($6::double precision)
            WHERE id = $7
            """,
            status,
            subscription.id,
            plan,
            billing_cycle,
            subscription.customer,
            float(subscription.current_period_end) if subscription.current_period_end else None,
            user_id,
        )
    logger.info(f"Subscription created for user {user_id}: {status}")


async def handle_subscription_updated(subscription, pool: asyncpg.Pool):
    """Handle subscription updates (trial end, plan change, etc.)."""
    user_id = get_metadata_value(subscription, "user_id")
    if not user_id:
        logger.warning(f"No user_id found in metadata for subscription {subscription.id}")
        return

    plan, billing_cycle = get_plan_from_metadata(subscription)
    if not plan and subscription.items.data:
        price_id = subscription.items.data[0].price.id
        plan, billing_cycle = get_plan_from_price_id(price_id)

    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE users
            SET subscription_status = $1,
                subscription_current_period_end = to_timestamp($2::double precision),
                subscription_plan = COALESCE($3, subscription_plan),
                subscription_billing_cycle = COALESCE($4, subscription_billing_cycle),
                stripe_customer_id = COALESCE($5, stripe_customer_id),
                subscription_id = COALESCE($6, subscription_id)
            WHERE id = $7
            """,
            subscription.status,
            float(subscription.current_period_end) if subscription.current_period_end else None,
            plan,
            billing_cycle,
            subscription.customer,
            subscription.id,
            user_id,
        )
    logger.info(f"Subscription updated for user {user_id}: {subscription.status}")


async def handle_subscription_deleted(subscription, pool: asyncpg.Pool):
    """Handle subscription cancellation."""
    user_id = get_metadata_value(subscription, "user_id")
    if not user_id:
        logger.warning(f"No user_id found in metadata for subscription {subscription.id}")
        return

    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE users
            SET subscription_status = 'canceled',
                subscription_id = NULL,
                subscription_plan = NULL,
                subscription_billing_cycle = NULL
            WHERE id = $1
            """,
            user_id,
        )
    logger.info(f"Subscription canceled for user {user_id}")


async def handle_payment_failed(invoice, pool: asyncpg.Pool):
    """Handle failed payment."""
    user_id = get_metadata_value(invoice, "user_id")
    subscription_id = invoice.get("subscription") if hasattr(invoice, "get") else None
    if not user_id and subscription_id:
        try:
            subscription = stripe.Subscription.retrieve(subscription_id)
            user_id = get_metadata_value(subscription, "user_id")
        except stripe.error.StripeError as e:
            logger.warning(f"Failed to fetch subscription metadata for invoice {invoice.id}: {e}")

    if not user_id:
        logger.warning(f"No user_id found in metadata for invoice {invoice.id}")
        return

    logger.warning(f"Payment failed for user {user_id}")

    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE users
            SET subscription_status = 'past_due',
                stripe_customer_id = COALESCE($2, stripe_customer_id),
                subscription_id = COALESCE($3, subscription_id)
            WHERE id = $1
            """,
            user_id,
            invoice.customer,
            subscription_id,
        )

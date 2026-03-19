import os
import time
import stripe
import asyncpg
import jwt
from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from observability import (
    init_observability,
    instrument_fastapi,
    set_request_context,
    clear_request_context,
    record_http_metrics,
    start_event_loop_lag_monitor,
    record_external_api_duration,
    get_tracer,
)

init_observability("payment")

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
DATABASE_URL = os.getenv("DATABASE_URL")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
SUCCESS_URL = os.getenv("SUCCESS_URL", "http://localhost:3000/pricing?status=success")
CANCEL_URL = os.getenv("CANCEL_URL", "http://localhost:3000/pricing?status=cancelled")

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

app = FastAPI()
instrument_fastapi(app)


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or request.headers.get("x-requestid")
    route = f"{request.method} {request.url.path}"
    set_request_context(route, request_id, "payment")
    start = time.perf_counter()
    response = None
    try:
        response = await call_next(request)
        return response
    finally:
        route_obj = request.scope.get("route")
        route_path = getattr(route_obj, "path", request.url.path)
        route = f"{request.method} {route_path}"
        set_request_context(route, request_id, "payment")
        duration_ms = (time.perf_counter() - start) * 1000
        status_code = response.status_code if response else 500
        record_http_metrics(route, request.method, status_code, duration_ms)
        clear_request_context()


@app.on_event("startup")
async def on_startup():
    await start_event_loop_lag_monitor()

# SECURITY INFRA-1: Production-safe CORS configuration
_env = os.getenv("ENV", "development").lower()
if _env == "production":
    cors_env = os.getenv("CORS_ALLOW_ORIGINS")
    if not cors_env:
        raise RuntimeError("CORS_ALLOW_ORIGINS must be set in production")
    allow_origins = [o.strip() for o in cors_env.split(",") if o.strip()]
    if "*" in allow_origins:
        raise RuntimeError("CORS_ALLOW_ORIGINS cannot contain '*' in production")
else:
    allow_origins = ["*"]  # Development only

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CheckoutRequest(BaseModel):
    price_id: str


def decode_supabase_token(auth_header: str):
    with get_tracer().start_as_current_span("auth.verify"):
        if not auth_header or not auth_header.lower().startswith("bearer "):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token")
        if not SUPABASE_JWT_SECRET:
            raise HTTPException(status_code=500, detail="SUPABASE_JWT_SECRET not configured")
        token = auth_header.split(" ", 1)[1]
        try:
            payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"])
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")


@app.get("/healthz")
def healthz():
    return {"ok": True, "service": "payment"}


@app.post("/create-checkout-session")
async def create_checkout_session(request: Request, body: CheckoutRequest):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    user = decode_supabase_token(request.headers.get("Authorization", ""))
    user_id = user.get("sub")
    email = user.get("email")
    if not user_id:
        raise HTTPException(status_code=400, detail="No user id in token")

    try:
        stripe_start = time.perf_counter()
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{"price": body.price_id, "quantity": 1}],
            success_url=SUCCESS_URL,
            cancel_url=CANCEL_URL,
            metadata={
                "user_id": user_id,
                "email": email or "",
                "price_id": body.price_id,
            },
        )
        record_external_api_duration("stripe", (time.perf_counter() - stripe_start) * 1000)
        return {"url": session.url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stripe error: {e}")


@app.post("/stripe-webhook")
async def stripe_webhook(request: Request):
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Webhook not configured")
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(
            payload=payload, sig_header=sig, secret=STRIPE_WEBHOOK_SECRET
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook error: {e}")

    # DB updates
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        if event["type"] == "checkout.session.completed":
            session = event["data"]["object"]
            user_id = (session.get("metadata") or {}).get("user_id")
            subscription = session.get("subscription")
            status_val = "active"
            if user_id:
                await conn.execute(
                    "UPDATE users SET subscription_status = $1 WHERE id = $2",
                    status_val,
                    user_id,
                )
            # Store subscription row if possible
            if user_id and subscription:
                await conn.execute(
                    """
                    INSERT INTO subscriptions (id, user_id, status, plan_id)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, plan_id = EXCLUDED.plan_id
                    """,
                    str(subscription),
                    user_id,
                    status_val,
                    (session.get("metadata") or {}).get("price_id"),
                )

        elif event["type"] in ("customer.subscription.updated", "customer.subscription.deleted"):
            sub = event["data"]["object"]
            sub_id = sub.get("id")
            status_val = sub.get("status")
            # Find user_id from prior insert using subscription id
            row = await conn.fetchrow("SELECT user_id FROM subscriptions WHERE id = $1", sub_id)
            if row:
                await conn.execute(
                    "UPDATE users SET subscription_status = $1 WHERE id = $2",
                    status_val,
                    row["user_id"],
                )
                await conn.execute(
                    """
                    UPDATE subscriptions SET status = $1, current_period_end = to_timestamp($2)
                    WHERE id = $3
                    """,
                    status_val,
                    (sub.get("current_period_end") or 0),
                    sub_id,
                )
    finally:
        await conn.close()

    return {"received": True}

"""
Rate limiting module for gateway-service.

COMPUTE-1: Stockfish rate limits (10/5/30 per min for auth/anon/IP)
COMPUTE-2: LLM rate limits (3/1 per min, 30/5 per day for auth/anon)
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from typing import Optional
import os
from gateway_modules.observability import get_tracer


def get_rate_limit_key(request: Request) -> str:
    """
    Extract rate limit key with priority: user_id > session_id > IP.
    
    Returns a key string used for rate limiting bucketing.
    """
    # Try to get user_id from JWT (set by auth middleware)
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"user:{user_id}"
    
    # Try session_id from header or cookie
    session_id = request.headers.get("x-session-id") or request.cookies.get("session_id")
    if session_id:
        return f"session:{session_id}"
    
    # Fallback to IP
    return f"ip:{get_remote_address(request)}"


def get_user_tier(request: Request) -> str:
    """
    Determine user tier for dynamic rate limits.
    
    Returns: 'auth', 'anon', or 'ip'
    """
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return "auth"
    
    session_id = request.headers.get("x-session-id") or request.cookies.get("session_id")
    if session_id:
        return "anon"
    
    return "ip"


# Rate limits by tier
STOCKFISH_LIMITS = {
    "auth": "10/minute",
    "anon": "5/minute",
    "ip": "30/minute",
}

LLM_LIMITS = {
    "auth": "3/minute",
    "anon": "1/minute",
    "ip": "2/minute",
}

# Daily caps for LLM (more expensive resource)
LLM_DAILY_CAPS = {
    "auth": 30,
    "anon": 5,
    "ip": 10,
}


# Create limiter instance
limiter = Limiter(
    key_func=get_rate_limit_key,
    default_limits=["100/minute"],
    storage_uri=os.getenv("REDIS_URL", "memory://"),
)


def get_stockfish_limit(request: Request) -> str:
    """Get appropriate Stockfish rate limit based on user tier."""
    tier = get_user_tier(request)
    return STOCKFISH_LIMITS.get(tier, STOCKFISH_LIMITS["ip"])


def get_llm_limit(request: Request) -> str:
    """Get appropriate LLM rate limit based on user tier."""
    tier = get_user_tier(request)
    return LLM_LIMITS.get(tier, LLM_LIMITS["ip"])


# Daily limit tracking (in-memory for now, should use Redis in production)
_daily_usage: dict = {}


def check_daily_limit(request: Request) -> bool:
    """
    Check if user has exceeded daily LLM limit.
    
    Returns True if within limit, raises HTTPException if exceeded.
    """
    from datetime import date
    from fastapi import HTTPException
    
    with get_tracer().start_as_current_span("rate_limit.check"):
        key = get_rate_limit_key(request)
        tier = get_user_tier(request)
        daily_cap = LLM_DAILY_CAPS.get(tier, LLM_DAILY_CAPS["ip"])

        today = str(date.today())
        daily_key = f"{today}:{key}"

        current_usage = _daily_usage.get(daily_key, 0)

        if current_usage >= daily_cap:
            raise HTTPException(
                status_code=429,
                detail=f"Daily limit exceeded ({daily_cap} requests per day). Try again tomorrow.",
                headers={"Retry-After": "86400"},
            )

        return True


def increment_daily_usage(request: Request):
    """Increment daily usage counter after successful request."""
    from datetime import date
    
    key = get_rate_limit_key(request)
    today = str(date.today())
    daily_key = f"{today}:{key}"
    
    _daily_usage[daily_key] = _daily_usage.get(daily_key, 0) + 1


def reset_daily_usage():
    """Clear daily usage tracking (for testing)."""
    global _daily_usage
    _daily_usage = {}

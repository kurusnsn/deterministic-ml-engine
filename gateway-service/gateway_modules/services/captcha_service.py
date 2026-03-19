"""
CAPTCHA verification service using Cloudflare Turnstile.

SECURITY: Invisible CAPTCHA for signup/login to prevent bot/spam.
- No visual challenges, no checkboxes
- Fail closed: missing/invalid token = denied request
- Production requires TURNSTILE_SECRET_KEY
"""
import os
import httpx
from typing import Optional

TURNSTILE_SECRET_KEY = os.getenv("TURNSTILE_SECRET_KEY")
TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
ENV = os.getenv("ENV", "development").lower()


async def verify_turnstile_token(token: str, ip: Optional[str] = None) -> dict:
    """
    Verify a Turnstile token with Cloudflare.
    
    Args:
        token: The Turnstile response token from frontend
        ip: Optional client IP for additional validation
        
    Returns:
        {
            "success": bool,
            "error_codes": list[str] (if any),
            "hostname": str,
            "challenge_ts": str
        }
        
    Fail closed behavior:
        - Missing secret in production: returns failure
        - Network/API errors: returns failure
        - Invalid token: returns failure from Cloudflare
    """
    # Fail closed: no secret in production = deny
    if not TURNSTILE_SECRET_KEY:
        if ENV == "production":
            return {"success": False, "error_codes": ["missing-secret-key"]}
        # Dev bypass for local testing without Turnstile setup
        return {"success": True, "_dev_bypass": True}
    
    payload = {
        "secret": TURNSTILE_SECRET_KEY,
        "response": token,
    }
    if ip:
        payload["remoteip"] = ip
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(TURNSTILE_VERIFY_URL, data=payload)
            resp.raise_for_status()
            return resp.json()
    except httpx.TimeoutException:
        # Fail closed on timeout
        return {"success": False, "error_codes": ["verification-timeout"]}
    except httpx.RequestError as e:
        # Fail closed on network errors
        return {"success": False, "error_codes": ["verification-error", str(e)]}
    except Exception as e:
        # Fail closed on any other errors
        return {"success": False, "error_codes": ["unknown-error", str(e)]}

"""
Users router - User profile, authentication, and session management endpoints.
"""

import os
import re
import random
import asyncpg
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
import httpx

from gateway_modules.dependencies import (
    get_pool,
    get_owner_from_request,
    get_current_user,
    decode_supabase_token,
    DATABASE_URL,
)
from gateway_modules.observability import record_external_api_duration

logger = logging.getLogger(__name__)

router = APIRouter(tags=["users"])

TURNSTILE_SECRET_KEY = os.getenv("TURNSTILE_SECRET_KEY", "")


async def verify_turnstile_token(token: str, client_ip: str = None) -> dict:
    """Verify a Cloudflare Turnstile CAPTCHA token."""
    if not TURNSTILE_SECRET_KEY:
        # For development without captcha configured
        return {"success": True}
    
    async with httpx.AsyncClient() as client:
        try:
            request_start = time.perf_counter()
            response = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data={
                    "secret": TURNSTILE_SECRET_KEY,
                    "response": token,
                    "remoteip": client_ip or ""
                },
                timeout=10.0
            )
            record_external_api_duration("turnstile", (time.perf_counter() - request_start) * 1000)
            return response.json()
        except Exception as e:
            logger.info(f"Turnstile verification error: {e}")
            return {"success": False, "error_codes": ["api-error"]}


@router.post("/users/sync")
async def sync_user(current_user: dict = Depends(get_current_user)):
    """Sync user from Supabase JWT to database."""
    user_id = current_user.get("sub")
    email = current_user.get("email")

    if not user_id or not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User ID or email not found in token",
        )

    conn = None
    try:
        conn = await asyncpg.connect(DATABASE_URL)
        existing_user = await conn.fetchrow(
            "SELECT id, username, display_name FROM users WHERE id = $1", user_id
        )
        if existing_user:
            return {
                "message": "User already in sync",
                "has_username": existing_user["username"] is not None,
                "username": existing_user["username"],
                "display_name": existing_user["display_name"],
            }

        await conn.execute(
            "INSERT INTO users (id, email) VALUES ($1, $2)",
            user_id,
            email,
        )
        return {
            "message": "User synced successfully",
            "has_username": False,
            "username": None,
            "display_name": None,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}",
        )
    finally:
        if conn:
            await conn.close()


@router.post("/auth/verify-captcha")
async def verify_captcha(request: Request):
    """
    Verify CAPTCHA token before signup/login.
    
    SECURITY: Fail closed behavior:
    - Missing token: 400 Bad Request
    - Invalid token: 403 Forbidden
    - Verification failure: 403 Forbidden
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid request body"
        )
    
    token = body.get("token")
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CAPTCHA token required"
        )
    
    client_ip = None
    if request.client:
        client_ip = request.client.host
    
    result = await verify_turnstile_token(token, client_ip)
    
    if not result.get("success"):
        error_codes = result.get("error_codes", ["verification-failed"])
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"CAPTCHA verification failed: {error_codes}"
        )
    
    return {"success": True}


@router.get("/users/me")
async def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    """Get the current user's profile including username."""
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID not found in token")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id, email, username, display_name, subscription_status, created_at FROM users WHERE id = $1",
            user_id
        )
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "id": str(user["id"]),
            "email": user["email"],
            "username": user["username"],
            "display_name": user["display_name"],
            "subscription_status": user["subscription_status"],
            "has_username": user["username"] is not None,
            "created_at": user["created_at"].isoformat() if user["created_at"] else None,
        }


@router.get("/users/username/check")
async def check_username_availability(
    username: str,
    current_user: dict = Depends(get_current_user)
):
    """Check if a username is available and valid."""
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID not found in token")
    
    username = username.strip()
    
    if len(username) < 3:
        return {
            "available": False,
            "valid": False,
            "error": "Username must be at least 3 characters long",
            "suggestions": []
        }
    
    if len(username) > 20:
        return {
            "available": False,
            "valid": False,
            "error": "Username must be at most 20 characters long",
            "suggestions": []
        }
    
    if not re.match(r'^[a-zA-Z][a-zA-Z0-9_]*$', username):
        return {
            "available": False,
            "valid": False,
            "error": "Username must start with a letter and contain only letters, numbers, and underscores",
            "suggestions": []
        }
    
    reserved = {
        "admin", "administrator", "root", "system", "chessvector", "support",
        "help", "api", "www", "mail", "email", "test", "guest", "anonymous",
        "null", "undefined", "moderator", "mod", "staff", "official"
    }
    if username.lower() in reserved:
        return {
            "available": False,
            "valid": True,
            "error": "This username is reserved",
            "suggestions": []
        }
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE LOWER(username) = LOWER($1)",
            username
        )
        
        if existing and str(existing["id"]) != user_id:
            suggestions = await generate_username_suggestions(conn, username)
            return {
                "available": False,
                "valid": True,
                "error": "Username is already taken",
                "suggestions": suggestions
            }
        
        similar = await conn.fetch(
            """
            SELECT username FROM users 
            WHERE LOWER(username) LIKE LOWER($1) 
            AND id != $2
            LIMIT 5
            """,
            f"%{username}%",
            user_id
        )
        
        return {
            "available": True,
            "valid": True,
            "error": None,
            "similar_usernames": [row["username"] for row in similar] if similar else [],
            "suggestions": []
        }


async def generate_username_suggestions(conn, base_username: str) -> list:
    """Generate available username suggestions based on a taken username."""
    suggestions = []
    attempts = 0
    max_attempts = 20
    
    while len(suggestions) < 5 and attempts < max_attempts:
        attempts += 1
        candidate = None
        
        strategy = attempts % 4
        if strategy == 0:
            candidate = f"{base_username}{random.randint(1, 999)}"
        elif strategy == 1:
            candidate = f"{base_username}_{random.randint(1, 99)}"
        elif strategy == 2:
            candidate = f"{base_username}{random.randint(90, 99)}"
        else:
            suffixes = ["chess", "player", "gm", "fm", "cm", "king", "queen"]
            candidate = f"{base_username}_{random.choice(suffixes)}"
        
        if len(candidate) > 20:
            candidate = candidate[:20]
        
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE LOWER(username) = LOWER($1)",
            candidate
        )
        
        if not existing and candidate not in suggestions:
            suggestions.append(candidate)
    
    return suggestions


@router.post("/users/username")
async def set_username(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Set or update the user's username."""
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID not found in token")
    
    body = await request.json()
    username = body.get("username", "").strip()
    display_name = body.get("display_name", "").strip() or None
    
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters long")
    
    if len(username) > 20:
        raise HTTPException(status_code=400, detail="Username must be at most 20 characters long")
    
    if not re.match(r'^[a-zA-Z][a-zA-Z0-9_]*$', username):
        raise HTTPException(
            status_code=400,
            detail="Username must start with a letter and contain only letters, numbers, and underscores"
        )
    
    reserved = {
        "admin", "administrator", "root", "system", "chessvector", "support",
        "help", "api", "www", "mail", "email", "test", "guest", "anonymous",
        "null", "undefined", "moderator", "mod", "staff", "official"
    }
    if username.lower() in reserved:
        raise HTTPException(status_code=400, detail="This username is reserved")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT username FROM users WHERE id = $1",
            user_id
        )
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2",
            username,
            user_id
        )
        
        if existing:
            suggestions = await generate_username_suggestions(conn, username)
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "Username is already taken",
                    "suggestions": suggestions
                }
            )
        
        await conn.execute(
            "UPDATE users SET username = $1, display_name = $2 WHERE id = $3",
            username,
            display_name,
            user_id
        )
        
        return {
            "success": True,
            "username": username,
            "display_name": display_name,
            "message": "Username set successfully"
        }


@router.get("/users/username/suggestions")
async def get_username_suggestions(
    base: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get username suggestions based on a base string or user's email."""
    user_id = current_user.get("sub")
    email = current_user.get("email", "")
    
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID not found in token")
    
    if not base:
        base = email.split("@")[0] if "@" in email else "player"
        base = re.sub(r'[^a-zA-Z0-9_]', '', base)
        if not base or not base[0].isalpha():
            base = "player"
    
    base = base[:15]
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE LOWER(username) = LOWER($1)",
            base
        )
        
        suggestions = []
        if not existing:
            suggestions.append(base)
        
        additional = await generate_username_suggestions(conn, base)
        suggestions.extend(additional)
        
        seen = set()
        unique_suggestions = []
        for s in suggestions:
            if s.lower() not in seen:
                seen.add(s.lower())
                unique_suggestions.append(s)
        
        return {
            "base": base,
            "suggestions": unique_suggestions[:6]
        }


@router.post("/link-session")
async def link_session(request: Request):
    """Link anonymous session-owned rows to the authenticated user."""
    user_id, _ = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Auth required")
    try:
        body = await request.json()
    except Exception:
        body = {}
    session_id = request.headers.get("x-session-id") or (body or {}).get("session_id")
    if not session_id:
        session_id = request.cookies.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        auth_header = request.headers.get("Authorization", "")
        payload = decode_supabase_token(auth_header)
        email = payload.get("email") if payload else None
        
        if user_id and email:
            await conn.execute(
                """
                INSERT INTO users (id, email) 
                VALUES ($1, $2) 
                ON CONFLICT (id) DO UPDATE SET email = $2
                """,
                user_id, email
            )

        tables = [
            ("games", "user_id", "session_id"),
            ("imports", "user_id", "session_id"),
            ("activities", "user_id", "session_id"),
            ("repertoires", "user_id", "session_id"),
            ("bot_games", "user_id", "session_id"),
            ("saved_reports", "user_id", "session_id"),
        ]
        total = 0
        for tbl, user_col, sess_col in tables:
            res = await conn.execute(
                f"UPDATE {tbl} SET {user_col} = $1, {sess_col} = NULL WHERE {user_col} IS NULL AND {sess_col} = $2",
                user_id, session_id,
            )
            try:
                total += int(res.split(" ")[1])
            except Exception:
                pass
        
        res = await conn.execute(
            """
            INSERT INTO user_games (user_id, game_id)
            SELECT $1, game_id FROM user_games
            WHERE session_id = $2
            ON CONFLICT (user_id, game_id) DO NOTHING
            """,
            user_id, session_id
        )
        try:
            total += int(res.split(" ")[1])
        except Exception:
            pass
            
        await conn.execute("DELETE FROM user_games WHERE session_id = $1", session_id)
    return {"linked": total}


@router.get("/games/usernames")
async def get_available_usernames(request: Request):
    """Get all unique usernames from imported games."""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    pool = await get_pool()
    async with pool.acquire() as conn:
        owner_condition = "ug.user_id = $1" if user_id else "ug.session_id = $1"
        owner_value = user_id if user_id else session_id

        rows = await conn.fetch(
            f"""
            SELECT DISTINCT p.username
            FROM players p
            JOIN games g ON p.game_id = g.id
            JOIN user_games ug ON g.id = ug.game_id
            WHERE {owner_condition} AND p.username IS NOT NULL AND p.username != ''
            ORDER BY p.username
            """,
            owner_value
        )
        usernames = [row["username"] for row in rows]
        return {"usernames": usernames}


@router.get("/profile/info")
async def get_profile_info(request: Request):
    """Get basic profile info for display."""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        if not user_id:
            return {
                "email": None,
                "created_at": None,
                "subscription_status": None
            }
        
        row = await conn.fetchrow(
            "SELECT email, created_at, subscription_status FROM users WHERE id = $1",
            user_id
        )
        
        if not row:
            return {
                "email": None,
                "created_at": None,
                "subscription_status": None
            }
        
        return {
            "email": row["email"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "subscription_status": row["subscription_status"]
        }

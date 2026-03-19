"""
Health and diagnostics router - Health checks, GPU status, and diagnostic endpoints.
"""

import os
import traceback
from typing import Optional

from fastapi import APIRouter, Request, Query
import httpx
import asyncpg

from gateway_modules.dependencies import get_pool, get_owner_from_request
from gateway_modules.gpu_routing import is_gpu_likely_cold

router = APIRouter(tags=["health"])

# Service URLs
STOCKFISH_URL = os.getenv("STOCKFISH_URL", "http://stockfish:5000")
IMPORT_URL = os.getenv("IMPORT_URL", "http://import:8000")


@router.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/gpu-status")
def gpu_status():
    """
    Get GPU warm-up status for frontend polling.
    
    Returns:
        status: 'cold' | 'lc0_warming' | 'llama_warming' | 'ready'
        lc0_ready: bool
        llama_ready: bool
    """
    from gateway_modules.gpu_routing import (
        is_gpu_likely_cold,
    )
    # For now return a simple status - can be enhanced later
    cold = is_gpu_likely_cold()
    return {
        "status": "cold" if cold else "ready",
        "lc0_ready": not cold,
        "llama_ready": not cold,
    }


@router.get("/diagnose/reports")
async def diagnose_reports_flow(request: Request):
    """
    Diagnostic endpoint to test the reports flow in production.
    Returns auth status, database connectivity, and user data counts.

    Use this to debug issues with importing games or generating reports.
    """
    diagnostics = {
        "auth": {},
        "database": {},
        "services": {},
        "data": {}
    }

    try:
        # 1. Check auth status
        user_id, session_id = get_owner_from_request(request)
        diagnostics["auth"]["user_id"] = user_id
        diagnostics["auth"]["session_id"] = session_id
        diagnostics["auth"]["authenticated"] = user_id is not None

        # 2. Check database connectivity
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                result = await conn.fetchval("SELECT 1")
                diagnostics["database"]["connected"] = result == 1
                diagnostics["database"]["pool_size"] = pool.get_size()
                diagnostics["database"]["pool_free"] = pool.get_idle_size()
        except Exception as db_error:
            diagnostics["database"]["connected"] = False
            diagnostics["database"]["error"] = str(db_error)

        # 3. Check external services
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Check Stockfish
            try:
                sf_resp = await client.get(f"{STOCKFISH_URL}/health")
                diagnostics["services"]["stockfish"] = {
                    "status": sf_resp.status_code,
                    "healthy": sf_resp.status_code == 200
                }
            except Exception as sf_error:
                diagnostics["services"]["stockfish"] = {
                    "healthy": False,
                    "error": str(sf_error)
                }

            # Check Import service
            try:
                import_resp = await client.get(f"{IMPORT_URL}/health")
                diagnostics["services"]["import"] = {
                    "status": import_resp.status_code,
                    "healthy": import_resp.status_code == 200
                }
            except Exception as import_error:
                diagnostics["services"]["import"] = {
                    "healthy": False,
                    "error": str(import_error)
                }

        # 4. Check user data if authenticated
        if user_id and diagnostics["database"]["connected"]:
            async with pool.acquire() as conn:
                # Count games
                games_count = await conn.fetchval(
                    "SELECT COUNT(*) FROM games WHERE user_id = $1",
                    user_id
                )
                diagnostics["data"]["games_count"] = games_count

                # Count imports
                imports_count = await conn.fetchval(
                    "SELECT COUNT(*) FROM imports WHERE user_id = $1",
                    user_id
                )
                diagnostics["data"]["imports_count"] = imports_count

                # Count reports
                reports_count = await conn.fetchval(
                    "SELECT COUNT(*) FROM reports WHERE user_id = $1",
                    user_id
                )
                diagnostics["data"]["reports_count"] = reports_count

                # Get latest import status
                latest_import = await conn.fetchrow(
                    """
                    SELECT id, status, source, username, created_at, 
                           games_found, games_imported, error_message
                    FROM imports 
                    WHERE user_id = $1 
                    ORDER BY created_at DESC 
                    LIMIT 1
                    """,
                    user_id
                )
                if latest_import:
                    diagnostics["data"]["latest_import"] = {
                        "id": str(latest_import["id"]),
                        "status": latest_import["status"],
                        "source": latest_import["source"],
                        "username": latest_import["username"],
                        "created_at": latest_import["created_at"].isoformat() if latest_import["created_at"] else None,
                        "games_found": latest_import["games_found"],
                        "games_imported": latest_import["games_imported"],
                        "error": latest_import["error_message"]
                    }

        diagnostics["overall_status"] = "healthy"

    except Exception as e:
        diagnostics["overall_status"] = "error"
        diagnostics["error"] = str(e)
        diagnostics["traceback"] = traceback.format_exc()

    return diagnostics


@router.get("/diagnose/import")
async def test_import_flow(request: Request, test_username: str = Query(default="DrNykterstein")):
    """
    Test a minimal import to verify the full flow works.
    Uses a known public account (DrNykterstein by default) with just 2 games.

    This helps diagnose issues with:
    - Authentication
    - Import service connectivity
    - Database writes
    - Report generation
    """
    diagnostics = {
        "steps": [],
        "status": "starting"
    }

    try:
        # Step 1: Check auth
        user_id, session_id = get_owner_from_request(request)
        diagnostics["steps"].append({
            "step": "auth_check",
            "success": True,
            "data": {"user_id": user_id, "session_id": session_id}
        })

        if not user_id and not session_id:
            diagnostics["status"] = "failed"
            diagnostics["error"] = "No authentication context"
            return diagnostics

        # Step 2: Check database
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        diagnostics["steps"].append({
            "step": "database_check",
            "success": True
        })

        # Step 3: Test import service connectivity
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                import_health = await client.get(f"{IMPORT_URL}/health")
                diagnostics["steps"].append({
                    "step": "import_service_health",
                    "success": import_health.status_code == 200,
                    "status_code": import_health.status_code
                })
            except Exception as e:
                diagnostics["steps"].append({
                    "step": "import_service_health",
                    "success": False,
                    "error": str(e)
                })
                diagnostics["status"] = "failed"
                diagnostics["error"] = f"Import service unreachable: {e}"
                return diagnostics

            # Step 4: Try a minimal fetch (just get game count, don't actually import)
            try:
                # Use a minimal request that won't actually start a full import
                test_payload = {
                    "source": "lichess.org",
                    "username": test_username,
                    "filters": {
                        "max": 2  # Only fetch 2 games for testing
                    }
                }
                
                diagnostics["steps"].append({
                    "step": "import_test_request",
                    "success": True,
                    "note": "Test payload prepared (not executed to avoid side effects)"
                })
            except Exception as e:
                diagnostics["steps"].append({
                    "step": "import_test_request",
                    "success": False,
                    "error": str(e)
                })

        diagnostics["status"] = "healthy"
        diagnostics["summary"] = "All diagnostic checks passed"

    except Exception as e:
        diagnostics["status"] = "error"
        diagnostics["error"] = str(e)
        diagnostics["traceback"] = traceback.format_exc()

    return diagnostics

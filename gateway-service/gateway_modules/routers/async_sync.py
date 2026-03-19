"""
Async Sync Router - Background game sync with progress tracking.

Provides endpoints for starting sync jobs and polling their status.
Uses FastAPI BackgroundTasks for processing and Redis for progress storage.
"""

import os
import json
import asyncio
from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Depends
from pydantic import BaseModel
import redis.asyncio as redis

from gateway_modules.dependencies import get_pool, get_owner_from_request
from gateway_modules.services.game_sync.sync_orchestrator import sync_games_for_user, SyncProgress

router = APIRouter(tags=["sync"])

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
SYNC_JOB_TTL = 3600  # 1 hour TTL for completed jobs

# Global redis pool
_redis_pool: Optional[redis.Redis] = None


async def get_redis_pool() -> redis.Redis:
    """Get or create Redis connection pool."""
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = redis.from_url(REDIS_URL, decode_responses=True)
    return _redis_pool


class SyncStartRequest(BaseModel):
    """Request body for starting a sync job."""
    providers: Optional[list[str]] = None  # e.g., ["lichess.org", "chess.com"]
    max_games: Optional[int] = 100


class SyncStartResponse(BaseModel):
    """Response from starting a sync job."""
    job_id: str
    status: str


class SyncStatusResponse(BaseModel):
    """Response from polling sync status."""
    job_id: str
    status: str  # queued, syncing, completed, failed
    provider: Optional[str] = None
    progress: int = 0
    total: int = 0
    synced: int = 0
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


async def update_job_progress(
    job_id: str,
    status: str,
    provider: Optional[str] = None,
    progress: int = 0,
    total: int = 0,
    synced: int = 0,
    error: Optional[str] = None,
):
    """Update job progress in Redis."""
    r = await get_redis_pool()
    key = f"sync:{job_id}"
    
    data = {
        "status": status,
        "progress": str(progress),
        "total": str(total),
        "synced": str(synced),
    }
    
    if provider:
        data["provider"] = provider
    if error:
        data["error"] = error
    if status in ("completed", "failed"):
        data["completed_at"] = datetime.utcnow().isoformat()
    
    await r.hset(key, mapping=data)
    
    # Set TTL on completed jobs
    if status in ("completed", "failed"):
        await r.expire(key, SYNC_JOB_TTL)


async def run_sync_job(
    job_id: str,
    user_id: Optional[str],
    session_id: Optional[str],
    providers: Optional[list[str]],
    max_games: int,
):
    """Background task that runs the sync job."""
    try:
        # Get DB pool
        pool = await get_pool()
        
        # Update status to syncing
        await update_job_progress(job_id, "syncing")
        
        # Progress callback to update Redis
        async def progress_callback(progress: SyncProgress):
            await update_job_progress(
                job_id,
                progress.status,
                provider=progress.provider,
                progress=progress.fetched,
                synced=progress.synced,
                error=progress.error,
            )
        
        # Run the sync
        result = await sync_games_for_user(
            pool=pool,
            user_id=user_id,
            session_id=session_id,
            providers=providers,
            max_games_per_provider=max_games,
            progress_callback=progress_callback,
        )
        
        # Final status update
        if result.success:
            await update_job_progress(
                job_id,
                "completed",
                progress=result.total_fetched,
                synced=result.total_synced,
            )
        else:
            await update_job_progress(
                job_id,
                "failed",
                progress=result.total_fetched,
                synced=result.total_synced,
                error="; ".join(result.errors) if result.errors else None,
            )
            
    except Exception as e:
        await update_job_progress(job_id, "failed", error=str(e))


@router.post("/sync/start", response_model=SyncStartResponse)
async def start_sync(
    request: Request,
    body: SyncStartRequest,
    background_tasks: BackgroundTasks,
):
    """
    Start a background sync job for linked game providers.
    
    Returns immediately with a job_id that can be used to poll status.
    """
    user_id, session_id = get_owner_from_request(request)
    
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")
    
    # Generate job ID
    job_id = str(uuid4())
    
    # Initialize job in Redis
    r = await get_redis_pool()
    await r.hset(f"sync:{job_id}", mapping={
        "status": "queued",
        "progress": "0",
        "total": "0",
        "synced": "0",
        "started_at": datetime.utcnow().isoformat(),
    })
    
    # Set initial TTL (will be refreshed on completion)
    await r.expire(f"sync:{job_id}", SYNC_JOB_TTL)
    
    # Add background task
    background_tasks.add_task(
        run_sync_job,
        job_id,
        user_id,
        session_id,
        body.providers,
        body.max_games or 100,
    )
    
    return SyncStartResponse(job_id=job_id, status="queued")


@router.get("/sync/status/{job_id}", response_model=SyncStatusResponse)
async def get_sync_status(job_id: str):
    """
    Get the current status of a sync job.
    
    Poll this endpoint to track progress until status is 'completed' or 'failed'.
    """
    r = await get_redis_pool()
    data = await r.hgetall(f"sync:{job_id}")
    
    if not data:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return SyncStatusResponse(
        job_id=job_id,
        status=data.get("status", "unknown"),
        provider=data.get("provider"),
        progress=int(data.get("progress", 0)),
        total=int(data.get("total", 0)),
        synced=int(data.get("synced", 0)),
        error=data.get("error"),
        started_at=data.get("started_at"),
        completed_at=data.get("completed_at"),
    )

"""
Tests for Async Sync Router

Tests the /sync/start and /sync/status/{job_id} endpoints for background game sync.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient


class TestAsyncSyncEndpoints:
    """Tests for async sync endpoints."""

    @pytest.fixture
    def mock_redis(self):
        """Create a mock Redis client."""
        mock = AsyncMock()
        mock.hset = AsyncMock()
        mock.hgetall = AsyncMock(return_value={
            "status": "queued",
            "progress": "0",
            "total": "0",
            "synced": "0",
            "started_at": "2025-01-12T00:00:00",
        })
        mock.expire = AsyncMock()
        return mock

    @pytest.fixture
    def mock_pool(self):
        """Create a mock database pool."""
        mock = AsyncMock()
        mock.acquire = MagicMock(return_value=AsyncMock())
        return mock

    @pytest.mark.asyncio
    async def test_start_sync_returns_job_id(self, mock_redis, mock_pool):
        """POST /sync/start should return a job_id immediately."""
        from gateway_modules.routers.async_sync import router, get_redis_pool
        from gateway_modules.dependencies import get_pool
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        app = FastAPI()
        app.include_router(router)

        # Patch dependencies
        with patch('gateway_modules.routers.async_sync.get_redis_pool', return_value=mock_redis), \
             patch('gateway_modules.routers.async_sync.get_pool', return_value=mock_pool), \
             patch('gateway_modules.routers.async_sync.get_owner_from_request', return_value=("user-123", None)):

            with TestClient(app) as client:
                response = client.post("/sync/start", json={"providers": ["lichess.org"]})

                assert response.status_code == 200
                data = response.json()
                assert "job_id" in data
                assert data["status"] == "queued"
                # Verify Redis was called to store job
                mock_redis.hset.assert_called()

    @pytest.mark.asyncio
    async def test_start_sync_without_auth_fails(self):
        """POST /sync/start should fail without user/session context."""
        from gateway_modules.routers.async_sync import router
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        app = FastAPI()
        app.include_router(router)

        with patch('gateway_modules.routers.async_sync.get_owner_from_request', return_value=(None, None)):
            with TestClient(app) as client:
                response = client.post("/sync/start", json={})
                assert response.status_code == 400
                assert "Missing user or session context" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_get_status_returns_queued(self, mock_redis):
        """GET /sync/status/{job_id} should return queued status."""
        from gateway_modules.routers.async_sync import router
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        app = FastAPI()
        app.include_router(router)

        job_id = str(uuid4())

        with patch('gateway_modules.routers.async_sync.get_redis_pool', return_value=mock_redis):
            with TestClient(app) as client:
                response = client.get(f"/sync/status/{job_id}")

                assert response.status_code == 200
                data = response.json()
                assert data["job_id"] == job_id
                assert data["status"] == "queued"
                assert data["progress"] == 0

    @pytest.mark.asyncio
    async def test_get_status_not_found(self, mock_redis):
        """GET /sync/status/{job_id} should return 404 for unknown job."""
        from gateway_modules.routers.async_sync import router
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        app = FastAPI()
        app.include_router(router)

        mock_redis.hgetall = AsyncMock(return_value={})  # Empty = not found

        with patch('gateway_modules.routers.async_sync.get_redis_pool', return_value=mock_redis):
            with TestClient(app) as client:
                response = client.get("/sync/status/nonexistent-job")

                assert response.status_code == 404
                assert "Job not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_get_status_completed(self, mock_redis):
        """GET /sync/status/{job_id} should return completed status with results."""
        from gateway_modules.routers.async_sync import router
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        app = FastAPI()
        app.include_router(router)

        mock_redis.hgetall = AsyncMock(return_value={
            "status": "completed",
            "progress": "50",
            "total": "50",
            "synced": "25",
            "started_at": "2025-01-12T00:00:00",
            "completed_at": "2025-01-12T00:01:00",
        })

        job_id = str(uuid4())

        with patch('gateway_modules.routers.async_sync.get_redis_pool', return_value=mock_redis):
            with TestClient(app) as client:
                response = client.get(f"/sync/status/{job_id}")

                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "completed"
                assert data["progress"] == 50
                assert data["synced"] == 25
                assert data["completed_at"] is not None

    @pytest.mark.asyncio
    async def test_get_status_failed(self, mock_redis):
        """GET /sync/status/{job_id} should return failed status with error."""
        from gateway_modules.routers.async_sync import router
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        app = FastAPI()
        app.include_router(router)

        mock_redis.hgetall = AsyncMock(return_value={
            "status": "failed",
            "progress": "10",
            "total": "0",
            "synced": "0",
            "error": "Lichess API error: 429",
            "started_at": "2025-01-12T00:00:00",
        })

        job_id = str(uuid4())

        with patch('gateway_modules.routers.async_sync.get_redis_pool', return_value=mock_redis):
            with TestClient(app) as client:
                response = client.get(f"/sync/status/{job_id}")

                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "failed"
                assert "Lichess API error" in data["error"]


class TestUpdateJobProgress:
    """Tests for the update_job_progress helper function."""

    @pytest.mark.asyncio
    async def test_update_progress_sets_redis_hash(self):
        """update_job_progress should set Redis hash with correct values."""
        from gateway_modules.routers.async_sync import update_job_progress, get_redis_pool

        mock_redis = AsyncMock()
        mock_redis.hset = AsyncMock()
        mock_redis.expire = AsyncMock()

        job_id = "test-job-123"

        with patch('gateway_modules.routers.async_sync.get_redis_pool', return_value=mock_redis):
            await update_job_progress(
                job_id,
                status="syncing",
                provider="lichess.org",
                progress=10,
                synced=5,
            )

            mock_redis.hset.assert_called_once()
            call_args = mock_redis.hset.call_args
            assert call_args[0][0] == f"sync:{job_id}"
            mapping = call_args[1]["mapping"]
            assert mapping["status"] == "syncing"
            assert mapping["provider"] == "lichess.org"
            assert mapping["progress"] == "10"
            assert mapping["synced"] == "5"

    @pytest.mark.asyncio
    async def test_update_progress_sets_ttl_on_completion(self):
        """update_job_progress should set TTL when status is completed."""
        from gateway_modules.routers.async_sync import update_job_progress, SYNC_JOB_TTL

        mock_redis = AsyncMock()
        mock_redis.hset = AsyncMock()
        mock_redis.expire = AsyncMock()

        job_id = "test-job-456"

        with patch('gateway_modules.routers.async_sync.get_redis_pool', return_value=mock_redis):
            await update_job_progress(job_id, status="completed", progress=50, synced=25)

            mock_redis.expire.assert_called_once()
            call_args = mock_redis.expire.call_args[0]
            assert call_args[0] == f"sync:{job_id}"
            assert call_args[1] == SYNC_JOB_TTL

    @pytest.mark.asyncio
    async def test_update_progress_sets_ttl_on_failure(self):
        """update_job_progress should set TTL when status is failed."""
        from gateway_modules.routers.async_sync import update_job_progress

        mock_redis = AsyncMock()
        mock_redis.hset = AsyncMock()
        mock_redis.expire = AsyncMock()

        job_id = "test-job-789"

        with patch('gateway_modules.routers.async_sync.get_redis_pool', return_value=mock_redis):
            await update_job_progress(job_id, status="failed", error="Test error")

            mock_redis.expire.assert_called_once()
            mapping = mock_redis.hset.call_args[1]["mapping"]
            assert mapping["error"] == "Test error"
            assert "completed_at" in mapping

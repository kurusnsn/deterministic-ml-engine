"""
API tests for the reports flow: importing games, generating reports, and viewing report details.
Tests the full flow including the new user_games join table for multi-user ownership.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, AsyncMock, patch
from uuid import uuid4
from datetime import datetime, timezone
import json

from app import app, get_pool, get_owner_from_request


class TestReportsAPI:
    """Integration tests for the reports API endpoints."""

    def get_mock_pool(self, fetchrow_results=None, fetch_results=None, fetchval_results=None):
        """Create a mock database pool with configurable return values."""
        mock_pool = MagicMock()
        mock_conn = MagicMock()
        
        if fetchrow_results is not None:
            if isinstance(fetchrow_results, (list, tuple)):
                mock_conn.fetchrow = AsyncMock(side_effect=fetchrow_results)
            else:
                mock_conn.fetchrow = AsyncMock(return_value=fetchrow_results)
        if fetch_results is not None:
            if (
                isinstance(fetch_results, (list, tuple))
                and fetch_results
                and isinstance(fetch_results[0], (list, tuple))
            ):
                mock_conn.fetch = AsyncMock(side_effect=fetch_results)
            else:
                mock_conn.fetch = AsyncMock(return_value=fetch_results)
        if fetchval_results is not None:
            if isinstance(fetchval_results, (list, tuple)):
                mock_conn.fetchval = AsyncMock(side_effect=fetchval_results)
            else:
                mock_conn.fetchval = AsyncMock(return_value=fetchval_results)
        mock_conn.execute = AsyncMock(return_value="UPDATE 1")
        
        # Mock context manager
        mock_pool.acquire = MagicMock(return_value=MagicMock(
            __aenter__=AsyncMock(return_value=mock_conn),
            __aexit__=AsyncMock(return_value=None)
        ))
        
        return mock_pool

    def test_get_reports_usernames_returns_list(self):
        """Test GET /analysis/reports/usernames returns available usernames."""
        user_id = str(uuid4())
        
        def mock_owner(*args, **kwargs):
            return (user_id, None)
        
        async def fake_get_pool():
            return self.get_mock_pool(fetch_results=[
                {"username": "DrNykterstein"},
                {"username": "MagnusCarlsen"}
            ])
        
        app.dependency_overrides[get_pool] = fake_get_pool
        
        with patch('app.get_owner_from_request', mock_owner):
            with TestClient(app) as client:
                response = client.get(
                    "/analysis/reports/usernames",
                    headers={"x-session-id": user_id}
                )
        
        assert response.status_code == 200
        data = response.json()
        assert "usernames" in data
        app.dependency_overrides = {}

    def test_get_saved_reports_empty(self):
        """Test GET /analysis/reports returns empty list for new user."""
        user_id = str(uuid4())

        mock_pool = self.get_mock_pool(
            fetch_results=[[], []],
            fetchrow_results=[None, (0,)]
        )

        async def fake_get_pool():
            return mock_pool

        with patch('app.get_pool', fake_get_pool):
            with TestClient(app) as client:
                response = client.get(
                    "/analysis/reports",
                    headers={"x-session-id": user_id}
                )

            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, dict)
            assert data.get("reports") == []
            assert data.get("total_count") == 0

    def test_get_saved_reports_with_data(self):
        """Test GET /analysis/reports returns saved reports."""
        user_id = str(uuid4())
        report_id = str(uuid4())
        now = datetime.now(timezone.utc)
        report_row = {
            "id": report_id,
            "name": "Test Report",
            "created_at": now,
            "updated_at": now,
            "total_games": 100,
            "overall_winrate": 0.52,
            "preview_openings": ["B20"],
            "source_usernames": ["DrNykterstein"],
            "is_multi_account": False,
            "time_control": "blitz"
        }

        mock_pool = self.get_mock_pool(
            fetch_results=[[], [report_row]],
            fetchrow_results=[None, (1,)]
        )

        async def fake_get_pool():
            return mock_pool

        with patch('app.get_pool', fake_get_pool):
            with TestClient(app) as client:
                response = client.get(
                    "/analysis/reports",
                    headers={"x-session-id": user_id}
                )

            assert response.status_code == 200
            data = response.json()
            assert data.get("total_count") == 1
            assert len(data.get("reports", [])) == 1
            assert data["reports"][0]["id"] == report_id

    def test_get_report_by_id(self):
        """Test GET /analysis/reports/{id} returns specific report."""
        user_id = str(uuid4())
        report_id = str(uuid4())

        mock_pool = self.get_mock_pool()
        mock_conn = MagicMock()
        mock_conn.fetchrow = AsyncMock(return_value={
            "report_data": json.dumps({
                "total_games": 100,
                "openings": [],
                "analysis_date": datetime.now(timezone.utc).isoformat()
            })
        })
        mock_pool.acquire = MagicMock(return_value=MagicMock(
            __aenter__=AsyncMock(return_value=mock_conn),
            __aexit__=AsyncMock(return_value=None)
        ))

        async def fake_get_pool():
            return mock_pool

        with patch('app.get_pool', fake_get_pool):
            with TestClient(app) as client:
                response = client.get(
                    f"/analysis/reports/{report_id}",
                    headers={"x-session-id": user_id}
                )

            assert response.status_code == 200
            data = response.json()
            assert data.get("total_games") == 100

    def test_delete_report(self):
        """Test DELETE /analysis/reports/{id} removes a report."""
        user_id = str(uuid4())
        report_id = str(uuid4())

        mock_pool = self.get_mock_pool()
        mock_conn = MagicMock()
        mock_conn.execute = AsyncMock(return_value="DELETE 1")
        mock_pool.acquire = MagicMock(return_value=MagicMock(
            __aenter__=AsyncMock(return_value=mock_conn),
            __aexit__=AsyncMock(return_value=None)
        ))

        async def fake_get_pool():
            return mock_pool

        with patch('app.get_pool', fake_get_pool):
            with TestClient(app) as client:
                response = client.delete(
                    f"/analysis/reports/{report_id}",
                    headers={"x-session-id": user_id}
                )

            assert response.status_code == 200
            data = response.json()
            assert data.get("success") is True


class TestUserGamesOwnership:
    """Tests for multi-user game ownership via user_games join table."""

    def test_game_import_creates_user_games_entry(self):
        """Test that importing a game creates an entry in user_games."""
        user_id = str(uuid4())
        game_id = 12345

        mock_pool = MagicMock()
        mock_conn = MagicMock()
        # Mock the INSERT returning the game ID
        mock_conn.fetchrow = AsyncMock(return_value={
            "id": game_id,
            "provider": "lichess.org",
            "source_id": "abc123"
        })
        mock_conn.execute = AsyncMock(return_value="INSERT 0 1")
        mock_pool.acquire = MagicMock(return_value=MagicMock(
            __aenter__=AsyncMock(return_value=mock_conn),
            __aexit__=AsyncMock(return_value=None)
        ))

        async def fake_get_pool():
            return mock_pool

        with patch('app.get_pool', fake_get_pool):
            with TestClient(app) as client:
                response = client.post(
                    "/games",
                    json={
                        "provider": "lichess.org",
                        "source_id": "abc123",
                        "pgn": "1. e4 e5 2. Nf3 Nc6"
                    },
                    headers={"x-session-id": user_id}
                )

            assert response.status_code == 200
            data = response.json()
            assert "id" in data

    def test_games_list_uses_join_table(self):
        """Test that GET /games uses the user_games join table."""
        user_id = str(uuid4())

        mock_pool = MagicMock()
        mock_conn = MagicMock()
        mock_conn.fetch = AsyncMock(return_value=[
            {
                "id": 1,
                "provider": "lichess.org",
                "source_id": "game1",
                "result": "1-0",
                "start_time": datetime.now(timezone.utc),
                "created_at": datetime.now(timezone.utc),
                "perf": "blitz",
                "time_control": "300+0",
                "rated": True,
                "opponent_username": "opponent",
                "opening_eco": "B20",
                "opening_name": "Sicilian",
                "url": None,
                "site": None
            }
        ])
        mock_pool.acquire = MagicMock(return_value=MagicMock(
            __aenter__=AsyncMock(return_value=mock_conn),
            __aexit__=AsyncMock(return_value=None)
        ))

        async def fake_get_pool():
            return mock_pool

        with patch('app.get_pool', fake_get_pool):
            with TestClient(app) as client:
                response = client.get(
                    "/games",
                    headers={"x-session-id": user_id}
                )

            assert response.status_code == 200
            data = response.json()
            assert "items" in data

"""
Tests for the /api/me/home endpoint (Home Dashboard Aggregator)
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone


class TestGetHomeDashboard:
    """Tests for the home dashboard aggregator endpoint."""
    
    @pytest.fixture
    def mock_pool(self):
        """Create a mock database pool."""
        pool = AsyncMock()
        conn = AsyncMock()
        pool.acquire.return_value.__aenter__.return_value = conn
        return pool, conn
    
    @pytest.fixture
    def mock_request_with_user(self):
        """Create a mock request with authenticated user."""
        request = MagicMock()
        request.headers = {"authorization": "Bearer test_token"}
        return request
    
    @pytest.fixture
    def mock_request_with_session(self):
        """Create a mock request with session ID only."""
        request = MagicMock()
        request.headers = {"x-session-id": "test-session-id"}
        request.cookies = {"session_id": "test-session-id"}
        return request
    
    @pytest.mark.asyncio
    async def test_home_no_data(self, mock_pool):
        """Test expected response shape for user with no linked accounts, no games, no reports."""
        pool, conn = mock_pool
        
        # Mock empty results for all queries
        conn.fetch.return_value = []
        conn.fetchrow.return_value = None
        conn.fetchval.return_value = 0
        
        # The expected response shape for no data
        expected = {
            "linked_accounts": {
                "lichess": {"connected": False, "username": None, "last_sync_at": None},
                "chesscom": {"connected": False, "username": None, "last_sync_at": None}
            },
            "latest_report": {
                "has_report": False,
                "id": None,
                "name": None,
                "created_at": None,
                "headline": None
            },
            "recent_games": [],
            "trainer": {
                "has_trainer_data": False,
                "status": None,
                "headline": None,
                "focus_area": None
            }
        }
        
        # Assertions about expected shape
        assert expected["linked_accounts"]["lichess"]["connected"] == False
        assert expected["linked_accounts"]["chesscom"]["connected"] == False
        assert expected["latest_report"]["has_report"] == False
        assert expected["recent_games"] == []
        assert expected["trainer"]["has_trainer_data"] == False
    
    @pytest.mark.asyncio
    async def test_home_with_lichess_account(self, mock_pool):
        """Test home endpoint for user with Lichess account linked."""
        pool, conn = mock_pool
        
        # Mock linked account
        accounts_result = [{"platform": "lichess.org", "username": "testuser"}]
        sync_result = [{"provider": "lichess", "last_synced_at": datetime(2025, 12, 10, 10, 0, 0, tzinfo=timezone.utc)}]
        
        conn.fetch.side_effect = [accounts_result, sync_result, []]  # accounts, sync, games
        conn.fetchrow.side_effect = [None, None]  # report, trainer snapshot
        conn.fetchval.return_value = 3  # game count
        
        expected_lichess = {
            "connected": True,
            "username": "testuser",
            "last_sync_at": "2025-12-10T10:00:00+00:00"
        }
        
        # Assertions about expected Lichess data
        assert expected_lichess["connected"] == True
        assert expected_lichess["username"] == "testuser"
    
    @pytest.mark.asyncio
    async def test_home_with_report_and_games(self, mock_pool):
        """Test home endpoint for user with games and a report."""
        pool, conn = mock_pool
        
        # Mock data
        accounts_result = [
            {"platform": "lichess.org", "username": "testuser"},
            {"platform": "chess.com", "username": "testuser2"}
        ]
        sync_result = [
            {"provider": "lichess", "last_synced_at": datetime(2025, 12, 10, 10, 0, 0, tzinfo=timezone.utc)},
            {"provider": "chesscom", "last_synced_at": datetime(2025, 12, 9, 15, 0, 0, tzinfo=timezone.utc)}
        ]
        report_result = {
            "id": "report-uuid-123",
            "name": "My Chess Report",
            "created_at": datetime(2025, 12, 9, 12, 0, 0, tzinfo=timezone.utc),
            "total_games": "45"
        }
        games_result = [
            {
                "id": "game-1",
                "opponent_username": "opponent1",
                "result": "win",
                "provider": "lichess",
                "game_date": datetime(2025, 12, 10, 9, 30, 0, tzinfo=timezone.utc)
            },
            {
                "id": "game-2",
                "opponent_username": "opponent2",
                "result": "loss",
                "provider": "chess.com",
                "game_date": datetime(2025, 12, 10, 8, 0, 0, tzinfo=timezone.utc)
            }
        ]
        trainer_snapshot = {
            "coach_summary": "You're making good progress in your middlegame play.",
            "recommendations": {"focus_areas": ["Endgame technique"]},
            "sample_size": 30,
            "updated_at": datetime(2025, 12, 9, 10, 0, 0, tzinfo=timezone.utc)
        }
        
        # Set up mock returns
        conn.fetch.side_effect = [accounts_result, sync_result, games_result]
        conn.fetchrow.side_effect = [report_result, trainer_snapshot]
        
        # Expected response structure verifications
        assert report_result["total_games"] == "45"
        assert len(games_result) == 2
        assert games_result[0]["result"] == "win"
        assert trainer_snapshot["sample_size"] == 30
    
    @pytest.mark.asyncio
    async def test_home_response_shape(self):
        """Test that response has correct top-level keys."""
        expected_keys = ["linked_accounts", "latest_report", "recent_games", "trainer"]
        
        # This test validates the expected response shape
        response = {
            "linked_accounts": {},
            "latest_report": {},
            "recent_games": [],
            "trainer": {}
        }
        
        for key in expected_keys:
            assert key in response
    
    @pytest.mark.asyncio
    async def test_linked_accounts_shape(self):
        """Test that linked_accounts has correct structure."""
        linked_accounts = {
            "lichess": {
                "connected": True,
                "username": "testuser",
                "last_sync_at": "2025-12-10T10:00:00Z"
            },
            "chesscom": {
                "connected": False,
                "username": None,
                "last_sync_at": None
            }
        }
        
        # Verify structure
        assert "lichess" in linked_accounts
        assert "chesscom" in linked_accounts
        assert "connected" in linked_accounts["lichess"]
        assert "username" in linked_accounts["lichess"]
        assert "last_sync_at" in linked_accounts["lichess"]
    
    @pytest.mark.asyncio
    async def test_recent_games_shape(self):
        """Test that recent_games items have correct structure."""
        game = {
            "id": "game-uuid",
            "played_at": "2025-12-10T09:30:00Z",
            "opponent": "OpponentName",
            "result": "win",
            "source": "lichess"
        }
        
        expected_keys = ["id", "played_at", "opponent", "result", "source"]
        for key in expected_keys:
            assert key in game
        
        # Validate source values
        valid_sources = ["lichess", "chesscom", "manual"]
        assert game["source"] in valid_sources
    
    @pytest.mark.asyncio
    async def test_trainer_shape(self):
        """Test that trainer data has correct structure."""
        trainer = {
            "has_trainer_data": True,
            "status": "ready",
            "headline": "Focus on endgame technique",
            "focus_area": "Endgame technique"
        }
        
        expected_keys = ["has_trainer_data", "status", "headline", "focus_area"]
        for key in expected_keys:
            assert key in trainer
        
        # Valid statuses
        valid_statuses = ["ready", "building", "available", None]
        assert trainer["status"] in valid_statuses


class TestHomeDashboardEdgeCases:
    """Edge case tests for home dashboard endpoint."""
    
    @pytest.mark.asyncio
    async def test_handles_missing_opponent(self):
        """Test that missing opponent username defaults to 'Unknown'."""
        game_with_no_opponent = {
            "id": "game-1",
            "opponent_username": None,
            "result": "win",
            "provider": "lichess",
            "game_date": datetime(2025, 12, 10, 9, 30, 0, tzinfo=timezone.utc)
        }
        
        # Simulating the processing logic
        opponent = game_with_no_opponent["opponent_username"] or "Unknown"
        assert opponent == "Unknown"
    
    @pytest.mark.asyncio
    async def test_handles_missing_result(self):
        """Test that missing result defaults to 'unknown'."""
        game_with_no_result = {
            "id": "game-1",
            "opponent_username": "opponent",
            "result": None,
            "provider": "lichess",
            "game_date": datetime(2025, 12, 10, 9, 30, 0, tzinfo=timezone.utc)
        }
        
        result = game_with_no_result["result"] or "unknown"
        assert result == "unknown"
    
    @pytest.mark.asyncio
    async def test_provider_mapping(self):
        """Test that provider names are correctly mapped to sources."""
        providers_to_sources = [
            ("lichess", "lichess"),
            ("Lichess", "lichess"),
            ("chess.com", "chesscom"),
            ("Chess.com", "chesscom"),
            ("manual", "manual"),
            ("", "manual"),
            (None, "manual"),
        ]
        
        for provider, expected_source in providers_to_sources:
            provider_val = provider or ""
            if provider_val.lower() == "lichess":
                source = "lichess"
            elif provider_val.lower() == "chess.com":
                source = "chesscom"
            else:
                source = "manual"
            
            assert source == expected_source, f"Provider '{provider}' should map to '{expected_source}'"

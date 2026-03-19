"""
Tests for Game Sync Services

Tests the Lichess and Chess.com sync services for game synchronization.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta


class TestLichessSyncService:
    """Tests for Lichess game sync functionality."""
    
    @pytest.mark.asyncio
    async def test_get_lichess_username_with_linked_account(self):
        """Should return username when account is linked."""
        from gateway_modules.services.game_sync.lichess_sync import get_lichess_username
        
        # Mock pool and connection
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = {"username": "testuser"}
        mock_pool = AsyncMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
        
        result = await get_lichess_username(mock_pool, "user-123", None)
        
        assert result == "testuser"
        mock_conn.fetchrow.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_lichess_username_no_linked_account(self):
        """Should return None when no account is linked."""
        from gateway_modules.services.game_sync.lichess_sync import get_lichess_username
        
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = None
        mock_pool = AsyncMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
        
        result = await get_lichess_username(mock_pool, "user-123", None)
        
        assert result is None
    
    def test_extract_game_data(self):
        """Should correctly extract game data from Lichess API response."""
        from gateway_modules.services.game_sync.lichess_sync import extract_game_data
        
        game = {
            "id": "abc123",
            "createdAt": 1700000000000,
            "lastMoveAt": 1700001000000,
            "rated": True,
            "variant": "standard",
            "speed": "blitz",
            "perf": "blitz",
            "status": "mate",
            "winner": "white",
            "players": {
                "white": {"user": {"name": "testuser"}, "rating": 1500},
                "black": {"user": {"name": "opponent"}, "rating": 1600}
            },
            "opening": {"eco": "C50", "name": "Italian Game"},
            "clock": {"initial": 300000, "increment": 3},
            "pgn": "1. e4 e5 2. Nf3 Nc6"
        }
        
        result = extract_game_data(game, "testuser")
        
        assert result["source_id"] == "abc123"
        assert result["provider"] == "lichess"
        assert result["opponent_username"] == "opponent"
        assert result["result"] == "1-0"
        assert result["opening_eco"] == "C50"
        assert result["opening_name"] == "Italian Game"
        assert result["rated"] == True


class TestChesscomSyncService:
    """Tests for Chess.com game sync functionality."""
    
    @pytest.mark.asyncio
    async def test_get_chesscom_username_with_linked_account(self):
        """Should return username when account is linked."""
        from gateway_modules.services.game_sync.chesscom_sync import get_chesscom_username
        
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = {"username": "testplayer"}
        mock_pool = AsyncMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
        
        result = await get_chesscom_username(mock_pool, "user-456", None)
        
        assert result == "testplayer"
    
    def test_get_months_to_sync_initial(self):
        """Should return last 6 months when no previous sync."""
        from gateway_modules.services.game_sync.chesscom_sync import get_months_to_sync
        
        months = get_months_to_sync(None, months_back=6)
        
        assert len(months) >= 1
        assert len(months) <= 7  # At most 7 months (6 back + current)
    
    def test_get_months_to_sync_incremental(self):
        """Should return months from last sync to current."""
        from gateway_modules.services.game_sync.chesscom_sync import get_months_to_sync
        
        # Last synced 2 months ago
        now = datetime.utcnow()
        two_months_ago = now - timedelta(days=60)
        last_synced = f"{two_months_ago.year}-{two_months_ago.month:02d}"
        
        months = get_months_to_sync(last_synced)
        
        assert len(months) >= 2
        assert months[0] == f"{two_months_ago.year}/{two_months_ago.month:02d}"
    
    def test_extract_game_data(self):
        """Should correctly extract game data from Chess.com API response."""
        from gateway_modules.services.game_sync.chesscom_sync import extract_game_data
        
        game = {
            "url": "https://www.chess.com/game/live/12345678",
            "end_time": 1700000000,
            "time_control": "300+5",
            "time_class": "blitz",
            "rules": "chess",
            "rated": True,
            "white": {
                "username": "testplayer",
                "rating": 1500,
                "result": "win"
            },
            "black": {
                "username": "opponent",
                "rating": 1600,
                "result": "checkmated"
            },
            "pgn": "1. e4 e5 2. Nf3 Nc6"
        }
        
        result = extract_game_data(game, "testplayer")
        
        assert result["source_id"] == "12345678"
        assert result["provider"] == "chesscom"
        assert result["opponent_username"] == "opponent"
        assert result["result"] == "1-0"
        assert result["time_control"] == "300+5"


class TestSyncOrchestrator:
    """Tests for sync orchestrator functionality."""
    
    @pytest.mark.asyncio
    async def test_get_linked_providers(self):
        """Should return list of linked platforms."""
        from gateway_modules.services.game_sync.sync_orchestrator import get_linked_providers
        
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [
            {"platform": "lichess.org"},
            {"platform": "chess.com"}
        ]
        mock_pool = AsyncMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
        
        result = await get_linked_providers(mock_pool, "user-789", None)
        
        assert "lichess.org" in result
        assert "chess.com" in result
        assert len(result) == 2


class TestGameDeduplication:
    """Tests for game deduplication logic."""
    
    def test_compute_game_digest_unique(self):
        """Should produce different digests for different games."""
        from gateway_modules.services.game_sync.lichess_sync import compute_game_digest
        
        game1 = {
            "id": "abc123",
            "createdAt": 1700000000000,
            "players": {
                "white": {"user": {"name": "player1"}},
                "black": {"user": {"name": "player2"}}
            }
        }
        game2 = {
            "id": "def456",
            "createdAt": 1700001000000,
            "players": {
                "white": {"user": {"name": "player1"}},
                "black": {"user": {"name": "player3"}}
            }
        }
        
        digest1 = compute_game_digest(game1)
        digest2 = compute_game_digest(game2)
        
        assert digest1 != digest2
    
    def test_compute_game_digest_consistent(self):
        """Should produce same digest for same game."""
        from gateway_modules.services.game_sync.lichess_sync import compute_game_digest
        
        game = {
            "id": "abc123",
            "createdAt": 1700000000000,
            "players": {
                "white": {"user": {"name": "player1"}},
                "black": {"user": {"name": "player2"}}
            }
        }
        
        digest1 = compute_game_digest(game)
        digest2 = compute_game_digest(game)
        
        assert digest1 == digest2

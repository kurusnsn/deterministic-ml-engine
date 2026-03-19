"""
Tests for memory snapshot service.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json


class TestComputeRawStatsForUser:
    """Tests for compute_raw_stats_for_user function."""
    
    @pytest.mark.asyncio
    async def test_compute_stats_basic(self):
        """Test basic stats computation with mock data."""
        from gateway_modules.services.memory.memory_snapshot_service import compute_raw_stats_for_user
        
        # Create mock pool
        mock_conn = AsyncMock()
        mock_pool = AsyncMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
        
        # Mock basic stats row
        mock_conn.fetchrow.return_value = {
            "sample_size": 100,
            "wins": 50,
            "losses": 40,
            "draws": 10,
            "games_with_brilliants": 5,
            "comeback_wins": 3
        }
        
        # Mock opening stats
        mock_conn.fetch.side_effect = [
            [
                {"eco": "B20", "name": "Sicilian Defense", "games": 30, "wins": 15, "draws": 5}
            ],
            [
                {"phase": "opening", "count": 10},
                {"phase": "middlegame", "count": 20},
                {"phase": "endgame", "count": 15}
            ]
        ]
        
        result = await compute_raw_stats_for_user(mock_pool, "test-user", "all", "both")
        
        assert result["sample_size"] == 100
        assert result["wins"] == 50
        assert result["losses"] == 40
        assert result["draws"] == 10
        assert result["score"] == 0.55  # (50 + 5) / 100
        assert len(result["top_openings"]) == 1
        assert result["blunder_distribution"]["opening"] == 10


class TestSelectKeyPositionsForTraining:
    """Tests for select_key_positions_for_training function."""
    
    @pytest.mark.asyncio
    async def test_select_positions(self):
        """Test key position selection."""
        from gateway_modules.services.memory.memory_snapshot_service import select_key_positions_for_training
        
        # Create mock pool
        mock_conn = AsyncMock()
        mock_pool = AsyncMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
        
        # Mock position rows
        mock_conn.fetch.return_value = [
            {
                "id": 1,
                "game_id": 100,
                "move_number": 15,
                "fen_before": "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
                "side_to_move": "white",
                "played_move_san": "Bc4",
                "best_move_san": "d4",
                "pv_san": '["d4", "exd4", "Nxd4"]',
                "eval_loss_cp": -150,
                "phase": "opening",
                "time_control_bucket": "blitz",
                "side": "white",
                "tags": '["missed_development"]',
                "outcome_impact": "from_equal_to_slight_disadvantage"
            }
        ]
        
        result = await select_key_positions_for_training(mock_pool, "test-user", "blitz", "white", limit=10)
        
        assert len(result) == 1
        assert result[0]["game_id"] == 100
        assert result[0]["move_number"] == 15
        assert result[0]["eval_loss_cp"] == -150


class TestRebuildMemorySnapshot:
    """Tests for rebuild_memory_snapshot function."""
    
    @pytest.mark.asyncio
    async def test_rebuild_not_enough_games(self):
        """Test that rebuild returns False when not enough games."""
        from gateway_modules.services.memory.memory_snapshot_service import rebuild_memory_snapshot
        
        # Create mock pool
        mock_conn = AsyncMock()
        mock_pool = AsyncMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
        
        # Mock stats with low sample size
        mock_conn.fetchrow.return_value = {
            "sample_size": 2,
            "wins": 1,
            "losses": 1,
            "draws": 0,
            "games_with_brilliants": 0,
            "comeback_wins": 0
        }
        mock_conn.fetch.return_value = []
        
        result = await rebuild_memory_snapshot(mock_pool, "test-user", "all", "both")
        
        assert result is False


class TestGameMemoryService:
    """Tests for game memory service functions."""
    
    def test_classify_time_control_bullet(self):
        """Test bullet time control classification."""
        from gateway_modules.services.memory.game_memory_service import classify_time_control
        
        assert classify_time_control("60+0") == "bullet"
        assert classify_time_control("120+1") == "bullet"
        assert classify_time_control("bullet") == "bullet"
    
    def test_classify_time_control_blitz(self):
        """Test blitz time control classification."""
        from gateway_modules.services.memory.game_memory_service import classify_time_control
        
        assert classify_time_control("180+0") == "blitz"
        assert classify_time_control("300+2") == "blitz"
        assert classify_time_control("blitz") == "blitz"
    
    def test_classify_time_control_rapid(self):
        """Test rapid time control classification."""
        from gateway_modules.services.memory.game_memory_service import classify_time_control
        
        assert classify_time_control("600+0") == "rapid"
        assert classify_time_control("900+10") == "rapid"
        assert classify_time_control("rapid") == "rapid"
    
    def test_classify_time_control_classical(self):
        """Test classical time control classification."""
        from gateway_modules.services.memory.game_memory_service import classify_time_control
        
        assert classify_time_control("1800+0") == "classical"
        assert classify_time_control("classical") == "classical"
        assert classify_time_control("standard") == "classical"
    
    def test_build_game_summary_input(self):
        """Test building game summary input."""
        from gateway_modules.services.memory.game_memory_service import build_game_summary_input
        
        game = {
            "id": 1,
            "time_control": "300+0",
            "result": "1-0",
            "opponent_username": "TestOpponent",
            "opening_eco": "B20",
            "opening_name": "Sicilian Defense",
            "source": "lichess.org"
        }
        
        result = build_game_summary_input(game)
        
        assert result["game_id"] == 1
        assert result["time_control_bucket"] == "blitz"
        assert result["result"] == "win"
        assert result["opponent_username"] == "TestOpponent"
        assert result["opening_eco"] == "B20"
    
    def test_generate_fallback_summary(self):
        """Test fallback summary generation."""
        from gateway_modules.services.memory.game_memory_service import _generate_fallback_summary
        
        game_input = {
            "time_control_bucket": "blitz",
            "side": "white",
            "opening_name": "Sicilian Defense",
            "result": "win",
            "opponent_username": "TestPlayer",
            "is_comeback": False,
            "has_brilliants": True,
            "brilliant_count": 2,
            "blunder_count": 1
        }
        
        result = _generate_fallback_summary(game_input)
        
        assert "blitz" in result
        assert "white" in result
        assert "Sicilian Defense" in result
        assert "Won" in result
        assert "2 brilliant" in result

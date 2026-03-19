"""
Performance tests for 3-tier architecture.

Tests ensure:
1. Tier 1 (heuristics) responds in <100ms
2. Heuristics work when Modal services are offline
3. GPU services (LC0, LLM) never block heuristics response
"""

import time
import pytest
from unittest.mock import patch, MagicMock
import asyncio

# Import the modules under test
from gateway_modules.services.heuristics_service import calculate_position_heuristics
from gateway_modules.services.heuristic_narrator import render_non_llm_commentary


class TestTier1Performance:
    """Test Tier 1 (heuristics) performance guarantees."""
    
    @pytest.fixture
    def sample_positions(self):
        """Various positions to test performance across game phases."""
        return [
            # Starting position
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            # After 1.e4
            "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
            # After 1.e4 c5 (Sicilian)
            "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2",
            # Italian Game
            "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
            # Complex middlegame
            "r2q1rk1/1pp2ppp/p1np1n2/2b1p1B1/2B1P1b1/2NP1N2/PPP2PPP/R2QR1K1 w - - 0 10",
            # Endgame
            "8/8/3k4/8/3K4/8/3P4/8 w - - 0 1",
        ]
    
    def test_heuristics_under_100ms(self, sample_positions):
        """Tier 1 heuristics must respond in <100ms for each position."""
        for fen in sample_positions:
            start = time.perf_counter()
            result = calculate_position_heuristics(fen)
            elapsed_ms = (time.perf_counter() - start) * 1000
            
            assert elapsed_ms < 100, f"Heuristics took {elapsed_ms:.1f}ms for {fen[:30]}..."
            assert result is not None
            assert "position_facts" in result or "error" not in result
    
    def test_heuristics_p95_under_100ms(self, sample_positions):
        """Test p95 latency is under 100ms across many calls."""
        latencies = []
        
        # Run multiple iterations
        for _ in range(5):
            for fen in sample_positions:
                start = time.perf_counter()
                calculate_position_heuristics(fen)
                latencies.append((time.perf_counter() - start) * 1000)
        
        # Sort and get p95
        latencies.sort()
        p95_index = int(len(latencies) * 0.95)
        p95_latency = latencies[p95_index]
        
        assert p95_latency < 100, f"P95 latency is {p95_latency:.1f}ms, should be <100ms"
    
    def test_full_tier1_pipeline_under_100ms(self, sample_positions):
        """Full Tier 1 pipeline (heuristics + narrator) must be <100ms."""
        for fen in sample_positions:
            start = time.perf_counter()
            
            # Full pipeline
            heuristics = calculate_position_heuristics(fen)
            commentary = render_non_llm_commentary(
                heuristics=heuristics,
                ply_count=10,
                meta={"game_phase": "middlegame"},
                fen=fen,
                move_facts=None,
                last_move_san="e4",
                engine={"display_eval": "+0.5"},
                opening={},
            )
            
            elapsed_ms = (time.perf_counter() - start) * 1000
            
            assert elapsed_ms < 100, f"Full pipeline took {elapsed_ms:.1f}ms"
            assert "text" in commentary
            assert commentary["text"]  # Non-empty


class TestModalIsolation:
    """Test that heuristics work independently of Modal services."""
    
    def test_heuristics_no_network_calls(self):
        """Heuristics must not make any network calls."""
        fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
        
        # Mock httpx to ensure no network calls
        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__ = MagicMock(side_effect=Exception("Network call attempted!"))
            
            # This should work without network
            result = calculate_position_heuristics(fen)
            
            assert result is not None
            assert "error" not in result or not result.get("error")
    
    def test_heuristics_no_modal_imports(self):
        """Heuristics service must not import Modal."""
        import gateway_modules.services.heuristics_service as hs
        import sys
        
        # Check that modal is not in the service's imports
        assert 'modal' not in dir(hs)
        
        # The module should work even if modal is not installed
        # (We can't uninstall modal in test, but we verify no direct dependency)
    
    def test_narrator_no_modal_imports(self):
        """Narrator service must not import Modal."""
        import gateway_modules.services.heuristic_narrator as hn
        
        assert 'modal' not in dir(hn)


class TestTierIsolation:
    """Test that tiers are properly isolated."""
    
    def test_tier1_returns_independently(self):
        """Tier 1 must return results without waiting for Tier 2/3."""
        fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
        
        start = time.perf_counter()
        
        # Run heuristics (Tier 1)
        heuristics = calculate_position_heuristics(fen)
        commentary = render_non_llm_commentary(
            heuristics=heuristics,
            ply_count=1,
            meta={},
            fen=fen,
            move_facts=None,
            last_move_san="e4",
            engine={},
            opening={},
        )
        
        tier1_time = (time.perf_counter() - start) * 1000
        
        # Tier 1 must complete in <100ms regardless of Tier 2/3 status
        assert tier1_time < 100, f"Tier 1 took {tier1_time:.1f}ms"
        assert commentary.get("text")


class TestSettingsFlags:
    """Test that feature flags work correctly."""
    
    def test_lc0_disabled_does_not_break_heuristics(self):
        """Disabling LC0 should not affect heuristics."""
        import gateway_modules.settings as settings
        
        # Save original
        original = settings.ENABLE_LC0_ANALYSIS
        
        try:
            settings.ENABLE_LC0_ANALYSIS = False
            
            # Heuristics should still work
            fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
            result = calculate_position_heuristics(fen)
            
            assert result is not None
        finally:
            settings.ENABLE_LC0_ANALYSIS = original
    
    def test_llm_disabled_does_not_break_heuristics(self):
        """Disabling LLM should not affect heuristics."""
        import gateway_modules.settings as settings
        
        original = settings.ENABLE_LLM_COMMENTARY
        
        try:
            settings.ENABLE_LLM_COMMENTARY = False
            
            fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
            result = calculate_position_heuristics(fen)
            
            assert result is not None
        finally:
            settings.ENABLE_LLM_COMMENTARY = original


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

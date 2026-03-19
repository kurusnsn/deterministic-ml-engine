"""
Integration tests for extended repertoire report generation with new features.
"""

import pytest
import asyncio
from gateway_modules.services.repertoire_service import generate_repertoire_report
from gateway_modules.models.repertoire import RepertoireAnalysisRequest
from gateway_modules.services.opening_analyzer import NormalizedGame


@pytest.mark.asyncio
class TestExtendedReportGeneration:
    """Integration tests for report generation with new features."""

    async def create_test_pool(self):
        """Create a test database pool."""
        # This would normally connect to a test database
        # For now, we'll skip tests that require DB
        pytest.skip("Requires test database setup")

    async def create_test_game_with_pgn(self, game_id: str, pgn: str) -> NormalizedGame:
        """Helper to create a test game with PGN."""
        return NormalizedGame(
            id=game_id,
            pgn=pgn,
            opening_eco="B20",
            white=None,
            black=None,
            result="1-0"
        )

    async def create_test_game_without_pgn(self, game_id: str) -> NormalizedGame:
        """Helper to create a test game without PGN."""
        game = NormalizedGame(
            id=game_id,
            pgn=None,
            opening_eco="B20",
            white=None,
            black=None,
            result="1-0"
        )
        return game

    @pytest.mark.skip("Requires database and Stockfish service")
    async def test_full_report_with_move_analysis(self):
        """Test full report generation with move analysis populated."""
        pool = await self.create_test_pool()
        
        # Create test games with PGN
        games = [
            await self.create_test_game_with_pgn(
                "1",
                "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7"
            )
        ]
        
        request = RepertoireAnalysisRequest(
            user_id="test_user",
            min_games=1,
            max_moves_per_game=10
        )
        
        # This would require mocking or test setup
        # report = await generate_repertoire_report(pool, request)
        
        # Verify new fields exist
        # assert report.engine_analysis is not None
        # assert len(report.engine_analysis["moves"]) > 0
        # assert report.weak_lines is not None
        # assert report.generated_puzzles is not None

    @pytest.mark.skip("Requires database setup")
    async def test_graceful_degradation_no_pgn(self):
        """Test that reports without PGN still generate correctly."""
        pool = await self.create_test_pool()
        
        # Games without PGN should still generate report
        games = [
            await self.create_test_game_without_pgn("1")
        ]
        
        request = RepertoireAnalysisRequest(
            user_id="test_user",
            min_games=1
        )
        
        # report = await generate_repertoire_report(pool, request)
        
        # Old fields should still work
        # assert report.opening_stats is not None
        # New fields should be None or empty
        # assert report.engine_analysis is None or len(report.engine_analysis["moves"]) == 0

    @pytest.mark.skip("Requires database and Stockfish service")
    async def test_report_structure_matches_schema(self):
        """Test that report structure matches expected schema."""
        pool = await self.create_test_pool()
        
        request = RepertoireAnalysisRequest(
            user_id="test_user",
            min_games=1
        )
        
        # report = await generate_repertoire_report(pool, request)
        
        # Verify all required fields exist
        # assert hasattr(report, 'user_id')
        # assert hasattr(report, 'total_games')
        # assert hasattr(report, 'white_repertoire')
        # assert hasattr(report, 'black_repertoire')
        # assert hasattr(report, 'insights')
        
        # Verify new optional fields
        # assert hasattr(report, 'engine_analysis')
        # assert hasattr(report, 'weak_lines')
        # assert hasattr(report, 'generated_puzzles')
        # assert hasattr(report, 'charts_additional')

    @pytest.mark.skip("Requires database setup")
    async def test_weak_lines_identification(self):
        """Test that weak lines are correctly identified."""
        pool = await self.create_test_pool()
        
        # Create multiple games with same weak line
        # ... test implementation ...
        pass

    @pytest.mark.skip("Requires database setup")
    async def test_puzzle_generation_from_blunders(self):
        """Test that puzzles are generated from blunders."""
        pool = await self.create_test_pool()
        
        # Create game with blunder
        # ... test implementation ...
        pass

    def test_request_model_with_max_moves(self):
        """Test that RepertoireAnalysisRequest accepts max_moves_per_game."""
        request = RepertoireAnalysisRequest(
            user_id="test_user",
            min_games=1,
            max_moves_per_game=20
        )
        
        assert request.max_moves_per_game == 20

    def test_request_model_default_max_moves(self):
        """Test default value for max_moves_per_game."""
        request = RepertoireAnalysisRequest(
            user_id="test_user",
            min_games=1
        )
        
        assert request.max_moves_per_game == 40  # Default value







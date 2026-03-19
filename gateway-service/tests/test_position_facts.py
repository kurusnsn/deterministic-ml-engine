"""
Tests for facts-first heuristic system.

Covers:
- compute_position_facts (material, development, phase)
- generate_concept_tags
- Facts integration in evaluate_position_from_heuristics
"""

import chess
import pytest
from gateway_modules.services.heuristics_service import (
    compute_position_facts,
    calculate_position_heuristics
)
from gateway_modules.services.position_evaluation_service import (
    evaluate_position_from_heuristics,
    generate_concept_tags,
    TIER_TO_UI
)


class TestPositionFacts:
    """Test compute_position_facts output."""

    def test_material_counts_start_pos(self):
        """Starting position should have equal material."""
        board = chess.Board()
        facts = compute_position_facts(board, ply_count=0)
        
        white = facts["material"]["white"]
        black = facts["material"]["black"]
        
        assert white["pawns"] == 8
        assert black["pawns"] == 8
        assert white["knights"] == 2
        assert facts["material"]["diff_cp"] == 0
        assert facts["phase"] == "opening"

    def test_development_score_after_e4_Nf3(self):
        """After 1.e4 and 2.Nf3, white dev score should increase."""
        board = chess.Board()
        # 1. e4 e5
        board.push_san("e4")
        board.push_san("e5")
        # 2. Nf3
        board.push_san("Nf3")
        
        facts = compute_position_facts(board)
        dev = facts["development"]
        
        # White has moved e-pawn (not counted in minor dev) and Knight
        # But logic counts pieces on STARTING squares
        # Nf3 means g1 is empty (or has something else, but here empty)
        # So white_undeveloped should be 3 (b1, c1, f1)
        # developed = 1
        assert dev["white_undeveloped_minors"] == 3
        # Black has all 4 minors at home
        assert dev["black_undeveloped_minors"] == 4
        
        assert dev["white_development_score"] == 0.25  # 1/4 developed
        assert dev["black_development_score"] == 0.0

    def test_phase_detection_endgame(self):
        """Low material should be detected as endgame."""
        # King and Pawn vs King
        board = chess.Board("8/8/8/8/8/4P3/4K3/4k3 w - - 0 1")
        facts = compute_position_facts(board)
        
        assert facts["phase"] == "endgame"

    def test_castling_facts(self):
        """Castling status should be correctly detected."""
        # White castled kingside
        board = chess.Board("r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4")
        facts = compute_position_facts(board)
        
        # White king is on g1
        assert facts["castling"]["white_castled"] == True
        assert facts["castling"]["black_castled"] == False
        # White has lost castling RIGHTS (because castled)
        assert facts["castling"]["white_can_castle_kingside"] == False
        assert facts["castling"]["white_king_moved"] == True


class TestConceptTags:
    """Test UI tag generation."""

    def test_opening_development_tag(self):
        """Should generate development lead tag in opening."""
        # White has huge lead: e4, Nf3, Bc4, d3 vs black nothing
        board = chess.Board("rnbqkbnr/pppppppp/8/8/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3")
        
        # Mock heuristics with the facts
        facts = compute_position_facts(board)
        heuristics = {"position_facts": facts}
        meta = {"game_phase": "opening"}
        
        tags = generate_concept_tags(heuristics, meta, ply_count=5)
        
        dev_tag = next((t for t in tags if t["key"] == "development"), None)
        assert dev_tag is not None
        assert dev_tag["tone"] == "good_for_white"

    def test_hanging_piece_tag_warning(self):
        """Hanging piece should generate warning tag."""
        heuristics = {
            "tension": {"has_true_hanging_piece": True},
            "position_facts": {},
        }
        meta = {}
        
        tags = generate_concept_tags(heuristics, meta)
        tag = next((t for t in tags if t["key"] == "hanging"), None)
        
        assert tag is not None
        assert tag["tone"] == "warning"

    def test_trapped_piece_tag(self):
        """Trapped piece should generate tag with appropriate tone."""
        heuristics = {
            "trapped_candidates": [{
                "is_truly_trapped": True,
                "piece": "B",
                "color": "white"
            }]
        }
        meta = {}
        
        tags = generate_concept_tags(heuristics, meta)
        tag = next((t for t in tags if t["key"] == "trapped"), None)
        
        assert tag is not None
        assert "trapped B" in tag["label"]
        # If white piece trapped -> good for black
        assert tag["tone"] == "good_for_black"


class TestEvaluationResponse:
    """Test full response shape."""

    def test_response_contains_new_fields(self):
        """Response should include headline, tags, evidence."""
        board = chess.Board()
        heuristics = calculate_position_heuristics(board.fen(), board)
        
        result = evaluate_position_from_heuristics(
            heuristics=heuristics,
            fen=board.fen(),
            board=board,
        )
        
        assert "headline" in result
        assert "tags" in result
        assert "evidence" in result
        
        # Test headline matches tier mapping
        tier = result["advantage"]
        expected_headline = TIER_TO_UI[tier]["headline"]
        assert result["headline"] == expected_headline

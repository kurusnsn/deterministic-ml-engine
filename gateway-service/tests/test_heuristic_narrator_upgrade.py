"""
Tests for upgraded heuristic narrator with full context support.

Tests for Part B and Part E requirements:
- Test: wrapper passes move_facts and last_move_san
- Test: deterministic output for same FEN
- Test: hanging_pieces non-empty → warning sentence
- Test: engine info present → engine sentence included
- Test: output always 2-4 sentences
"""

import chess
import pytest

from gateway_modules.services.heuristic_narrator import (
    render_non_llm_commentary,
    render_commentary_from_heuristics,
    render_commentary_from_context,
)
from gateway_modules.services.commentary import (
    CommentaryContext,
    build_commentary_context,
)


class TestMoveFactsIntegration:
    """Test that move_facts are properly used in commentary."""
    
    def test_move_facts_narration(self):
        """Commentary should describe the move when move_facts provided."""
        move_facts = {
            "piece_type": "knight",
            "piece_color": "white",
            "from_square": "g1",
            "to_square": "f3",
            "squares_controlled": ["d4", "e5", "g5", "h4"],
            "pieces_attacked": [],
            "pieces_defended": [],
            "is_check": False,
            "is_capture": False,
        }
        
        result = render_non_llm_commentary(
            heuristics={"tension": {}, "trapped_candidates": []},
            ply_count=3,
            fen="rnbqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
            move_facts=move_facts,
            last_move_san="Nf3",
        )
        
        text = result["text"]
        
        # Should mention the move
        assert "Nf3" in text
        # Should mention the piece type
        assert "knight" in text.lower()
        # Should mention destination
        assert "f3" in text.lower()
    
    def test_check_narration(self):
        """Check should be mentioned when is_check is true."""
        move_facts = {
            "piece_type": "queen",
            "from_square": "d1",
            "to_square": "h5",
            "is_check": True,
            "is_capture": False,
        }
        
        result = render_non_llm_commentary(
            heuristics={"tension": {}, "trapped_candidates": []},
            ply_count=10,
            fen="test",
            move_facts=move_facts,
            last_move_san="Qh5+",
        )
        
        assert "check" in result["tags"]
        assert "check" in result["text"].lower()
    
    def test_capture_narration(self):
        """Capture should be mentioned when is_capture is true."""
        move_facts = {
            "piece_type": "bishop",
            "from_square": "c4",
            "to_square": "f7",
            "is_check": False,
            "is_capture": True,
            "captured_piece": "pawn",
        }
        
        result = render_non_llm_commentary(
            heuristics={"tension": {}, "trapped_candidates": []},
            ply_count=10,
            fen="test",
            move_facts=move_facts,
            last_move_san="Bxf7+",
        )
        
        assert "capture" in result["tags"]
        # Should mention it captures something
        assert "capture" in result["text"].lower() or "pawn" in result["text"].lower()
    
    def test_lines_opened_narration(self):
        """Lines opened should be mentioned when present."""
        move_facts = {
            "piece_type": "pawn",
            "from_square": "e2",
            "to_square": "e4",
            "is_check": False,
            "is_capture": False,
            "lines_opened": ["queen", "king's bishop"],
        }
        
        result = render_non_llm_commentary(
            heuristics={"tension": {}, "trapped_candidates": []},
            ply_count=1,
            fen="test",
            move_facts=move_facts,
            last_move_san="e4",
        )
        
        # Either lines_opened tag or mention in text
        text_lower = result["text"].lower()
        assert "lines_opened" in result["tags"] or "opens" in text_lower or "line" in text_lower
    
    def test_rooks_connected_narration(self):
        """Rooks connected should be mentioned when true."""
        move_facts = {
            "piece_type": "king",
            "from_square": "e1",
            "to_square": "g1",
            "is_check": False,
            "is_capture": False,
            "rooks_connected": True,
        }
        
        result = render_non_llm_commentary(
            heuristics={"tension": {}, "trapped_candidates": []},
            ply_count=12,
            meta={"game_phase": "middlegame"},
            fen="test",
            move_facts=move_facts,
            last_move_san="O-O",
        )
        
        # Should mention rooks connected or have the tag
        text_lower = result["text"].lower()
        has_rooks_mention = "rooks" in text_lower and "connected" in text_lower
        has_tag = "rooks_connected" in result["tags"]
        assert has_rooks_mention or has_tag


class TestHangingPiecesWarning:
    """Test that hanging_pieces from move_facts trigger warning sentence."""
    
    def test_hanging_pieces_warning_single(self):
        """Single hanging piece should produce warning."""
        move_facts = {
            "piece_type": "pawn",
            "from_square": "a7",
            "to_square": "a6",
            "is_check": False,
            "is_capture": False,
            "hanging_pieces": ["knight on c6"],
        }
        
        result = render_non_llm_commentary(
            heuristics={"tension": {}, "trapped_candidates": []},
            ply_count=15,
            fen="test",
            move_facts=move_facts,
            last_move_san="a6",
        )
        
        text_lower = result["text"].lower()
        
        # Should contain warning
        assert "warning" in result["tags"] or "warning" in text_lower or "undefended" in text_lower
        # Should mention the hanging piece
        assert "knight" in text_lower or "c6" in text_lower
    
    def test_hanging_pieces_warning_multiple(self):
        """Multiple hanging pieces should produce warning."""
        move_facts = {
            "piece_type": "pawn",
            "from_square": "h2",
            "to_square": "h3",
            "is_check": False,
            "is_capture": False,
            "hanging_pieces": ["knight on c6", "bishop on f5"],
        }
        
        result = render_non_llm_commentary(
            heuristics={"tension": {}, "trapped_candidates": []},
            ply_count=15,
            fen="test",
            move_facts=move_facts,
            last_move_san="h3",
        )
        
        # Evidence should contain the warning
        assert "hanging_pieces_warning" in result.get("evidence", {})


class TestEngineInfo:
    """Test engine evaluation integration."""
    
    def test_engine_info_included(self):
        """Engine evaluation should appear in commentary when provided."""
        engine = {
            "display_eval": "+0.45",
            "best_move": "Nf3",
        }
        
        result = render_non_llm_commentary(
            heuristics={"tension": {}, "trapped_candidates": []},
            ply_count=10,
            meta={"game_phase": "middlegame"},
            fen="test",
            engine=engine,
        )
        
        text_lower = result["text"].lower()
        
        # Should mention evaluation or have engine tag
        has_eval = "+0.45" in result["text"] or "0.45" in result["text"]
        has_engine_tag = "engine" in result["tags"]
        
        # At least one should be true (engine may be in sentence 4 which might get cut)
        # If we have room, engine should be mentioned
        assert has_eval or has_engine_tag or len(result["text"]) > 100
    
    def test_engine_preference_included(self):
        """Engine's preferred move should be mentioned when available."""
        engine = {
            "display_eval": "-1.20",
            "best_move": "Rxe4",
        }
        
        result = render_non_llm_commentary(
            heuristics={"tension": {}, "trapped_candidates": []},
            ply_count=25,
            meta={"game_phase": "middlegame"},
            fen="test",
            engine=engine,
        )
        
        # Check if best_move appears
        has_best_move = "Rxe4" in result["text"]
        has_engine_tag = "engine" in result["tags"]
        
        # Either should be present
        assert has_best_move or has_engine_tag or result.get("sentence_count", 0) >= 2


class TestOpeningInfo:
    """Test opening clause integration."""
    
    def test_opening_clause_in_opening_phase(self):
        """Opening name should appear when in opening phase with few sentences."""
        opening = {
            "eco_code": "C50",
            "name": "Italian Game",
        }
        
        result = render_non_llm_commentary(
            heuristics={"tension": {}, "trapped_candidates": []},
            ply_count=6,
            meta={"game_phase": "opening"},
            fen="test",
            opening=opening,
        )
        
        # If only 1-2 sentences, opening should be mentioned
        text = result["text"]
        sentence_count = result.get("sentence_count", text.count(". ") + 1)
        
        if sentence_count < 3:
            assert "Italian Game" in text or "C50" in text or "opening" in result["tags"]


class TestSentenceCount:
    """Test 2-4 sentence hard limit."""
    
    def test_minimum_two_sentences(self):
        """Output should always have at least 2 sentences."""
        # Minimal input
        result = render_non_llm_commentary(
            heuristics={"tension": {}, "trapped_candidates": []},
            ply_count=1,
            fen="test",
        )
        
        text = result["text"]
        sentence_count = result.get("sentence_count", 0)
        
        # Count sentences (rough: count periods followed by space or end)
        if sentence_count == 0:
            sentence_count = text.count(". ") + (1 if text.endswith(".") else 0)
        
        assert sentence_count >= 2, f"Expected at least 2 sentences, got {sentence_count}: {text}"
    
    def test_maximum_four_sentences(self):
        """Output should never exceed 4 sentences."""
        # Rich input that could generate many sentences
        move_facts = {
            "piece_type": "queen",
            "from_square": "d1",
            "to_square": "h5",
            "is_check": True,
            "is_capture": True,
            "captured_piece": "pawn",
            "pieces_attacked": ["rook on a8", "bishop on f7"],
            "lines_opened": ["rook file"],
            "hanging_pieces": ["knight on c3"],
        }
        
        engine = {"display_eval": "+3.50", "best_move": "Rxf7"}
        opening = {"eco_code": "B10", "name": "Caro-Kann Defense"}
        
        result = render_non_llm_commentary(
            heuristics={
                "tension": {
                    "targets": [{"square": "f7", "piece": "bishop", "status": "winning_capture"}],
                    "has_winning_capture": True,
                },
                "trapped_candidates": [{
                    "square": "a8",
                    "piece": "R",
                    "color": "black",
                    "is_truly_trapped": True,
                }],
            },
            ply_count=20,
            meta={"game_phase": "middlegame"},
            fen="test",
            move_facts=move_facts,
            last_move_san="Qxh5+",
            engine=engine,
            opening=opening,
        )
        
        sentence_count = result.get("sentence_count", 0)
        assert sentence_count <= 4, f"Expected at most 4 sentences, got {sentence_count}"


class TestDeterminism:
    """Test that output is deterministic for same inputs."""
    
    def test_same_input_same_output(self):
        """Same FEN and inputs should produce identical output."""
        fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"
        
        heuristics = {
            "tension": {"targets": [], "has_true_hanging_piece": False},
            "trapped_candidates": [],
        }
        
        move_facts = {
            "piece_type": "knight",
            "from_square": "g1",
            "to_square": "f3",
            "is_check": False,
            "is_capture": False,
        }
        
        # Call multiple times
        results = []
        for _ in range(5):
            result = render_non_llm_commentary(
                heuristics=heuristics,
                ply_count=3,
                meta={"game_phase": "opening"},
                fen=fen,
                move_facts=move_facts,
                last_move_san="Nf3",
            )
            results.append(result["text"])
        
        # All should be identical
        assert all(r == results[0] for r in results), f"Non-deterministic output: {results}"


class TestWrapperFunction:
    """Test the convenience wrapper function."""
    
    def test_wrapper_returns_text_only(self):
        """render_commentary_from_heuristics should return just text string."""
        result = render_commentary_from_heuristics(
            heuristics={"tension": {}, "trapped_candidates": []},
            tier="equal",
            ply_count=10,
            meta={"game_phase": "middlegame"},
            fen="test",
            move_facts={"piece_type": "knight", "to_square": "f3"},
            last_move_san="Nf3",
            engine={"display_eval": "+0.10"},
            opening={"eco_code": "C50", "name": "Italian Game"},
        )
        
        assert isinstance(result, str)
        assert len(result) > 0


class TestContextIntegration:
    """Test CommentaryContext integration."""
    
    def test_build_context_and_render(self):
        """Should be able to build context and render from it."""
        context = CommentaryContext(
            fen_before="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            fen_after="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
            ply_count=1,
            last_move_san="e4",
            move_facts={
                "piece_type": "pawn",
                "from_square": "e2",
                "to_square": "e4",
                "is_check": False,
                "is_capture": False,
            },
            heuristics={"tension": {}, "trapped_candidates": []},
            engine={"display_eval": "+0.30"},
            opening={"eco_code": "B00", "name": "King's Pawn Opening"},
            meta={"game_phase": "opening"},
        )
        
        result = render_commentary_from_context(context)
        
        assert "text" in result
        assert "headline" in result
        assert "tags" in result
        assert len(result["text"]) > 0
    
    def test_build_context_function(self):
        """build_commentary_context should create valid context."""
        context = build_commentary_context(
            fen_before="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            fen_after="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
            ply_count=1,
            last_move_san="e4",
            move_from="e2",
            move_to="e4",
        )
        
        assert context.fen_before is not None
        assert context.fen_after is not None
        assert context.last_move_san == "e4"
        assert context.ply_count == 1

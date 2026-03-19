"""
Tests for Concept Grounding Module.

Tests ensure:
1. Color filtering works correctly (_w_ prefers white, _b_ prefers black)
2. Evidence is capped at 3 per concept
3. No hallucination - evidence comes from decode statements or is verifiably true
4. Passed pawn detection is accurate
"""

import pytest
import chess
from gateway_modules.concepts.concept_grounding import (
    ground_concepts,
    ConceptGrounder,
    ConceptEvidence,
    MAX_EVIDENCE_PER_CONCEPT,
)


# Test fixtures
@pytest.fixture
def sample_fen():
    """Standard test position with active play."""
    return "2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21"


@pytest.fixture
def decode_statements_mixed():
    """Mixed decode statements with both colors."""
    return [
        "the white rook on a7 threatens the black knight on d7",
        "the white rook on a7 can capture the black knight on d7",
        "the white bishop on f4 threatens the black bishop on d5",
        "the black rook on c8 threatens the white rook on a7",
        "the white queen on b2 supports the white bishop on f4",
        "the black queen on d8 supports the black rook on c8",
        "the white bishop on g2 controls square d5",
        "the black knight on d7 is threatened by the white rook",
        "the white pawn on e2 supports the white pawn on f3",
        "the black pawn on f7 protects the king by guarding g6",
    ]


@pytest.fixture
def decode_statements_white_heavy():
    """Statements predominantly about white pieces."""
    return [
        "the white rook on a7 threatens the black knight on d7",
        "the white bishop on f4 threatens the black pawn on e5",
        "the white queen on b2 controls square b7",
        "the white rook on d1 uses the open d file",
        "the white bishop on g2 uses the a8-h1 diagonal",
    ]


@pytest.fixture
def passed_pawn_fen():
    """Position with a clear passed pawn for white on d5."""
    return "8/8/8/3P4/8/8/8/8 w - - 0 1"


@pytest.fixture
def no_passed_pawn_fen():
    """Position with no passed pawns."""
    return "8/3p4/8/3P4/8/8/8/8 w - - 0 1"


class TestColorFiltering:
    """Tests for color-based evidence filtering."""

    def test_grounding_color_filtering_white(self, sample_fen, decode_statements_mixed):
        """_w_ concepts should prefer statements mentioning 'white'."""
        top_concepts = [("Threats_w_high", 0.85)]

        grounded = ground_concepts(sample_fen, decode_statements_mixed, top_concepts)

        evidence = grounded["Threats_w_high"]["evidence"]
        assert len(evidence) > 0

        # Check that white-mentioning statements come first
        white_count = sum(1 for e in evidence if "white" in e.lower())
        assert white_count > 0, "Should have white-mentioning evidence for _w_ concept"

        # First evidence should mention white
        assert "white" in evidence[0].lower(), "First evidence should mention white"

    def test_grounding_color_filtering_black(self, sample_fen, decode_statements_mixed):
        """_b_ concepts should prefer statements mentioning 'black'."""
        top_concepts = [("Threats_b_high", -0.65)]

        grounded = ground_concepts(sample_fen, decode_statements_mixed, top_concepts)

        evidence = grounded["Threats_b_high"]["evidence"]
        assert len(evidence) > 0

        # Check that black-mentioning statements come first
        black_count = sum(1 for e in evidence if "black" in e.lower())
        assert black_count > 0, "Should have black-mentioning evidence for _b_ concept"

    def test_grounding_no_color_suffix(self, sample_fen, decode_statements_mixed):
        """Concepts without color suffix should include all statements."""
        top_concepts = [("Mobility_high", 0.5)]

        grounded = ground_concepts(sample_fen, decode_statements_mixed, top_concepts)

        # Should still produce evidence (even if fewer matches)
        evidence = grounded["Mobility_high"]["evidence"]
        # No color preference, so could have either


class TestEvidenceCaps:
    """Tests for evidence count limits."""

    def test_grounding_caps_at_max(self, sample_fen):
        """Evidence should be capped at MAX_EVIDENCE_PER_CONCEPT per concept."""
        # Many matching statements
        many_statements = [
            f"the white rook on a{i} threatens the black knight on d{i}"
            for i in range(1, 8)
        ]

        top_concepts = [("Threats_w_high", 0.9)]
        grounded = ground_concepts(sample_fen, many_statements, top_concepts)

        evidence = grounded["Threats_w_high"]["evidence"]
        assert len(evidence) <= MAX_EVIDENCE_PER_CONCEPT
        assert len(evidence) == MAX_EVIDENCE_PER_CONCEPT  # Should fill up to max

    def test_grounding_caps_multiple_concepts(self, sample_fen, decode_statements_mixed):
        """Each concept should independently cap at max evidence."""
        top_concepts = [
            ("Threats_w_high", 0.85),
            ("Threats_b_high", 0.65),
            ("Kingsafety_w_high", 0.45),
        ]

        grounded = ground_concepts(sample_fen, decode_statements_mixed, top_concepts)

        for concept_name in grounded:
            evidence = grounded[concept_name]["evidence"]
            assert len(evidence) <= MAX_EVIDENCE_PER_CONCEPT, \
                f"Concept {concept_name} exceeds max evidence"


class TestNoHallucination:
    """Tests ensuring no hallucinated evidence."""

    def test_no_hallucination_exact_subset(self, sample_fen, decode_statements_mixed):
        """Grounded evidence must be exact subset of decode statements."""
        top_concepts = [
            ("Threats_w_high", 0.85),
            ("Kingsafety_b_low", -0.3),
        ]

        grounded = ground_concepts(sample_fen, decode_statements_mixed, top_concepts)

        for concept_name, data in grounded.items():
            for evidence_line in data["evidence"]:
                # Each evidence line must exist in original decode statements
                assert evidence_line in decode_statements_mixed, \
                    f"Evidence '{evidence_line}' not in decode statements"

    def test_no_hallucination_empty_statements(self, sample_fen):
        """Should not hallucinate evidence when decode statements are empty."""
        top_concepts = [("Threats_w_high", 0.85)]

        grounded = ground_concepts(sample_fen, [], top_concepts)

        # Evidence should be empty (no source to hallucinate from)
        evidence = grounded["Threats_w_high"]["evidence"]
        # May have passed pawn evidence if applicable, but nothing else
        for e in evidence:
            if "passed pawn" not in e.lower():
                pytest.fail(f"Hallucinated evidence: {e}")

    def test_no_invented_pieces_or_squares(self, sample_fen, decode_statements_mixed):
        """Evidence must not contain pieces or squares not in decode statements."""
        top_concepts = [("Threats_w_high", 0.85)]

        grounded = ground_concepts(sample_fen, decode_statements_mixed, top_concepts)

        # All evidence should be verbatim from decode statements
        for evidence_line in grounded["Threats_w_high"]["evidence"]:
            assert evidence_line in decode_statements_mixed


class TestPassedPawnDetection:
    """Tests for passed pawn evidence generation."""

    def test_passed_pawn_detected(self, passed_pawn_fen):
        """Passed pawn should be detected and added as evidence."""
        top_concepts = [("Passedpawns_w", 0.8)]

        # Empty decode statements to trigger local detection
        grounded = ground_concepts(passed_pawn_fen, [], top_concepts)

        evidence = grounded["Passedpawns_w"]["evidence"]
        assert len(evidence) == 1
        assert "white has a passed pawn on d5" in evidence[0].lower()

    def test_no_passed_pawn_when_blocked(self, no_passed_pawn_fen):
        """Should not claim passed pawn when blocked by enemy pawn."""
        top_concepts = [("Passedpawns_w", 0.5)]

        grounded = ground_concepts(no_passed_pawn_fen, [], top_concepts)

        evidence = grounded["Passedpawns_w"]["evidence"]
        # Should be empty - pawn on d5 is blocked by pawn on d7
        assert len(evidence) == 0 or "passed pawn" not in str(evidence).lower()

    def test_passed_pawn_verifiable(self, passed_pawn_fen):
        """Passed pawn evidence must be verifiable via python-chess."""
        top_concepts = [("Passedpawns_w", 0.8)]

        grounded = ground_concepts(passed_pawn_fen, [], top_concepts)

        evidence = grounded["Passedpawns_w"]["evidence"]

        for e in evidence:
            if "passed pawn on" in e.lower():
                # Extract square from evidence
                import re
                match = re.search(r"passed pawn on ([a-h][1-8])", e.lower())
                assert match, f"Could not extract square from evidence: {e}"

                sq_name = match.group(1)
                sq = chess.parse_square(sq_name)
                board = chess.Board(passed_pawn_fen)

                # Verify it's actually a pawn on that square
                piece = board.piece_at(sq)
                assert piece is not None, f"No piece on {sq_name}"
                assert piece.piece_type == chess.PAWN, f"Not a pawn on {sq_name}"

                # Verify it's passed (manually check)
                pawn_file = chess.square_file(sq)
                pawn_rank = chess.square_rank(sq)
                color = piece.color
                enemy_pawns = board.pieces(chess.PAWN, not color)

                is_actually_passed = True
                for enemy_sq in enemy_pawns:
                    enemy_file = chess.square_file(enemy_sq)
                    enemy_rank = chess.square_rank(enemy_sq)

                    if abs(enemy_file - pawn_file) <= 1:
                        if color == chess.WHITE and enemy_rank > pawn_rank:
                            is_actually_passed = False
                        elif color == chess.BLACK and enemy_rank < pawn_rank:
                            is_actually_passed = False

                assert is_actually_passed, f"Pawn on {sq_name} is not actually passed"


class TestConceptCategories:
    """Tests for different concept category mappings."""

    def test_threats_category(self, sample_fen, decode_statements_mixed):
        """Threats concepts should match threat-related keywords."""
        top_concepts = [("Threats_w_high", 0.9)]

        grounded = ground_concepts(sample_fen, decode_statements_mixed, top_concepts)

        evidence = grounded["Threats_w_high"]["evidence"]
        for e in evidence:
            e_lower = e.lower()
            assert any(kw in e_lower for kw in ["threatens", "can capture", "x-rays", "is threatened"])

    def test_kingsafety_category(self, sample_fen, decode_statements_mixed):
        """Kingsafety concepts should match king-related keywords."""
        top_concepts = [("Kingsafety_b_high", 0.7)]

        grounded = ground_concepts(sample_fen, decode_statements_mixed, top_concepts)

        evidence = grounded["Kingsafety_b_high"]["evidence"]
        # May be empty if no king safety statements
        for e in evidence:
            e_lower = e.lower()
            assert any(kw in e_lower for kw in ["king", "protects", "controls square f", "controls square g", "controls square h"])

    def test_material_category(self, sample_fen, decode_statements_mixed):
        """Material concepts should match material-related keywords."""
        top_concepts = [("Material_w_up", 0.5)]

        grounded = ground_concepts(sample_fen, decode_statements_mixed, top_concepts)

        evidence = grounded["Material_w_up"]["evidence"]
        for e in evidence:
            e_lower = e.lower()
            assert any(kw in e_lower for kw in ["pawn", "capture", "can capture"])


class TestConceptGrounderClass:
    """Tests for ConceptGrounder class directly."""

    def test_grounder_initialization(self, sample_fen, decode_statements_mixed):
        """ConceptGrounder should initialize correctly."""
        grounder = ConceptGrounder(sample_fen, decode_statements_mixed)

        assert grounder.fen == sample_fen
        assert grounder.decode_statements == decode_statements_mixed
        assert len(grounder._statements_lower) == len(decode_statements_mixed)

    def test_grounder_color_extraction(self, sample_fen, decode_statements_mixed):
        """ConceptGrounder should extract colors from concept names."""
        grounder = ConceptGrounder(sample_fen, decode_statements_mixed)

        assert grounder._extract_color_from_concept("Threats_w_high") == "white"
        assert grounder._extract_color_from_concept("Threats_b_high") == "black"
        assert grounder._extract_color_from_concept("Threats_high") is None

    def test_grounder_category_extraction(self, sample_fen, decode_statements_mixed):
        """ConceptGrounder should extract categories from concept names."""
        grounder = ConceptGrounder(sample_fen, decode_statements_mixed)

        assert grounder._extract_category_from_concept("Threats_w_high") == "Threats"
        assert grounder._extract_category_from_concept("Kingsafety_b_low") == "Kingsafety"
        assert grounder._extract_category_from_concept("Unknown_concept") is None


class TestDeterminism:
    """Tests for deterministic output."""

    def test_deterministic_output(self, sample_fen, decode_statements_mixed):
        """Same inputs should produce same outputs."""
        top_concepts = [
            ("Threats_w_high", 0.85),
            ("Kingsafety_b_high", 0.65),
        ]

        result1 = ground_concepts(sample_fen, decode_statements_mixed, top_concepts)
        result2 = ground_concepts(sample_fen, decode_statements_mixed, top_concepts)

        assert result1 == result2

    def test_deterministic_across_runs(self, sample_fen, decode_statements_mixed):
        """Multiple calls should produce identical results."""
        top_concepts = [("Threats_w_high", 0.85)]

        results = [
            ground_concepts(sample_fen, decode_statements_mixed, top_concepts)
            for _ in range(5)
        ]

        # All results should be identical
        for result in results[1:]:
            assert result == results[0]

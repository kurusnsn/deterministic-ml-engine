"""
Concept Grounding Module.

Maps SVM concept names to grounded evidence extracted from DecodeChess heuristics.
This module ensures that all concept evidence is factually grounded in the position,
with no hallucinated pieces, squares, or relationships.

Usage:
    from gateway_modules.concepts.concept_grounding import ground_concepts

    grounded = ground_concepts(
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        decode_statements=["the white pawn on e2 supports the white pawn on d3", ...],
        top_concepts=[("Threats_w_high", 0.85), ("Kingsafety_b_low", -0.3)]
    )
"""

import re
import logging
from typing import List, Tuple, Dict, Optional, Set
from dataclasses import dataclass
import chess

logger = logging.getLogger(__name__)

# Maximum evidence lines per concept
MAX_EVIDENCE_PER_CONCEPT = 3

# Concept category mapping patterns
CONCEPT_PATTERNS = {
    "Threats": {
        "keywords": ["threatens", "is threatened", "can capture", "x-rays", "x-ray"],
        "priority": 1,
    },
    "Kingsafety": {
        "keywords": [
            "protects the king",
            "king on",
            "controls square f2",
            "controls square f7",
            "controls square g2",
            "controls square g7",
            "controls square h2",
            "controls square h7",
            "open file",
        ],
        "priority": 2,
    },
    "Mobility": {
        "keywords": ["controls square", "uses file", "uses rank", "uses diagonal"],
        "priority": 3,
    },
    "Space": {
        "keywords": ["controls square", "uses file", "uses rank", "uses diagonal"],
        "priority": 3,
    },
    "Material": {
        "keywords": ["pawn", "capture", "can capture"],
        "priority": 4,
    },
    "Imbalance": {
        "keywords": ["pawn", "supports", "can capture"],
        "priority": 4,
    },
    "Pawns": {
        "keywords": ["pawn", "supports", "pawn structure"],
        "priority": 4,
    },
    "Passedpawns": {
        "keywords": ["passed pawn"],  # Will be supplemented by local detection
        "priority": 5,
    },
}

# King safety related squares by color
KING_SAFETY_SQUARES_WHITE = {"f2", "g2", "h2", "f1", "g1", "h1", "a2", "b2", "c2", "a1", "b1", "c1"}
KING_SAFETY_SQUARES_BLACK = {"f7", "g7", "h7", "f8", "g8", "h8", "a7", "b7", "c7", "a8", "b8", "c8"}


@dataclass
class ConceptEvidence:
    """Evidence for a grounded concept."""
    concept_name: str
    score: float
    evidence: List[str]

    def to_dict(self) -> Dict:
        return {
            "score": self.score,
            "evidence": self.evidence,
        }


class ConceptGrounder:
    """
    Maps SVM concept names to grounded evidence from DecodeChess heuristics.

    Rules:
    - Evidence is ONLY selected from decode statements (string matching + light parsing)
    - Evidence list is capped at MAX_EVIDENCE_PER_CONCEPT per concept
    - Color filtering: _w_ concepts prefer "white" evidence, _b_ prefer "black"
    - No hallucinated pieces/squares - only evidence lines that already exist
    - Passed pawn detection is added as a local check if decode lacks it
    """

    def __init__(self, fen: str, decode_statements: List[str]):
        """
        Initialize the grounder.

        Args:
            fen: The FEN string of the position
            decode_statements: List of heuristic statements from extract_decodechess_heuristics
        """
        self.fen = fen
        self.board = chess.Board(fen)
        self.decode_statements = decode_statements
        self._statements_lower = [s.lower() for s in decode_statements]

        # Pre-compute passed pawns for grounding add-on
        self._passed_pawns = self._detect_passed_pawns()

    def _detect_passed_pawns(self) -> Dict[chess.Color, List[str]]:
        """
        Detect passed pawns using python-chess.

        A pawn is passed if no enemy pawns can block or capture it on its way to promotion.

        Returns:
            Dict mapping color to list of square names with passed pawns
        """
        passed = {chess.WHITE: [], chess.BLACK: []}

        for color in [chess.WHITE, chess.BLACK]:
            pawns = self.board.pieces(chess.PAWN, color)
            enemy_pawns = self.board.pieces(chess.PAWN, not color)

            for pawn_sq in pawns:
                pawn_file = chess.square_file(pawn_sq)
                pawn_rank = chess.square_rank(pawn_sq)

                is_passed = True

                # Check files: same file and adjacent files
                for check_file in [pawn_file - 1, pawn_file, pawn_file + 1]:
                    if check_file < 0 or check_file > 7:
                        continue

                    for enemy_sq in enemy_pawns:
                        enemy_file = chess.square_file(enemy_sq)
                        enemy_rank = chess.square_rank(enemy_sq)

                        if enemy_file != check_file:
                            continue

                        # For white, enemy must be ahead (higher rank)
                        # For black, enemy must be ahead (lower rank)
                        if color == chess.WHITE:
                            if enemy_rank > pawn_rank:
                                is_passed = False
                                break
                        else:
                            if enemy_rank < pawn_rank:
                                is_passed = False
                                break

                    if not is_passed:
                        break

                if is_passed:
                    passed[color].append(chess.square_name(pawn_sq))

        return passed

    def _extract_color_from_concept(self, concept_name: str) -> Optional[str]:
        """
        Extract color preference from concept name.

        Args:
            concept_name: e.g., "Threats_w_high", "Kingsafety_b_low"

        Returns:
            "white", "black", or None if no color specified
        """
        concept_lower = concept_name.lower()
        if "_w_" in concept_lower or concept_lower.endswith("_w"):
            return "white"
        elif "_b_" in concept_lower or concept_lower.endswith("_b"):
            return "black"
        return None

    def _extract_category_from_concept(self, concept_name: str) -> Optional[str]:
        """
        Extract the category prefix from a concept name.

        Args:
            concept_name: e.g., "Threats_w_high", "Kingsafety_b_low"

        Returns:
            Category name like "Threats", "Kingsafety", etc.
        """
        for category in CONCEPT_PATTERNS.keys():
            if concept_name.lower().startswith(category.lower()):
                return category
        return None

    def _filter_by_color(
        self,
        statements: List[str],
        statements_lower: List[str],
        preferred_color: Optional[str],
    ) -> List[str]:
        """
        Filter statements by color preference.

        Args:
            statements: Original case statements
            statements_lower: Lowercase versions for matching
            preferred_color: "white", "black", or None

        Returns:
            Filtered list of statements (original case)
        """
        if not preferred_color:
            return statements

        # Prefer statements mentioning the preferred color
        matching = []
        other = []

        for stmt, stmt_lower in zip(statements, statements_lower):
            if preferred_color in stmt_lower:
                matching.append(stmt)
            else:
                other.append(stmt)

        # Return matching first, then other (up to limit)
        return matching + other

    def _find_evidence_for_category(
        self,
        category: str,
        preferred_color: Optional[str],
    ) -> List[str]:
        """
        Find evidence statements matching a category's keywords.

        Args:
            category: Category name from CONCEPT_PATTERNS
            preferred_color: Optional color preference

        Returns:
            List of matching evidence statements (max MAX_EVIDENCE_PER_CONCEPT)
        """
        if category not in CONCEPT_PATTERNS:
            return []

        keywords = CONCEPT_PATTERNS[category]["keywords"]
        matching_indices = set()

        for i, stmt_lower in enumerate(self._statements_lower):
            for keyword in keywords:
                if keyword.lower() in stmt_lower:
                    matching_indices.add(i)
                    break

        # Get matching statements
        matching = [self.decode_statements[i] for i in sorted(matching_indices)]
        matching_lower = [self._statements_lower[i] for i in sorted(matching_indices)]

        # Apply color filtering
        filtered = self._filter_by_color(matching, matching_lower, preferred_color)

        # Additional filtering for Kingsafety: prioritize king-adjacent squares
        if category == "Kingsafety":
            filtered = self._prioritize_king_adjacent(filtered, preferred_color)

        return filtered[:MAX_EVIDENCE_PER_CONCEPT]

    def _prioritize_king_adjacent(
        self,
        statements: List[str],
        preferred_color: Optional[str],
    ) -> List[str]:
        """
        Prioritize statements mentioning squares adjacent to the king.

        Args:
            statements: List of evidence statements
            preferred_color: "white" or "black" to determine which king

        Returns:
            Reordered list with king-adjacent mentions first
        """
        if not preferred_color:
            return statements

        # Determine relevant squares based on opponent's king
        # If concept is about white's king safety, we care about squares near white's king
        if preferred_color == "white":
            relevant_squares = KING_SAFETY_SQUARES_WHITE
        else:
            relevant_squares = KING_SAFETY_SQUARES_BLACK

        king_adjacent = []
        other = []

        for stmt in statements:
            stmt_lower = stmt.lower()
            is_king_adjacent = False

            # Check for king-adjacent squares
            for sq in relevant_squares:
                if sq in stmt_lower:
                    is_king_adjacent = True
                    break

            # Also prioritize "king on" mentions
            if "king on" in stmt_lower or "protects the king" in stmt_lower:
                is_king_adjacent = True

            if is_king_adjacent:
                king_adjacent.append(stmt)
            else:
                other.append(stmt)

        return king_adjacent + other

    def _get_passed_pawn_evidence(self, preferred_color: Optional[str]) -> List[str]:
        """
        Generate passed pawn evidence from local detection.

        Args:
            preferred_color: "white" or "black"

        Returns:
            List with at most 1 evidence line if a passed pawn exists
        """
        if not preferred_color:
            # Check both colors
            for color_name, color in [("white", chess.WHITE), ("black", chess.BLACK)]:
                if self._passed_pawns[color]:
                    sq = self._passed_pawns[color][0]  # First passed pawn
                    return [f"{color_name} has a passed pawn on {sq}"]
            return []

        color = chess.WHITE if preferred_color == "white" else chess.BLACK
        if self._passed_pawns[color]:
            sq = self._passed_pawns[color][0]  # First passed pawn
            return [f"{preferred_color} has a passed pawn on {sq}"]

        return []

    def ground_concept(
        self,
        concept_name: str,
        score: float,
    ) -> ConceptEvidence:
        """
        Ground a single concept with evidence from decode statements.

        Args:
            concept_name: The SVM concept name (e.g., "Threats_w_high")
            score: The concept score or importance value

        Returns:
            ConceptEvidence with grounded evidence lines
        """
        category = self._extract_category_from_concept(concept_name)
        preferred_color = self._extract_color_from_concept(concept_name)

        evidence = []

        if category:
            evidence = self._find_evidence_for_category(category, preferred_color)

        # Special handling for Passedpawns: add local detection if needed
        if category == "Passedpawns" and len(evidence) < MAX_EVIDENCE_PER_CONCEPT:
            # Check if we already have passed pawn evidence from decode
            has_passed_pawn_evidence = any(
                "passed pawn" in e.lower() for e in evidence
            )
            if not has_passed_pawn_evidence:
                local_evidence = self._get_passed_pawn_evidence(preferred_color)
                evidence.extend(local_evidence)
                evidence = evidence[:MAX_EVIDENCE_PER_CONCEPT]

        return ConceptEvidence(
            concept_name=concept_name,
            score=score,
            evidence=evidence,
        )

    def ground_all(
        self,
        top_concepts: List[Tuple[str, float]],
    ) -> Dict[str, Dict]:
        """
        Ground all top concepts with evidence.

        Args:
            top_concepts: List of (concept_name, score) tuples

        Returns:
            Dict mapping concept_name to {"score": float, "evidence": List[str]}
        """
        result = {}

        for concept_name, score in top_concepts:
            evidence = self.ground_concept(concept_name, score)
            result[concept_name] = evidence.to_dict()

        return result


def ground_concepts(
    fen: str,
    decode_statements: List[str],
    top_concepts: List[Tuple[str, float]],
) -> Dict[str, Dict]:
    """
    Ground SVM concepts with evidence from decode heuristics.

    This is the main entry point for concept grounding.

    Args:
        fen: FEN string of the position
        decode_statements: Output of extract_decodechess_heuristics(fen)
        top_concepts: List of (concept_name, score_or_importance) tuples

    Returns:
        Dict with structure:
        {
            concept_name: {
                "score": float,
                "evidence": List[str]  # max 3 lines per concept
            }
        }

    Example:
        >>> grounded = ground_concepts(
        ...     fen="2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21",
        ...     decode_statements=["the white rook on a7 threatens the black knight on d7", ...],
        ...     top_concepts=[("Threats_w_high", 0.85)]
        ... )
        >>> grounded["Threats_w_high"]["evidence"]
        ["the white rook on a7 threatens the black knight on d7", ...]
    """
    grounder = ConceptGrounder(fen, decode_statements)
    return grounder.ground_all(top_concepts)

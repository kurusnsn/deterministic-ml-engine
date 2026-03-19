#!/usr/bin/env python3
"""
A/B Testing Harness: Concept-Grounded Commentary vs Baseline

Compares baseline commentary with concept-grounded commentary for N positions.
Logs: fen, move, baseline_comment, grounded_comment, top_concepts

Usage:
    # Run with default test positions
    python scripts/ab_concepts_vs_baseline.py

    # Run with custom positions file (JSON or CSV)
    python scripts/ab_concepts_vs_baseline.py --positions positions.json

    # Specify output file
    python scripts/ab_concepts_vs_baseline.py --output results.json

    # Run specific number of positions
    python scripts/ab_concepts_vs_baseline.py --limit 10

Environment Variables:
    ENABLE_LC0_SVM_CONCEPTS=1  - Enable concept features for grounded commentary
    MODAL_DEPLOYED=1           - Use Modal-deployed service (vs local mock)
"""

import os
import sys
import json
import time
import argparse
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any

# Add gateway-service to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "gateway-service"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


# Default test positions for A/B testing
DEFAULT_TEST_POSITIONS = [
    {
        "fen": "2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21",
        "move": "Rxd5",
        "engine_eval": "+1.5",
        "description": "Tactical capture in middlegame",
    },
    {
        "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
        "move": "Ng5",
        "engine_eval": "+0.3",
        "description": "Italian Game - Ng5 attack on f7",
    },
    {
        "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        "move": "c5",
        "engine_eval": "+0.2",
        "description": "Sicilian Defense response to 1.e4",
    },
    {
        "fen": "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 2 5",
        "move": "c3",
        "engine_eval": "+0.1",
        "description": "Italian Game - preparing d4",
    },
    {
        "fen": "r2q1rk1/ppp2ppp/2n1bn2/3pp3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 9",
        "move": "exd5",
        "engine_eval": "+0.4",
        "description": "Central tension resolution",
    },
    {
        "fen": "r1bq1rk1/pp2ppbp/2np1np1/2p5/2P5/2NP1NP1/PP2PPBP/R1BQ1RK1 w - - 0 8",
        "move": "b3",
        "engine_eval": "0.0",
        "description": "English Opening - fianchetto setup",
    },
    {
        "fen": "r1bqr1k1/pp3ppp/2nb4/3p4/3Pn3/2N2N2/PP2BPPP/R1BQR1K1 w - - 0 12",
        "move": "Nxe4",
        "engine_eval": "+0.2",
        "description": "Central exchange",
    },
    {
        "fen": "3r2k1/pp2qppp/2p5/4P3/3P4/P4N2/1P3PPP/3QR1K1 w - - 0 20",
        "move": "d5",
        "engine_eval": "+1.0",
        "description": "Passed pawn advance",
    },
    {
        "fen": "r4rk1/1ppqbppp/p1n2n2/3pp3/2B1P3/P1NP1N2/1PP2PPP/R2Q1RK1 w - - 0 10",
        "move": "Bg5",
        "engine_eval": "+0.3",
        "description": "Pin the knight",
    },
    {
        "fen": "r1bq1rk1/pppn1ppp/4pn2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R w KQ - 2 6",
        "move": "Bg5",
        "engine_eval": "+0.4",
        "description": "Queen's Gambit - pin",
    },
]


class ABHarness:
    """A/B testing harness for commentary comparison."""

    def __init__(
        self,
        use_modal: bool = False,
        enable_concepts: bool = True,
    ):
        """
        Initialize the harness.

        Args:
            use_modal: Whether to use Modal-deployed service
            enable_concepts: Whether to enable concept-grounded commentary
        """
        self.use_modal = use_modal
        self.enable_concepts = enable_concepts
        self.results: List[Dict[str, Any]] = []

        if enable_concepts:
            os.environ["ENABLE_LC0_SVM_CONCEPTS"] = "1"

    def get_baseline_commentary(
        self,
        fen: str,
        move: str,
        engine_eval: Optional[str] = None,
    ) -> str:
        """
        Get baseline commentary (non-concept-grounded).

        This simulates the existing heuristic narrator or simple LLM commentary.
        """
        try:
            from gateway_modules.services.heuristic_narrator import render_non_llm_commentary
            from gateway_modules.heuristics.decode_heuristics import extract_decodechess_heuristics

            decode_statements = extract_decodechess_heuristics(fen)

            # Simple baseline: pick a few relevant statements
            baseline_text = f"After {move}"
            if decode_statements:
                baseline_text += f": {decode_statements[0]}"

            return baseline_text

        except ImportError:
            # Fallback mock baseline
            return f"Baseline: The move {move} is played in this position."

    def get_grounded_commentary(
        self,
        fen: str,
        move: str,
        engine_eval: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get concept-grounded commentary.

        Returns full result including concepts and LLM comment.
        """
        try:
            from gateway_modules.concepts.concept_grounding import ground_concepts
            from gateway_modules.concepts.lc0_svm_inference import run_lc0_svm_inference
            from gateway_modules.heuristics.decode_heuristics import extract_decodechess_heuristics

            # Step 1: Get decode heuristics
            decode_statements = extract_decodechess_heuristics(fen)

            # Step 2: Run LC0+SVM inference
            lc0_result = run_lc0_svm_inference(fen, move, top_k=5)
            top_concepts = lc0_result.get("concept_importance", [])

            # Step 3: Ground concepts
            grounded = ground_concepts(fen, decode_statements, top_concepts)

            # Step 4: Generate comment (simplified - no actual LLM call)
            comment = self._generate_local_comment(move, top_concepts, grounded)

            return {
                "comment": comment,
                "top_concepts": top_concepts,
                "grounded": grounded,
                "decode_count": len(decode_statements),
            }

        except ImportError as e:
            logger.warning(f"Import error: {e}")
            return {
                "comment": f"Grounded: The move {move} affects the position.",
                "top_concepts": [],
                "grounded": {},
                "error": str(e),
            }

    def _generate_local_comment(
        self,
        move: str,
        top_concepts: List[tuple],
        grounded: Dict[str, Dict],
    ) -> str:
        """Generate a simple local comment based on concepts and evidence."""
        if not top_concepts:
            return f"The move {move} is played."

        parts = [f"The move {move}"]

        # Add concept-based commentary
        for concept_name, score in top_concepts[:2]:
            data = grounded.get(concept_name, {})
            evidence = data.get("evidence", [])

            # Extract category
            category = concept_name.split("_")[0]

            if score > 0:
                direction = "increases"
            else:
                direction = "decreases"

            if evidence:
                # Use first evidence
                parts.append(f"{direction} {category.lower()} ({evidence[0][:50]}...)")
            else:
                parts.append(f"{direction} {category.lower()}")

        return " ".join(parts)

    def run_comparison(
        self,
        fen: str,
        move: str,
        engine_eval: Optional[str] = None,
        description: str = "",
    ) -> Dict[str, Any]:
        """
        Run comparison between baseline and grounded commentary.

        Args:
            fen: Position FEN
            move: Move in SAN or UCI
            engine_eval: Optional engine evaluation
            description: Optional position description

        Returns:
            Dict with comparison results
        """
        logger.info(f"Comparing: {move} in {fen[:40]}...")

        start_time = time.time()

        # Get baseline
        baseline_comment = self.get_baseline_commentary(fen, move, engine_eval)

        # Get grounded
        grounded_result = self.get_grounded_commentary(fen, move, engine_eval)

        elapsed = time.time() - start_time

        result = {
            "fen": fen,
            "move": move,
            "engine_eval": engine_eval,
            "description": description,
            "baseline_comment": baseline_comment,
            "grounded_comment": grounded_result["comment"],
            "top_concepts": grounded_result["top_concepts"],
            "grounded_evidence": grounded_result.get("grounded", {}),
            "elapsed_ms": int(elapsed * 1000),
            "timestamp": datetime.utcnow().isoformat(),
        }

        self.results.append(result)
        return result

    def run_all(
        self,
        positions: List[Dict[str, Any]],
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Run comparison for all positions.

        Args:
            positions: List of position dicts with fen, move, etc.
            limit: Optional limit on number of positions

        Returns:
            List of comparison results
        """
        if limit:
            positions = positions[:limit]

        logger.info(f"Running A/B comparison for {len(positions)} positions...")

        for i, pos in enumerate(positions):
            logger.info(f"Position {i+1}/{len(positions)}: {pos.get('description', pos['move'])}")

            self.run_comparison(
                fen=pos["fen"],
                move=pos["move"],
                engine_eval=pos.get("engine_eval"),
                description=pos.get("description", ""),
            )

        return self.results

    def save_results(self, output_path: str):
        """Save results to JSON file."""
        with open(output_path, "w") as f:
            json.dump(self.results, f, indent=2)
        logger.info(f"Results saved to {output_path}")

    def print_summary(self):
        """Print summary of results."""
        print("\n" + "=" * 70)
        print("A/B Testing Summary")
        print("=" * 70)

        for i, result in enumerate(self.results):
            print(f"\n--- Position {i+1}: {result['description'] or result['move']} ---")
            print(f"FEN: {result['fen'][:50]}...")
            print(f"Move: {result['move']}")
            print(f"Baseline: {result['baseline_comment'][:80]}...")
            print(f"Grounded: {result['grounded_comment'][:80]}...")
            print(f"Top concepts: {result['top_concepts'][:3]}")
            print(f"Time: {result['elapsed_ms']}ms")

        print("\n" + "=" * 70)
        avg_time = sum(r["elapsed_ms"] for r in self.results) / len(self.results) if self.results else 0
        print(f"Total positions: {len(self.results)}")
        print(f"Average time: {avg_time:.0f}ms")


def load_positions(path: str) -> List[Dict[str, Any]]:
    """Load positions from JSON or CSV file."""
    path = Path(path)

    if path.suffix == ".json":
        with open(path) as f:
            return json.load(f)
    elif path.suffix == ".csv":
        import csv
        positions = []
        with open(path) as f:
            reader = csv.DictReader(f)
            for row in reader:
                positions.append({
                    "fen": row["fen"],
                    "move": row["move"],
                    "engine_eval": row.get("engine_eval"),
                    "description": row.get("description", ""),
                })
        return positions
    else:
        raise ValueError(f"Unsupported file format: {path.suffix}")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="A/B Testing: Concept-Grounded vs Baseline Commentary"
    )
    parser.add_argument(
        "--positions",
        type=str,
        help="Path to positions file (JSON or CSV)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="ab_results.json",
        help="Output file path (default: ab_results.json)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Limit number of positions to test",
    )
    parser.add_argument(
        "--use-modal",
        action="store_true",
        help="Use Modal-deployed service",
    )
    parser.add_argument(
        "--no-concepts",
        action="store_true",
        help="Disable concept-grounded commentary (baseline only)",
    )

    args = parser.parse_args()

    # Load positions
    if args.positions:
        positions = load_positions(args.positions)
    else:
        positions = DEFAULT_TEST_POSITIONS

    # Create harness
    harness = ABHarness(
        use_modal=args.use_modal,
        enable_concepts=not args.no_concepts,
    )

    # Run comparisons
    harness.run_all(positions, limit=args.limit)

    # Print summary
    harness.print_summary()

    # Save results
    harness.save_results(args.output)

    print(f"\nResults saved to: {args.output}")


if __name__ == "__main__":
    main()

"""
Unit tests for Motif Cost Prioritization (Step 3).

Tests verify:
- Motif cost computation is correct
- Top motifs are selected correctly
- Personal relevance scoring works
- Puzzles matching top motifs are ranked higher
- Baseline unchanged when flag OFF
"""

import pytest
from typing import Dict, Any, List

from gateway_modules.config.ml_config import MLConfig
from gateway_modules.services.motif_prioritizer import (
    compute_motif_costs,
    get_top_motifs,
    compute_personal_relevance,
    apply_motif_prioritization,
    rank_puzzles_by_relevance,
    MotifPrioritizer,
)


class TestMotifCostComputation:
    """Test motif cost calculation."""
    
    def test_empty_motifs_returns_empty(self):
        """Empty input returns empty dict."""
        costs = compute_motif_costs([])
        assert costs == {}
    
    def test_single_motif_cost(self):
        """Single motif gets normalized to 1.0."""
        motifs = [{"motif": "fork", "count": 5, "avg_cp_loss": -200}]
        costs = compute_motif_costs(motifs)
        
        assert "fork" in costs
        assert costs["fork"] == 1.0  # Only motif = 100%
    
    def test_multiple_motifs_normalized(self):
        """Multiple motifs are normalized to sum to 1.0."""
        motifs = [
            {"motif": "fork", "count": 5, "avg_cp_loss": -200},  # 1000
            {"motif": "pin", "count": 3, "avg_cp_loss": -100},   # 300
            {"motif": "skewer", "count": 2, "avg_cp_loss": -100}, # 200
        ]
        costs = compute_motif_costs(motifs)
        
        total = sum(costs.values())
        assert total == pytest.approx(1.0, rel=0.01)
        
        # Fork should have highest cost
        assert costs["fork"] > costs["pin"]
        assert costs["pin"] > costs["skewer"]
    
    def test_cost_formula(self):
        """Cost = count * abs(avg_cp_loss)."""
        motifs = [
            {"motif": "fork", "count": 10, "avg_cp_loss": -100},  # 1000
            {"motif": "pin", "count": 5, "avg_cp_loss": -200},    # 1000
        ]
        costs = compute_motif_costs(motifs)
        
        # Same cost = same normalized value
        assert costs["fork"] == pytest.approx(costs["pin"], rel=0.01)


class TestTopMotifs:
    """Test top motif selection."""
    
    def test_get_top_3(self):
        """Top 3 motifs are returned."""
        costs = {"fork": 0.5, "pin": 0.3, "skewer": 0.15, "xray": 0.05}
        top = get_top_motifs(costs, top_k=3)
        
        assert len(top) == 3
        assert top == ["fork", "pin", "skewer"]
    
    def test_fewer_than_k_motifs(self):
        """Returns all motifs if fewer than k."""
        costs = {"fork": 0.7, "pin": 0.3}
        top = get_top_motifs(costs, top_k=5)
        
        assert len(top) == 2
        assert "fork" in top
        assert "pin" in top


class TestPersonalRelevance:
    """Test personal relevance scoring."""
    
    def test_matching_motifs_add_relevance(self):
        """Puzzle themes matching motif costs add relevance."""
        motif_costs = {"fork": 0.5, "pin": 0.3, "skewer": 0.2}
        top_motifs = ["fork", "pin", "skewer"]
        
        relevance, explain = compute_personal_relevance(
            puzzle_themes=["fork", "pin"],
            motif_costs=motif_costs,
            top_motifs=top_motifs,
        )
        
        # Should get fork (0.5) + pin (0.3) = 0.8
        assert relevance == pytest.approx(0.8, rel=0.01)
        assert explain.relevance_score == relevance
    
    def test_no_matching_motifs_zero_relevance(self):
        """Puzzle with no matching themes gets 0 relevance."""
        motif_costs = {"fork": 0.5, "pin": 0.3}
        top_motifs = ["fork", "pin"]
        
        relevance, explain = compute_personal_relevance(
            puzzle_themes=["tactical", "endgame"],
            motif_costs=motif_costs,
            top_motifs=top_motifs,
        )
        
        assert relevance == 0.0
        assert "don't match" in explain.rationale.lower()
    
    def test_top_motif_matches_noted_in_explain(self):
        """Explain mentions top motif matches."""
        motif_costs = {"fork": 0.5, "pin": 0.3}
        top_motifs = ["fork", "pin"]
        
        relevance, explain = compute_personal_relevance(
            puzzle_themes=["fork"],
            motif_costs=motif_costs,
            top_motifs=top_motifs,
        )
        
        assert "fork" in explain.rationale
        assert "weak motifs" in explain.rationale.lower()


class TestApplyMotifPrioritization:
    """Test applying prioritization to puzzles."""
    
    def test_adds_relevance_score(self):
        """Applies personal_relevance_score to puzzle."""
        puzzle = {"puzzle_id": "pz_1", "theme": ["fork", "pin"]}
        motif_costs = {"fork": 0.5, "pin": 0.3}
        top_motifs = ["fork", "pin"]
        
        result = apply_motif_prioritization(puzzle, motif_costs, top_motifs)
        
        assert "personal_relevance_score" in result
        assert result["personal_relevance_score"] == pytest.approx(0.8, rel=0.01)
        assert "motif_explain" in result


class TestPuzzleRanking:
    """Test puzzle ranking by combined score."""
    
    def test_relevance_boosts_ranking(self):
        """Puzzle matching top motifs ranks higher with same quality."""
        puzzles = [
            {"puzzle_id": "p1", "theme": ["tactical"], "quality_score": 0.8},
            {"puzzle_id": "p2", "theme": ["fork"], "quality_score": 0.8},
        ]
        motif_costs = {"fork": 0.5, "pin": 0.3}
        top_motifs = ["fork", "pin"]
        
        ranked = rank_puzzles_by_relevance(
            puzzles=puzzles,
            motif_costs=motif_costs,
            top_motifs=top_motifs,
        )
        
        # p2 has fork theme so should rank higher
        assert ranked[0]["puzzle_id"] == "p2"
        assert ranked[1]["puzzle_id"] == "p1"
    
    def test_quality_still_matters(self):
        """High quality beats low quality even with lower relevance."""
        puzzles = [
            {"puzzle_id": "p1", "theme": ["fork"], "quality_score": 0.3},
            {"puzzle_id": "p2", "theme": ["tactical"], "quality_score": 0.95},
        ]
        motif_costs = {"fork": 0.5}
        top_motifs = ["fork"]
        
        # With default weights (0.6 quality, 0.4 relevance):
        # p1: 0.6*0.3 + 0.4*0.5 = 0.18 + 0.2 = 0.38
        # p2: 0.6*0.95 + 0.4*0 = 0.57
        ranked = rank_puzzles_by_relevance(
            puzzles=puzzles,
            motif_costs=motif_costs,
            top_motifs=top_motifs,
        )
        
        # p2 should rank higher due to quality
        assert ranked[0]["puzzle_id"] == "p2"


class TestMotifPrioritizer:
    """Test MotifPrioritizer class."""
    
    def test_prioritizer_workflow(self):
        """Full workflow: init, score, rank."""
        mistake_motifs = [
            {"motif": "fork", "count": 5, "avg_cp_loss": -200},
            {"motif": "pin", "count": 3, "avg_cp_loss": -150},
        ]
        
        prioritizer = MotifPrioritizer(mistake_motifs)
        
        # Check top motifs identified
        assert "fork" in prioritizer.top_motifs
        assert "pin" in prioritizer.top_motifs
        
        # Score puzzles
        p1 = prioritizer.score_puzzle({
            "puzzle_id": "p1", "theme": ["fork"], "quality_score": 0.7
        })
        p2 = prioritizer.score_puzzle({
            "puzzle_id": "p2", "theme": ["tactical"], "quality_score": 0.8
        })
        
        assert p1["personal_relevance_score"] > p2["personal_relevance_score"]
        
        # Get ranked
        ranked = prioritizer.get_ranked_puzzles()
        assert len(ranked) == 2
    
    def test_summary(self):
        """Summary includes expected fields."""
        mistake_motifs = [
            {"motif": "fork", "count": 5, "avg_cp_loss": -200},
        ]
        
        prioritizer = MotifPrioritizer(mistake_motifs)
        prioritizer.score_puzzle({"puzzle_id": "p1", "theme": ["fork"]})
        
        summary = prioritizer.get_summary()
        
        assert "top_motifs" in summary
        assert "motif_costs" in summary
        assert "total_puzzles" in summary
        assert summary["total_puzzles"] == 1

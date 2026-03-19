"""
Unit tests for Style Embeddings (Step 7).

Tests verify:
- Style vector generation from stats
- Cosine similarity computation
- Archetype matching
- Style analysis pipeline
"""

import pytest
from typing import Dict, Any, List

from gateway_modules.services.style_embeddings import (
    StyleVector,
    compute_style_embedding,
    cosine_similarity,
    find_similar_style,
    analyze_player_style,
    enrich_report_with_style,
    STYLE_DIMENSIONS,
    ARCHETYPE_STYLES,
)


class TestStyleVector:
    """Test StyleVector class."""
    
    def test_default_vector(self):
        """Default vector has correct length."""
        style = StyleVector()
        assert len(style.vector) == len(STYLE_DIMENSIONS)
    
    def test_getitem_by_name(self):
        """Can access dimension by name."""
        style = StyleVector(vector=[0.8] * len(STYLE_DIMENSIONS))
        assert style["aggression"] == 0.8
    
    def test_to_dict(self):
        """Converts to dimension dict."""
        style = StyleVector(vector=[0.5] * len(STYLE_DIMENSIONS))
        d = style.to_dict()
        assert "aggression" in d
        assert d["aggression"] == 0.5
    
    def test_normalize(self):
        """Normalized vector has unit length."""
        import math
        style = StyleVector(vector=[1.0] * 8)
        normalized = style.normalize()
        magnitude = math.sqrt(sum(v ** 2 for v in normalized.vector))
        assert magnitude == pytest.approx(1.0, rel=0.01)


class TestComputeStyleEmbedding:
    """Test proxy embedding generation."""
    
    def test_generates_valid_vector(self):
        """Embedding has correct dimensions."""
        stats = {"avg_eval_swing": 50, "avg_game_length": 45}
        style = compute_style_embedding(stats)
        
        assert len(style.vector) == len(STYLE_DIMENSIONS)
        # All values should be in [0, 1]
        for v in style.vector:
            assert 0.0 <= v <= 1.0
    
    def test_high_swing_high_aggression(self):
        """High eval swing increases aggression dimension."""
        low_swing = compute_style_embedding({"avg_eval_swing": 20})
        high_swing = compute_style_embedding({"avg_eval_swing": 200})
        
        assert high_swing["aggression"] > low_swing["aggression"]
    
    def test_good_endgame_high_endgame_skill(self):
        """High endgame winrate increases endgame_skill."""
        style = compute_style_embedding({"endgame_winrate": 0.75})
        assert style["endgame_skill"] == 0.75


class TestCosineSimilarity:
    """Test cosine similarity."""
    
    def test_identical_vectors_similarity_one(self):
        """Identical vectors have similarity = 1.0."""
        a = StyleVector(vector=[0.5] * 8)
        b = StyleVector(vector=[0.5] * 8)
        
        sim = cosine_similarity(a, b)
        assert sim == pytest.approx(1.0, rel=0.01)
    
    def test_orthogonal_vectors_similarity_zero(self):
        """Orthogonal vectors have similarity = 0.0."""
        a = StyleVector(vector=[1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
        b = StyleVector(vector=[0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
        
        sim = cosine_similarity(a, b)
        assert sim == pytest.approx(0.0, abs=0.01)
    
    def test_similar_vectors_high_similarity(self):
        """Similar vectors have high similarity."""
        a = StyleVector(vector=[0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1])
        b = StyleVector(vector=[0.7, 0.6, 0.5, 0.5, 0.4, 0.3, 0.2, 0.2])
        
        sim = cosine_similarity(a, b)
        assert sim > 0.9


class TestFindSimilarStyle:
    """Test finding similar reference styles."""
    
    def test_returns_top_k(self):
        """Returns requested number of matches."""
        player = StyleVector(vector=[0.5] * 8)
        matches = find_similar_style(player, ARCHETYPE_STYLES, top_k=3)
        
        assert len(matches) == 3
    
    def test_sorted_by_similarity(self):
        """Results sorted by similarity descending."""
        player = StyleVector(vector=[0.8, 0.7, 0.5, 0.6, 0.6, 0.9, 0.3, 0.7])  # tactical
        matches = find_similar_style(player, ARCHETYPE_STYLES, top_k=3)
        
        # First match should have highest similarity
        assert matches[0][1] >= matches[1][1]
        assert matches[1][1] >= matches[2][1]
    
    def test_tactical_player_matches_tactical_archetype(self):
        """Tactical player style matches tactical archetype."""
        player = StyleVector(vector=[0.8, 0.7, 0.5, 0.6, 0.6, 0.9, 0.3, 0.7])
        matches = find_similar_style(player, ARCHETYPE_STYLES, top_k=1)
        
        # Should match tactical_attacker
        assert matches[0][0] == "tactical_attacker"


class TestAnalyzePlayerStyle:
    """Test full style analysis pipeline."""
    
    def test_returns_required_fields(self):
        """Analysis includes all required fields."""
        stats = {"avg_eval_swing": 100, "endgame_winrate": 0.6}
        result = analyze_player_style(stats)
        
        assert "style_vector" in result
        assert "archetype_matches" in result
        assert "primary_archetype" in result
        assert "style_summary" in result
    
    def test_style_summary_is_readable(self):
        """Summary is human-readable."""
        stats = {"avg_eval_swing": 100}
        result = analyze_player_style(stats)
        
        assert len(result["style_summary"]) > 0
        assert "%" in result["style_summary"]


class TestEnrichReportWithStyle:
    """Test adding style to report."""
    
    def test_adds_style_analysis(self):
        """Style analysis added to report."""
        report = {"username": "player1"}
        stats = {"avg_eval_swing": 100}
        
        enriched = enrich_report_with_style(report, stats)
        
        assert "style_analysis" in enriched
        assert "style_vector" in enriched["style_analysis"]

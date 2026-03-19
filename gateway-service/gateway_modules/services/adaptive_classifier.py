"""
Adaptive Repertoire Classification Service.

ML overlay classifier for personalized opening categorization.
Uses a calibrated probabilistic classifier with confidence-gated override logic.

This is Step 5 of the ML pipeline augmentation.

Feature flag: ml_config.adaptive_repertoire_classifier
"""

from typing import Dict, List, Any, Optional, Tuple, TYPE_CHECKING
from dataclasses import dataclass, field
import math

if TYPE_CHECKING:
    from ..config.ml_config import MLConfig

from ..models.explain import ClassificationExplain


# Category definitions (from baseline)
CATEGORIES = ["core", "repair", "expansion", "experimental", "developing"]


@dataclass
class OpeningFeatures:
    """Features for adaptive classification."""
    
    eco: str = ""
    color: str = ""
    frequency: float = 0.0
    winrate: float = 0.0
    games_count: int = 0
    avg_eval_swing: float = 0.0
    style_alignment_score: float = 0.5
    
    # Optional residual from Step 4
    opening_residual: Optional[float] = None
    expected_score: Optional[float] = None
    
    def to_vector(self) -> List[float]:
        """Convert to feature vector for classification."""
        return [
            self.frequency,
            self.winrate,
            self.games_count / 100.0,  # Normalize
            (self.avg_eval_swing + 300) / 600.0,  # Normalize to ~0-1
            self.style_alignment_score,
            self.opening_residual if self.opening_residual is not None else 0.0,
        ]


@dataclass
class ClassificationResult:
    """Result of adaptive classification."""
    
    category: str = "developing"
    probabilities: Dict[str, float] = field(default_factory=dict)
    confidence: float = 0.0
    top_features: List[str] = field(default_factory=list)
    explain: Optional[ClassificationExplain] = None


class AdaptiveClassifier:
    """
    Rule-based probabilistic classifier for opening categorization.
    
    Uses a scoring system based on features to produce category probabilities.
    Later can be replaced with sklearn model trained on labeled data.
    """
    
    def __init__(self, ml_config: Optional["MLConfig"] = None):
        self.ml_config = ml_config
        self.override_confidence = 0.70
        if ml_config:
            self.override_confidence = ml_config.override_confidence
    
    def predict(self, features: OpeningFeatures) -> ClassificationResult:
        """
        Predict category with probabilities.
        
        Args:
            features: OpeningFeatures for the opening
            
        Returns:
            ClassificationResult with category, probabilities, confidence
        """
        # Compute scores for each category
        scores = self._compute_category_scores(features)
        
        # Convert to probabilities via softmax
        probabilities = self._softmax(scores)
        
        # Get predicted category (highest probability)
        predicted = max(probabilities.items(), key=lambda x: x[1])
        category = predicted[0]
        confidence = predicted[1]
        
        # Determine top features that influenced the decision
        top_features = self._get_top_features(features, category)
        
        # Build explain
        explain = ClassificationExplain(
            inputs_used={
                "frequency": features.frequency,
                "winrate": features.winrate,
                "games_count": features.games_count,
                "style_alignment": features.style_alignment_score,
                "residual": features.opening_residual,
            },
            scoring_rules={
                "core": "high_freq + solid_winrate",
                "repair": "high_freq + poor_winrate",
                "expansion": "low_freq + high_winrate",
                "experimental": "low_freq + poor_winrate",
                "developing": "mid_freq or mid_winrate",
            },
            rationale=self._generate_rationale(category, features, confidence),
            confidence=confidence,
            ml_category=category,
            category_probabilities=probabilities,
            top_features=top_features,
        )
        
        return ClassificationResult(
            category=category,
            probabilities=probabilities,
            confidence=confidence,
            top_features=top_features,
            explain=explain,
        )
    
    def _compute_category_scores(self, f: OpeningFeatures) -> Dict[str, float]:
        """Compute raw scores for each category."""
        scores = {}
        
        # Adjust winrate expectations for color
        winrate_adj = f.winrate + 0.02 if f.color == "black" else f.winrate
        
        # Use residual if available for better scoring
        residual_bonus = 0.0
        if f.opening_residual is not None:
            residual_bonus = f.opening_residual * 2  # Scale for impact
        
        # Core: high frequency + solid winrate
        core_score = 0.0
        if f.frequency >= 0.05 and winrate_adj >= 0.50:
            core_score = (f.frequency * 5) + (winrate_adj - 0.3) * 3 + residual_bonus
        scores["core"] = max(0, core_score)
        
        # Repair: high frequency + poor winrate
        repair_score = 0.0
        if f.frequency >= 0.05 and winrate_adj < 0.40:
            repair_score = (f.frequency * 5) + (0.5 - winrate_adj) * 3 - residual_bonus
        scores["repair"] = max(0, repair_score)
        
        # Expansion: low frequency + high winrate
        expansion_score = 0.0
        if f.frequency < 0.02 and winrate_adj >= 0.60:
            expansion_score = (0.05 - f.frequency) * 10 + (winrate_adj - 0.4) * 3 + residual_bonus
        scores["expansion"] = max(0, expansion_score)
        
        # Experimental: low frequency + poor winrate  
        experimental_score = 0.0
        if f.frequency < 0.02 and winrate_adj < 0.40:
            experimental_score = (0.05 - f.frequency) * 5 + (0.5 - winrate_adj) * 2
        scores["experimental"] = max(0, experimental_score)
        
        # Developing: medium frequency or mixed results
        developing_score = 0.5  # Base score
        if 0.02 <= f.frequency < 0.05:
            developing_score += 0.3
        if 0.40 <= winrate_adj < 0.50:
            developing_score += 0.2
        scores["developing"] = developing_score
        
        # Style alignment bonus to preferred categories
        if f.style_alignment_score > 0.7:
            scores["core"] += 0.2
            scores["expansion"] += 0.1
        
        return scores
    
    def _softmax(self, scores: Dict[str, float]) -> Dict[str, float]:
        """Convert scores to probabilities via softmax."""
        # Prevent overflow
        max_score = max(scores.values()) if scores else 0
        exp_scores = {k: math.exp(v - max_score) for k, v in scores.items()}
        total = sum(exp_scores.values())
        
        if total == 0:
            # Uniform distribution
            return {k: 1.0 / len(CATEGORIES) for k in CATEGORIES}
        
        return {k: v / total for k, v in exp_scores.items()}
    
    def _get_top_features(self, f: OpeningFeatures, category: str) -> List[str]:
        """Identify top features influencing the decision."""
        features = []
        
        if category == "core":
            if f.frequency >= 0.05:
                features.append(f"high_frequency ({f.frequency:.1%})")
            if f.winrate >= 0.50:
                features.append(f"solid_winrate ({f.winrate:.1%})")
        elif category == "repair":
            if f.frequency >= 0.05:
                features.append(f"high_frequency ({f.frequency:.1%})")
            if f.winrate < 0.40:
                features.append(f"poor_winrate ({f.winrate:.1%})")
        elif category == "expansion":
            if f.frequency < 0.02:
                features.append(f"low_frequency ({f.frequency:.1%})")
            if f.winrate >= 0.60:
                features.append(f"excellent_winrate ({f.winrate:.1%})")
        elif category == "experimental":
            features.append(f"rarely_played ({f.games_count} games)")
        else:
            features.append("moderate_experience")
        
        if f.opening_residual is not None:
            if f.opening_residual > 0.10:
                features.append(f"overperforming (+{f.opening_residual:.1%})")
            elif f.opening_residual < -0.10:
                features.append(f"underperforming ({f.opening_residual:.1%})")
        
        return features[:3]
    
    def _generate_rationale(self, category: str, f: OpeningFeatures, confidence: float) -> str:
        """Generate human-readable rationale."""
        conf_text = "high" if confidence >= 0.7 else "moderate" if confidence >= 0.5 else "low"
        
        if category == "core":
            return f"This is a core opening: frequently played ({f.frequency:.1%}) with solid results ({f.winrate:.1%}). {conf_text} confidence."
        elif category == "repair":
            return f"This opening needs repair: frequently played ({f.frequency:.1%}) but struggling ({f.winrate:.1%}). {conf_text} confidence."
        elif category == "expansion":
            return f"Consider expanding this: rarely played but excellent results ({f.winrate:.1%}). {conf_text} confidence."
        elif category == "experimental":
            return f"Experimental opening: limited experience with mixed results. {conf_text} confidence."
        else:
            return f"Developing opening: moderate experience, room for growth. {conf_text} confidence."
    
    def should_override_baseline(
        self,
        ml_result: ClassificationResult,
        baseline_category: str,
    ) -> bool:
        """
        Determine if ML result should override baseline.
        
        Override only when:
        - ML confidence >= threshold (default 0.70)
        - ML category differs from baseline
        """
        if ml_result.category == baseline_category:
            return False
        
        return ml_result.confidence >= self.override_confidence


def apply_adaptive_classification(
    opening_stats: Dict[str, Any],
    baseline_category: str,
    ml_config: Optional["MLConfig"] = None,
) -> Dict[str, Any]:
    """
    Apply adaptive classification to an opening.
    
    Args:
        opening_stats: Dict with opening statistics
        baseline_category: Category from rule-based classifier
        ml_config: Optional ML configuration
        
    Returns:
        Updated opening_stats with ml_category_suggestion, final_category, explain
    """
    # Extract features
    features = OpeningFeatures(
        eco=opening_stats.get("eco", ""),
        color=opening_stats.get("color", ""),
        frequency=opening_stats.get("frequency", 0.0),
        winrate=opening_stats.get("winrate", 0.0),
        games_count=opening_stats.get("games_count", 0),
        avg_eval_swing=opening_stats.get("avg_eval_swing", 0.0),
        style_alignment_score=opening_stats.get("style_alignment_score", 0.5),
        opening_residual=opening_stats.get("residual"),
        expected_score=opening_stats.get("expected_score"),
    )
    
    # Run classifier
    classifier = AdaptiveClassifier(ml_config)
    result = classifier.predict(features)
    
    # Determine final category
    should_override = classifier.should_override_baseline(result, baseline_category)
    
    if should_override:
        final_category = result.category
        override_reason = f"ML classifier suggests '{result.category}' with {result.confidence:.0%} confidence"
    else:
        final_category = baseline_category
        if result.category == baseline_category:
            override_reason = "ML agrees with baseline classification"
        else:
            override_reason = f"ML suggests '{result.category}' but confidence ({result.confidence:.0%}) below threshold"
    
    # Update explain
    if result.explain:
        result.explain.baseline_category = baseline_category
        result.explain.final_category = final_category
        result.explain.override_applied = should_override
    
    # Add to opening stats
    opening_stats["baseline_category"] = baseline_category
    opening_stats["ml_category_suggestion"] = result.category
    opening_stats["ml_confidence"] = result.confidence
    opening_stats["final_category"] = final_category
    opening_stats["category_probabilities"] = result.probabilities
    opening_stats["classification_explain"] = result.explain.model_dump() if result.explain else None
    opening_stats["override_reason"] = override_reason
    
    return opening_stats

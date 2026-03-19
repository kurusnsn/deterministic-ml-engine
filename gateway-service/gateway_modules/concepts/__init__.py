"""
Concept hints via LC0+SVM probes with heuristic grounding.

This module provides:
- LC0 neural network activation extraction
- SVM probe classification for chess concepts
- Grounding of concepts using DecodeChess heuristics
- Integration with Llama for natural language commentary

Feature flag: ENABLE_LC0_SVM_CONCEPTS=1
"""

from .concept_grounding import ground_concepts, ConceptGrounder
from .lc0_svm_inference import LC0SVMInference, run_lc0_svm_inference

__all__ = [
    "ground_concepts",
    "ConceptGrounder",
    "LC0SVMInference",
    "run_lc0_svm_inference",
]

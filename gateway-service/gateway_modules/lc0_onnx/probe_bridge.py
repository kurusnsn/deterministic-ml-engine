"""
Probe Bridge: Maps ONNX Activations to Existing SVM Probes.

This module bridges the new ONNX-based activation extraction with the
existing trained SVM probes. The probes are NOT modified - we apply
the exact same preprocessing that was used during training.

Key contract:
- Activations from ONNX: (batch, 512, 8, 8) post-ReLU
- Pooling: Flatten to (batch, 32768)
- Feed to existing SVM: decision_function -> score
"""

import logging
import re
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
import numpy as np

from .config import (
    ENABLE_LC0_ONNX_PROBING,
    get_svm_cache_dir,
    SVM_PROBE_PATTERN,
    DEFAULT_PROBE_LAYER,
    EXPECTED_ACTIVATION_DIM,
)
from .encoder import encode_fen_lc0
from .runtime import get_runtime, lc0_onnx_get_activation

logger = logging.getLogger(__name__)


# Cache for loaded SVM probes
_svm_probes: Dict[str, Any] = {}
_probes_loaded = False


def _load_svm_probes(target_layer: int = DEFAULT_PROBE_LAYER) -> Dict[str, Any]:
    """
    Load SVM probe models from cache directory.
    
    Probes are loaded once and cached for reuse.
    
    Args:
        target_layer: Layer index to load probes for
        
    Returns:
        Dict mapping concept name to SVM model
    """
    global _svm_probes, _probes_loaded
    
    if _probes_loaded:
        return _svm_probes
    
    try:
        import joblib
    except ImportError:
        logger.warning("joblib not installed - SVM probes unavailable")
        _probes_loaded = True
        return {}
    
    svm_dir = Path(get_svm_cache_dir())
    
    if not svm_dir.exists():
        logger.warning(f"SVM cache directory not found: {svm_dir}")
        _probes_loaded = True
        return {}
    
    # Pattern to match probe files
    pattern = re.compile(r"linear_svm.*_concept_(.+)_layer_(\d+)\.pkl")
    
    logger.info(f"Loading SVM probes from {svm_dir}...")
    
    for pkl_file in svm_dir.glob("*.pkl"):
        try:
            match = pattern.match(pkl_file.name)
            if match:
                concept_name = match.group(1)
                layer = int(match.group(2))
                
                if layer == target_layer:
                    _svm_probes[concept_name] = joblib.load(pkl_file)
                    logger.debug(f"  Loaded probe: {concept_name}")
        except Exception as e:
            logger.warning(f"Failed to load {pkl_file}: {e}")
    
    _probes_loaded = True
    logger.info(f"✓ Loaded {len(_svm_probes)} SVM probes for layer {target_layer}")
    
    return _svm_probes


def apply_pooling(
    activation: np.ndarray,
    pooling: str = "flatten",
) -> np.ndarray:
    """
    Apply pooling to activation tensor.
    
    This must match exactly what was done during probe training.
    
    Args:
        activation: Activation tensor of shape (batch, 512, 8, 8) or (512, 8, 8)
        pooling: Pooling type - "flatten", "mean_hw", or "max_hw"
        
    Returns:
        Pooled features array
    """
    # Handle both batched and unbatched
    if activation.ndim == 3:
        activation = activation[np.newaxis, ...]
    
    if pooling == "flatten":
        # Flatten spatial dimensions: (B, C, H, W) -> (B, C*H*W)
        batch_size = activation.shape[0]
        return activation.reshape(batch_size, -1)
    
    elif pooling == "mean_hw":
        # Mean over spatial dimensions: (B, C, H, W) -> (B, C)
        return activation.mean(axis=(2, 3))
    
    elif pooling == "max_hw":
        # Max over spatial dimensions: (B, C, H, W) -> (B, C)
        return activation.max(axis=(2, 3))
    
    else:
        raise ValueError(f"Unknown pooling type: {pooling}")


def run_svm_probes(
    activation: np.ndarray,
    concept_keys: Optional[List[str]] = None,
    target_layer: int = DEFAULT_PROBE_LAYER,
) -> Dict[str, float]:
    """
    Run SVM probes on activation tensor.
    
    Args:
        activation: Flattened activation of shape (batch, 32768) or (32768,)
        concept_keys: List of concept names to evaluate (None = all)
        target_layer: Layer the activation came from
        
    Returns:
        Dict mapping concept name to score (decision_function output)
    """
    probes = _load_svm_probes(target_layer)
    
    if not probes:
        logger.warning("No SVM probes loaded - returning empty scores")
        return {}
    
    # Ensure 2D
    if activation.ndim == 1:
        activation = activation.reshape(1, -1)
    
    # Verify dimension
    if activation.shape[1] != EXPECTED_ACTIVATION_DIM:
        logger.warning(
            f"Activation dimension {activation.shape[1]} != expected {EXPECTED_ACTIVATION_DIM}"
        )
    
    # Select concepts to evaluate
    if concept_keys is None:
        concept_keys = list(probes.keys())
    
    scores = {}
    
    for concept in concept_keys:
        if concept in probes:
            try:
                probe = probes[concept]
                # Use decision_function for continuous score
                score = probe.decision_function(activation)[0]
                scores[concept] = float(score)
            except Exception as e:
                logger.warning(f"Probe {concept} failed: {e}")
                scores[concept] = 0.0
        else:
            logger.debug(f"No probe for concept: {concept}")
    
    return scores


def run_existing_probes(
    onnx_activations: Dict[str, np.ndarray],
    layer: int = DEFAULT_PROBE_LAYER,
    concept_keys: Optional[List[str]] = None,
) -> Dict[str, float]:
    """
    Bridge function: Map ONNX activations to existing probes.
    
    This is the main interface that takes ONNX runtime output and
    produces concept scores using the unchanged SVM probes.
    
    Args:
        onnx_activations: Dict from ONNX runtime (contains "resblock_N" keys)
        layer: Which layer to use
        concept_keys: Concepts to evaluate (None = all)
        
    Returns:
        Dict mapping concept name to score
    """
    layer_key = f"resblock_{layer}"
    
    if layer_key not in onnx_activations:
        available = [k for k in onnx_activations.keys() if k.startswith("resblock_")]
        raise ValueError(
            f"Layer {layer_key} not in ONNX outputs. Available: {available}"
        )
    
    # Get activation tensor
    activation = onnx_activations[layer_key]
    
    # Apply pooling (flatten, matching training)
    features = apply_pooling(activation, pooling="flatten")
    
    # Run probes
    return run_svm_probes(features, concept_keys=concept_keys, target_layer=layer)


def compute_concept_delta(
    fen_before: str,
    fen_after: str,
    layer: int = DEFAULT_PROBE_LAYER,
    concept_keys: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Compute concept score delta between two positions.
    
    Args:
        fen_before: FEN before move
        fen_after: FEN after move
        layer: Layer to use
        concept_keys: Concepts to evaluate
        
    Returns:
        Dict with 'before', 'after', and 'delta' scores
    """
    if not ENABLE_LC0_ONNX_PROBING:
        return {'error': 'LC0 ONNX probing disabled'}
    
    # Encode positions
    encoded_before = encode_fen_lc0(fen_before)
    encoded_after = encode_fen_lc0(fen_after)
    
    # Get runtime
    runtime = get_runtime()
    
    # Get activations
    acts_before = runtime.infer(encoded_before)
    acts_after = runtime.infer(encoded_after)
    
    # Get probe scores
    scores_before = run_existing_probes(acts_before, layer=layer, concept_keys=concept_keys)
    scores_after = run_existing_probes(acts_after, layer=layer, concept_keys=concept_keys)
    
    # Compute deltas
    deltas = {}
    for concept in scores_before.keys():
        if concept in scores_after:
            deltas[concept] = scores_after[concept] - scores_before[concept]
    
    # Sort by absolute delta
    sorted_deltas = sorted(
        deltas.items(),
        key=lambda x: abs(x[1]),
        reverse=True,
    )
    
    return {
        'before': scores_before,
        'after': scores_after,
        'deltas': sorted_deltas,
    }


def get_available_concepts() -> List[str]:
    """Get list of available concept probe names."""
    probes = _load_svm_probes()
    return list(probes.keys())


def validate_probe_compatibility(
    metadata_path: Optional[str] = None,
) -> Tuple[bool, str]:
    """
    Validate that ONNX model is compatible with existing probes.
    
    Checks:
    - ONNX model exists and loads
    - Output layer matches probe expectations
    - Activation dimension is correct
    
    Returns:
        Tuple of (is_compatible, message)
    """
    import json
    
    # Load metadata
    if metadata_path is None:
        metadata_path = Path(__file__).parent / "metadata.json"
    
    try:
        with open(metadata_path) as f:
            metadata = json.load(f)
    except Exception as e:
        return False, f"Cannot load metadata: {e}"
    
    # Check runtime
    try:
        runtime = get_runtime()
        if not runtime.is_loaded:
            runtime._load_session()
    except Exception as e:
        return False, f"Cannot load ONNX runtime: {e}"
    
    # Check output names
    expected_layer = metadata.get('probe_layers', ['resblock_39'])[0]
    if expected_layer not in runtime.output_names:
        return False, f"Expected output {expected_layer} not in model outputs"
    
    # Check activation dimension
    try:
        dummy_input = np.zeros((1, 112, 8, 8), dtype=np.float32)
        result = runtime.infer(dummy_input)
        
        activation_shape = result[expected_layer].shape
        expected_features = metadata.get('expected_features', 32768)
        
        actual_features = np.prod(activation_shape[1:])
        if actual_features != expected_features:
            return False, (
                f"Activation dimension mismatch: {actual_features} vs {expected_features}"
            )
    except Exception as e:
        return False, f"Inference test failed: {e}"
    
    # Check probes load
    probes = _load_svm_probes()
    if not probes:
        return False, "No SVM probes loaded"
    
    return True, f"Compatible: {len(probes)} probes, layer {expected_layer}"


class ProbeBridge:
    """
    High-level probe bridge interface.
    
    Combines encoding, ONNX inference, and probe evaluation
    into a single interface.
    """
    
    def __init__(self, layer: int = DEFAULT_PROBE_LAYER):
        self.layer = layer
        self.runtime = get_runtime()
        
        # Eagerly load probes
        _load_svm_probes(layer)
    
    def score_position(
        self,
        fen: str,
        concept_keys: Optional[List[str]] = None,
    ) -> Dict[str, float]:
        """
        Score a single position.
        
        Args:
            fen: Position FEN
            concept_keys: Concepts to evaluate
            
        Returns:
            Dict mapping concept name to score
        """
        if not ENABLE_LC0_ONNX_PROBING:
            return {}
        
        encoded = encode_fen_lc0(fen)
        activations = self.runtime.infer(encoded)
        return run_existing_probes(activations, layer=self.layer, concept_keys=concept_keys)
    
    def score_move(
        self,
        fen: str,
        move: str,
        concept_keys: Optional[List[str]] = None,
        top_k: int = 5,
    ) -> Dict[str, Any]:
        """
        Score a move by computing concept deltas.
        
        Args:
            fen: Position FEN before move
            move: Move in SAN or UCI format
            concept_keys: Concepts to evaluate
            top_k: Number of top concepts to return
            
        Returns:
            Dict with before/after scores and sorted deltas
        """
        import chess
        
        if not ENABLE_LC0_ONNX_PROBING:
            return {'error': 'LC0 ONNX probing disabled'}
        
        # Parse move
        board = chess.Board(fen)
        
        try:
            move_obj = board.parse_san(move)
        except (chess.IllegalMoveError, chess.InvalidMoveError):
            try:
                move_obj = board.parse_uci(move)
            except (chess.IllegalMoveError, chess.InvalidMoveError):
                return {'error': f'Invalid move: {move}'}
        
        # Apply move
        board.push(move_obj)
        fen_after = board.fen()
        
        # Compute delta
        result = compute_concept_delta(
            fen, fen_after,
            layer=self.layer,
            concept_keys=concept_keys,
        )
        
        # Limit to top_k
        if 'deltas' in result:
            result['deltas'] = result['deltas'][:top_k]
        
        return result
    
    @property
    def is_available(self) -> bool:
        """Check if probe bridge is available and ready."""
        if not ENABLE_LC0_ONNX_PROBING:
            return False
        
        try:
            probes = _load_svm_probes(self.layer)
            return len(probes) > 0
        except:
            return False

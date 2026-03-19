"""
LC0 ONNX Probing Module.

This module provides an ONNX-based alternative path for LC0 concept probing.
It is designed to be a drop-in replacement for the existing TensorFlow-based
probing pipeline, producing identical activations for the same trained probes.

FEATURE FLAG:
    Set ENABLE_LC0_ONNX_PROBING=true in environment to enable.
    When disabled (default), no ONNX models are loaded.

USAGE:
    from gateway_modules.lc0_onnx import lc0_concept_probe_adapter
    
    result = lc0_concept_probe_adapter(fen)
    # result is None if disabled, or Dict[str, float] with concept scores

MODULES:
    - config: Feature flags and configuration
    - encoder: LC0 112-plane input encoding
    - model_t78: PyTorch T78 model definition
    - weight_loader: Load weights from .pb.gz protobuf
    - export_onnx: Export to ONNX with multi-output
    - runtime: ONNX Runtime inference
    - probe_bridge: Bridge to existing SVM probes

EXPORT WORKFLOW:
    1. python -m gateway_modules.lc0_onnx.export_onnx --weights T78_512x40.pb.gz
    2. Set LC0_ONNX_MODEL_PATH to exported .onnx file
    3. Set ENABLE_LC0_ONNX_PROBING=true

PROBE COMPATIBILITY:
    This module produces activations identical to the TensorFlow backend,
    ensuring all 42 existing SVM probes work unchanged.
"""

import logging
from typing import Dict, List, Optional, Any

from .config import (
    ENABLE_LC0_ONNX_PROBING,
    get_onnx_model_path,
    get_weights_path,
    log_config,
    DEFAULT_PROBE_LAYER,
    T78_FILTERS,
    T78_RESIDUAL_BLOCKS,
    EXPECTED_ACTIVATION_DIM,
)

logger = logging.getLogger(__name__)

# Lazy imports to avoid loading ONNX when disabled
_runtime = None
_probe_bridge = None


def _get_runtime():
    """Get or create ONNX runtime (lazy load)."""
    global _runtime
    
    if not ENABLE_LC0_ONNX_PROBING:
        return None
    
    if _runtime is None:
        from .runtime import LC0ONNXRuntime
        _runtime = LC0ONNXRuntime()
    
    return _runtime


def _get_probe_bridge():
    """Get or create probe bridge (lazy load)."""
    global _probe_bridge
    
    if not ENABLE_LC0_ONNX_PROBING:
        return None
    
    if _probe_bridge is None:
        from .probe_bridge import ProbeBridge
        _probe_bridge = ProbeBridge()
    
    return _probe_bridge


def lc0_concept_probe_adapter(
    fen: str,
    concept_keys: Optional[List[str]] = None,
) -> Optional[Dict[str, float]]:
    """
    Main entry point for ONNX-based concept probing.
    
    This function is the adapter between the existing probing pipeline
    and the new ONNX backend. When enabled, it:
    1. Encodes the FEN using LC0's 112-plane format
    2. Runs ONNX inference to extract activations
    3. Feeds activations to existing SVM probes
    4. Returns concept scores
    
    Args:
        fen: Chess position in FEN notation
        concept_keys: List of concept names to evaluate (None = all)
        
    Returns:
        None if ONNX probing is disabled
        Dict[str, float] mapping concept name to score if enabled
        
    Example:
        >>> from gateway_modules.lc0_onnx import lc0_concept_probe_adapter
        >>> scores = lc0_concept_probe_adapter("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        >>> if scores is not None:
        ...     print(scores.get("Threats_w_mid"))
    """
    if not ENABLE_LC0_ONNX_PROBING:
        return None
    
    try:
        bridge = _get_probe_bridge()
        if bridge is None:
            return None
        
        return bridge.score_position(fen, concept_keys=concept_keys)
    
    except Exception as e:
        logger.error(f"ONNX concept probing failed: {e}")
        return None


def lc0_move_concept_delta(
    fen: str,
    move: str,
    concept_keys: Optional[List[str]] = None,
    top_k: int = 5,
) -> Optional[Dict[str, Any]]:
    """
    Compute concept deltas for a move using ONNX backend.
    
    Args:
        fen: Position FEN before the move
        move: Move in SAN or UCI format
        concept_keys: Concepts to evaluate
        top_k: Number of top concepts to return
        
    Returns:
        None if disabled, or Dict with:
        - 'before': Dict[str, float] - scores before move
        - 'after': Dict[str, float] - scores after move
        - 'deltas': List[Tuple[str, float]] - sorted by abs delta
    """
    if not ENABLE_LC0_ONNX_PROBING:
        return None
    
    try:
        bridge = _get_probe_bridge()
        if bridge is None:
            return None
        
        return bridge.score_move(fen, move, concept_keys=concept_keys, top_k=top_k)
    
    except Exception as e:
        logger.error(f"ONNX concept delta failed: {e}")
        return None


def is_onnx_probing_available() -> bool:
    """
    Check if ONNX probing is available and ready.
    
    Returns:
        True if ONNX model is loaded and probes are available
    """
    if not ENABLE_LC0_ONNX_PROBING:
        return False
    
    try:
        bridge = _get_probe_bridge()
        return bridge is not None and bridge.is_available
    except:
        return False


def get_onnx_probing_status() -> Dict[str, Any]:
    """
    Get detailed status of ONNX probing system.
    
    Returns:
        Dict with status information
    """
    status = {
        'enabled': ENABLE_LC0_ONNX_PROBING,
        'onnx_model_path': get_onnx_model_path() if ENABLE_LC0_ONNX_PROBING else None,
        'weights_path': get_weights_path() if ENABLE_LC0_ONNX_PROBING else None,
        'runtime_loaded': False,
        'probes_available': 0,
    }
    
    if ENABLE_LC0_ONNX_PROBING:
        try:
            runtime = _get_runtime()
            if runtime:
                stats = runtime.get_stats()
                status['runtime_loaded'] = stats.get('session_loaded', False)
                status['inference_count'] = stats.get('inference_count', 0)
                status['avg_inference_ms'] = stats.get('avg_inference_time_ms', 0)
            
            bridge = _get_probe_bridge()
            if bridge:
                from .probe_bridge import get_available_concepts
                concepts = get_available_concepts()
                status['probes_available'] = len(concepts)
                status['concept_names'] = concepts
        except Exception as e:
            status['error'] = str(e)
    
    return status


# Export key components
__all__ = [
    # Main API
    'lc0_concept_probe_adapter',
    'lc0_move_concept_delta',
    'is_onnx_probing_available',
    'get_onnx_probing_status',
    
    # Configuration
    'ENABLE_LC0_ONNX_PROBING',
    'DEFAULT_PROBE_LAYER',
    
    # For direct access when needed
    'log_config',
]

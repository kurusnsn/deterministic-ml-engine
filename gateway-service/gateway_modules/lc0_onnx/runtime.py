"""
LC0 ONNX Runtime Inference.

Provides cached ONNX Runtime inference for LC0 T78 model.
Thread-safe, singleton session for efficiency.
"""

import logging
import threading
import time
from pathlib import Path
from typing import Dict, List, Optional, Any
import numpy as np

from .config import (
    ENABLE_LC0_ONNX_PROBING,
    get_onnx_model_path,
    MAX_INFERENCE_TIME_MS,
    ENABLE_ACTIVATION_CACHE,
    MAX_CACHE_SIZE,
    DEFAULT_PROBE_LAYER,
    EXPECTED_ACTIVATION_DIM,
)

logger = logging.getLogger(__name__)


class LC0ONNXRuntime:
    """
    ONNX Runtime inference wrapper for LC0 T78.
    
    Features:
    - Cached ONNX session (loaded once)
    - Thread-safe inference
    - Optional activation caching
    - Performance monitoring
    """
    
    _instance: Optional['LC0ONNXRuntime'] = None
    _lock = threading.Lock()
    
    def __new__(cls, *args, **kwargs):
        """Singleton pattern for runtime instance."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self, model_path: Optional[str] = None):
        """
        Initialize ONNX Runtime.
        
        Args:
            model_path: Path to ONNX model file (optional, uses config default)
        """
        # Only initialize once
        if hasattr(self, '_initialized') and self._initialized:
            return
        
        self._model_path = model_path or get_onnx_model_path()
        self._session = None
        self._output_names = None
        self._session_lock = threading.Lock()
        
        # Activation cache
        self._cache: Dict[str, Dict[str, np.ndarray]] = {}
        self._cache_lock = threading.Lock()
        
        # Performance stats
        self._inference_count = 0
        self._total_inference_time_ms = 0.0
        
        self._initialized = True
        logger.info(f"LC0ONNXRuntime initialized with model: {self._model_path}")
    
    def _load_session(self) -> None:
        """Load ONNX session if not already loaded."""
        if self._session is not None:
            return
        
        with self._session_lock:
            if self._session is not None:
                return
            
            if not Path(self._model_path).exists():
                raise FileNotFoundError(
                    f"ONNX model not found: {self._model_path}\n"
                    f"Please export the model first using export_onnx.py"
                )
            
            import onnxruntime as ort
            
            logger.info(f"Loading ONNX session from {self._model_path}...")
            
            # Use CPU execution provider for portability
            sess_options = ort.SessionOptions()
            sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            
            self._session = ort.InferenceSession(
                self._model_path,
                sess_options=sess_options,
                providers=['CPUExecutionProvider'],
            )
            
            # Cache output names
            self._output_names = [o.name for o in self._session.get_outputs()]
            
            logger.info(f"✓ ONNX session loaded. Outputs: {self._output_names}")
    
    @property
    def is_loaded(self) -> bool:
        """Check if session is loaded."""
        return self._session is not None
    
    @property
    def output_names(self) -> List[str]:
        """Get list of output names."""
        if self._output_names is None:
            self._load_session()
        return self._output_names
    
    def _cache_key(self, encoded_board: np.ndarray) -> str:
        """Generate cache key from encoded board."""
        return encoded_board.tobytes()[:64].hex()  # First 64 bytes as hex
    
    def infer(
        self,
        encoded_board: np.ndarray,
        use_cache: bool = True,
    ) -> Dict[str, np.ndarray]:
        """
        Run inference on encoded board.
        
        Args:
            encoded_board: Input tensor of shape (batch, 112, 8, 8)
            use_cache: Whether to use activation cache
            
        Returns:
            Dict mapping output names to numpy arrays
        """
        if not ENABLE_LC0_ONNX_PROBING:
            logger.warning("LC0 ONNX probing is disabled")
            return {}
        
        # Ensure session is loaded
        self._load_session()
        
        # Check cache
        if use_cache and ENABLE_ACTIVATION_CACHE:
            cache_key = self._cache_key(encoded_board)
            with self._cache_lock:
                if cache_key in self._cache:
                    return self._cache[cache_key]
        
        # Ensure correct shape
        if encoded_board.ndim == 3:
            encoded_board = encoded_board[np.newaxis, ...]
        
        # Ensure float32
        if encoded_board.dtype != np.float32:
            encoded_board = encoded_board.astype(np.float32)
        
        # Run inference with timing
        start_time = time.perf_counter()
        
        outputs = self._session.run(self._output_names, {"board": encoded_board})
        
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        
        # Update stats
        self._inference_count += 1
        self._total_inference_time_ms += elapsed_ms
        
        if elapsed_ms > MAX_INFERENCE_TIME_MS:
            logger.warning(
                f"Inference took {elapsed_ms:.1f}ms (target: <{MAX_INFERENCE_TIME_MS}ms)"
            )
        
        # Build result dict
        result = dict(zip(self._output_names, outputs))
        
        # Cache result
        if use_cache and ENABLE_ACTIVATION_CACHE:
            with self._cache_lock:
                if len(self._cache) >= MAX_CACHE_SIZE:
                    # Remove oldest entries (FIFO)
                    keys_to_remove = list(self._cache.keys())[:MAX_CACHE_SIZE // 4]
                    for key in keys_to_remove:
                        del self._cache[key]
                self._cache[cache_key] = result
        
        return result
    
    def infer_batch(
        self,
        encoded_boards: np.ndarray,
    ) -> Dict[str, np.ndarray]:
        """
        Run batch inference.
        
        Args:
            encoded_boards: Input tensor of shape (batch, 112, 8, 8)
            
        Returns:
            Dict mapping output names to numpy arrays (with batch dimension)
        """
        if not ENABLE_LC0_ONNX_PROBING:
            return {}
        
        self._load_session()
        
        if encoded_boards.dtype != np.float32:
            encoded_boards = encoded_boards.astype(np.float32)
        
        outputs = self._session.run(self._output_names, {"board": encoded_boards})
        
        return dict(zip(self._output_names, outputs))
    
    def get_activation(
        self,
        encoded_board: np.ndarray,
        layer: int = DEFAULT_PROBE_LAYER,
        flatten: bool = True,
    ) -> np.ndarray:
        """
        Get activation from a specific layer.
        
        Args:
            encoded_board: Input tensor
            layer: Residual block index
            flatten: Whether to flatten the activation
            
        Returns:
            Activation array (flattened if requested)
        """
        result = self.infer(encoded_board)
        
        layer_key = f"resblock_{layer}"
        if layer_key not in result:
            available = [k for k in result.keys() if k.startswith("resblock_")]
            raise ValueError(
                f"Layer {layer_key} not in outputs. Available: {available}"
            )
        
        activation = result[layer_key]
        
        if flatten:
            # Flatten spatial dimensions: (B, C, H, W) -> (B, C*H*W)
            batch_size = activation.shape[0]
            activation = activation.reshape(batch_size, -1)
            
            # Verify expected dimension
            expected = EXPECTED_ACTIVATION_DIM
            actual = activation.shape[1]
            if actual != expected:
                logger.warning(
                    f"Activation dimension mismatch: {actual} vs expected {expected}"
                )
        
        return activation
    
    def get_stats(self) -> Dict[str, Any]:
        """Get inference statistics."""
        avg_time = (
            self._total_inference_time_ms / self._inference_count
            if self._inference_count > 0 else 0
        )
        
        return {
            'model_path': self._model_path,
            'session_loaded': self.is_loaded,
            'inference_count': self._inference_count,
            'avg_inference_time_ms': avg_time,
            'cache_size': len(self._cache),
            'output_names': self._output_names,
        }
    
    def clear_cache(self) -> None:
        """Clear activation cache."""
        with self._cache_lock:
            self._cache.clear()
        logger.info("Activation cache cleared")
    
    @classmethod
    def reset_instance(cls) -> None:
        """Reset singleton instance (for testing)."""
        with cls._lock:
            if cls._instance is not None:
                cls._instance._session = None
                cls._instance._cache.clear()
            cls._instance = None


# Module-level convenience functions

def get_runtime() -> LC0ONNXRuntime:
    """Get the global ONNX runtime instance."""
    return LC0ONNXRuntime()


def lc0_onnx_infer(encoded_board: np.ndarray) -> Dict[str, np.ndarray]:
    """
    Run LC0 ONNX inference.
    
    Convenience function for quick inference.
    
    Args:
        encoded_board: Encoded board tensor (1, 112, 8, 8)
        
    Returns:
        Dict with all outputs (policy, value, activations)
    """
    runtime = get_runtime()
    return runtime.infer(encoded_board)


def lc0_onnx_get_activation(
    encoded_board: np.ndarray,
    layer: int = DEFAULT_PROBE_LAYER,
) -> np.ndarray:
    """
    Get flattened activation from ONNX model.
    
    Args:
        encoded_board: Encoded board tensor
        layer: Layer index (default: 39)
        
    Returns:
        Flattened activation array of shape (batch, 32768)
    """
    runtime = get_runtime()
    return runtime.get_activation(encoded_board, layer=layer, flatten=True)

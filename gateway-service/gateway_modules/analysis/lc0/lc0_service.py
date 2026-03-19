"""
LC0 Position Evaluation Service.

Provides LC0-based position evaluation for premium augmentation features.
Uses the existing ONNX runtime from lc0_onnx module.

Key features:
- Batched evaluation for efficiency
- FEN-hash caching
- Timeout with graceful fallback
- Never blocks baseline pipeline
"""

import hashlib
import logging
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Any
import threading

logger = logging.getLogger(__name__)

# In-memory cache for LC0 results
_lc0_cache: Dict[str, Dict[str, Any]] = {}
_cache_lock = threading.Lock()
MAX_CACHE_SIZE = 1000


@dataclass
class LC0PositionResult:
    """Result of LC0 evaluation for a single position."""
    fen: str
    value: float  # [-1, 1] range, positive = white winning
    policy_topk: List[Dict[str, Any]]  # [{"uci": "e2e4", "p": 0.35}, ...]
    policy_entropy: float
    wdl: Optional[Dict[str, float]] = None  # {"w": 0.4, "d": 0.3, "l": 0.3}
    computed_at: Optional[str] = None
    cached: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "fen": self.fen,
            "value": self.value,
            "policy_topk": self.policy_topk,
            "policy_entropy": self.policy_entropy,
            "wdl": self.wdl,
            "computed_at": self.computed_at,
            "cached": self.cached,
        }


class LC0Service:
    """
    LC0 position evaluation service.
    
    Uses existing ONNX runtime from gateway_modules/lc0_onnx.
    Fully optional - never blocks baseline.
    
    Example:
        >>> service = get_lc0_service()
        >>> results = service.evaluate_positions(["fen1", "fen2"], topk=5)
        >>> for r in results:
        ...     print(f"{r.fen}: value={r.value:.2f}")
    """
    
    _instance: Optional['LC0Service'] = None
    _lock = threading.Lock()
    
    def __new__(cls, *args, **kwargs):
        """Singleton pattern."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if hasattr(self, '_initialized') and self._initialized:
            return
        
        self._onnx_available = False
        self._runtime = None
        self._encoder = None
        self._initialized = True
        
        # Try to import ONNX runtime components
        try:
            from gateway_modules.lc0_onnx.config import ENABLE_LC0_ONNX_PROBING
            if ENABLE_LC0_ONNX_PROBING:
                from gateway_modules.lc0_onnx.runtime import get_runtime
                from gateway_modules.lc0_onnx.encoder import encode_fen_lc0, encode_fen_batch
                self._runtime = get_runtime()
                self._encode_fen = encode_fen_lc0
                self._encode_batch = encode_fen_batch
                self._onnx_available = True
                logger.info("LC0Service initialized with ONNX backend")
            else:
                logger.info("LC0 ONNX probing disabled - LC0Service using mock mode")
        except ImportError as e:
            logger.warning(f"LC0 ONNX import failed: {e} - using mock mode")
    
    @property
    def is_available(self) -> bool:
        """Check if LC0 evaluation is available."""
        return self._onnx_available
    
    def _fen_hash(self, fen: str) -> str:
        """Generate cache hash for FEN."""
        return hashlib.md5(fen.encode()).hexdigest()[:16]
    
    def _get_cached(self, fen: str) -> Optional[Dict[str, Any]]:
        """Get cached result for FEN."""
        cache_key = self._fen_hash(fen)
        with _cache_lock:
            return _lc0_cache.get(cache_key)
    
    def _set_cached(self, fen: str, result: Dict[str, Any]) -> None:
        """Cache result for FEN."""
        cache_key = self._fen_hash(fen)
        with _cache_lock:
            if len(_lc0_cache) >= MAX_CACHE_SIZE:
                # Remove oldest entries
                keys_to_remove = list(_lc0_cache.keys())[:MAX_CACHE_SIZE // 4]
                for key in keys_to_remove:
                    del _lc0_cache[key]
            _lc0_cache[cache_key] = result
    
    def _compute_policy_entropy(self, policy_probs: List[float]) -> float:
        """Compute Shannon entropy of policy distribution."""
        import math
        
        entropy = 0.0
        for p in policy_probs:
            if p > 1e-8:
                entropy -= p * math.log2(p)
        
        return entropy
    
    def _extract_topk_policy(
        self, 
        policy_logits: Any, 
        fen: str, 
        topk: int
    ) -> List[Dict[str, Any]]:
        """
        Extract top-k moves from policy logits.
        
        Args:
            policy_logits: Raw policy output from network
            fen: FEN for legal move filtering
            topk: Number of top moves to return
            
        Returns:
            List of {uci, p} dicts sorted by probability
        """
        import numpy as np
        import chess
        
        try:
            board = chess.Board(fen)
            legal_moves = list(board.legal_moves)
            
            if not legal_moves:
                return []
            
            # Policy logits shape: (1858,) for LC0's policy encoding
            # We need to map UCI moves to policy indices
            # For simplicity, we'll use a heuristic approach
            
            # Softmax over all legal move indices
            logits = policy_logits.flatten()
            
            # Apply softmax
            exp_logits = np.exp(logits - logits.max())
            probs = exp_logits / exp_logits.sum()
            
            # For each legal move, find its policy index and probability
            move_probs = []
            for move in legal_moves:
                # LC0 policy encoding: we use a simplified index based on from-to squares
                # This is an approximation - full implementation would need lc0 policy map
                from_sq = move.from_square
                to_sq = move.to_square
                
                # Simple index calculation (approximation)
                idx = from_sq * 64 + to_sq
                if idx < len(probs):
                    move_probs.append((move.uci(), float(probs[idx])))
                else:
                    move_probs.append((move.uci(), 0.01))  # Fallback
            
            # Normalize
            total_prob = sum(p for _, p in move_probs)
            if total_prob > 0:
                move_probs = [(m, p / total_prob) for m, p in move_probs]
            
            # Sort by probability and get top-k
            move_probs.sort(key=lambda x: x[1], reverse=True)
            
            return [{"uci": m, "p": round(p, 4)} for m, p in move_probs[:topk]]
            
        except Exception as e:
            logger.warning(f"Policy extraction failed: {e}")
            return []
    
    def evaluate_positions(
        self,
        fens: List[str],
        *,
        topk: int = 8,
        timeout_seconds: float = 30.0,
        use_cache: bool = True
    ) -> List[LC0PositionResult]:
        """
        Evaluate multiple chess positions using LC0.
        
        Args:
            fens: List of FEN strings to evaluate
            topk: Number of top policy moves to return per position
            timeout_seconds: Maximum time for all evaluations
            use_cache: Whether to use/update cache
            
        Returns:
            List of LC0PositionResult, one per input FEN.
            On timeout/error, returns partial results with mock data.
        """
        import numpy as np
        from datetime import datetime
        
        start_time = time.perf_counter()
        results = []
        
        if not fens:
            return results
        
        # Check cache first
        uncached_fens = []
        uncached_indices = []
        
        for i, fen in enumerate(fens):
            if use_cache:
                cached = self._get_cached(fen)
                if cached:
                    results.append(LC0PositionResult(
                        fen=fen,
                        value=cached.get("value", 0.0),
                        policy_topk=cached.get("policy_topk", []),
                        policy_entropy=cached.get("policy_entropy", 0.0),
                        wdl=cached.get("wdl"),
                        cached=True,
                    ))
                    continue
            
            uncached_fens.append(fen)
            uncached_indices.append(i)
            results.append(None)  # Placeholder
        
        if not uncached_fens:
            return results
        
        # Run LC0 inference if available
        if self._onnx_available and self._runtime:
            try:
                # Check timeout
                elapsed = time.perf_counter() - start_time
                if elapsed > timeout_seconds:
                    logger.warning("LC0 timeout before inference")
                    return self._fill_mock_results(fens, results, uncached_indices)
                
                # Batch encode all uncached FENs
                encoded = self._encode_batch(uncached_fens)
                
                # Run batch inference
                outputs = self._runtime.infer_batch(encoded)
                
                # Extract value and policy
                value_output = outputs.get("value", outputs.get("value_head", None))
                policy_output = outputs.get("policy", outputs.get("policy_head", None))
                
                timestamp = datetime.utcnow().isoformat()
                
                for batch_idx, fen in enumerate(uncached_fens):
                    try:
                        # Extract value for this position
                        value = 0.0
                        if value_output is not None:
                            v = value_output[batch_idx]
                            if hasattr(v, '__len__') and len(v) >= 3:
                                # WDL output: [win, draw, loss]
                                w, d, l = float(v[0]), float(v[1]), float(v[2])
                                value = w - l  # Convert to [-1, 1]
                                wdl = {"w": round(w, 4), "d": round(d, 4), "l": round(l, 4)}
                            else:
                                value = float(v) if np.isscalar(v) else float(v[0])
                                wdl = None
                        else:
                            wdl = None
                        
                        # Extract top-k policy moves
                        policy_topk = []
                        policy_entropy = 0.0
                        if policy_output is not None:
                            policy_topk = self._extract_topk_policy(
                                policy_output[batch_idx], fen, topk
                            )
                            probs = [m["p"] for m in policy_topk]
                            if probs:
                                policy_entropy = self._compute_policy_entropy(probs)
                        
                        result = LC0PositionResult(
                            fen=fen,
                            value=round(value, 4),
                            policy_topk=policy_topk,
                            policy_entropy=round(policy_entropy, 4),
                            wdl=wdl,
                            computed_at=timestamp,
                            cached=False,
                        )
                        
                        # Cache the result
                        if use_cache:
                            self._set_cached(fen, result.to_dict())
                        
                        # Place in correct position
                        original_idx = uncached_indices[batch_idx]
                        results[original_idx] = result
                        
                    except Exception as e:
                        logger.warning(f"LC0 result extraction failed for {fen}: {e}")
                        results[uncached_indices[batch_idx]] = self._mock_result(fen)
                
            except Exception as e:
                logger.error(f"LC0 batch inference failed: {e}")
                return self._fill_mock_results(fens, results, uncached_indices)
        else:
            # No ONNX available - return mock results
            return self._fill_mock_results(fens, results, uncached_indices)
        
        return results
    
    def _mock_result(self, fen: str) -> LC0PositionResult:
        """Generate mock result for fallback."""
        return LC0PositionResult(
            fen=fen,
            value=0.0,
            policy_topk=[],
            policy_entropy=0.0,
            wdl=None,
            cached=False,
        )
    
    def _fill_mock_results(
        self,
        fens: List[str],
        results: List[Optional[LC0PositionResult]],
        uncached_indices: List[int]
    ) -> List[LC0PositionResult]:
        """Fill in mock results for uncached positions."""
        for i, fen in enumerate(fens):
            if results[i] is None:
                results[i] = self._mock_result(fen)
        return results
    
    def evaluate_single(self, fen: str, topk: int = 8) -> Optional[LC0PositionResult]:
        """
        Evaluate a single position.
        
        Convenience wrapper around evaluate_positions.
        
        Args:
            fen: Position FEN
            topk: Number of top moves to return
            
        Returns:
            LC0PositionResult or None on error
        """
        results = self.evaluate_positions([fen], topk=topk)
        return results[0] if results else None
    
    def get_stats(self) -> Dict[str, Any]:
        """Get service statistics."""
        return {
            "available": self._onnx_available,
            "cache_size": len(_lc0_cache),
            "runtime_stats": self._runtime.get_stats() if self._runtime else None,
        }
    
    @classmethod
    def reset_instance(cls) -> None:
        """Reset singleton instance (for testing)."""
        with cls._lock:
            cls._instance = None
        
        # Clear cache
        with _cache_lock:
            _lc0_cache.clear()


# Module-level convenience function
_service_instance: Optional[LC0Service] = None


def get_lc0_service() -> LC0Service:
    """Get the global LC0 service instance."""
    global _service_instance
    if _service_instance is None:
        _service_instance = LC0Service()
    return _service_instance

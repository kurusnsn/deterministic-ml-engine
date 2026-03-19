"""
LC0 + SVM Probe Inference Module.

Loads an LC0 neural network and trained SVM probes to produce concept scores
and importance values for chess positions.

This module supports:
- CPU fallback (local development)
- GPU acceleration (Modal deployment)
- In-memory caching for repeated queries
- Deterministic outputs

Usage:
    from gateway_modules.concepts.lc0_svm_inference import run_lc0_svm_inference

    result = run_lc0_svm_inference(
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        move_san_or_uci="e4",
        target_layers=[39],
        top_k=5
    )

How to run locally (CPU fallback):
    1. Ensure model files exist at <repo-root>/models/:
       models/
         lc0/
           t78_512x40.pb.gz
         svm/
           cache/
             linear_svm_v4.6_....pkl
             ...
       Or set LC0_MODEL_PATH and SVM_CACHE_DIR env vars.

    2. Install dependencies: pip install python-chess numpy tensorflow joblib

    3. Run with: ENABLE_LC0_SVM_CONCEPTS=1 python -c "from gateway_modules.concepts import run_lc0_svm_inference; ..."

Note: TensorFlow will use CPU if no GPU is available. Mock inference is used if models are missing.
"""

import os
import gzip
import hashlib
import logging
from functools import lru_cache
from pathlib import Path
from typing import List, Tuple, Dict, Optional, Any
from dataclasses import dataclass, field

import chess
import numpy as np

logger = logging.getLogger(__name__)

# Default paths (can be overridden by env vars)
# For Modal: uses /models volume paths
# For local: uses relative paths from repo root
DEFAULT_LC0_CONFIG_PATH = "/models/lc0/T78.yaml"
DEFAULT_LC0_WEIGHTS_PATH = "/models/lc0/T78_512x40.pb.gz"
DEFAULT_SVM_CACHE_DIR = "/models/svm"

# Local development paths (relative to repo root or gateway-service)
LOCAL_LC0_CONFIG_PATHS = [
    "lczeroTraining/tf/configs/T78.yaml",      # From repo root
    "../lczeroTraining/tf/configs/T78.yaml",   # From gateway-service
]
LOCAL_LC0_WEIGHTS_PATHS = [
    "T78_512x40.pb.gz",      # From repo root
    "../T78_512x40.pb.gz",   # From gateway-service
]
LOCAL_SVM_CACHE_DIRS = [
    "cache",             # From repo root
    "../cache",          # From gateway-service
]

# Default concept keys (matching trained SVM probes)
# Format: linear_svm_v4.6_size_200000_0.05_concept_{CONCEPT}_layer_{LAYER}.pkl
DEFAULT_CONCEPT_KEYS = [
    "Threats_w_mid",
    "Threats_b_mid",
    "Kingsafety_w_mid",
    "Kingsafety_b_mid",
    "Mobility_w_mid",
    "Mobility_b_mid",
    "Space_w_mid",
    "Space_b_mid",
    "Material_t_mid",
    "Pawns_t_mid",
    "Passedpawns_w_mid",
    "Passedpawns_b_mid",
    "Imbalance_t_mid",
    "Knights_w_mid",
    "Knights_b_mid",
    "Bishop_w_mid",
    "Bishop_b_mid",
    "Rooks_w_mid",
    "Rooks_b_mid",
    "Queens_w_mid",
    "Queens_b_mid",
]

# SVM probe filename pattern
SVM_PROBE_PATTERN = "linear_svm_v4.6_size_200000_0.05_concept_{concept}_layer_{layer}.pkl"


@dataclass
class LC0SVMResult:
    """Result from LC0+SVM inference."""
    concept_scores: List[Tuple[str, float]]  # Per concept at root position
    concept_importance: List[Tuple[str, float]]  # Delta importance (sorted desc by abs)
    meta: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return {
            "concept_scores": self.concept_scores,
            "concept_importance": self.concept_importance,
            "meta": self.meta,
        }


class LC0SVMInference:
    """
    LC0 activation extraction + SVM probe inference.

    Loads models once and caches results per (fen, move) to avoid recomputation.

    Concept importance is computed as:
        importance = score(after_reply) - score(root)

    This measures how much a concept changes after the move and opponent's best reply,
    indicating the strategic impact of the move on that concept.
    """

    def __init__(
        self,
        lc0_config_path: Optional[str] = None,
        lc0_weights_path: Optional[str] = None,
        svm_cache_dir: Optional[str] = None,
        stockfish_path: Optional[str] = None,
        stockfish_depth: int = 10,
        # Backwards compatibility: accept lc0_model_path as alias for lc0_weights_path
        lc0_model_path: Optional[str] = None,
    ):
        """
        Initialize the inference engine.

        Args:
            lc0_config_path: Path to LC0 config YAML (T78.yaml)
            lc0_weights_path: Path to LC0 protobuf weights (.pb.gz)
            svm_cache_dir: Directory containing SVM pickle files
            stockfish_path: Path to Stockfish binary (for best reply computation)
            stockfish_depth: Depth for Stockfish best reply search
            lc0_model_path: Deprecated alias for lc0_weights_path
        """
        # Backwards compatibility
        lc0_weights_path = lc0_weights_path or lc0_model_path
        
        # Resolve LC0 config path
        self.lc0_config_path = lc0_config_path or os.getenv("LC0_CONFIG_PATH")
        if not self.lc0_config_path:
            if Path(DEFAULT_LC0_CONFIG_PATH).exists():
                self.lc0_config_path = DEFAULT_LC0_CONFIG_PATH
            else:
                for local_path in LOCAL_LC0_CONFIG_PATHS:
                    if Path(local_path).exists():
                        self.lc0_config_path = local_path
                        break
                else:
                    self.lc0_config_path = DEFAULT_LC0_CONFIG_PATH

        # Resolve LC0 weights path
        self.lc0_weights_path = lc0_weights_path or os.getenv("LC0_WEIGHTS_PATH")
        if not self.lc0_weights_path:
            if Path(DEFAULT_LC0_WEIGHTS_PATH).exists():
                self.lc0_weights_path = DEFAULT_LC0_WEIGHTS_PATH
            else:
                for local_path in LOCAL_LC0_WEIGHTS_PATHS:
                    if Path(local_path).exists():
                        self.lc0_weights_path = local_path
                        break
                else:
                    self.lc0_weights_path = DEFAULT_LC0_WEIGHTS_PATH

        # Resolve SVM cache dir
        self.svm_cache_dir = svm_cache_dir or os.getenv("SVM_CACHE_DIR")
        if not self.svm_cache_dir:
            if Path(DEFAULT_SVM_CACHE_DIR).exists():
                self.svm_cache_dir = DEFAULT_SVM_CACHE_DIR
            else:
                for local_dir in LOCAL_SVM_CACHE_DIRS:
                    if Path(local_dir).exists():
                        self.svm_cache_dir = local_dir
                        break
                else:
                    self.svm_cache_dir = DEFAULT_SVM_CACHE_DIR

        self.stockfish_path = stockfish_path or os.getenv("STOCKFISH_PATH", "stockfish")
        self.stockfish_depth = stockfish_depth

        # Lazy-loaded models
        self._lc0_extractor = None  # LC0ActivationExtractor instance
        self._svm_probes: Dict[str, Any] = {}
        self._loaded = False

        # In-memory cache for (fen, move) -> result
        self._cache: Dict[str, LC0SVMResult] = {}

    def _cache_key(self, fen: str, move: str) -> str:
        """Generate deterministic cache key for (fen, move) pair."""
        combined = f"{fen}|{move}"
        return hashlib.sha256(combined.encode()).hexdigest()[:16]

    def load_models(self) -> bool:
        """
        Load LC0 network and SVM probes.

        Returns:
            True if models loaded successfully, False otherwise
        """
        if self._loaded:
            return True

        try:
            # Load LC0 activation extractor
            self._lc0_extractor = self._load_lc0_extractor()
            if self._lc0_extractor is None:
                logger.warning("LC0 extractor not loaded - using mock inference")

            # Load SVM probes for the target layer (default: 39)
            self._svm_probes = self._load_svm_probes(target_layer=39)
            if not self._svm_probes:
                logger.warning("No SVM probes loaded - using mock inference")

            self._loaded = True
            logger.info(
                f"Models loaded: LC0={'yes' if self._lc0_extractor else 'mock'}, "
                f"SVM probes={len(self._svm_probes)}"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to load models: {e}")
            self._loaded = True  # Mark as loaded to avoid retry
            return False

    def _load_lc0_extractor(self) -> Optional[Any]:
        """
        Load LC0 activation extractor using TFProcess.
        
        This uses the lczeroTraining infrastructure to properly build
        the Keras model from config and load weights.
        """
        try:
            logger.info("=" * 60)
            logger.info("LOADING LC0 ACTIVATION EXTRACTOR")
            logger.info("=" * 60)
            
            from gateway_modules.concepts.lc0_extractor import LC0ActivationExtractor
            
            config_path = Path(self.lc0_config_path)
            weights_path = Path(self.lc0_weights_path)
            
            logger.info(f"Config path: {config_path}")
            logger.info(f"Weights path: {weights_path}")
            
            if not config_path.exists():
                logger.error(f"LC0 config not found at {config_path}")
                return None
                
            if not weights_path.exists():
                logger.error(f"LC0 weights not found at {weights_path}")
                return None
            
            logger.info(f"Creating LC0ActivationExtractor with force_cpu=True")
            
            extractor = LC0ActivationExtractor(
                config_path=str(config_path),
                weights_path=str(weights_path),
                target_layer=39,
                force_cpu=False,  # LC0 requires GPU (NCHW format)
            )
            
            logger.info("Calling extractor.initialize()...")
            extractor.initialize()
            
            logger.info("LC0 extractor initialized successfully!")
            return extractor
            
        except ImportError as e:
            logger.error(f"LC0 extractor import failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None
        except FileNotFoundError as e:
            logger.error(f"LC0 file not found: {e}")
            return None
        except Exception as e:
            logger.error(f"Failed to load LC0 extractor: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None

    def _load_svm_probes(self, target_layer: int = 39) -> Dict[str, Any]:
        """Load SVM probe pickle files for a specific layer."""
        try:
            import joblib
            import re

            probes = {}
            svm_dir = Path(self.svm_cache_dir)

            if not svm_dir.exists():
                logger.warning(f"SVM cache directory not found at {svm_dir}")
                return {}

            # Pattern to extract concept name and layer from filename
            # e.g., linear_svm_v4.6_size_200000_0.05_concept_Threats_w_mid_layer_39.pkl
            pattern = re.compile(r"linear_svm.*_concept_(.+)_layer_(\d+)\.pkl")

            for pkl_file in svm_dir.glob("*.pkl"):
                try:
                    match = pattern.match(pkl_file.name)
                    if match:
                        concept_name = match.group(1)  # e.g., "Threats_w_mid"
                        layer = int(match.group(2))  # e.g., 39
                        
                        # Only load probes for the target layer
                        if layer == target_layer:
                            probes[concept_name] = joblib.load(pkl_file)
                            logger.debug(f"Loaded SVM probe: {concept_name} (layer {layer})")
                except Exception as e:
                    logger.warning(f"Failed to load SVM probe {pkl_file}: {e}")

            return probes

        except ImportError:
            logger.warning("joblib not available - using mock SVM inference")
            return {}
        except Exception as e:
            logger.warning(f"Failed to load SVM probes: {e}")
            return {}

    def _fen_to_input(self, fen: str) -> np.ndarray:
        """
        Convert FEN to LC0 input tensor.

        LC0 uses a 112-plane input encoding:
        - 13 planes per position (6 piece types x 2 colors + 1 repetition)
        - 8 history positions
        - 8 additional planes (castling, en passant, etc.)

        For simplicity with probes, we use a single position encoding.
        """
        board = chess.Board(fen)

        # Create 112-plane input (8x8x112)
        planes = np.zeros((8, 8, 112), dtype=np.float32)

        # Encode current position (first 13 planes)
        piece_to_plane = {
            (chess.PAWN, chess.WHITE): 0,
            (chess.KNIGHT, chess.WHITE): 1,
            (chess.BISHOP, chess.WHITE): 2,
            (chess.ROOK, chess.WHITE): 3,
            (chess.QUEEN, chess.WHITE): 4,
            (chess.KING, chess.WHITE): 5,
            (chess.PAWN, chess.BLACK): 6,
            (chess.KNIGHT, chess.BLACK): 7,
            (chess.BISHOP, chess.BLACK): 8,
            (chess.ROOK, chess.BLACK): 9,
            (chess.QUEEN, chess.BLACK): 10,
            (chess.KING, chess.BLACK): 11,
        }

        for sq in chess.SQUARES:
            piece = board.piece_at(sq)
            if piece:
                plane_idx = piece_to_plane.get((piece.piece_type, piece.color))
                if plane_idx is not None:
                    rank = chess.square_rank(sq)
                    file = chess.square_file(sq)
                    # Flip rank for black's perspective if needed
                    if board.turn == chess.BLACK:
                        rank = 7 - rank
                    planes[rank, file, plane_idx] = 1.0

        # Castling rights (planes 104-107)
        if board.has_kingside_castling_rights(chess.WHITE):
            planes[:, :, 104] = 1.0
        if board.has_queenside_castling_rights(chess.WHITE):
            planes[:, :, 105] = 1.0
        if board.has_kingside_castling_rights(chess.BLACK):
            planes[:, :, 106] = 1.0
        if board.has_queenside_castling_rights(chess.BLACK):
            planes[:, :, 107] = 1.0

        # Side to move (plane 108)
        if board.turn == chess.WHITE:
            planes[:, :, 108] = 1.0

        # Move count (plane 109) - normalized
        planes[:, :, 109] = min(board.fullmove_number / 100.0, 1.0)

        return planes

    def _extract_activations(
        self,
        fen: str,
        target_layers: List[int],
    ) -> Dict[int, np.ndarray]:
        """
        Extract activations from LC0 for specified layers.

        Args:
            fen: Position FEN
            target_layers: List of layer indices to extract

        Returns:
            Dict mapping layer index to activation array
        """
        if self._lc0_extractor is None:
            # Mock activations for testing without model
            return {
                layer: np.random.RandomState(
                    int(hashlib.sha256(fen.encode()).hexdigest()[:8], 16) % (2**31)
                ).randn(512)
                for layer in target_layers
            }

        try:
            activations = {}
            
            for layer in target_layers:
                try:
                    # Use LC0ActivationExtractor
                    activation = self._lc0_extractor.extract_activation(fen, layer=layer)
                    activations[layer] = activation
                except Exception as e:
                    logger.warning(f"Failed to extract layer {layer}: {e}")
                    # Use deterministic mock for this layer
                    seed = int(hashlib.sha256(f"{fen}_{layer}".encode()).hexdigest()[:8], 16) % (2**31)
                    activations[layer] = np.random.RandomState(seed).randn(512)

            return activations

        except Exception as e:
            logger.warning(f"Activation extraction failed: {e}")
            return {
                layer: np.random.RandomState(
                    int(hashlib.sha256(f"{fen}_{layer}".encode()).hexdigest()[:8], 16) % (2**31)
                ).randn(512)
                for layer in target_layers
            }

    def _run_svm_probes(
        self,
        activations: Dict[int, np.ndarray],
        concept_keys: List[str],
        target_layer: int,
    ) -> Dict[str, float]:
        """
        Run SVM probes on activations to get concept scores.

        Args:
            activations: Dict of layer -> activation array
            concept_keys: List of concept names to score
            target_layer: Which layer's activations to use

        Returns:
            Dict mapping concept_name -> score (decision_function output)
        """
        if target_layer not in activations:
            logger.warning(f"Layer {target_layer} not in activations")
            return {}

        activation = activations[target_layer]
        scores = {}

        for concept in concept_keys:
            if concept in self._svm_probes:
                try:
                    probe = self._svm_probes[concept]
                    # Use decision_function for continuous score
                    score = probe.decision_function(activation.reshape(1, -1))[0]
                    scores[concept] = float(score)
                except Exception as e:
                    logger.warning(f"SVM probe {concept} failed: {e}")
                    scores[concept] = 0.0
            else:
                # Mock score for missing probes (deterministic based on concept name)
                seed = int(hashlib.sha256(concept.encode()).hexdigest()[:8], 16)
                # Generate deterministic "score" between -1 and 1
                mock_score = (seed % 1000) / 500.0 - 1.0
                scores[concept] = mock_score

        return scores

    def _get_best_reply(self, fen: str) -> Optional[str]:
        """
        Get best reply for the opponent using Stockfish.

        Args:
            fen: Position FEN after our move

        Returns:
            Best move in UCI format, or None if failed
        """
        try:
            import chess.engine

            engine = chess.engine.SimpleEngine.popen_uci(self.stockfish_path)
            board = chess.Board(fen)

            if board.is_game_over():
                engine.quit()
                return None

            result = engine.play(
                board,
                chess.engine.Limit(depth=self.stockfish_depth),
            )
            engine.quit()

            return result.move.uci() if result.move else None

        except Exception as e:
            logger.warning(f"Stockfish best reply failed: {e}")
            # Fallback: return first legal move (deterministic)
            board = chess.Board(fen)
            if board.legal_moves:
                return list(board.legal_moves)[0].uci()
            return None

    def _parse_move(self, board: chess.Board, move_san_or_uci: str) -> Optional[chess.Move]:
        """Parse a move in SAN or UCI format."""
        try:
            # Try SAN first
            return board.parse_san(move_san_or_uci)
        except chess.IllegalMoveError:
            pass
        except chess.InvalidMoveError:
            pass

        try:
            # Try UCI
            return board.parse_uci(move_san_or_uci)
        except chess.IllegalMoveError:
            pass
        except chess.InvalidMoveError:
            pass

        return None

    def infer(
        self,
        fen: str,
        move_san_or_uci: str,
        target_layers: Optional[List[int]] = None,
        concept_keys: Optional[List[str]] = None,
        top_k: int = 5,
    ) -> LC0SVMResult:
        """
        Run LC0+SVM inference for a position and move.

        Importance is computed as: score(after_reply) - score(root)

        Args:
            fen: Position FEN
            move_san_or_uci: Move in SAN or UCI format
            target_layers: Layer indices to extract (default [39])
            concept_keys: Concepts to score (default DEFAULT_CONCEPT_KEYS)
            top_k: Number of top concepts to return by importance

        Returns:
            LC0SVMResult with concept scores and importance
        """
        self.load_models()

        target_layers = target_layers or [39]
        concept_keys = concept_keys or DEFAULT_CONCEPT_KEYS

        # Check cache - cache stores full importance, top_k applied after retrieval
        cache_key = self._cache_key(fen, move_san_or_uci)
        if cache_key in self._cache:
            cached = self._cache[cache_key]
            # Apply top_k to cached result
            return LC0SVMResult(
                concept_scores=cached.concept_scores,
                concept_importance=cached.concept_importance[:top_k],
                meta=cached.meta,
            )

        # Parse board and move
        board = chess.Board(fen)
        move = self._parse_move(board, move_san_or_uci)

        if not move:
            logger.warning(f"Invalid move {move_san_or_uci} for position {fen}")
            return LC0SVMResult(
                concept_scores=[],
                concept_importance=[],
                meta={"error": "invalid_move"},
            )

        # Step 1: Get root position activations and scores
        root_activations = self._extract_activations(fen, target_layers)
        root_scores = self._run_svm_probes(root_activations, concept_keys, target_layers[0])

        # Step 2: Apply move and get after_move scores
        board.push(move)
        after_move_fen = board.fen()
        after_move_activations = self._extract_activations(after_move_fen, target_layers)
        after_move_scores = self._run_svm_probes(after_move_activations, concept_keys, target_layers[0])

        # Step 3: Get best reply and after_reply scores
        best_reply = self._get_best_reply(after_move_fen)
        after_reply_scores = after_move_scores  # Default to after_move if no reply

        if best_reply:
            reply_move = self._parse_move(board, best_reply)
            if reply_move:
                board.push(reply_move)
                after_reply_fen = board.fen()
                after_reply_activations = self._extract_activations(after_reply_fen, target_layers)
                after_reply_scores = self._run_svm_probes(
                    after_reply_activations, concept_keys, target_layers[0]
                )

        # Step 4: Compute importance = after_reply - root
        importance = {}
        for concept in concept_keys:
            root_val = root_scores.get(concept, 0.0)
            reply_val = after_reply_scores.get(concept, 0.0)
            importance[concept] = reply_val - root_val

        # Sort by absolute importance, preserving sign (store all for caching)
        sorted_importance_full = sorted(
            importance.items(),
            key=lambda x: abs(x[1]),
            reverse=True,
        )

        # Format root scores
        root_scores_list = [(k, v) for k, v in root_scores.items()]

        # Cache stores full sorted importance
        cached_result = LC0SVMResult(
            concept_scores=root_scores_list,
            concept_importance=sorted_importance_full,
            meta={
                "layer": target_layers[0],
                "rollout": "root, after_move, after_reply",
                "best_reply": best_reply,
            },
        )

        # Cache full result
        self._cache[cache_key] = cached_result

        # Return with top_k applied
        return LC0SVMResult(
            concept_scores=root_scores_list,
            concept_importance=sorted_importance_full[:top_k],
            meta=cached_result.meta,
        )

    def infer_delta(
        self,
        fen: str,
        move_san_or_uci: str,
        target_layer: int = 39,
        concept_keys: Optional[List[str]] = None,
        top_k: int = 5,
    ) -> Dict[str, Any]:
        """
        Compute concept deltas caused by a move (before vs after).
        
        Unlike infer() which uses opponent's best reply, this directly compares:
        - before_move: concept scores at root position
        - after_move: concept scores after our move
        - delta: after - before (positive = improved for this side)
        
        Args:
            fen: Position FEN before the move
            move_san_or_uci: Move in SAN or UCI format
            target_layer: LC0 layer to extract (default 39)
            concept_keys: Concepts to score (default DEFAULT_CONCEPT_KEYS)
            top_k: Number of top delta concepts to return
            
        Returns:
            Dict with 'deltas' (sorted by abs), 'before', 'after'
        """
        self.load_models()
        
        concept_keys = concept_keys or DEFAULT_CONCEPT_KEYS
        
        # Parse board and move
        board = chess.Board(fen)
        move = self._parse_move(board, move_san_or_uci)
        
        if not move:
            logger.warning(f"Invalid move {move_san_or_uci} for position {fen}")
            return {"deltas": [], "before": {}, "after": {}, "error": "invalid_move"}
        
        # Get before scores (root position)
        before_activations = self._extract_activations(fen, [target_layer])
        before_scores = self._run_svm_probes(before_activations, concept_keys, target_layer)
        
        # Apply move and get after scores
        board.push(move)
        after_fen = board.fen()
        after_activations = self._extract_activations(after_fen, [target_layer])
        after_scores = self._run_svm_probes(after_activations, concept_keys, target_layer)
        
        # Compute deltas
        deltas = {}
        for concept in concept_keys:
            before_val = before_scores.get(concept, 0.0)
            after_val = after_scores.get(concept, 0.0)
            deltas[concept] = after_val - before_val
        
        # Sort by absolute delta (biggest change first)
        sorted_deltas = sorted(
            deltas.items(),
            key=lambda x: abs(x[1]),
            reverse=True,
        )[:top_k]
        
        logger.info(f"Computed {len(sorted_deltas)} delta concepts for move {move_san_or_uci}")
        
        return {
            "deltas": sorted_deltas,
            "before": before_scores,
            "after": after_scores,
            "move": move_san_or_uci,
        }


# Global singleton instance (lazy-loaded)
_inference_instance: Optional[LC0SVMInference] = None


def get_inference_instance() -> LC0SVMInference:
    """Get or create the global LC0SVMInference instance."""
    global _inference_instance
    if _inference_instance is None:
        _inference_instance = LC0SVMInference()
    return _inference_instance


def run_lc0_svm_inference(
    fen: str,
    move_san_or_uci: str,
    target_layers: Optional[List[int]] = None,
    concept_keys: Optional[List[str]] = None,
    top_k: int = 5,
) -> Dict:
    """
    Run LC0+SVM inference for a position and move.

    This is the main entry point for concept inference.

    Args:
        fen: Position FEN
        move_san_or_uci: Move in SAN or UCI format
        target_layers: Layer indices to extract (default [39])
        concept_keys: Concepts to score (default DEFAULT_CONCEPT_KEYS)
        top_k: Number of top concepts to return by importance

    Returns:
        Dict with structure:
        {
            "concept_scores": List[Tuple[str, float]],     # Per concept at root
            "concept_importance": List[Tuple[str, float]], # Delta importance
            "meta": { "layer": int, "rollout": str, "best_reply": str }
        }

    Example:
        >>> result = run_lc0_svm_inference(
        ...     fen="2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21",
        ...     move_san_or_uci="Rxd5",
        ...     top_k=5
        ... )
        >>> result["concept_importance"]
        [("Threats_w_high", 0.85), ("Material_w_up", 0.42), ...]
    """
    inference = get_inference_instance()
    result = inference.infer(
        fen=fen,
        move_san_or_uci=move_san_or_uci,
        target_layers=target_layers,
        concept_keys=concept_keys,
        top_k=top_k,
    )
    return result.to_dict()

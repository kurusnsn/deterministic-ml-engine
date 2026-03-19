"""
LC0 + SVM Concept Extraction Service

Separate Modal service for TensorFlow-based LC0 neural network activation extraction
and SVM concept probing. Runs on its own A10G GPU to avoid cuDNN conflicts with vLLM.

This service exposes HTTP endpoints that the main chess inference service calls.

VERSION: 2.0 - Eager model loading fix (2025-12-20)
"""

import modal
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Modal app definition
app = modal.App("lc0-concept-service")

# Volume for SVM probes and LC0 weights
models_vol = modal.Volume.from_name("chess-models", create_if_missing=True)

# LC0 service image - TensorFlow only (no PyTorch/vLLM)
lc0_image = (
    modal.Image.from_registry(
        # Use CUDA image with cuDNN for TensorFlow
        "nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04",
        add_python="3.12",
    )
    .entrypoint([])
    .env({
        "TF_USE_LEGACY_KERAS": "1",  # Force Keras 2 for TFProcess compatibility
        "TF_CPP_MIN_LOG_LEVEL": "2",  # Reduce TF logging
    })
    .pip_install(
        # TensorFlow with bundled CUDA/cuDNN for GPU Conv2D support
        "tensorflow[and-cuda]>=2.16.0,<2.17.0",
        "tf-keras>=2.16.0,<2.17.0",
        # LC0 dependencies
        "python-chess>=1.9.0",
        "numpy>=1.24.0",
        "pyyaml>=6.0",
        "protobuf>=3.20.0",
        # SVM probes
        "joblib>=1.3.0",
        "scikit-learn>=1.3.0",
        # Stockfish for best reply
        "aiohttp>=3.9.0",
    )
    .run_commands(
        "apt-get update && apt-get install -y stockfish"
    )
    # Add gateway-service code
    .add_local_dir(
        "gateway-service/gateway_modules",
        remote_path="/root/gateway_modules",
        copy=True,
    )
    # Add lczeroTraining code
    .add_local_dir(
        "lczeroTraining",
        remote_path="/root/lczeroTraining",
        copy=True,
    )
    # Add lcztools for FEN conversion
    .add_local_dir(
        "lcztools",
        remote_path="/root/lcztools",
        copy=True,
    )
    # Add LC0 weights
    .add_local_file(
        "T78_512x40.pb.gz",
        remote_path="/root/lc0_weights/T78_512x40.pb.gz",
        copy=True,
    )
    .pip_install("grpcio-tools>=1.50.0")
    .run_commands(
        # Generate protobuf files for lczeroTraining
        "mkdir -p /root/lczeroTraining/tf/proto && "
        "python -m grpc_tools.protoc "
        "-I=/root/lczeroTraining/libs/lczero-common/proto "
        "--python_out=/root/lczeroTraining/tf/proto "
        "/root/lczeroTraining/libs/lczero-common/proto/net.proto && "
        "touch /root/lczeroTraining/tf/proto/__init__.py"
    )
)


@app.cls(
    image=lc0_image,
    gpu="A10G",  # LC0 gets its own A10G
    volumes={"/models": models_vol},
    timeout=600,
)
class LC0ConceptService:
    """LC0 + SVM concept extraction service."""
    
    @modal.enter()
    def load_models(self):
        """Load LC0 and SVM models on container startup."""
        logger.info("=" * 60)
        logger.info("LC0 CONCEPT SERVICE - Loading models...")
        logger.info("=" * 60)
        
        # Set paths
        os.environ["LC0_CONFIG_PATH"] = "/root/lczeroTraining/tf/configs/T78.yaml"
        os.environ["LC0_WEIGHTS_PATH"] = "/root/lc0_weights/T78_512x40.pb.gz"
        # Volume mounts at /models, probes are at /models/svm/*.pkl
        os.environ["SVM_CACHE_DIR"] = "/models/svm"
        os.environ["STOCKFISH_PATH"] = "/usr/games/stockfish"
        
        # DEBUG: List what's in the SVM directory
        import glob
        svm_files = glob.glob("/models/svm/*.pkl")
        logger.error(f"SVM FILES FOUND: {len(svm_files)} files")
        for f in svm_files[:5]:
            logger.error(f"  -> {f}")
        
        # Import and initialize LC0SVMInference
        from gateway_modules.concepts.lc0_svm_inference import LC0SVMInference
        
        self.lc0_svm = LC0SVMInference()
        
        # Force eager loading of models (not lazy)
        logger.error("FORCING EAGER MODEL LOAD...")
        self.lc0_svm.load_models()
        
        # Check if models loaded properly
        has_extractor = self.lc0_svm._lc0_extractor is not None
        num_probes = len(self.lc0_svm._svm_probes) if self.lc0_svm._svm_probes else 0
        
        logger.error(f"AFTER EAGER LOAD: LC0 extractor loaded: {has_extractor}")
        logger.error(f"AFTER EAGER LOAD: SVM probes loaded: {num_probes}")
        logger.info("=" * 60)
        logger.info("LC0: model loaded, service warm")  # WARM INDICATOR
        logger.info("LC0 Concept Service ready!")
        logger.info("=" * 60)
    
    @modal.method()
    def infer(self, fen: str, move: str, top_k: int = 5):
        """
        Run full SVM concept inference.
        
        Args:
            fen: Position FEN string
            move: Move in UCI format (e.g., "e2e4")
            top_k: Number of top concepts to return
            
        Returns:
            Dict with concepts, importance scores, and grounded evidence
        """
        logger.info(f"infer() called: fen={fen[:30]}..., move={move}")
        
        try:
            result = self.lc0_svm.infer(fen, move, top_k=top_k)
            # LC0SVMResult has to_dict() method
            if hasattr(result, 'to_dict'):
                return result.to_dict()
            elif isinstance(result, dict):
                return result
            else:
                # Fallback: extract attributes
                return {
                    "concept_scores": getattr(result, "concept_scores", []),
                    "concept_importance": getattr(result, "concept_importance", []),
                    "meta": getattr(result, "meta", {}),
                }
        except Exception as e:
            logger.error(f"infer() failed: {e}")
            return {"error": str(e)}
    
    @modal.method()
    def infer_delta(self, fen: str, move: str, top_k: int = 5):
        """
        Compute delta concepts (change before/after move).
        
        Args:
            fen: Position FEN before the move
            move: Move in UCI format
            top_k: Number of top delta concepts to return
            
        Returns:
            Dict with delta concepts and scores
        """
        logger.info(f"infer_delta() called: fen={fen[:30]}..., move={move}")
        
        try:
            result = self.lc0_svm.infer_delta(fen, move, top_k=top_k)
            # Convert to JSON-serializable dict
            return {
                "deltas": [(str(k), float(v)) for k, v in result.get("deltas", [])],
                "before_scores": {str(k): float(v) for k, v in result.get("before_scores", {}).items()},
                "after_scores": {str(k): float(v) for k, v in result.get("after_scores", {}).items()},
            }
        except Exception as e:
            logger.error(f"infer_delta() failed: {e}")
            return {"error": str(e), "deltas": [], "before_scores": {}, "after_scores": {}}
    
    @modal.method()
    def infer_wdl_entropy(self, fen: str, move: str):
        """
        Compute WDL entropy delta using LC0 value head.
        
        This measures how the move affects position certainty:
        - Negative delta = position becomes more decisive
        - Positive delta = position becomes more uncertain
        
        Args:
            fen: Position FEN before the move
            move: Move in UCI or SAN format
            
        Returns:
            Dict with WDL before/after and entropy delta
        """
        logger.info(f"infer_wdl_entropy() called: fen={fen[:30]}..., move={move}")
        
        try:
            import chess
            from gateway_modules.analysis.wdl_entropy import compute_entropy_delta
            
            # Get WDL before move
            extractor = self.lc0_svm._lc0_extractor
            wdl_before = extractor.extract_wdl(fen)
            
            if wdl_before is None:
                return {"error": "WDL extraction failed for before position"}
            
            # Make the move
            board = chess.Board(fen)
            try:
                # Try as SAN first
                board.push_san(move)
            except ValueError:
                # Try as UCI
                board.push_uci(move)
            
            fen_after = board.fen()
            
            # Get WDL after move
            wdl_after = extractor.extract_wdl(fen_after)
            
            if wdl_after is None:
                return {"error": "WDL extraction failed for after position"}
            
            # Compute entropy delta
            entropy_result = compute_entropy_delta(wdl_before, wdl_after)
            
            return {
                "wdl_before": wdl_before,
                "wdl_after": wdl_after,
                "entropy": entropy_result,
            }
            
        except Exception as e:
            logger.error(f"infer_wdl_entropy() failed: {e}")
            import traceback
            traceback.print_exc()
            return {"error": str(e)}
    
    @modal.method()
    def health(self):
        """Health check endpoint."""
        has_extractor = self.lc0_svm._lc0_extractor is not None
        num_probes = len(self.lc0_svm._svm_probes) if self.lc0_svm._svm_probes else 0
        return {
            "status": "healthy",
            "lc0_extractor": has_extractor,
            "svm_probes": num_probes,
        }


# Test entrypoint
@app.local_entrypoint()
def test_lc0_service():
    """Test the LC0 concept service."""
    logger.info("Testing LC0 Concept Service...")
    
    # Test position - use simple starting position with e4
    test_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    test_move = "e2e4"  # Simple opening move
    
    # Get service handle
    service = LC0ConceptService()
    
    # Test health
    health = service.health.remote()
    logger.info(f"Health check: {health}")
    
    # Test concept inference
    logger.info(f"Testing infer() with FEN: {test_fen[:40]}...")
    result = service.infer.remote(test_fen, test_move, top_k=5)
    
    if "error" in result:
        logger.error(f"infer() error: {result['error']}")
    else:
        logger.info(f"Top concepts: {result.get('concepts', [])[:5]}")
    
    # Test delta inference
    logger.info(f"Testing infer_delta()...")
    delta_result = service.infer_delta.remote(test_fen, test_move, top_k=5)
    
    if "error" in delta_result:
        logger.error(f"infer_delta() error: {delta_result['error']}")
    else:
        logger.info(f"Delta concepts: {delta_result.get('deltas', [])[:5]}")
    
    logger.info("LC0 Concept Service test complete!")

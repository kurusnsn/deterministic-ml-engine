"""
LC0 Activation Extractor for Modal.

This module wraps the lczeroTraining/tf infrastructure to extract
neural network activations for SVM concept probing.
"""
import os
import sys
import logging
from pathlib import Path
from typing import Dict, List, Optional
import numpy as np

logger = logging.getLogger(__name__)


class LC0ActivationExtractor:
    """
    Extract activations from LC0 neural network for concept probing.
    
    Uses TFProcess from lczeroTraining to build a Keras model with
    activation extraction, then uses lcztools for input encoding.
    """
    
    def __init__(
        self,
        config_path: str = "/models/lc0/T78.yaml",
        weights_path: str = "/models/lc0/T78_512x40.pb.gz",
        target_layer: int = 39,
        force_cpu: bool = True,  # Default to CPU for reliability
    ):
        self.config_path = config_path
        self.weights_path = weights_path
        self.target_layer = target_layer
        self.force_cpu = force_cpu
        
        self.tfproc = None
        self._initialized = False
        
    def initialize(self):
        """Initialize the LC0 model with activation extraction."""
        if self._initialized:
            return
        
        logger.info("=" * 60)
        logger.info("LC0 EXTRACTOR INITIALIZATION STARTING")
        logger.info("=" * 60)
        
        # Note: LC0 model uses NCHW format which requires GPU
        # We use GPU memory growth to coexist with vLLM
        
        import yaml
        import tensorflow as tf
        
        # Log TF version and devices
        logger.info(f"TensorFlow version: {tf.__version__}")
        logger.info(f"GPU devices: {tf.config.list_physical_devices('GPU')}")
        logger.info(f"CPU devices: {tf.config.list_physical_devices('CPU')}")
        
        # Force CPU if requested (avoids GPU memory contention with vLLM)
        if self.force_cpu:
            logger.info("FORCING CPU-ONLY MODE for LC0")
            # Hide GPUs from TensorFlow
            tf.config.set_visible_devices([], 'GPU')
            logger.info(f"Visible devices after hiding GPU: {tf.config.get_visible_devices()}")
        else:
            # If using GPU, set memory growth
            gpus = tf.config.experimental.list_physical_devices('GPU')
            if gpus:
                for gpu in gpus:
                    tf.config.experimental.set_memory_growth(gpu, True)
                logger.info("GPU memory growth enabled")
        
        # Add lczeroTraining to path
        lc0_training_path = "/root/lczeroTraining/tf"
        if lc0_training_path not in sys.path:
            sys.path.insert(0, lc0_training_path)
        logger.info(f"Added to sys.path: {lc0_training_path}")
        
        # Verify config exists
        if not Path(self.config_path).exists():
            raise FileNotFoundError(f"LC0 config not found: {self.config_path}")
        logger.info(f"Config file exists: {self.config_path}")
        
        # Verify weights exist
        if not Path(self.weights_path).exists():
            raise FileNotFoundError(f"LC0 weights not found: {self.weights_path}")
        logger.info(f"Weights file exists: {self.weights_path} ({Path(self.weights_path).stat().st_size / 1e6:.1f} MB)")
        
        # Import TFProcess
        logger.info("Importing TFProcess...")
        from tfprocess import TFProcess
        logger.info("TFProcess imported successfully")
        
        # Load config
        logger.info(f"Loading config from {self.config_path}...")
        with open(self.config_path, "r") as f:
            cfg = yaml.safe_load(f)
        
        # Override paths that don't apply to inference
        cfg['training']['path'] = '/tmp/lc0'
        cfg['gpu'] = 0 if not self.force_cpu else -1  # -1 for CPU
        
        logger.info(f"Config loaded: {cfg['model']['residual_blocks']} blocks, "
                   f"{cfg['model']['filters']} filters")
        
        # Create TFProcess and initialize with activation extraction
        logger.info("Creating TFProcess...")
        self.tfproc = TFProcess(cfg)
        logger.info("TFProcess created")
        
        logger.info("Calling init_net(return_activations=True)...")
        self.tfproc.init_net(return_activations=True)
        logger.info("Network initialized")
        
        # Verify activation_extractor exists
        if hasattr(self.tfproc, 'activation_extractor') and self.tfproc.activation_extractor is not None:
            logger.info(f"activation_extractor model exists: {type(self.tfproc.activation_extractor)}")
            # Log model structure
            if hasattr(self.tfproc.activation_extractor, 'outputs'):
                outputs = self.tfproc.activation_extractor.outputs
                logger.info(f"activation_extractor has {len(outputs)} outputs")
                for i, out in enumerate(outputs[:3]):
                    logger.info(f"  Output {i}: {out.shape}")
        else:
            logger.error("activation_extractor is None or missing!")
            raise ValueError("TFProcess did not create activation_extractor")
        
        # Load weights
        logger.info(f"Loading LC0 weights from {self.weights_path}...")
        self.tfproc.replace_weights(self.weights_path)
        logger.info("Weights loaded successfully")
        
        self._initialized = True
        logger.info("=" * 60)
        logger.info("LC0 EXTRACTOR INITIALIZATION COMPLETE")
        logger.info("=" * 60)
    
    def fen_to_input(self, fen: str) -> np.ndarray:
        """Convert FEN to LC0 input tensor (1, 112, 8, 8)."""
        # Import LeelaBoard directly to avoid importing testing module
        # which uses deprecated chess.uci
        lcztools_path = "/root/lcztools"
        if lcztools_path not in sys.path:
            sys.path.insert(0, lcztools_path)
        
        from lcztools._leela_board import LeelaBoard
        
        board = LeelaBoard(fen=fen)
        features = board.lcz_features()
        # Shape: (112, 8, 8) as uint8
        input_np = np.reshape(features.astype(np.float32), [1, 112, 8, 8])
        return input_np
    
    def extract_activation(self, fen: str, layer: Optional[int] = None) -> np.ndarray:
        """
        Extract activation vector from specified layer.
        
        Args:
            fen: Chess position in FEN format
            layer: Layer index (0-39 for 40-block network). Default uses self.target_layer.
            
        Returns:
            1D numpy array of activations (flattened from layer output)
        """
        if not self._initialized:
            self.initialize()
            
        layer = layer if layer is not None else self.target_layer
        
        # Convert FEN to input
        logger.info(f"Converting FEN to input tensor: {fen[:30]}...")
        input_tensor = self.fen_to_input(fen)
        logger.info(f"Input tensor shape: {input_tensor.shape}")
        
        # Get activations using activation_extractor model
        logger.info("Running activation_extractor.predict()...")
        activations = self.tfproc.activation_extractor.predict(input_tensor, verbose=0)
        
        # Debug: Detailed shape logging
        logger.info("=" * 40)
        logger.info("ACTIVATION EXTRACTION RESULTS:")
        if activations is None:
            logger.error("activations is None!")
            raise ValueError("activation_extractor returned None")
        elif isinstance(activations, list):
            logger.info(f"activations is list with {len(activations)} elements")
            for i, act in enumerate(activations):
                if act is not None:
                    logger.info(f"  activations[{i}].shape = {act.shape}")
                else:
                    logger.info(f"  activations[{i}] = None")
        else:
            logger.info(f"activations is ndarray with shape: {activations.shape}")
        logger.info("=" * 40)
        
        # Extract target layer
        if isinstance(activations, list):
            if layer >= len(activations):
                raise ValueError(f"Layer {layer} out of range (only {len(activations)} layers)")
            layer_activation = activations[layer]
        else:
            layer_activation = activations
        
        if layer_activation is None:
            raise ValueError(f"Layer {layer} activation is None")
        
        logger.info(f"Layer {layer} raw shape: {layer_activation.shape}")
        
        # Flatten and verify shape
        flattened = layer_activation.flatten()
        logger.info(f"Flattened shape: {flattened.shape}")
        
        # HARD ASSERT: We expect 512*8*8 = 32768 features for layer 39
        expected_dim = 512 * 8 * 8  # 32768
        assert flattened.shape[0] == expected_dim, \
            f"Expected {expected_dim} features but got {flattened.shape[0]}. " \
            f"Raw shape was {layer_activation.shape}"
        
        logger.info(f"✓ Activation extraction successful: {flattened.shape[0]} features")
        return flattened
    
    def extract_activations_batch(
        self, 
        fens: List[str], 
        layer: Optional[int] = None
    ) -> np.ndarray:
        """
        Extract activations for multiple positions.
        
        Args:
            fens: List of FEN strings
            layer: Layer index
            
        Returns:
            2D numpy array, shape (len(fens), activation_dim)
        """
        if not self._initialized:
            self.initialize()
            
        layer = layer if layer is not None else self.target_layer
        
        # Batch convert FENs to inputs
        inputs = np.concatenate([self.fen_to_input(fen) for fen in fens], axis=0)
        
        # Get activations
        activations = self.tfproc.activation_extractor.predict(inputs, verbose=0)
        
        # Extract target layer and reshape
        layer_activations = activations[layer]
        
        # Flatten each sample
        batch_size = len(fens)
        return layer_activations.reshape(batch_size, -1)

    def extract_wdl(self, fen: str) -> Dict[str, float]:
        """
        Extract W/D/L probabilities from LC0 value head.
        
        Args:
            fen: Chess position in FEN format
            
        Returns:
            Dict with {"w": float, "d": float, "l": float} probabilities
        """
        if not self._initialized:
            self.initialize()
        
        try:
            import tensorflow as tf
            
            # Convert FEN to input tensor
            input_tensor = self.fen_to_input(fen)
            
            # Run the main model to get policy and value outputs
            # The model outputs: [policy, value, (optional) moves_left]
            outputs = self.tfproc.model.predict(input_tensor, verbose=0)
            
            # Value head is outputs[1] - shape (1, 3) for WDL
            value_output = outputs[1]
            
            # Apply softmax if not already applied (raw logits)
            if hasattr(self.tfproc, 'wdl') and self.tfproc.wdl:
                # WDL head - apply softmax to get probabilities
                wdl_probs = tf.nn.softmax(value_output[0]).numpy()
                return {
                    "w": float(wdl_probs[0]),  # Win
                    "d": float(wdl_probs[1]),  # Draw
                    "l": float(wdl_probs[2]),  # Loss
                }
            else:
                # Classical value head (single scalar) - approximate WDL
                v = float(value_output[0][0])
                # Map [-1, 1] to WDL approximation
                return {
                    "w": max(0, (v + 1) / 2),
                    "d": 0.1,  # Small draw probability
                    "l": max(0, (1 - v) / 2),
                }
                
        except Exception as e:
            logger.warning(f"WDL extraction failed: {e}")
            return None


# Singleton instance for reuse
_extractor_instance: Optional[LC0ActivationExtractor] = None


def get_lc0_extractor(
    config_path: str = "/models/lc0/T78.yaml",
    weights_path: str = "/models/lc0/T78_512x40.pb.gz",
    target_layer: int = 39,
    force_cpu: bool = True,
) -> LC0ActivationExtractor:
    """Get or create LC0 activation extractor singleton."""
    global _extractor_instance
    
    if _extractor_instance is None:
        _extractor_instance = LC0ActivationExtractor(
            config_path=config_path,
            weights_path=weights_path,
            target_layer=target_layer,
            force_cpu=force_cpu,
        )
    
    return _extractor_instance

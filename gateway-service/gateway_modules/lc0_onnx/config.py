"""
LC0 ONNX Probing Configuration.

Feature flag controls whether ONNX-based probing is enabled.
When disabled, no ONNX models are loaded and the system behaves identically
to the existing TensorFlow-based probing.
"""

import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# =============================================================================
# FEATURE FLAG - Master switch for ONNX probing
# =============================================================================
# Set ENABLE_LC0_ONNX_PROBING=true in environment to enable
ENABLE_LC0_ONNX_PROBING = os.getenv("ENABLE_LC0_ONNX_PROBING", "false").lower() == "true"

# =============================================================================
# Model Paths
# =============================================================================
# Default ONNX model path (relative to gateway-service or absolute)
DEFAULT_ONNX_MODEL_PATH = os.getenv(
    "LC0_ONNX_MODEL_PATH",
    "/models/lc0/lc0_t78_probe.onnx"
)

# Original LC0 weights for export (if ONNX not pre-generated)
DEFAULT_LC0_WEIGHTS_PATH = os.getenv(
    "LC0_WEIGHTS_PATH",
    "/models/lc0/T78_512x40.pb.gz"
)

# Local development paths
LOCAL_ONNX_PATHS = [
    "models/lc0/lc0_t78_probe.onnx",
    "../models/lc0/lc0_t78_probe.onnx",
]

LOCAL_WEIGHTS_PATHS = [
    "T78_512x40.pb.gz",
    "../T78_512x40.pb.gz",
]

# =============================================================================
# SVM Probe Configuration  
# =============================================================================
# Directory containing trained SVM probes
DEFAULT_SVM_CACHE_DIR = os.getenv("SVM_CACHE_DIR", "/models/svm")

LOCAL_SVM_DIRS = [
    "cache",
    "../cache",
]

# SVM probe filename pattern
SVM_PROBE_PATTERN = "linear_svm_v4.6_size_200000_0.05_concept_{concept}_layer_{layer}.pkl"

# =============================================================================
# Architecture Constants (must match T78 exactly)
# =============================================================================
T78_FILTERS = 512
T78_RESIDUAL_BLOCKS = 40
T78_SE_RATIO = 16
T78_INPUT_PLANES = 112

# Target layer for probe extraction
DEFAULT_PROBE_LAYER = 39
EXPECTED_ACTIVATION_DIM = T78_FILTERS * 8 * 8  # 32768

# =============================================================================
# Performance Configuration
# =============================================================================
# Maximum inference time before warning (milliseconds)
MAX_INFERENCE_TIME_MS = 20

# Enable/disable activation caching
ENABLE_ACTIVATION_CACHE = True

# Maximum cache size (number of positions)
MAX_CACHE_SIZE = 1000


def get_onnx_model_path() -> str:
    """
    Resolve the ONNX model path.
    
    Checks in order:
    1. Environment variable LC0_ONNX_MODEL_PATH
    2. Default production path
    3. Local development paths
    
    Returns:
        Path to ONNX model file
    """
    # Check default/env path first
    if Path(DEFAULT_ONNX_MODEL_PATH).exists():
        return DEFAULT_ONNX_MODEL_PATH
    
    # Check local development paths
    for local_path in LOCAL_ONNX_PATHS:
        if Path(local_path).exists():
            return local_path
    
    # Return default even if not found (will error later with clear message)
    return DEFAULT_ONNX_MODEL_PATH


def get_weights_path() -> str:
    """
    Resolve the LC0 weights path for ONNX export.
    
    Returns:
        Path to LC0 .pb.gz weights file
    """
    if Path(DEFAULT_LC0_WEIGHTS_PATH).exists():
        return DEFAULT_LC0_WEIGHTS_PATH
    
    for local_path in LOCAL_WEIGHTS_PATHS:
        if Path(local_path).exists():
            return local_path
    
    return DEFAULT_LC0_WEIGHTS_PATH


def get_svm_cache_dir() -> str:
    """
    Resolve the SVM cache directory.
    
    Returns:
        Path to directory containing SVM .pkl files
    """
    if Path(DEFAULT_SVM_CACHE_DIR).exists():
        return DEFAULT_SVM_CACHE_DIR
    
    for local_dir in LOCAL_SVM_DIRS:
        if Path(local_dir).exists():
            return local_dir
    
    return DEFAULT_SVM_CACHE_DIR


def log_config():
    """Log current configuration for debugging."""
    logger.info("=" * 60)
    logger.info("LC0 ONNX PROBING CONFIGURATION")
    logger.info("=" * 60)
    logger.info(f"ENABLE_LC0_ONNX_PROBING: {ENABLE_LC0_ONNX_PROBING}")
    logger.info(f"ONNX Model Path: {get_onnx_model_path()}")
    logger.info(f"LC0 Weights Path: {get_weights_path()}")
    logger.info(f"SVM Cache Dir: {get_svm_cache_dir()}")
    logger.info(f"Target Layer: {DEFAULT_PROBE_LAYER}")
    logger.info(f"Expected Activation Dim: {EXPECTED_ACTIVATION_DIM}")
    logger.info("=" * 60)

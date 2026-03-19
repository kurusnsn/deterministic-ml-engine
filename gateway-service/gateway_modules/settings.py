"""
Centralized Settings for Chess Analysis Backend

Feature flags enable safe rollback and gradual migration to 3-tier architecture.
"""

import os

# =============================================================================
# FEATURE FLAGS - Rollback Safety
# =============================================================================

# Tier 1: Local Heuristics (always enabled - this is the default path)
# No flag needed - always available

# Tier 2: LC0 Concept Analysis (on-demand GPU)
# When disabled: LC0 requests return empty/mock data, heuristics still work
ENABLE_LC0_ANALYSIS = os.getenv("ENABLE_LC0_ANALYSIS", "1") == "1"

# Tier 3: LLM Commentary (on-demand GPU)  
# When disabled: LLM requests return empty, heuristics still work
ENABLE_LLM_COMMENTARY = os.getenv("ENABLE_LLM_COMMENTARY", "1") == "1"

# Use local heuristics instead of Modal (bypasses all GPU services)
USE_LOCAL_HEURISTICS = os.getenv("USE_LOCAL_HEURISTICS", "1") == "1"

# Legacy: Unified inference (will be deprecated)
USE_UNIFIED_INFERENCE = os.getenv("USE_UNIFIED_INFERENCE", "0") == "1"


# =============================================================================
# SERVICE URLS
# =============================================================================

# LC0 Concept Service (Modal A10G)
LC0_SERVICE_URL = os.getenv(
    "LC0_SERVICE_URL",
    "https://kurusnsn--lc0-concept-service.modal.run"
)

# LLM Commentary Service (Modal L40S)
LLM_SERVICE_URL = os.getenv(
    "LLM_SERVICE_URL",
    "https://kurusnsn--llm-commentary-service.modal.run"
)

# Legacy unified inference URL (deprecated)
UNIFIED_INFERENCE_URL = os.getenv(
    "UNIFIED_INFERENCE_URL",
    "https://kurusnsn--unified-chess-inference-chessinference-analyze-20766a.modal.run"
)


# =============================================================================
# PERFORMANCE BUDGETS
# =============================================================================

# Maximum time to wait for heuristics (should never be exceeded)
HEURISTICS_TIMEOUT_MS = 100

# Maximum time to wait for LC0 response (includes cold start)
LC0_TIMEOUT_S = 60

# Maximum time to wait for LLM response (includes cold start)
LLM_TIMEOUT_S = 120


# =============================================================================
# LOGGING
# =============================================================================

# Groq API Key (for cold start fallback - uses Llama 3.3 70B)
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# GPU Routing Configuration
# PREFER_GROQ_API: When True (default), always use Groq API for LLM commentary
# This is recommended based on benchmarks: Groq is instant vs 51s vLLM cold start
PREFER_GROQ_API = os.getenv("PREFER_GROQ_API", "true").lower() == "true"

# Modal GPU routing thresholds (only used when PREFER_GROQ_API=False)
MODAL_GPU_PAID_USER_THRESHOLD = int(os.getenv("MODAL_GPU_PAID_USER_THRESHOLD", "3"))
PAID_SESSION_TTL_SECONDS = int(os.getenv("PAID_SESSION_TTL_SECONDS", "300"))

def log_settings():
    """Log current settings for debugging."""
    import logging
    logger = logging.getLogger(__name__)
    logger.info("=== Chess Analysis Settings ===")
    logger.info(f"ENABLE_LC0_ANALYSIS: {ENABLE_LC0_ANALYSIS}")
    logger.info(f"ENABLE_LLM_COMMENTARY: {ENABLE_LLM_COMMENTARY}")
    logger.info(f"USE_LOCAL_HEURISTICS: {USE_LOCAL_HEURISTICS}")
    logger.info(f"USE_UNIFIED_INFERENCE: {USE_UNIFIED_INFERENCE}")
    logger.info(f"LC0_SERVICE_URL: {LC0_SERVICE_URL}")
    logger.info(f"LLM_SERVICE_URL: {LLM_SERVICE_URL}")
    logger.info(f"GROQ_API_KEY: {'***configured***' if GROQ_API_KEY else 'NOT SET'}")
    logger.info(f"GROQ_MODEL: {GROQ_MODEL}")
    logger.info(f"PREFER_GROQ_API: {PREFER_GROQ_API}")
    logger.info(f"MODAL_GPU_PAID_USER_THRESHOLD: {MODAL_GPU_PAID_USER_THRESHOLD}")
    logger.info(f"PAID_SESSION_TTL_SECONDS: {PAID_SESSION_TTL_SECONDS}")
    logger.info("===============================")



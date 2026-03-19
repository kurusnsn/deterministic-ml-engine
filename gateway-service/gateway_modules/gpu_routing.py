"""
GPU Routing Module for LC0 + LLaMA Queue-Based Warm-Up Strategy.

STRATEGY (based on benchmark results 2026-01-03):
- LC0 (TensorFlow/A10G) cold start: 33-39 seconds (FASTER)
- LLaMA/vLLM (L40S) cold start: 51-61 seconds (SLOWER)

WARM-UP SEQUENCE (Queue-Based - No Groq API Fallback):
1. First request triggers GPU warm-up (background)
2. Show rotating logo loading while warming up
3. Queue all moves played during warm-up
4. Once GPUs are ready, process queue with LLaMA GPU

This prioritizes quality over speed - no API fallback, pure GPU inference.
"""

import os
import time
from typing import Dict, Optional, Literal
from dataclasses import dataclass


# =============================================================================
# CONFIGURATION
# =============================================================================

# GPU idle thresholds (seconds before GPU is considered "cold")
LC0_IDLE_THRESHOLD = int(os.getenv("LC0_IDLE_THRESHOLD", "60"))
LLAMA_IDLE_THRESHOLD = int(os.getenv("LLAMA_IDLE_THRESHOLD", "60"))

# Session tracking
PAID_SESSION_TTL_SECONDS = int(os.getenv("PAID_SESSION_TTL_SECONDS", "300"))  # 5 min
MODAL_GPU_PAID_USER_THRESHOLD = int(os.getenv("MODAL_GPU_PAID_USER_THRESHOLD", "3"))

# Legacy flag - when True, always use Groq (skip warm-up strategy)
PREFER_GROQ_API = os.getenv("PREFER_GROQ_API", "false").lower() == "true"


# =============================================================================
# STATE TRACKING
# =============================================================================

@dataclass
class PaidSession:
    """Tracks an active paid user session."""
    user_id: str
    last_active: float  # Unix timestamp


# In-memory state (future: Redis for horizontal scaling)
_active_paid_sessions: Dict[str, PaidSession] = {}

# Separate tracking for LC0 and LLaMA
_lc0_last_success: Optional[float] = None
_llama_last_success: Optional[float] = None

# Warm-up started flags (to avoid duplicate warm-up triggers)
_lc0_warmup_started: bool = False
_llama_warmup_started: bool = False


# =============================================================================
# SESSION MANAGEMENT
# =============================================================================

def register_paid_session(user_id: str) -> None:
    """Register or refresh a paid user session."""
    global _active_paid_sessions
    _active_paid_sessions[user_id] = PaidSession(
        user_id=user_id,
        last_active=time.time()
    )
    _cleanup_expired_sessions()


def unregister_paid_session(user_id: str) -> None:
    """Remove a paid user session (e.g., on logout)."""
    global _active_paid_sessions
    _active_paid_sessions.pop(user_id, None)


def _cleanup_expired_sessions() -> None:
    """Remove sessions that have exceeded TTL."""
    global _active_paid_sessions
    now = time.time()
    expired = [
        user_id for user_id, session in _active_paid_sessions.items()
        if (now - session.last_active) > PAID_SESSION_TTL_SECONDS
    ]
    for user_id in expired:
        del _active_paid_sessions[user_id]


def get_active_paid_user_count() -> int:
    """Get count of currently active paid users."""
    _cleanup_expired_sessions()
    return len(_active_paid_sessions)


# =============================================================================
# LC0 STATUS
# =============================================================================

def is_lc0_ready() -> bool:
    """Check if LC0 GPU is warm (responded recently)."""
    global _lc0_last_success
    if _lc0_last_success is None:
        return False
    return (time.time() - _lc0_last_success) < LC0_IDLE_THRESHOLD


def update_lc0_status() -> None:
    """Mark LC0 as successfully called."""
    global _lc0_last_success, _lc0_warmup_started
    _lc0_last_success = time.time()
    _lc0_warmup_started = True  # Warm-up complete
    print(f"[GPU STATUS] LC0 marked as ready")


def should_start_lc0_warmup() -> bool:
    """Check if LC0 warm-up should be started."""
    global _lc0_warmup_started
    if _lc0_warmup_started:
        return False
    _lc0_warmup_started = True
    return True


# =============================================================================
# LLAMA STATUS
# =============================================================================

def is_llama_ready() -> bool:
    """Check if LLaMA GPU is warm (responded recently)."""
    global _llama_last_success
    if _llama_last_success is None:
        return False
    return (time.time() - _llama_last_success) < LLAMA_IDLE_THRESHOLD


def update_llama_status() -> None:
    """Mark LLaMA as successfully called."""
    global _llama_last_success, _llama_warmup_started
    _llama_last_success = time.time()
    _llama_warmup_started = True  # Warm-up complete
    print(f"[GPU STATUS] LLaMA marked as ready")


def should_start_llama_warmup() -> bool:
    """Check if LLaMA warm-up should be started (only after LC0 is ready)."""
    global _llama_warmup_started
    if _llama_warmup_started:
        return False
    if not is_lc0_ready():
        return False  # Wait for LC0 first
    _llama_warmup_started = True
    return True


# =============================================================================
# LEGACY COMPATIBILITY
# =============================================================================

def is_gpu_likely_cold() -> bool:
    """Legacy: Check if GPU is cold (uses LLaMA status for backward compat)."""
    return not is_llama_ready()


def update_gpu_status() -> None:
    """Legacy: Mark GPU as hot (updates LLaMA status for backward compat)."""
    update_llama_status()


# =============================================================================
# ROUTING DECISIONS
# =============================================================================

GPUStatus = Literal["cold", "lc0_warming", "llama_warming", "ready"]


def get_gpu_status() -> dict:
    """
    Get current GPU warm-up status for frontend.
    
    Returns:
        Dict with status and timing info
    """
    lc0_ready = is_lc0_ready()
    llama_ready = is_llama_ready()
    
    if lc0_ready and llama_ready:
        status: GPUStatus = "ready"
    elif lc0_ready and not llama_ready:
        status = "llama_warming"
    elif not lc0_ready:
        status = "lc0_warming" if _lc0_warmup_started else "cold"
    else:
        status = "cold"
    
    return {
        "status": status,
        "queue_moves": not llama_ready,  # Queue if GPU not ready
        "lc0_ready": lc0_ready,
        "llama_ready": llama_ready,
        "lc0_last_success": _lc0_last_success,
        "llama_last_success": _llama_last_success,
        "prefer_groq_api": PREFER_GROQ_API,
    }



def should_queue_request() -> tuple[bool, str]:
    """
    Determine if LLM requests should be queued (GPU not ready).
    
    Returns:
        (should_queue, reason): Tuple of (boolean, explanation string)
    
    Queue-based strategy (no Groq API fallback):
    - If GPU not ready → Queue (show loading, process later)
    - If GPU ready → Process immediately
    """
    # Check if LLaMA GPU is ready
    if not is_llama_ready():
        if is_lc0_ready():
            return (True, "llama_warming")
        else:
            return (True, "lc0_warming")
    
    # GPU ready - process immediately
    return (False, "gpu_ready")


def should_use_groq_api() -> tuple[bool, str]:
    """
    DEPRECATED: Use should_queue_request() instead.
    
    Only use Groq if explicitly enabled via PREFER_GROQ_API=true.
    Otherwise, queue requests until GPU is ready.
    """
    if PREFER_GROQ_API:
        return (True, "prefer_groq_api")
    
    # Default: don't use Groq, queue instead
    return (False, "use_gpu_queue")




def should_use_modal_gpu() -> tuple[bool, str]:
    """
    Determine whether to use Modal GPU or Groq API.
    Inverted logic from should_use_groq_api for backward compatibility.
    """
    use_groq, reason = should_use_groq_api()
    return (not use_groq, reason)


# =============================================================================
# MONITORING
# =============================================================================

def get_routing_stats() -> dict:
    """Get current routing statistics for monitoring/debugging."""
    status = get_gpu_status()
    return {
        **status,
        "active_paid_users": get_active_paid_user_count(),
        "threshold": MODAL_GPU_PAID_USER_THRESHOLD,
        "session_ttl_seconds": PAID_SESSION_TTL_SECONDS,
        "active_sessions": list(_active_paid_sessions.keys()),
    }


# =============================================================================
# TESTING
# =============================================================================

def _reset_state():
    """Reset all state (for testing only)."""
    global _active_paid_sessions, _lc0_last_success, _llama_last_success
    global _lc0_warmup_started, _llama_warmup_started
    _active_paid_sessions = {}
    _lc0_last_success = None
    _llama_last_success = None
    _lc0_warmup_started = False
    _llama_warmup_started = False



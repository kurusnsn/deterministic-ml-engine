"""
Tests for GPU routing with phased warm-up strategy.

Tests:
- Session registration and cleanup
- LC0 and LLaMA status tracking
- Phased warm-up routing (Groq → LC0 ready → LLaMA ready → GPU)
- get_gpu_status() for frontend polling
"""
import pytest
import time
from unittest.mock import patch
from gateway_modules.gpu_routing import (
    register_paid_session,
    unregister_paid_session,
    get_active_paid_user_count,
    should_use_modal_gpu,
    should_use_groq_api,
    is_gpu_likely_cold,
    is_lc0_ready,
    is_llama_ready,
    update_gpu_status,
    update_lc0_status,
    update_llama_status,
    get_routing_stats,
    get_gpu_status,
    _reset_state,
    MODAL_GPU_PAID_USER_THRESHOLD,
    PAID_SESSION_TTL_SECONDS,
)


class TestSessionRegistration:
    """Test paid user session tracking."""
    
    def setup_method(self):
        """Reset state before each test."""
        _reset_state()
    
    def test_register_single_session(self):
        """Registering a session increments count."""
        assert get_active_paid_user_count() == 0
        register_paid_session("user-1")
        assert get_active_paid_user_count() == 1
    
    def test_register_multiple_sessions(self):
        """Multiple users are tracked separately."""
        register_paid_session("user-1")
        register_paid_session("user-2")
        register_paid_session("user-3")
        assert get_active_paid_user_count() == 3
    
    def test_register_same_user_twice(self):
        """Re-registering same user doesn't duplicate."""
        register_paid_session("user-1")
        register_paid_session("user-1")
        assert get_active_paid_user_count() == 1
    
    def test_unregister_session(self):
        """Unregistering removes user from count."""
        register_paid_session("user-1")
        register_paid_session("user-2")
        unregister_paid_session("user-1")
        assert get_active_paid_user_count() == 1
    
    def test_unregister_nonexistent_user(self):
        """Unregistering nonexistent user is a no-op."""
        register_paid_session("user-1")
        unregister_paid_session("user-99")  # Doesn't exist
        assert get_active_paid_user_count() == 1


class TestSessionExpiration:
    """Test TTL-based session cleanup."""
    
    def setup_method(self):
        _reset_state()
    
    @patch('gateway_modules.gpu_routing.PAID_SESSION_TTL_SECONDS', 1)
    def test_session_expires_after_ttl(self):
        """Sessions expire after TTL seconds of inactivity."""
        from gateway_modules import gpu_routing
        # Temporarily patch TTL
        original_ttl = gpu_routing.PAID_SESSION_TTL_SECONDS
        gpu_routing.PAID_SESSION_TTL_SECONDS = 1
        
        try:
            register_paid_session("user-1")
            assert get_active_paid_user_count() == 1
            
            # Wait for TTL to expire
            time.sleep(1.1)
            
            # Session should be cleaned up on next count
            assert get_active_paid_user_count() == 0
        finally:
            gpu_routing.PAID_SESSION_TTL_SECONDS = original_ttl
    
    def test_session_refresh_resets_ttl(self):
        """Re-registering session resets TTL timer."""
        register_paid_session("user-1")
        # Re-register should update last_active time
        register_paid_session("user-1")
        assert get_active_paid_user_count() == 1


class TestQueueBasedWarmUp:
    """Test the queue-based warm-up routing logic (no Groq fallback)."""
    
    def setup_method(self):
        _reset_state()
    
    def test_cold_state_queues(self):
        """When GPU not ready, queue moves."""
        from gateway_modules.gpu_routing import should_queue_request
        should_queue, reason = should_queue_request()
        assert should_queue is True
        assert reason == "lc0_warming"
    
    def test_lc0_ready_but_llama_cold_queues(self):
        """When LC0 is ready but LLaMA is not, still queue."""
        from gateway_modules.gpu_routing import should_queue_request
        update_lc0_status()
        
        assert is_lc0_ready() is True
        assert is_llama_ready() is False
        
        should_queue, reason = should_queue_request()
        assert should_queue is True
        assert reason == "llama_warming"
    
    def test_both_ready_processes_immediately(self):
        """When both GPUs ready, process immediately (don't queue)."""
        from gateway_modules.gpu_routing import should_queue_request
        update_lc0_status()
        update_llama_status()
        
        assert is_lc0_ready() is True
        assert is_llama_ready() is True
        
        should_queue, reason = should_queue_request()
        assert should_queue is False
        assert reason == "gpu_ready"
    
    def test_queue_moves_flag_in_status(self):
        """get_gpu_status includes queue_moves flag."""
        from gateway_modules.gpu_routing import get_gpu_status
        
        # Cold state: should queue
        status = get_gpu_status()
        assert status["queue_moves"] is True
        
        # GPU ready: should not queue
        update_lc0_status()
        update_llama_status()
        status = get_gpu_status()
        assert status["queue_moves"] is False
    
    def test_prefer_groq_api_flag(self):
        """When PREFER_GROQ_API=True, use Groq API."""
        from gateway_modules import gpu_routing
        original = gpu_routing.PREFER_GROQ_API
        gpu_routing.PREFER_GROQ_API = True
        
        try:
            use_groq, reason = should_use_groq_api()
            assert use_groq is True
            assert reason == "prefer_groq_api"
        finally:
            gpu_routing.PREFER_GROQ_API = original



class TestGPUStatus:
    """Test get_gpu_status for frontend polling."""
    
    def setup_method(self):
        _reset_state()
    
    def test_initial_status_is_cold(self):
        """Initial status is 'cold'."""
        status = get_gpu_status()
        assert status["status"] == "cold"
        assert status["lc0_ready"] is False
        assert status["llama_ready"] is False
    
    def test_status_lc0_warming(self):
        """After first request, status becomes 'lc0_warming'."""
        from gateway_modules.gpu_routing import should_start_lc0_warmup
        should_start_lc0_warmup()
        
        status = get_gpu_status()
        assert status["status"] == "lc0_warming"
    
    def test_status_llama_warming(self):
        """After LC0 ready, status becomes 'llama_warming'."""
        update_lc0_status()
        
        status = get_gpu_status()
        assert status["status"] == "llama_warming"
        assert status["lc0_ready"] is True
        assert status["llama_ready"] is False
    
    def test_status_ready(self):
        """When both GPUs ready, status is 'ready'."""
        update_lc0_status()
        update_llama_status()
        
        status = get_gpu_status()
        assert status["status"] == "ready"
        assert status["lc0_ready"] is True
        assert status["llama_ready"] is True


class TestLegacyCompatibility:
    """Test backward compatibility functions."""
    
    def setup_method(self):
        _reset_state()
    
    def test_is_gpu_likely_cold_checks_llama(self):
        """Legacy is_gpu_likely_cold() checks LLaMA status."""
        assert is_gpu_likely_cold() is True
        
        update_llama_status()
        assert is_gpu_likely_cold() is False
    
    def test_update_gpu_status_updates_llama(self):
        """Legacy update_gpu_status() updates LLaMA."""
        assert is_llama_ready() is False
        
        update_gpu_status()
        assert is_llama_ready() is True


class TestGPUColdDetection:
    """Test GPU cold start detection with idle thresholds."""
    
    def setup_method(self):
        _reset_state()
    
    def test_lc0_cold_initially(self):
        """LC0 is cold when never called."""
        assert is_lc0_ready() is False
    
    def test_llama_cold_initially(self):
        """LLaMA is cold when never called."""
        assert is_llama_ready() is False
    
    def test_lc0_hot_after_update(self):
        """LC0 is hot immediately after successful call."""
        update_lc0_status()
        assert is_lc0_ready() is True
    
    def test_llama_hot_after_update(self):
        """LLaMA is hot immediately after successful call."""
        update_llama_status()
        assert is_llama_ready() is True


class TestRoutingStats:
    """Test monitoring/debugging stats."""
    
    def setup_method(self):
        _reset_state()
    
    def test_get_routing_stats(self):
        """Stats return expected structure."""
        register_paid_session("user-1")
        register_paid_session("user-2")
        update_lc0_status()
        update_llama_status()
        
        stats = get_routing_stats()
        
        assert stats["active_paid_users"] == 2
        assert stats["threshold"] == MODAL_GPU_PAID_USER_THRESHOLD
        assert stats["status"] == "ready"
        assert stats["lc0_ready"] is True
        assert stats["llama_ready"] is True
        assert "user-1" in stats["active_sessions"]
        assert "user-2" in stats["active_sessions"]


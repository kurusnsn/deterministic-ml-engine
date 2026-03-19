"""
Tests for rate limiting security controls.

COMPUTE-1: Stockfish rate limits (10/5/30 per min for auth/anon/IP)
COMPUTE-2: LLM rate limits (3/1 per min, 30/5 per day for auth/anon)
"""
import pytest
from unittest.mock import MagicMock, patch
from gateway_modules.rate_limiter import (
    get_rate_limit_key,
    get_user_tier,
    get_stockfish_limit,
    get_llm_limit,
    check_daily_limit,
    increment_daily_usage,
    reset_daily_usage,
    STOCKFISH_LIMITS,
    LLM_LIMITS,
    LLM_DAILY_CAPS,
)
from slowapi.errors import RateLimitExceeded


class TestRateLimitKeyExtraction:
    """Test rate limit key extraction with priority: user > session > IP."""
    
    def test_authenticated_user_gets_user_key(self):
        """Authenticated user should get user: prefixed key."""
        request = MagicMock()
        request.state = MagicMock()
        request.state.user_id = "user-123"
        request.headers = {}
        request.cookies = {}
        
        key = get_rate_limit_key(request)
        assert key == "user:user-123"
    
    def test_session_user_gets_session_key(self):
        """Session user should get session: prefixed key."""
        request = MagicMock()
        request.state = MagicMock(spec=[])  # No user_id attribute
        request.headers = {"x-session-id": "session-456"}
        request.cookies = {}
        
        key = get_rate_limit_key(request)
        assert key == "session:session-456"
    
    def test_cookie_session_fallback(self):
        """Session should work from cookie if not in header."""
        request = MagicMock()
        request.state = MagicMock(spec=[])
        request.headers = {}
        request.cookies = {"session_id": "cookie-session-789"}
        
        key = get_rate_limit_key(request)
        assert key == "session:cookie-session-789"
    
    def test_ip_fallback(self):
        """IP fallback when no user or session."""
        request = MagicMock()
        request.state = MagicMock(spec=[])
        request.headers = {}
        request.cookies = {}
        request.client = MagicMock()
        request.client.host = "192.168.1.100"
        
        key = get_rate_limit_key(request)
        assert key.startswith("ip:")


class TestUserTierDetection:
    """Test user tier detection for rate limit selection."""
    
    def test_auth_tier(self):
        request = MagicMock()
        request.state = MagicMock()
        request.state.user_id = "user-123"
        
        assert get_user_tier(request) == "auth"
    
    def test_anon_tier(self):
        request = MagicMock()
        request.state = MagicMock(spec=[])
        request.headers = {"x-session-id": "session-456"}
        request.cookies = {}
        
        assert get_user_tier(request) == "anon"
    
    def test_ip_tier(self):
        request = MagicMock()
        request.state = MagicMock(spec=[])
        request.headers = {}
        request.cookies = {}
        
        assert get_user_tier(request) == "ip"


class TestStockfishRateLimits:
    """Test COMPUTE-1: Stockfish rate limit values."""
    
    def test_auth_limit(self):
        assert STOCKFISH_LIMITS["auth"] == "10/minute"
    
    def test_anon_limit(self):
        assert STOCKFISH_LIMITS["anon"] == "5/minute"
    
    def test_ip_limit(self):
        assert STOCKFISH_LIMITS["ip"] == "30/minute"
    
    def test_get_stockfish_limit_auth(self):
        request = MagicMock()
        request.state = MagicMock()
        request.state.user_id = "user-123"
        
        limit = get_stockfish_limit(request)
        assert limit == "10/minute"
    
    def test_get_stockfish_limit_anon(self):
        request = MagicMock()
        request.state = MagicMock(spec=[])
        request.headers = {"x-session-id": "session-456"}
        request.cookies = {}
        
        limit = get_stockfish_limit(request)
        assert limit == "5/minute"


class TestLLMRateLimits:
    """Test COMPUTE-2: LLM rate limit values."""
    
    def test_auth_limit(self):
        assert LLM_LIMITS["auth"] == "3/minute"
    
    def test_anon_limit(self):
        assert LLM_LIMITS["anon"] == "1/minute"
    
    def test_daily_caps(self):
        assert LLM_DAILY_CAPS["auth"] == 30
        assert LLM_DAILY_CAPS["anon"] == 5


class TestDailyLimitEnforcement:
    """Test COMPUTE-2: Daily limit tracking and enforcement."""
    
    def setup_method(self):
        """Reset daily usage before each test."""
        reset_daily_usage()
    
    def test_within_daily_limit(self):
        """Requests within daily limit should pass."""
        request = MagicMock()
        request.state = MagicMock()
        request.state.user_id = "user-123"
        request.headers = {}
        request.cookies = {}
        
        # Should not raise
        assert check_daily_limit(request) is True
    
    def test_daily_limit_exceeded(self):
        """Requests exceeding daily limit should raise HTTPException 429."""
        from fastapi import HTTPException
        
        request = MagicMock()
        request.state = MagicMock()
        request.state.user_id = "user-exceed"
        request.headers = {}
        request.cookies = {}
        
        # Hit daily limit
        for _ in range(30):
            try:
                check_daily_limit(request)
                increment_daily_usage(request)
            except HTTPException:
                pass  # Should happen on 31st
        
        # 31st request should exceed
        with pytest.raises(HTTPException) as exc_info:
            check_daily_limit(request)
        assert exc_info.value.status_code == 429
    
    def test_anon_daily_cap_lower(self):
        """Anonymous users have lower daily cap (5 vs 30)."""
        from fastapi import HTTPException
        
        request = MagicMock()
        request.state = MagicMock(spec=[])
        request.headers = {"x-session-id": "anon-session"}
        request.cookies = {}
        
        # Should fail after 5 requests
        for _ in range(5):
            check_daily_limit(request)
            increment_daily_usage(request)
        
        with pytest.raises(HTTPException) as exc_info:
            check_daily_limit(request)
        assert exc_info.value.status_code == 429

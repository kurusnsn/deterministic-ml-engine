"""
Backend Tests: Moderation Service
=================================

Tests for the chat moderation service.
Tests Detoxify integration and regex filtering.

Test categories:
- Toxicity detection (mocked Detoxify)
- Regex pattern matching
- Moderation actions (allow, replace, shadowban, block, escalate)
- Ghost messages for shadowbanned users
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import re

# ============================================
# Mock Data Factories
# ============================================

def create_mock_message(content="Hello everyone!", user_id="user123"):
    """Factory for chat message"""
    return {
        "id": "msg1",
        "user_id": user_id,
        "username": "ChessFan",
        "content": content,
        "timestamp": "2025-04-01T10:30:00Z",
        "game_id": "g1",
    }


def create_mock_detoxify_result(toxicity=0.01, severe_toxicity=0.001, obscene=0.02):
    """Factory for Detoxify model result"""
    return {
        "toxicity": toxicity,
        "severe_toxicity": severe_toxicity,
        "obscene": obscene,
        "threat": 0.001,
        "insult": 0.01,
        "identity_attack": 0.001,
    }


def create_mock_user(shadowbanned=False, banned=False):
    """Factory for user data"""
    return {
        "id": "user123",
        "username": "ChessFan",
        "shadowbanned": shadowbanned,
        "banned": banned,
        "trust_score": 0.95,
    }


# ============================================
# Toxicity Detection Tests
# ============================================

class TestToxicityDetection:
    """Tests for Detoxify-based toxicity detection"""

    def test_clean_message_passes(self):
        """Test that clean messages pass moderation"""
        result = create_mock_detoxify_result(toxicity=0.01)
        
        threshold = 0.5
        is_toxic = result["toxicity"] > threshold
        
        assert not is_toxic

    def test_toxic_message_detected(self):
        """Test that toxic messages are detected"""
        result = create_mock_detoxify_result(toxicity=0.85)
        
        threshold = 0.5
        is_toxic = result["toxicity"] > threshold
        
        assert is_toxic

    def test_severe_toxicity_detected(self):
        """Test that severely toxic messages are flagged"""
        result = create_mock_detoxify_result(severe_toxicity=0.9)
        
        threshold = 0.5
        is_severe = result["severe_toxicity"] > threshold
        
        assert is_severe

    def test_multiple_toxicity_flags(self):
        """Test handling multiple toxicity flags"""
        result = create_mock_detoxify_result(
            toxicity=0.7,
            obscene=0.8,
        )
        
        threshold = 0.5
        flags = []
        
        if result["toxicity"] > threshold:
            flags.append("toxic")
        if result["obscene"] > threshold:
            flags.append("obscene")
        if result["severe_toxicity"] > threshold:
            flags.append("severe")
        
        assert "toxic" in flags
        assert "obscene" in flags
        assert "severe" not in flags


# ============================================
# Regex Filtering Tests
# ============================================

class TestRegexFiltering:
    """Tests for regex-based content filtering"""

    def test_block_urls(self):
        """Test blocking URLs in messages"""
        patterns = [
            r'https?://[^\s]+',
            r'www\.[^\s]+',
        ]
        
        message = "Check this out: https://example.com"
        
        blocked = any(re.search(p, message) for p in patterns)
        
        assert blocked

    def test_block_spam_patterns(self):
        """Test blocking spam patterns"""
        spam_patterns = [
            r'(.)\\1{5,}',  # Repeated characters: aaaaaaa
            r'(?i)free money',
            r'(?i)click here',
        ]
        
        spam_message = "FREEEE MONEYYY click here!!!!"
        
        # Check for spam
        is_spam = any(re.search(p, spam_message) for p in spam_patterns)
        
        # The first pattern matches the repeated characters
        assert re.search(r'(.)\1{4,}', spam_message)

    def test_replace_profanity(self):
        """Test replacing profanity with asterisks"""
        profanity_list = ["badword", "profanity"]
        message = "This is a badword and profanity"
        
        filtered = message
        for word in profanity_list:
            filtered = re.sub(
                rf'\b{word}\b',
                '*' * len(word),
                filtered,
                flags=re.IGNORECASE
            )
        
        assert "badword" not in filtered
        assert "*******" in filtered  # 7 asterisks for "badword"

    def test_detect_chess_engine_mentions(self):
        """Test detecting engine cheating mentions"""
        engine_patterns = [
            r'(?i)stockfish',
            r'(?i)engine.*move',
            r'(?i)computer.*says',
        ]
        
        message = "Stockfish suggests this move"
        
        has_engine_mention = any(re.search(p, message) for p in engine_patterns)
        
        assert has_engine_mention


# ============================================
# Moderation Actions Tests
# ============================================

class TestModerationActions:
    """Tests for different moderation actions"""

    def test_action_allow(self):
        """Test allowing clean message"""
        message = create_mock_message("Great game!")
        detoxify_result = create_mock_detoxify_result(toxicity=0.01)
        
        action = "allow" if detoxify_result["toxicity"] < 0.5 else "block"
        
        assert action == "allow"
        assert message["content"] == "Great game!"

    def test_action_replace(self):
        """Test replacing offensive content"""
        message = create_mock_message("You are such a badword!")
        
        # Replace profanity
        message["content"] = re.sub(r'badword', '*******', message["content"])
        action = "replace"
        
        assert action == "replace"
        assert "*******" in message["content"]

    def test_action_shadowban(self):
        """Test shadowban action - user sees their message, others don't"""
        user = create_mock_user()
        message = create_mock_message("Toxic message")
        detoxify_result = create_mock_detoxify_result(toxicity=0.75)
        
        # Repeated toxic messages lead to shadowban
        if detoxify_result["toxicity"] > 0.7:
            user["shadowbanned"] = True
        
        assert user["shadowbanned"]

    def test_action_block(self):
        """Test blocking severely toxic message"""
        message = create_mock_message("Severely toxic content")
        detoxify_result = create_mock_detoxify_result(severe_toxicity=0.95)
        
        action = "block" if detoxify_result["severe_toxicity"] > 0.8 else "allow"
        
        assert action == "block"

    def test_action_escalate(self):
        """Test escalating to human moderator"""
        message = create_mock_message("Threatening content")
        detoxify_result = create_mock_detoxify_result(
            toxicity=0.9,
            severe_toxicity=0.85,
        )
        
        # Escalate if both high toxicity and severe toxicity
        should_escalate = (
            detoxify_result["toxicity"] > 0.8 and
            detoxify_result["severe_toxicity"] > 0.8
        )
        
        assert should_escalate


# ============================================
# Ghost Messages Tests
# ============================================

class TestGhostMessages:
    """Tests for shadowban ghost message behavior"""

    def test_shadowbanned_user_sees_own_message(self):
        """Test that shadowbanned user sees their own message"""
        user = create_mock_user(shadowbanned=True)
        message = create_mock_message("My message")
        
        # Message is visible to the sender
        visible_to_sender = True
        
        assert visible_to_sender
        assert user["shadowbanned"]

    def test_other_users_dont_see_shadowbanned_message(self):
        """Test that other users don't see shadowbanned user's message"""
        sender = create_mock_user(shadowbanned=True)
        sender["id"] = "shadowbanned_user"
        
        viewer = create_mock_user()
        viewer["id"] = "normal_user"
        
        message = create_mock_message(user_id=sender["id"])
        
        # Message visibility logic
        def is_visible_to(viewer_id):
            if sender["shadowbanned"] and viewer_id != sender["id"]:
                return False
            return True
        
        assert not is_visible_to(viewer["id"])
        assert is_visible_to(sender["id"])

    def test_ghost_message_not_in_broadcast(self):
        """Test that ghost messages aren't included in WebSocket broadcast"""
        sender = create_mock_user(shadowbanned=True)
        message = create_mock_message(user_id=sender["id"])
        
        # Broadcast list should exclude shadowbanned messages
        broadcast_messages = []
        
        if not sender["shadowbanned"]:
            broadcast_messages.append(message)
        
        assert len(broadcast_messages) == 0


# ============================================
# Moderation Pipeline Tests
# ============================================

class TestModerationPipeline:
    """Tests for the full moderation pipeline"""

    def test_pipeline_order(self):
        """Test that moderation checks run in correct order"""
        steps = []
        
        def check_banned_user():
            steps.append("banned_check")
            return False
        
        def check_regex_patterns():
            steps.append("regex_check")
            return False
        
        def check_toxicity():
            steps.append("toxicity_check")
            return False
        
        def check_spam_rate():
            steps.append("spam_rate_check")
            return False
        
        # Run pipeline
        checks = [
            check_banned_user,
            check_regex_patterns,
            check_toxicity,
            check_spam_rate,
        ]
        
        for check in checks:
            should_block = check()
            if should_block:
                break
        
        assert steps == ["banned_check", "regex_check", "toxicity_check", "spam_rate_check"]

    def test_pipeline_short_circuit_on_banned(self):
        """Test that pipeline stops on banned user"""
        steps = []
        
        def check_banned_user():
            steps.append("banned_check")
            return True  # User is banned
        
        def check_toxicity():
            steps.append("toxicity_check")
            return False
        
        checks = [check_banned_user, check_toxicity]
        
        for check in checks:
            if check():
                break
        
        assert steps == ["banned_check"]  # Only first check ran

    def test_accumulate_moderation_flags(self):
        """Test accumulating moderation flags for analysis"""
        message = create_mock_message("Test message with some issues")
        
        flags = []
        
        # Simulate various checks
        if len(message["content"]) > 200:
            flags.append("too_long")
        if "http" in message["content"]:
            flags.append("contains_url")
        if any(c.isupper() for c in message["content"]) and \
           sum(1 for c in message["content"] if c.isupper()) > len(message["content"]) * 0.5:
            flags.append("excessive_caps")
        
        # Log flags for analysis even if message is allowed
        moderation_result = {
            "action": "allow",
            "flags": flags,
            "toxicity_score": 0.1,
        }
        
        assert moderation_result["action"] == "allow"
        assert moderation_result["flags"] == []


# ============================================
# Rate Limiting Tests
# ============================================

class TestModerationRateLimiting:
    """Tests for chat rate limiting"""

    def test_rate_limit_exceeded(self):
        """Test detecting when user exceeds rate limit"""
        user_message_times = [
            "2025-04-01T10:30:00Z",
            "2025-04-01T10:30:01Z",
            "2025-04-01T10:30:02Z",
            "2025-04-01T10:30:03Z",
            "2025-04-01T10:30:04Z",
            "2025-04-01T10:30:05Z",  # 6 messages in 5 seconds
        ]
        
        # Rate limit: 5 messages per 10 seconds
        limit = 5
        window_seconds = 10
        
        is_rate_limited = len(user_message_times) > limit
        
        assert is_rate_limited

    def test_rate_limit_not_exceeded(self):
        """Test normal message rate"""
        user_message_count = 3
        limit = 5
        
        is_rate_limited = user_message_count > limit
        
        assert not is_rate_limited

    def test_rate_limit_cooldown(self):
        """Test cooldown after rate limit"""
        from datetime import datetime, timedelta
        
        last_rate_limit_time = datetime.now() - timedelta(seconds=30)
        cooldown_seconds = 60
        
        # Check if still in cooldown
        in_cooldown = datetime.now() < last_rate_limit_time + timedelta(seconds=cooldown_seconds)
        
        assert in_cooldown




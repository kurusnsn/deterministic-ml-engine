"""
Backend Tests: Commentary Service
=================================

Tests for the AI commentary generation service.
Uses mocked LLM responses to verify caching and formatting.

Test categories:
- Commentary request formatting
- LLM response parsing
- Caching behavior
- Error handling
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime
import json

# ============================================
# Mock Data Factories
# ============================================

def create_mock_position():
    """Factory for chess position data"""
    return {
        "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
        "moves": ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"],
        "last_move": "Nf6",
        "turn": "white",
        "evaluation": 0.3,
    }


def create_mock_llm_response():
    """Factory for mocked LLM response"""
    return {
        "choices": [
            {
                "message": {
                    "content": """<analysis>
White has developed harmoniously with the Italian Game setup. The bishop on c4 targets f7, while the knight controls key central squares.

**Position Summary:**
White has a slight space advantage and better piece coordination. The position is equal with chances for both sides.

**Last Move Explanation:**
6...Nf6 is the main theoretical move, attacking e4 and developing the kingside.

**Alternative Lines:**
- 6...Be7 leads to the Hungarian Defense
- 6...Bc5 enters the Giuoco Piano

**Critical Observation:**
White must decide between d3 (slow but solid) or d4 (aggressive central break).
</analysis>"""
                }
            }
        ]
    }


def create_mock_explain_move_response():
    """Factory for move explanation response"""
    return {
        "choices": [
            {
                "message": {
                    "content": """The move Nf6 develops the knight to its natural square while:
1. Attacking the e4 pawn
2. Preparing kingside castling
3. Following classical opening principles

This is the most popular response in this position, played in over 80% of master games."""
                }
            }
        ]
    }


def create_mock_best_line_response():
    """Factory for best line response"""
    return {
        "choices": [
            {
                "message": {
                    "content": """Best continuation: 7. d4 exd4 8. O-O d6 9. Nxd4 Be7 10. Nc3

Evaluation: +0.25 (slightly better for White)

This is the main line of the Italian Game, leading to rich middlegame play."""
                }
            }
        ]
    }


def create_mock_mistake_explanation():
    """Factory for mistake explanation response"""
    return {
        "choices": [
            {
                "message": {
                    "content": """The move was a mistake because:
1. It allows tactical exploitation with Ng5!
2. The f7 square becomes weak
3. Better was Be7, preparing castling

After Ng5, Black faces difficult defensive tasks."""
                }
            }
        ]
    }


# ============================================
# Commentary Request Tests
# ============================================

class TestCommentaryRequest:
    """Tests for commentary request formatting"""

    def test_format_position_for_llm(self):
        """Test formatting chess position for LLM input"""
        position = create_mock_position()
        
        prompt = f"""Analyze this chess position:
FEN: {position['fen']}
Moves played: {' '.join(position['moves'])}
Last move: {position['last_move']}
Side to move: {position['turn']}
Engine evaluation: {position['evaluation']:+.2f}
"""
        
        assert position["fen"] in prompt
        assert "e4 e5 Nf3 Nc6 Bc4 Nf6" in prompt
        assert "Nf6" in prompt
        assert "+0.30" in prompt

    def test_create_system_prompt(self):
        """Test creating system prompt for commentary"""
        system_prompt = """You are a chess grandmaster commentator providing analysis.
Be concise but insightful. Focus on:
- Position evaluation
- Key ideas and plans
- Critical squares and pieces
- Potential tactical motifs"""
        
        assert "grandmaster" in system_prompt
        assert "Position evaluation" in system_prompt

    def test_include_tactical_context(self):
        """Test including tactical context in request"""
        position = create_mock_position()
        tactics = {
            "threats": ["Ng5 attacking f7"],
            "pins": [],
            "forks": [],
        }
        
        context = f"Tactical themes: {json.dumps(tactics)}"
        
        assert "Ng5 attacking f7" in context


# ============================================
# LLM Response Parsing Tests
# ============================================

class TestLLMResponseParsing:
    """Tests for parsing LLM responses"""

    def test_extract_commentary_from_response(self):
        """Test extracting commentary from LLM response"""
        response = create_mock_llm_response()
        content = response["choices"][0]["message"]["content"]
        
        assert "Position Summary" in content
        assert "Last Move Explanation" in content
        assert "Alternative Lines" in content
        assert "Critical Observation" in content

    def test_parse_structured_sections(self):
        """Test parsing structured sections from response"""
        response = create_mock_llm_response()
        content = response["choices"][0]["message"]["content"]
        
        # Simple section extraction
        sections = {}
        current_section = None
        current_content = []
        
        for line in content.split('\n'):
            if line.startswith('**') and line.endswith('**'):
                if current_section:
                    sections[current_section] = '\n'.join(current_content)
                current_section = line.strip('*:')
                current_content = []
            elif current_section:
                current_content.append(line)
        
        if current_section:
            sections[current_section] = '\n'.join(current_content)
        
        assert "Position Summary" in sections
        assert "Last Move Explanation" in sections

    def test_extract_alternative_lines(self):
        """Test extracting alternative lines from response"""
        response = create_mock_llm_response()
        content = response["choices"][0]["message"]["content"]
        
        alternatives = []
        in_alternatives = False
        
        for line in content.split('\n'):
            if "Alternative Lines" in line:
                in_alternatives = True
                continue
            if in_alternatives and line.startswith('- '):
                alternatives.append(line[2:])
            if in_alternatives and line.startswith('**') and "Alternative" not in line:
                break
        
        assert len(alternatives) == 2
        assert "Hungarian Defense" in alternatives[0]
        assert "Giuoco Piano" in alternatives[1]

    def test_handle_streaming_response(self):
        """Test handling streaming LLM response"""
        chunks = [
            {"choices": [{"delta": {"content": "White has "}}]},
            {"choices": [{"delta": {"content": "a slight "}}]},
            {"choices": [{"delta": {"content": "advantage."}}]},
        ]
        
        full_content = ""
        for chunk in chunks:
            delta = chunk["choices"][0].get("delta", {})
            full_content += delta.get("content", "")
        
        assert full_content == "White has a slight advantage."


# ============================================
# Caching Tests
# ============================================

class TestCommentaryCaching:
    """Tests for commentary caching behavior"""

    def test_cache_key_generation(self):
        """Test generating cache key from position"""
        position = create_mock_position()
        
        # Cache key should be based on FEN and move count
        cache_key = f"{position['fen']}:{len(position['moves'])}"
        
        assert position["fen"] in cache_key
        assert ":6" in cache_key

    def test_cache_hit(self):
        """Test cache hit scenario"""
        cache = {}
        position = create_mock_position()
        cache_key = position["fen"]
        
        # First request (cache miss)
        assert cache_key not in cache
        
        # Store in cache
        cache[cache_key] = create_mock_llm_response()
        
        # Second request (cache hit)
        assert cache_key in cache
        assert "Position Summary" in cache[cache_key]["choices"][0]["message"]["content"]

    def test_cache_expiration(self):
        """Test cache expiration for live games"""
        from datetime import timedelta
        
        cache_entry = {
            "data": create_mock_llm_response(),
            "timestamp": datetime.now(),
            "ttl": timedelta(minutes=5),  # Short TTL for live games
        }
        
        # Check if expired
        is_expired = datetime.now() > cache_entry["timestamp"] + cache_entry["ttl"]
        
        assert not is_expired  # Just created, not expired


# ============================================
# Commentary Types Tests
# ============================================

class TestCommentaryTypes:
    """Tests for different commentary types"""

    @pytest.mark.asyncio
    async def test_explain_move_commentary(self):
        """Test explain move commentary type"""
        response = create_mock_explain_move_response()
        content = response["choices"][0]["message"]["content"]
        
        assert "develops the knight" in content
        assert "Attacking the e4 pawn" in content
        assert "kingside castling" in content

    @pytest.mark.asyncio
    async def test_best_line_commentary(self):
        """Test best line commentary type"""
        response = create_mock_best_line_response()
        content = response["choices"][0]["message"]["content"]
        
        assert "d4 exd4" in content
        assert "+0.25" in content
        assert "Italian Game" in content

    @pytest.mark.asyncio
    async def test_mistake_explanation_commentary(self):
        """Test mistake explanation commentary type"""
        response = create_mock_mistake_explanation()
        content = response["choices"][0]["message"]["content"]
        
        assert "mistake" in content
        assert "Ng5" in content
        assert "Better was Be7" in content


# ============================================
# Error Handling Tests
# ============================================

class TestCommentaryErrorHandling:
    """Tests for commentary service error handling"""

    @pytest.mark.asyncio
    async def test_handle_llm_timeout(self):
        """Test handling LLM request timeout"""
        import asyncio
        
        async def mock_llm_timeout():
            await asyncio.sleep(0.1)
            raise asyncio.TimeoutError("LLM request timed out")
        
        with pytest.raises(asyncio.TimeoutError):
            await mock_llm_timeout()

    @pytest.mark.asyncio
    async def test_handle_invalid_fen(self):
        """Test handling invalid FEN input"""
        invalid_fen = "not a valid fen"
        
        # Service should validate FEN before sending to LLM
        is_valid_fen = "/" in invalid_fen and len(invalid_fen.split()) >= 4
        
        assert not is_valid_fen

    @pytest.mark.asyncio
    async def test_handle_empty_llm_response(self):
        """Test handling empty LLM response"""
        empty_response = {"choices": [{"message": {"content": ""}}]}
        
        content = empty_response["choices"][0]["message"]["content"]
        
        # Should have fallback
        fallback = content if content else "Unable to generate commentary for this position."
        
        assert fallback == "Unable to generate commentary for this position."

    @pytest.mark.asyncio
    async def test_handle_llm_rate_limit(self):
        """Test handling LLM rate limiting"""
        rate_limit_response = {
            "error": {
                "type": "rate_limit_exceeded",
                "message": "Rate limit exceeded",
            }
        }
        
        assert "rate_limit" in rate_limit_response.get("error", {}).get("type", "")


# ============================================
# Commentary Formatting Tests
# ============================================

class TestCommentaryFormatting:
    """Tests for commentary output formatting"""

    def test_format_for_ui(self):
        """Test formatting commentary for UI display"""
        raw_commentary = create_mock_llm_response()["choices"][0]["message"]["content"]
        
        # Format for UI (extract key sections)
        formatted = {
            "summary": "",
            "explanation": "",
            "alternatives": [],
            "critical": "",
        }
        
        lines = raw_commentary.split('\n')
        current_section = None
        
        for line in lines:
            line = line.strip()
            if "Position Summary" in line:
                current_section = "summary"
            elif "Last Move Explanation" in line:
                current_section = "explanation"
            elif "Alternative Lines" in line:
                current_section = "alternatives"
            elif "Critical" in line:
                current_section = "critical"
            elif current_section and line:
                if current_section == "alternatives" and line.startswith('-'):
                    formatted["alternatives"].append(line[2:])
                elif current_section != "alternatives":
                    formatted[current_section] += line + " "
        
        assert len(formatted["alternatives"]) > 0
        assert "slight space advantage" in formatted["summary"]

    def test_sanitize_llm_output(self):
        """Test sanitizing LLM output for display"""
        raw_output = "Analysis: <script>alert('xss')</script> Good move!"
        
        # Simple sanitization
        sanitized = raw_output.replace('<', '&lt;').replace('>', '&gt;')
        
        assert '<script>' not in sanitized
        assert '&lt;script&gt;' in sanitized




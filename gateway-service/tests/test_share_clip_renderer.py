"""
Tests for Share Clip Renderer Service.

Tests the image rendering functionality for share clips.
"""

import pytest
from io import BytesIO
from PIL import Image

from gateway_modules.services.share_clip_renderer import (
    render_share_clip,
    RenderResult,
    _format_eval,
    CANVAS_WIDTH,
    CANVAS_HEIGHT
)


class TestRenderShareClip:
    """Tests for render_share_clip function."""

    @pytest.fixture
    def sample_payload(self):
        """Sample render payload for testing."""
        return {
            "analysis_id": "test-analysis",
            "game_id": 123,
            "primary_move_index": 23,
            "frame": {
                "fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
                "san": "Nxe5",
                "eval_cp_before": -80,
                "eval_cp_after": 120,
                "classification": "brilliant",
                "commentary": "White sacrifices to seize the initiative.",
                "threat_arrows": [
                    {"from": "e5", "to": "f7", "type": "attack"}
                ]
            },
            "visual_options": {
                "show_threat_arrows": True,
                "show_move_classification": True
            },
            "game_meta": {
                "opponent": "Magnus",
                "result": "1-0",
                "time_control": "10+0",
                "played_at": "2025-01-01",
                "opening_name": "Sicilian Defense"
            }
        }

    def test_returns_render_result(self, sample_payload):
        """Should return a RenderResult object."""
        result = render_share_clip(sample_payload)
        
        assert isinstance(result, RenderResult)
        assert result.image_bytes is not None
        assert len(result.image_bytes) > 0

    def test_generates_valid_png(self, sample_payload):
        """Output should be a valid PNG image."""
        result = render_share_clip(sample_payload)
        
        # Try to open with PIL
        img = Image.open(BytesIO(result.image_bytes))
        assert img.format == "PNG"

    def test_correct_dimensions(self, sample_payload):
        """Image should be 1080x1080 pixels."""
        result = render_share_clip(sample_payload)
        
        img = Image.open(BytesIO(result.image_bytes))
        assert img.size == (CANVAS_WIDTH, CANVAS_HEIGHT)

    def test_generates_thumbnail(self, sample_payload):
        """Should also generate a thumbnail."""
        result = render_share_clip(sample_payload)
        
        assert result.thumbnail_bytes is not None
        assert len(result.thumbnail_bytes) > 0
        
        # Verify thumbnail is smaller
        thumb = Image.open(BytesIO(result.thumbnail_bytes))
        assert thumb.size[0] <= 400
        assert thumb.size[1] <= 400

    def test_handles_empty_frame(self):
        """Should handle minimal/empty payload."""
        minimal_payload = {
            "analysis_id": "test",
            "frame": {},
            "visual_options": {},
            "game_meta": {}
        }
        
        result = render_share_clip(minimal_payload)
        
        assert result.image_bytes is not None
        img = Image.open(BytesIO(result.image_bytes))
        assert img.format == "PNG"

    def test_handles_no_arrows_option(self, sample_payload):
        """Should respect show_threat_arrows=False."""
        sample_payload["visual_options"]["show_threat_arrows"] = False
        
        result = render_share_clip(sample_payload)
        
        # Should still render successfully
        assert result.image_bytes is not None
        img = Image.open(BytesIO(result.image_bytes))
        assert img.format == "PNG"

    def test_handles_no_classification_badge(self, sample_payload):
        """Should respect show_move_classification=False."""
        sample_payload["visual_options"]["show_move_classification"] = False
        
        result = render_share_clip(sample_payload)
        
        assert result.image_bytes is not None


class TestFormatEval:
    """Tests for _format_eval helper."""

    def test_positive_eval(self):
        """Positive eval should show + prefix."""
        assert _format_eval(150) == "+1.5"
        assert _format_eval(30) == "+0.3"

    def test_negative_eval(self):
        """Negative eval should show - prefix."""
        assert _format_eval(-150) == "-1.5"
        assert _format_eval(-30) == "-0.3"

    def test_zero_eval(self):
        """Zero should show +0.0."""
        assert _format_eval(0) == "+0.0"

    def test_mate_score(self):
        """Large values should show M for mate."""
        assert _format_eval(10000) == "M"
        assert _format_eval(-10000) == "-M"

    def test_near_mate(self):
        """Values near 10000 should show exact."""
        assert _format_eval(9999) == "+100.0"

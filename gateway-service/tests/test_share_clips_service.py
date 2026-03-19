"""
Tests for Share Clips Service.

Tests the ShareClipsService CRUD operations and utility functions.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from contextlib import asynccontextmanager
import uuid
from datetime import datetime

from gateway_modules.services.share_clips_service import (
    generate_unique_slug,
    build_render_payload,
    ShareClipsService,
    _row_to_dict
)


class TestGenerateUniqueSlug:
    """Tests for generate_unique_slug function."""

    def test_basic_slug_format(self):
        """Slug should contain SAN, classification, move index, and random suffix."""
        slug = generate_unique_slug("Nxe5", "brilliant", 23)
        parts = slug.split("-")
        
        assert len(parts) == 4
        assert parts[0] == "nxe5"  # lowercase SAN
        assert parts[1] == "brilliant"  # lowercase classification
        assert parts[2] == "23"  # move index
        assert len(parts[3]) == 4  # random suffix

    def test_slug_without_classification(self):
        """Slug should work without classification."""
        slug = generate_unique_slug("e4", None, 1)
        parts = slug.split("-")
        
        assert len(parts) == 3
        assert parts[0] == "e4"
        assert parts[1] == "1"
        assert len(parts[2]) == 4

    def test_slug_cleans_special_chars(self):
        """Slug should remove +, #, = from SAN."""
        slug = generate_unique_slug("Qxf7+", "checkmate", 42)
        assert "qxf7" in slug
        assert "+" not in slug

        slug2 = generate_unique_slug("e8=Q#", "mate", 50)
        assert "e8q" in slug2
        assert "=" not in slug2
        assert "#" not in slug2

    def test_slug_is_unique(self):
        """Multiple calls should produce unique slugs."""
        slugs = [generate_unique_slug("Nxe5", "brilliant", 23) for _ in range(100)]
        assert len(set(slugs)) == 100


class TestBuildRenderPayload:
    """Tests for build_render_payload function."""

    def test_payload_structure(self):
        """Payload should have all required fields."""
        payload = build_render_payload(
            analysis_id="analysis-123",
            game_id=456,
            primary_move_index=23,
            move_data={
                "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R",
                "san": "Nxe5",
                "eval_cp_before": -80,
                "eval_cp_after": 120,
                "classification": "brilliant",
                "commentary": "White sacrifices to seize initiative.",
                "threat_arrows": [{"from": "e5", "to": "f7", "type": "attack"}]
            },
            game_meta={"opponent": "Magnus", "result": "1-0"},
            visual_options={"show_threat_arrows": True, "show_move_classification": True}
        )
        
        assert payload["analysis_id"] == "analysis-123"
        assert payload["game_id"] == 456
        assert payload["primary_move_index"] == 23
        assert "frame" in payload
        assert "visual_options" in payload
        assert "game_meta" in payload

    def test_frame_contains_move_data(self):
        """Frame should contain all move-specific data."""
        payload = build_render_payload(
            analysis_id="test",
            game_id=1,
            primary_move_index=1,
            move_data={
                "fen": "fen_string",
                "san": "e4",
                "eval_cp_before": 0,
                "eval_cp_after": 30,
                "classification": "book",
                "commentary": "Standard opening.",
                "threat_arrows": []
            },
            game_meta={},
            visual_options={}
        )
        
        frame = payload["frame"]
        assert frame["fen"] == "fen_string"
        assert frame["san"] == "e4"
        assert frame["eval_cp_before"] == 0
        assert frame["eval_cp_after"] == 30
        assert frame["classification"] == "book"
        assert frame["commentary"] == "Standard opening."
        assert frame["threat_arrows"] == []

    def test_handles_missing_fields(self):
        """Should handle missing optional fields with defaults."""
        payload = build_render_payload(
            analysis_id="test",
            game_id=None,
            primary_move_index=1,
            move_data={"san": "e4"},  # Minimal data
            game_meta={},
            visual_options={}
        )
        
        frame = payload["frame"]
        assert frame["fen"] == ""
        assert frame["eval_cp_before"] == 0
        assert frame["commentary"] == ""
        assert frame["threat_arrows"] == []


def create_mock_pool(conn_mock):
    """Create a properly mocked asyncpg pool with async context manager support."""
    pool = MagicMock()
    
    @asynccontextmanager
    async def mock_acquire():
        yield conn_mock
    
    pool.acquire = mock_acquire
    return pool


class TestShareClipsServiceCreate:
    """Tests for ShareClipsService.create_clip."""

    @pytest.mark.asyncio
    async def test_create_clip_success(self):
        """Should create clip and return record."""
        conn = AsyncMock()
        pool = create_mock_pool(conn)
        
        # Mock the database response
        mock_row = {
            "id": uuid.uuid4(),
            "slug": "nxe5-brilliant-23-a1b2",
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        conn.fetchrow.return_value = mock_row
        
        result = await ShareClipsService.create_clip(
            pool=pool,
            user_id="user-123",
            game_id=456,
            analysis_id="analysis-789",
            primary_move_index=23,
            slug="nxe5-brilliant-23-a1b2",
            show_threat_arrows=True,
            show_move_classification=True,
            render_payload={"test": "payload"}
        )
        
        assert "id" in result
        assert result["slug"] == "nxe5-brilliant-23-a1b2"
        assert "created_at" in result
        conn.fetchrow.assert_called_once()


class TestShareClipsServiceGet:
    """Tests for ShareClipsService get methods."""

    @pytest.mark.asyncio
    async def test_get_by_id_found(self):
        """Should return clip when found."""
        conn = AsyncMock()
        pool = create_mock_pool(conn)
        
        # Create a proper mock row that behaves like asyncpg.Record
        mock_data = {
            "id": uuid.uuid4(),
            "user_id": uuid.uuid4(),
            "slug": "test-slug",
            "is_public": True,
            "game_id": 123,
            "analysis_id": "analysis-1",
            "primary_move_index": 10,
            "gif_url": None,
            "thumbnail_url": None,
            "show_threat_arrows": True,
            "show_move_classification": True,
            "render_payload": None,
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        
        # Make the mock support dict() conversion
        mock_row = MagicMock()
        mock_row.__iter__ = lambda self: iter(mock_data.items())
        mock_row.keys = lambda: mock_data.keys()
        mock_row.__getitem__ = lambda self, key: mock_data[key]
        mock_row.get = lambda key, default=None: mock_data.get(key, default)
        
        conn.fetchrow.return_value = mock_row
        
        result = await ShareClipsService.get_clip_by_id(pool, "clip-id-123")
        
        assert result is not None
        assert result["slug"] == "test-slug"
        conn.fetchrow.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_by_id_not_found(self):
        """Should return None when not found."""
        conn = AsyncMock()
        pool = create_mock_pool(conn)
        conn.fetchrow.return_value = None
        
        result = await ShareClipsService.get_clip_by_id(pool, "nonexistent")
        
        assert result is None

    @pytest.mark.asyncio
    async def test_get_by_slug_public_only(self):
        """Should filter by is_public when public_only=True."""
        conn = AsyncMock()
        pool = create_mock_pool(conn)
        conn.fetchrow.return_value = None
        
        await ShareClipsService.get_clip_by_slug(pool, "test-slug", public_only=True)
        
        # Check that the query includes is_public = TRUE
        call_args = conn.fetchrow.call_args
        assert "is_public = TRUE" in call_args[0][0]


class TestShareClipsServiceUpdate:
    """Tests for ShareClipsService update methods."""

    @pytest.mark.asyncio
    async def test_update_urls_success(self):
        """Should update URLs and return True."""
        conn = AsyncMock()
        pool = create_mock_pool(conn)
        conn.execute.return_value = "UPDATE 1"
        
        result = await ShareClipsService.update_clip_urls(
            pool,
            "clip-id",
            gif_url="https://cdn.example.com/clip.png",
            thumbnail_url="https://cdn.example.com/thumb.png"
        )
        
        assert result is True

    @pytest.mark.asyncio
    async def test_update_urls_not_found(self):
        """Should return False when clip not found."""
        conn = AsyncMock()
        pool = create_mock_pool(conn)
        conn.execute.return_value = "UPDATE 0"
        
        result = await ShareClipsService.update_clip_urls(pool, "nonexistent", gif_url="url")
        
        assert result is False


class TestShareClipsServiceDelete:
    """Tests for ShareClipsService.delete_clip."""

    @pytest.mark.asyncio
    async def test_delete_success(self):
        """Should delete and return True."""
        conn = AsyncMock()
        pool = create_mock_pool(conn)
        conn.execute.return_value = "DELETE 1"
        
        result = await ShareClipsService.delete_clip(pool, "clip-id", "user-id")
        
        assert result is True

    @pytest.mark.asyncio
    async def test_delete_not_found_or_unauthorized(self):
        """Should return False when clip not found or wrong user."""
        conn = AsyncMock()
        pool = create_mock_pool(conn)
        conn.execute.return_value = "DELETE 0"
        
        result = await ShareClipsService.delete_clip(pool, "clip-id", "wrong-user")
        
        assert result is False

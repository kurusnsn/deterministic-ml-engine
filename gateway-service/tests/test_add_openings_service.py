"""
Unit tests for add_openings_service.py

Tests cover:
1. add_openings_from_repertoire - copying between user buckets
2. add_openings_from_catalog - importing from ECO catalog
3. get_openings_for_import - listing openings for import UI
4. Ownership validation
5. Duplicate handling
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

# Mock asyncpg before importing the service
import sys
sys.modules['asyncpg'] = MagicMock()

from gateway_modules.services.add_openings_service import (
    add_openings_from_repertoire,
    add_openings_from_catalog,
    get_openings_for_import,
)


@pytest.fixture
def mock_pool():
    """Create a mock database connection pool."""
    pool = MagicMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)
    return pool, conn


@pytest.mark.asyncio
async def test_add_openings_from_repertoire_success(mock_pool):
    """Test successfully copying openings between repertoires."""
    pool, conn = mock_pool
    user_id = str(uuid4())
    target_id = str(uuid4())
    source_id = str(uuid4())
    
    # Mock ownership check - user owns both
    conn.fetchval = AsyncMock(side_effect=[user_id, user_id, "Test Source Repertoire"])
    
    # Mock source openings
    conn.fetch = AsyncMock(side_effect=[
        [
            {"eco_code": "B90", "color": "black", "note": None},
            {"eco_code": "C42", "color": "white", "note": "Petroff Defense"},
        ],
        # Existing openings in target (empty)
        []
    ])
    
    # Mock transaction
    conn.transaction = MagicMock()
    conn.transaction.return_value.__aenter__ = AsyncMock()
    conn.transaction.return_value.__aexit__ = AsyncMock()
    
    conn.execute = AsyncMock()
    
    result = await add_openings_from_repertoire(
        pool, user_id, target_id, source_id, ["B90", "C42"]
    )
    
    assert result["added"] == 2
    assert result["duplicates"] == 0
    assert result["errors"] == []


@pytest.mark.asyncio
async def test_add_openings_from_repertoire_with_duplicates(mock_pool):
    """Test that duplicates are detected and not inserted."""
    pool, conn = mock_pool
    user_id = str(uuid4())
    target_id = str(uuid4())
    source_id = str(uuid4())
    
    # Mock ownership check
    conn.fetchval = AsyncMock(side_effect=[user_id, user_id, "Source"])
    
    # Mock source openings and existing target openings
    conn.fetch = AsyncMock(side_effect=[
        [{"eco_code": "B90", "color": "black", "note": None}],
        [{"eco_code": "B90", "color": "black"}]  # Already exists in target
    ])
    
    conn.transaction = MagicMock()
    conn.transaction.return_value.__aenter__ = AsyncMock()
    conn.transaction.return_value.__aexit__ = AsyncMock()
    conn.execute = AsyncMock()
    
    result = await add_openings_from_repertoire(
        pool, user_id, target_id, source_id, ["B90"]
    )
    
    assert result["added"] == 0
    assert result["duplicates"] == 1


@pytest.mark.asyncio
async def test_add_openings_from_repertoire_ownership_check(mock_pool):
    """Test that ownership is enforced for both source and target."""
    pool, conn = mock_pool
    user_id = str(uuid4())
    other_user_id = str(uuid4())
    target_id = str(uuid4())
    source_id = str(uuid4())
    
    # Target owned by user, source owned by someone else
    conn.fetchval = AsyncMock(side_effect=[user_id, other_user_id])
    
    with pytest.raises(ValueError, match="Source repertoire not found"):
        await add_openings_from_repertoire(
            pool, user_id, target_id, source_id, ["B90"]
        )


@pytest.mark.asyncio
async def test_add_openings_from_catalog_success(mock_pool):
    """Test successfully adding openings from catalog."""
    pool, conn = mock_pool
    user_id = str(uuid4())
    target_id = str(uuid4())
    
    # Mock ownership check
    conn.fetchval = AsyncMock(return_value=user_id)
    
    # Mock no existing openings
    conn.fetch = AsyncMock(return_value=[])
    
    conn.transaction = MagicMock()
    conn.transaction.return_value.__aenter__ = AsyncMock()
    conn.transaction.return_value.__aexit__ = AsyncMock()
    conn.execute = AsyncMock()
    
    catalog_openings = [
        {"eco": "B90", "name": "Sicilian Najdorf", "color": "black"},
        {"eco": "C42", "name": "Petroff Defense", "color": "white"},
    ]
    
    result = await add_openings_from_catalog(
        pool, user_id, target_id, catalog_openings
    )
    
    assert result["added"] == 2
    assert result["duplicates"] == 0


@pytest.mark.asyncio
async def test_add_openings_from_catalog_validates_color(mock_pool):
    """Test that invalid colors are rejected."""
    pool, conn = mock_pool
    user_id = str(uuid4())
    target_id = str(uuid4())
    
    conn.fetchval = AsyncMock(return_value=user_id)
    conn.fetch = AsyncMock(return_value=[])
    conn.transaction = MagicMock()
    conn.transaction.return_value.__aenter__ = AsyncMock()
    conn.transaction.return_value.__aexit__ = AsyncMock()
    conn.execute = AsyncMock()
    
    catalog_openings = [
        {"eco": "B90", "name": "Sicilian", "color": "invalid"},
    ]
    
    result = await add_openings_from_catalog(
        pool, user_id, target_id, catalog_openings
    )
    
    assert result["added"] == 0
    assert "Invalid color" in result["errors"][0]


@pytest.mark.asyncio
async def test_get_openings_for_import(mock_pool):
    """Test getting openings from a repertoire."""
    pool, conn = mock_pool
    user_id = str(uuid4())
    repertoire_id = str(uuid4())
    
    conn.fetchval = AsyncMock(return_value=user_id)
    conn.fetch = AsyncMock(return_value=[
        {"eco_code": "B90", "color": "black", "note": "Main line"},
        {"eco_code": "C42", "color": "white", "note": None},
    ])
    
    result = await get_openings_for_import(pool, user_id, repertoire_id)
    
    assert len(result) == 2
    assert result[0]["eco_code"] == "B90"
    assert result[0]["color"] == "black"
    assert result[0]["note"] == "Main line"


@pytest.mark.asyncio
async def test_get_openings_for_import_ownership_check(mock_pool):
    """Test that only owner can get openings for import."""
    pool, conn = mock_pool
    user_id = str(uuid4())
    other_user_id = str(uuid4())
    repertoire_id = str(uuid4())
    
    # Repertoire owned by someone else
    conn.fetchval = AsyncMock(return_value=other_user_id)
    
    with pytest.raises(ValueError, match="not owned by user"):
        await get_openings_for_import(pool, user_id, repertoire_id)

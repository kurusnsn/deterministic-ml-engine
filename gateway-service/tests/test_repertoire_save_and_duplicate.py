"""
Comprehensive tests for repertoire save operations and duplicate detection
"""
import pytest
import pytest_asyncio
import httpx
import uuid
from typing import AsyncGenerator


GATEWAY_URL = "http://localhost:8010"


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[httpx.AsyncClient, None]:
    """HTTP client fixture"""
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=10.0) as client:
        yield client


@pytest.fixture
def session_id() -> str:
    """Generate a unique session ID for testing"""
    return str(uuid.uuid4())


@pytest.fixture
def test_repertoire():
    """Sample repertoire payload"""
    return {
        "name": "Test Sicilian Defense",
        "category": "core",
        "eco_codes": ["B20", "B21", "B22"],
        "openings": [
            {
                "eco": "B20",
                "name": "Sicilian Defense",
                "color": "black",
                "games_count": 25,
                "winrate": 0.6,
                "frequency": 0.4
            },
            {
                "eco": "B21",
                "name": "Sicilian Defense: Smith-Morra Gambit",
                "color": "black",
                "games_count": 15,
                "winrate": 0.55,
                "frequency": 0.25
            },
            {
                "eco": "B22",
                "name": "Sicilian Defense: Alapin Variation",
                "color": "black",
                "games_count": 20,
                "winrate": 0.58,
                "frequency": 0.35
            }
        ],
        "color": "black"
    }


@pytest.mark.asyncio
async def test_save_repertoire_success(client, session_id, test_repertoire):
    """Test successfully saving a new repertoire"""
    response = await client.post(
        "/repertoires",
        json=test_repertoire,
        headers={"x-session-id": session_id}
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == test_repertoire["name"]
    assert data["category"] == test_repertoire["category"]
    assert data["color"] == test_repertoire["color"]
    assert len(data["eco_codes"]) == len(test_repertoire["eco_codes"])
    assert "id" in data
    assert data["total_games"] == 60  # 25 + 15 + 20
    assert 0.56 < data["avg_winrate"] < 0.59  # Weighted average


@pytest.mark.asyncio
async def test_save_duplicate_repertoire_fails(client, session_id, test_repertoire):
    """Test that saving a duplicate repertoire returns 409 Conflict"""
    # Save first time
    response1 = await client.post(
        "/repertoires",
        json=test_repertoire,
        headers={"x-session-id": session_id}
    )
    assert response1.status_code == 201

    # Try to save again with same name and ECO codes
    response2 = await client.post(
        "/repertoires",
        json=test_repertoire,
        headers={"x-session-id": session_id}
    )

    assert response2.status_code == 409
    error_data = response2.json()
    assert "already exists" in error_data["detail"].lower()


@pytest.mark.asyncio
async def test_save_same_name_different_ecos_succeeds(client, session_id, test_repertoire):
    """Test that same name with different ECO codes is allowed"""
    # Save first repertoire
    response1 = await client.post(
        "/repertoires",
        json=test_repertoire,
        headers={"x-session-id": session_id}
    )
    assert response1.status_code == 201

    # Save with same name but different ECO codes
    modified_repertoire = test_repertoire.copy()
    modified_repertoire["eco_codes"] = ["E60", "E61"]  # Different ECO codes
    modified_repertoire["openings"] = [
        {
            "eco": "E60",
            "name": "King's Indian Defense",
            "color": "black",
            "games_count": 10,
            "winrate": 0.5,
            "frequency": 0.3
        }
    ]

    response2 = await client.post(
        "/repertoires",
        json=modified_repertoire,
        headers={"x-session-id": session_id}
    )

    assert response2.status_code == 201


@pytest.mark.asyncio
async def test_save_developing_category(client, session_id):
    """Test saving a repertoire with 'developing' category"""
    repertoire = {
        "name": "Developing Repertoire",
        "category": "developing",
        "eco_codes": ["C50"],
        "openings": [
            {
                "eco": "C50",
                "name": "Italian Game",
                "color": "white",
                "games_count": 5,
                "winrate": 0.4,
                "frequency": 0.2
            }
        ],
        "color": "white"
    }

    response = await client.post(
        "/repertoires",
        json=repertoire,
        headers={"x-session-id": session_id}
    )

    assert response.status_code == 201
    data = response.json()
    assert data["category"] == "developing"


@pytest.mark.asyncio
async def test_list_repertoires(client, session_id, test_repertoire):
    """Test listing saved repertoires"""
    # Save a repertoire first
    await client.post(
        "/repertoires",
        json=test_repertoire,
        headers={"x-session-id": session_id}
    )

    # List repertoires
    response = await client.get(
        "/repertoires",
        headers={"x-session-id": session_id}
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert any(r["name"] == test_repertoire["name"] for r in data)


@pytest.mark.asyncio
async def test_get_repertoire_stats(client, session_id, test_repertoire):
    """Test getting repertoire statistics"""
    # Save a repertoire first
    await client.post(
        "/repertoires",
        json=test_repertoire,
        headers={"x-session-id": session_id}
    )

    # Get stats
    response = await client.get(
        "/repertoires/stats",
        headers={"x-session-id": session_id}
    )

    assert response.status_code == 200
    data = response.json()
    assert "total_repertoires" in data
    assert "favorite_count" in data
    assert "categories" in data
    assert "avg_winrate" in data
    assert data["total_repertoires"] >= 1


@pytest.mark.asyncio
async def test_invalid_category_fails(client, session_id):
    """Test that invalid category returns 422 Unprocessable Entity"""
    invalid_repertoire = {
        "name": "Invalid Category Test",
        "category": "invalid_category",  # Invalid
        "eco_codes": ["A00"],
        "openings": [
            {
                "eco": "A00",
                "name": "Test",
                "color": "white",
                "games_count": 1,
                "winrate": 0.5,
                "frequency": 0.1
            }
        ],
        "color": "white"
    }

    response = await client.post(
        "/repertoires",
        json=invalid_repertoire,
        headers={"x-session-id": session_id}
    )

    assert response.status_code == 422


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])

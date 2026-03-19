import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, AsyncMock
from uuid import uuid4
from datetime import datetime, timezone

from app import app, get_pool, get_current_user

def test_create_repertoire():
    user_id = uuid4()
    def get_current_user_override():
        return {"id": user_id}

    async def fake_get_pool():
        mock_pool = MagicMock()
        mock_pool.fetchrow = AsyncMock(return_value={
            'id': uuid4(), 'user_id': user_id, 'name': 'Test Repertoire',
            'eco_codes': ['A00'], 'openings': [{'eco': 'A00', 'name': 'Anderssen Opening', 'color': 'white'}],
            'source_report_id': None, 'favorite': False, 'created_at': datetime.now(timezone.utc),
            'updated_at': datetime.now(timezone.utc),
        })
        return mock_pool

    app.dependency_overrides[get_pool] = fake_get_pool
    app.dependency_overrides[get_current_user] = get_current_user_override

    with TestClient(app) as client:
        response = client.post("/repertoires", json={
            "name": "Test Repertoire", "eco_codes": ["A00"],
            "openings": [{"eco": "A00", "name": "Anderssen Opening", "color": "white"}]
        })
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Repertoire"
    assert data["favorite"] is False
    app.dependency_overrides = {}

def test_favorite_repertoire():
    user_id = uuid4()
    repertoire_id = uuid4()
    def get_current_user_override():
        return {"id": user_id}

    async def fake_get_pool():
        mock_pool = MagicMock()
        mock_pool.fetchrow = AsyncMock(side_effect=[
            {
                'id': repertoire_id, 'user_id': user_id, 'name': 'Test', 'eco_codes':[], 
                'openings':[], 'source_report_id': None, 'favorite': False, 
                'created_at': datetime.now(timezone.utc), 'updated_at': datetime.now(timezone.utc)
            }, 
            {
                'id': repertoire_id, 'user_id': user_id, 'favorite': True, 'name': 'Test', 
                'eco_codes':[], 'openings':[], 'source_report_id': None, 
                'created_at': datetime.now(timezone.utc), 'updated_at': datetime.now(timezone.utc)
            }
        ])
        return mock_pool

    app.dependency_overrides[get_pool] = fake_get_pool
    app.dependency_overrides[get_current_user] = get_current_user_override

    with TestClient(app) as client:
        response = client.patch(f"/repertoires/{repertoire_id}", json={"favorite": True})
    
    assert response.status_code == 200
    data = response.json()
    assert data["favorite"] is True
    app.dependency_overrides = {}

def test_delete_repertoire():
    user_id = uuid4()
    repertoire_id = uuid4()
    def get_current_user_override():
        return {"id": user_id}

    async def fake_get_pool():
        mock_pool = MagicMock()
        mock_pool.fetchval = AsyncMock(return_value=repertoire_id)
        return mock_pool

    app.dependency_overrides[get_pool] = fake_get_pool
    app.dependency_overrides[get_current_user] = get_current_user_override

    with TestClient(app) as client:
        response = client.delete(f"/repertoires/{repertoire_id}")
    
    assert response.status_code == 204
    app.dependency_overrides = {}

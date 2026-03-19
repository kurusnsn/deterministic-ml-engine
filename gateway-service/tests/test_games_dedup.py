import pytest
from fastapi.testclient import TestClient

import app as gateway_app


class _FakePool:
    async def fetch(self, query, *args):
        record = {
            'id': 1,
            'provider': 'lichess',
            'source': 'lichess',
            'source_id': 'game-123',
            'perf': 'blitz',
            'time_control': '180+0',
            'result': 'win',
            'rated': True,
            'opponent_username': 'Opponent',
            'opening_eco': 'C20',
            'opening_name': 'KP Game',
            'url': 'https://lichess.org/abc',
            'site': 'lichess.org',
            'start_time': None,
            'end_time': None,
            'created_at': None,
            'pgn': '1.e4 e5',
            'digest': 'digest-abc',
        }
        # Return duplicate rows intentionally
        return [record, record.copy()]

    def acquire(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


def test_games_endpoint_dedupes_duplicates(monkeypatch):
    async def fake_get_pool():
        return _FakePool()

    monkeypatch.setattr(gateway_app, "get_pool", fake_get_pool, raising=False)

    with TestClient(gateway_app.app) as client:
        response = client.get("/games", headers={"x-session-id": "session-1"})

    assert response.status_code == 200
    data = response.json()
    assert data["items"]
    assert len(data["items"]) == 1

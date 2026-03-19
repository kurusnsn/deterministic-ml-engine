import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timezone

import app as gateway_app


class _FakeConn:
    def __init__(self, rows=None):
        self._rows = rows or []

    async def fetch(self, query, *args):
        return self._rows

    async def fetchrow(self, query, *args):
        if "INSERT INTO studies" in query:
            return {"id": 1, "created_at": datetime.now(timezone.utc)}
        if "DELETE FROM studies" in query:
            return {"id": 1}
        if "SELECT * FROM studies" in query:
            return {
                "id": 1, "name": "Test Study", "pgn": "1.e4 e5",
                "current_fen": "start", "current_path": "", "move_tree": "{}",
                "messages": "{}", "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
        return None

class _AcquireCtx:
    def __init__(self, conn):
        self._conn = conn
    async def __aenter__(self):
        return self._conn
    async def __aexit__(self, exc_type, exc, tb):
        return False

class _FakePool:
    def __init__(self, rows=None):
        self._conn = _FakeConn(rows)
    def acquire(self):
        return _AcquireCtx(self._conn)

def test_studies_anon_401_when_flag_off(monkeypatch):
    monkeypatch.setattr(gateway_app, "ALLOW_ANON_STUDIES", False, raising=False)

    async def fake_get_pool():
        return _FakePool([])
    gateway_app.app.dependency_overrides[gateway_app.get_pool] = fake_get_pool

    with TestClient(gateway_app.app) as client:
        r = client.get("/studies", headers={"x-session-id": "dev-session"})
    assert r.status_code == 401

    gateway_app.app.dependency_overrides = {}

def test_studies_anon_list_empty_when_flag_on(monkeypatch):
    monkeypatch.setattr(gateway_app, "ALLOW_ANON_STUDIES", True, raising=False)

    async def fake_get_pool():
        return _FakePool([])
    gateway_app.app.dependency_overrides[gateway_app.get_pool] = fake_get_pool

    with TestClient(gateway_app.app) as client:
        r = client.get("/studies", headers={"x-session-id": "dev-session"})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    assert "studies" in data
    assert isinstance(data["studies"], list)

    gateway_app.app.dependency_overrides = {}

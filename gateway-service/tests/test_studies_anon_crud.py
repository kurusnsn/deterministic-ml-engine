import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timezone
from uuid import uuid4

import app as gateway_app


class _FakeConn:
    def __init__(self):
        self._rows = []
        self._id = 0

    async def fetch(self, query, *args):
        # list by user or session
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "pgn": r["pgn"],
                "current_fen": r["current_fen"],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            }
            for r in self._rows
        ]

    async def fetchrow(self, query, *args):
        if "INSERT INTO studies" in query:
            self._id += 1
            row = {
                "id": self._id,
                "user_id": args[0],
                "session_id": args[1],
                "name": args[2],
                "pgn": args[3],
                "current_fen": args[4],
                "current_path": args[5],
                "move_tree": "{}",
                "messages": "{}",
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
            self._rows.append(row)
            return {"id": row["id"], "created_at": row["created_at"]}
        if "SELECT * FROM studies" in query:
            # args: study_id, user_id, session_id
            study_id = args[0]
            for r in self._rows:
                if r["id"] == study_id:
                    return r
            return None
        if "DELETE FROM studies" in query:
            study_id = args[0]
            for i, r in enumerate(self._rows):
                if r["id"] == study_id:
                    self._rows.pop(i)
                    return {"id": study_id}
            return None
        return None


class _AcquireCtx:
    def __init__(self, conn):
        self._conn = conn
    async def __aenter__(self):
        return self._conn
    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakePool:
    def __init__(self):
        self._conn = _FakeConn()
    def acquire(self):
        return _AcquireCtx(self._conn)


def test_studies_crud_with_session(monkeypatch):
    monkeypatch.setattr(gateway_app, "ALLOW_ANON_STUDIES", True, raising=False)

    pool = _FakePool()

    async def fake_get_pool():
        return pool

    gateway_app.app.dependency_overrides[gateway_app.get_pool] = fake_get_pool

    headers = {"x-session-id": str(uuid4())}
    payload = {
        "name": "Playwright Test",
        "pgn": "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6",
        "current_fen": "start",
        "current_path": "",
        "move_tree": {},
        "messages": {},
    }

    with TestClient(gateway_app.app) as client:
        # Create
        r = client.post("/studies", headers=headers, json=payload)
        assert r.status_code == 200
        created = r.json()
        assert created.get("success") is True
        study_id = created.get("study_id")
        assert isinstance(study_id, int)

        # List
        r = client.get("/studies", headers=headers)
        assert r.status_code == 200
        assert len(r.json().get("studies", [])) == 1

        # Get by id
        r = client.get(f"/studies/{study_id}", headers=headers)
        assert r.status_code == 200
        assert r.json().get("id") == study_id

        # Delete
        r = client.delete(f"/studies/{study_id}", headers=headers)
        assert r.status_code == 200
        assert r.json().get("success") is True

        # List again -> empty
        r = client.get("/studies", headers=headers)
        assert r.status_code == 200
        assert r.json().get("studies") == []

    gateway_app.app.dependency_overrides = {}

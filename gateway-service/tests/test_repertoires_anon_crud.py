import pytest
from fastapi.testclient import TestClient
from uuid import uuid4
from datetime import datetime, timezone

import app as gateway_app
import gateway_modules.routers.repertoires as rep_router


class _FakePool:
    def __init__(self):
        self.rows = []

    async def fetch(self, query, *args):
        # SELECT list by owner (user_id or session_id)
        return list(self.rows)

    async def fetchrow(self, query, *args):
        q = query.upper()
        if "INSERT INTO REPERTOIRES" in q:
            # args: id, (user_id or session_id), name, eco_codes, openings, source_report_id
            new = {
                'id': args[0],
                'user_id': args[1] if 'USER_ID' in q else None,
                'session_id': args[1] if 'SESSION_ID' in q else None,
                'name': args[2],
                'eco_codes': args[3],
                'openings': args[4],
                'source_report_id': args[5],
                'favorite': False,
                'created_at': datetime.now(timezone.utc),
                'updated_at': datetime.now(timezone.utc),
            }
            self.rows.append(new)
            return new
        if "SELECT * FROM REPERTOIRES WHERE ID =" in q:
            rep_id = args[0]
            for r in self.rows:
                if r['id'] == rep_id:
                    return r
            return None
        if "UPDATE REPERTOIRES" in q and "FAVORITE" in q:
            # args: favorite, id, owner
            favorite = args[0]
            rep_id = args[1]
            for r in self.rows:
                if r['id'] == rep_id:
                    r['favorite'] = favorite
                    r['updated_at'] = datetime.now(timezone.utc)
                    return r
            return None
        return None

    async def fetchval(self, query, *args):
        q = query.upper()
        if "DELETE FROM REPERTOIRES" in q:
            rep_id = args[0]
            for i, r in enumerate(self.rows):
                if r['id'] == rep_id:
                    self.rows.pop(i)
                    return rep_id
            return None
        return None


def test_repertoires_crud_with_session(monkeypatch):
    monkeypatch.setattr(gateway_app, "ALLOW_ANON_STUDIES", True, raising=False)
    monkeypatch.setattr(rep_router, "ALLOW_ANON_STUDIES", True, raising=False)

    pool = _FakePool()

    async def fake_get_pool():
        return pool

    # Override dependency for router
    gateway_app.app.dependency_overrides[rep_router.get_pool] = fake_get_pool

    headers = {"x-session-id": str(uuid4())}
    repertoire_body = {
        "name": "Test Rep",
        "eco_codes": ["B20"],
        "openings": [{"eco": "B20", "name": "Sicilian Defense", "color": "black"}],
        "source_report_id": None,
    }

    with TestClient(gateway_app.app) as client:
        # Create
        r = client.post("/repertoires", headers=headers, json=repertoire_body)
        assert r.status_code == 201
        created = r.json()
        rep_id = created["id"]
        assert created["favorite"] is False

        # List
        r = client.get("/repertoires", headers=headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) == 1

        # Update favorite
        r = client.patch(f"/repertoires/{rep_id}", headers=headers, json={"favorite": True})
        assert r.status_code == 200
        assert r.json()["favorite"] is True

        # Delete
        r = client.delete(f"/repertoires/{rep_id}", headers=headers)
        assert r.status_code == 204

        # List again -> empty
        r = client.get("/repertoires", headers=headers)
        assert r.status_code == 200
        assert r.json() == []

    gateway_app.app.dependency_overrides = {}


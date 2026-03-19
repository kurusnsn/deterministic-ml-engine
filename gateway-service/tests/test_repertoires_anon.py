import pytest
from httpx import AsyncClient, ASGITransport

import app as gateway_app


class _FakePool:
    async def fetch(self, query, *args):
        return []


@pytest.mark.asyncio
async def test_repertoires_anon_401_when_flag_off(monkeypatch):
    monkeypatch.setattr(gateway_app, "ALLOW_ANON_STUDIES", False, raising=False)

    async def fake_get_pool():
        return _FakePool()

    # Patch dependency used inside the router module
    import gateway_modules.routers.repertoires as rep_router
    # Override FastAPI dependency
    gateway_app.app.dependency_overrides[rep_router.get_pool] = fake_get_pool

    transport = ASGITransport(app=gateway_app.app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.get("/repertoires", headers={"x-session-id": "dev-session"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_repertoires_anon_list_when_flag_on(monkeypatch):
    monkeypatch.setattr(gateway_app, "ALLOW_ANON_STUDIES", True, raising=False)

    async def fake_get_pool():
        return _FakePool()

    import gateway_modules.routers.repertoires as rep_router
    gateway_app.app.dependency_overrides[rep_router.get_pool] = fake_get_pool
    # Ensure router sees flag as True
    monkeypatch.setattr(rep_router, "ALLOW_ANON_STUDIES", True, raising=False)

    transport = ASGITransport(app=gateway_app.app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.get("/repertoires", headers={"x-session-id": "dev-session"})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert data == []

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app import app

GOLDEN_DIR = Path(__file__).resolve().parents[2] / "contracts" / "golden" / "gateway"


def _load_golden_json(name: str):
    return json.loads((GOLDEN_DIR / name).read_text(encoding="utf-8"))


def _load_golden_jsonl(name: str):
    lines = (GOLDEN_DIR / name).read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def _read_sse_events(response):
    events = []
    for line in response.iter_lines():
        if not line:
            continue
        if line.startswith("data: "):
            payload = line[len("data: "):]
            events.append(json.loads(payload))
    return events


class _FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.content = json.dumps(payload).encode("utf-8")

    def json(self):
        return self._payload

    def raise_for_status(self):
        return None


class _FakeAsyncClient:
    def __init__(self, stockfish_payload, eco_payload, *args, **kwargs):
        self._stockfish_payload = stockfish_payload
        self._eco_payload = eco_payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def post(self, url, json=None):
        return _FakeResponse(self._stockfish_payload)

    async def get(self, url, params=None):
        return _FakeResponse(self._eco_payload)


class _FakePuzzleClient:
    def __init__(self, puzzle_payload, *args, **kwargs):
        self._puzzle_payload = puzzle_payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def get(self, url, params=None):
        return _FakeResponse(self._puzzle_payload)


def test_reports_by_id_golden():
    golden = _load_golden_json("analysis_report.json")

    with patch(
        "gateway_modules.routers.reports.ReportStorageService.get_report_by_id",
        new=AsyncMock(return_value=golden),
    ), patch(
        "gateway_modules.routers.reports.get_pool",
        new=AsyncMock(return_value=object()),
    ), patch(
        "gateway_modules.routers.reports.get_owner_from_request",
        return_value=("user-123", "session-123"),
    ):
        with TestClient(app) as client:
            response = client.get(
                "/analysis/reports/report_123",
                headers={"x-session-id": "session-123"},
            )

    assert response.status_code == 200
    assert response.json() == golden


def test_puzzles_next_golden():
    golden = _load_golden_json("puzzles_next.json")

    with patch(
        "gateway_modules.routers.puzzles.httpx.AsyncClient",
        lambda *args, **kwargs: _FakePuzzleClient(golden, *args, **kwargs),
    ):
        with TestClient(app) as client:
            response = client.get("/puzzles/next?mode=random&rating=1500")

    assert response.status_code == 200
    assert response.json() == golden


def test_analyze_with_llm_stream_golden():
    golden_events = _load_golden_jsonl("analyze_with_llm_stream.jsonl")
    assert golden_events, "Golden stream snapshot missing events"

    stockfish_payload = golden_events[0]["full_response"]["stockfish"]
    eco_payload = golden_events[0]["full_response"]["eco"]

    with patch(
        "app.httpx.AsyncClient",
        lambda *args, **kwargs: _FakeAsyncClient(stockfish_payload, eco_payload, *args, **kwargs),
    ), patch(
        "gateway_modules.routers.analysis.httpx.AsyncClient",
        lambda *args, **kwargs: _FakeAsyncClient(stockfish_payload, eco_payload, *args, **kwargs),
    ), patch(
        "app.update_book_move_classifications",
        new=AsyncMock(return_value=stockfish_payload),
    ), patch(
        "gateway_modules.routers.analysis.update_book_move_classifications",
        new=AsyncMock(return_value=stockfish_payload),
    ):
        with TestClient(app) as client:
            with client.stream(
                "POST",
                "/chess/analyze_with_llm/stream",
                json={"fen": "r1bqkbnr/pppppppp/2n5/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2", "include_llm": False},
            ) as response:
                events = _read_sse_events(response)

    assert response.status_code == 200
    assert events == golden_events


def test_auth_401_golden():
    golden = _load_golden_json("auth_401.json")

    with TestClient(app) as client:
        response = client.get("/users/me")

    assert response.status_code == 401
    assert response.json() == golden


def test_auth_403_golden():
    golden = _load_golden_json("auth_403.json")

    with patch(
        "gateway_modules.routers.users.verify_turnstile_token",
        new=AsyncMock(return_value={"success": False, "error_codes": ["bad-token"]}),
    ):
        with TestClient(app) as client:
            response = client.post("/auth/verify-captcha", json={"token": "bad"})

    assert response.status_code == 403
    assert response.json() == golden

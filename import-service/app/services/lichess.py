import httpx
import json
from typing import Any, AsyncIterator, Iterable

BASE_URL = "https://lichess.org/api/games/user"

def _normalize_perf_types(perf_type: Any) -> str | None:
    """Accept a single perf string or a CSV/list; return CSV of allowed speeds.
    Limits to standard speeds to implicitly exclude variant perfs.
    """
    if not perf_type:
        return None
    # Lichess perfType exact values
    allowed = {"ultraBullet", "bullet", "blitz", "rapid", "classical", "correspondence"}
    items: Iterable[str]
    if isinstance(perf_type, str):
        items = [s.strip() for s in perf_type.split(",") if s.strip()]
    elif isinstance(perf_type, (list, tuple, set)):
        items = [str(s).strip() for s in perf_type]
    else:
        return None
    # Preserve exact casing for known perf types
    selected = [p if p in allowed else None for p in items]
    selected = [p for p in selected if p]
    if not selected:
        return None
    return ",".join(selected)


async def fetch_games(username: str, filters: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Fetch games from Lichess API as JSON objects.
    Uses NDJSON streaming and supports filters (rated, perfType, color, date range).
    """

    params = {
        "max": filters.get("max", 50),
        "pgnInJson": True,
        "opening": True,
    }

    if filters.get("color"):
        params["color"] = filters["color"]
    if filters.get("rated") is not None:
        params["rated"] = str(filters["rated"]).lower()
    perf_csv = _normalize_perf_types(filters.get("perfType"))
    if perf_csv:
        params["perfType"] = perf_csv
    if filters.get("since"):
        params["since"] = int(filters["since"])
    if filters.get("until"):
        # inclusive-of-day like openingtree: add one day
        params["until"] = int(filters["until"]) + 24 * 60 * 60 * 1000

    url = f"{BASE_URL}/{username.lower()}"
    games = []

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "GET",
            url,
            params=params,
            headers={"Accept": "application/x-ndjson"},
        ) as resp:
            resp.raise_for_status()

            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                try:
                    obj = json.loads(line)
                    # Enforce standard-only variant
                    if (obj.get("variant") or "").lower() != "standard":
                        continue
                    games.append(obj)
                except json.JSONDecodeError:
                    continue

    return games


async def fetch_games_stream(username: str, filters: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    """Stream Lichess NDJSON as individual dicts, enforcing standard variant and filters."""
    max_games = int(filters.get("max", 50) or 50)
    yielded = 0
    params: dict[str, Any] = {
        "max": max_games,  # Tell Lichess API to limit results
        "pgnInJson": True,
        "opening": True,
    }
    if filters.get("color"):
        params["color"] = filters["color"]
    if filters.get("rated") is not None:
        params["rated"] = str(filters["rated"]).lower()
    perf_csv = _normalize_perf_types(filters.get("perfType"))
    if perf_csv:
        params["perfType"] = perf_csv
    if filters.get("since"):
        params["since"] = int(filters["since"]) 
    if filters.get("until"):
        params["until"] = int(filters["until"]) + 24 * 60 * 60 * 1000

    url = f"{BASE_URL}/{username.lower()}"
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "GET",
            url,
            params=params,
            headers={"Accept": "application/x-ndjson"},
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if (obj.get("variant") or "").lower() != "standard":
                    continue
                yield obj
                yielded += 1
                if yielded >= max_games:
                    return

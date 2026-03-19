import httpx
from typing import Any, List, AsyncIterator
from datetime import datetime

ARCHIVES_URL = "https://api.chess.com/pub/player/{username}/games/archives"


def _perf_matches(time_class: str, perf: str | None) -> bool:
    if not perf:
        return True
    time_class = (time_class or "").lower()
    mapping = {
        "bullet": "bullet",
        "blitz": "blitz",
        "rapid": "rapid",
        "daily": "daily",  # correspondence on chess.com
    }
    # Accept CSV of perf types
    perfs = [p.strip().lower() for p in str(perf).split(",") if p.strip()]
    wanted_classes = {mapping.get(p) for p in perfs if mapping.get(p)}
    if not wanted_classes:
        return True
    return time_class in wanted_classes


def _color_matches(game: dict[str, Any], username: str, color: str | None) -> bool:
    if not color:
        return True
    u = username.lower()
    is_white = game.get("white", {}).get("username", "").lower() == u
    is_black = game.get("black", {}).get("username", "").lower() == u
    if color == "white":
        return is_white
    if color == "black":
        return is_black
    return True


def _time_in_range(game: dict[str, Any], since_ms: int | None, until_ms: int | None) -> bool:
    # chess.com provides end_time in epoch seconds
    end_time_s = game.get("end_time")
    if not isinstance(end_time_s, int):
        return True
    t_ms = end_time_s * 1000
    if since_ms is not None and t_ms < since_ms:
        return False
    if until_ms is not None and t_ms > until_ms:
        return False
    return True


async def fetch_games(username: str, filters: dict[str, Any]) -> List[dict[str, Any]]:
    """
    Fetch games from Chess.com archives, honoring filters similar to the Lichess service:
      - color: "white" | "black"
      - rated: bool
      - perfType: "bullet" | "blitz" | "rapid" | "daily"
      - since / until: epoch ms
      - max: number of games to return (default 50)
    Returns: list of game dicts as provided by Chess.com monthly archive JSON.
    """

    max_games = int(filters.get("max", 50) or 50)
    since_ms = filters.get("since")
    until_ms = filters.get("until")
    # inclusive-of-day like openingtree: add one day
    if until_ms is not None:
        try:
            until_ms = int(until_ms) + 24 * 60 * 60 * 1000
        except Exception:
            pass
    color = filters.get("color")
    rated = filters.get("rated")
    perf = filters.get("perfType")

    games: List[dict[str, Any]] = []
    username_lc = username.lower()

    async with httpx.AsyncClient(timeout=20.0) as client:
        # 1) Get archive URLs
        r = await client.get(ARCHIVES_URL.format(username=username_lc))
        r.raise_for_status()
        archives: list[str] = r.json().get("archives", [])

        # 2) Iterate most-recent first to satisfy "max" quickly
        for url in reversed(archives):
            # Optional: quick month filter using URL suffix /YYYY/MM
            if since_ms is not None or until_ms is not None:
                try:
                    year, month = url.rsplit("/", 2)[-2:]
                    month_start = int(datetime(int(year), int(month), 1).timestamp() * 1000)
                    # month_end ~ next month start - 1, but rough check is fine
                    if until_ms is not None and month_start > until_ms:
                        # Future month beyond until
                        continue
                    # If since is after this month, still fetch (games level filter will prune)
                except Exception:
                    pass

            resp = await client.get(url)
            resp.raise_for_status()
            month_games = resp.json().get("games", [])

            for g in month_games:
                # Keep only games involving the requested user
                w = g.get("white", {}).get("username", "").lower()
                b = g.get("black", {}).get("username", "").lower()
                if w != username_lc and b != username_lc:
                    continue

                if rated is not None and bool(g.get("rated")) != bool(rated):
                    continue

                if not _perf_matches(g.get("time_class"), perf):
                    continue

                # Standard-only: chess.com 'rules' must be "chess"
                if (g.get("rules") or "").lower() != "chess":
                    continue

                if not _color_matches(g, username_lc, color):
                    continue

                if not _time_in_range(g, since_ms, until_ms):
                    continue

                games.append(g)
                if len(games) >= max_games:
                    return games

    return games


async def fetch_games_stream(username: str, filters: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    """Stream Chess.com games archive month-by-month, yielding filtered games."""
    max_games = int(filters.get("max", 50) or 50)
    since_ms = filters.get("since")
    until_ms = filters.get("until")
    if until_ms is not None:
        try:
            until_ms = int(until_ms) + 24 * 60 * 60 * 1000
        except Exception:
            pass
    color = filters.get("color")
    rated = filters.get("rated")
    perf = filters.get("perfType")

    yielded = 0
    username_lc = username.lower()

    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(ARCHIVES_URL.format(username=username_lc))
        r.raise_for_status()
        archives: list[str] = r.json().get("archives", [])

        for url in reversed(archives):
            resp = await client.get(url)
            resp.raise_for_status()
            month_games = resp.json().get("games", [])

            for g in month_games:
                w = g.get("white", {}).get("username", "").lower()
                b = g.get("black", {}).get("username", "").lower()
                if w != username_lc and b != username_lc:
                    continue
                if rated is not None and bool(g.get("rated")) != bool(rated):
                    continue
                if not _perf_matches(g.get("time_class"), perf):
                    continue
                if (g.get("rules") or "").lower() != "chess":
                    continue
                if not _color_matches(g, username_lc, color):
                    continue
                if not _time_in_range(g, since_ms, until_ms):
                    continue

                yield g
                yielded += 1
                if yielded >= max_games:
                    return

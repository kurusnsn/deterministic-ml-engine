from typing import Any, Optional
import re
from urllib.parse import urlparse

PGN_TAG_RE = re.compile(r"^\[(?P<tag>[A-Za-z0-9_]+) \"(?P<value>.*)\"\]\s*$", re.MULTILINE)

def _pgn_get(pgn: Optional[str], tag: str) -> Optional[str]:
    if not pgn:
        return None
    # quick scan for a [Tag "..."] line
    for m in PGN_TAG_RE.finditer(pgn):
        if m.group('tag') == tag:
            return m.group('value')
    return None

def _to_time_control_from_clock(clock: Optional[dict]) -> Optional[str]:
    if not clock:
        return None
    try:
        initial = int(clock.get("initial", 0))  # seconds
        increment = int(clock.get("increment", 0))  # seconds
        return f"{initial}+{increment}"
    except Exception:
        return None


def _to_result_from_lichess(status: Optional[str], winner: Optional[str]) -> Optional[str]:
    if status == "draw":
        return "1/2-1/2"
    if winner == "white":
        return "1-0"
    if winner == "black":
        return "0-1"
    return None


def normalize_lichess(game: dict[str, Any]) -> dict[str, Any]:
    players = game.get("players", {})
    white = players.get("white", {})
    black = players.get("black", {})
    w_user = (white.get("user") or {}).get("name") or (white.get("user") or {}).get("id")
    b_user = (black.get("user") or {}).get("name") or (black.get("user") or {}).get("id")

    result = _to_result_from_lichess(game.get("status"), game.get("winner"))

    return {
        "source": "lichess.org",
        "id": game.get("id"),
        "url": game.get("url"),
        "site": "lichess.org",
        "rated": game.get("rated"),
        "perf": game.get("speed"),
        "time_control": _to_time_control_from_clock(game.get("clock")),
        "start_time": game.get("createdAt"),
        "end_time": game.get("lastMoveAt"),
        "white": {
            "username": w_user,
            "rating": white.get("rating"),
            "result": "win" if game.get("winner") == "white" else ("draw" if result == "1/2-1/2" else None),
            "color": "white",
        },
        "black": {
            "username": b_user,
            "rating": black.get("rating"),
            "result": "win" if game.get("winner") == "black" else ("draw" if result == "1/2-1/2" else None),
            "color": "black",
        },
        "result": result,
        "termination": game.get("status"),
        "opening_name": (game.get("opening") or {}).get("name"),
        "opening_eco": (game.get("opening") or {}).get("eco"),
        "pgn": game.get("pgn"),
    }


def _to_result_from_chesscom(white_result: Optional[str], black_result: Optional[str]) -> Optional[str]:
    w = (white_result or "").lower()
    b = (black_result or "").lower()

    if w == "win" or b in {"checkmated", "resigned", "timeout", "lose", "abandoned", "forfeit"}:
        return "1-0"
    if b == "win" or w in {"checkmated", "resigned", "timeout", "lose", "abandoned", "forfeit"}:
        return "0-1"
    if w in {"agreed", "stalemate", "draw"} or b in {"agreed", "stalemate", "draw"}:
        return "1/2-1/2"
    return None


def normalize_chesscom(game: dict[str, Any]) -> dict[str, Any]:
    white = game.get("white", {})
    black = game.get("black", {})
    result = _to_result_from_chesscom(white.get("result"), black.get("result"))

    # Prefer TimeControl from PGN if present, else JSON time_control
    pgn_tc = _pgn_get(game.get("pgn"), "TimeControl")
    json_tc = game.get("time_control")
    time_control = _normalize_time_control_chesscom(pgn_tc or json_tc)

    end_time_ms = None
    if isinstance(game.get("end_time"), int):
        end_time_ms = game["end_time"] * 1000

    start_time_ms = None
    if isinstance(game.get("start_time"), int):
        start_time_ms = game["start_time"] * 1000

    # Extract id from URL when possible
    cid = _id_from_url(game.get("url"))

    # Opening and ECO from PGN if present
    opening_name = _pgn_get(game.get("pgn"), "Opening")
    opening_eco = _pgn_get(game.get("pgn"), "ECO")

    # Termination from PGN, fallback to more specific player result if available
    termination = _pgn_get(game.get("pgn"), "Termination") or _derive_termination(white.get("result"), black.get("result"))

    return {
        "source": "chess.com",
        "id": cid,
        "url": game.get("url"),
        "site": "chess.com",
        "rated": game.get("rated"),
        "perf": game.get("time_class"),
        "time_control": time_control,
        "start_time": start_time_ms,
        "end_time": end_time_ms,
        "white": {
            "username": white.get("username"),
            "rating": white.get("rating"),
            "result": white.get("result"),  # keep granular result (e.g., resigned, checkmated)
            "color": "white",
        },
        "black": {
            "username": black.get("username"),
            "rating": black.get("rating"),
            "result": black.get("result"),
            "color": "black",
        },
        "result": result,
        "termination": termination,
        "opening_name": opening_name,
        "opening_eco": opening_eco,
        "pgn": game.get("pgn"),
    }


def _id_from_url(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    try:
        path = urlparse(url).path.rstrip('/')
        last = path.split('/')[-1]
        return last or None
    except Exception:
        return None


def _normalize_time_control_chesscom(tc: Optional[str]) -> Optional[str]:
    """
    Normalize Chess.com time control strings to "initial+increment" (seconds).
    Accepts typical forms:
      - "600+0" -> "600+0"
      - "600"   -> "600+0"
      - "1/86400" (daily) -> "0+86400"
    """
    if not tc:
        return None
    s = str(tc).strip()
    if "+" in s:
        initial, inc = s.split("+", 1)
        try:
            return f"{int(initial)}+{int(inc)}"
        except Exception:
            return s  # fallback
    if "/" in s:
        # moves/seconds -> treat as 0+seconds
        try:
            _, seconds = s.split("/", 1)
            return f"0+{int(seconds)}"
        except Exception:
            return s
    # only initial seconds
    try:
        return f"{int(s)}+0"
    except Exception:
        return s


def _derive_termination(wres: Optional[str], bres: Optional[str]) -> Optional[str]:
    w = (wres or "").lower()
    b = (bres or "").lower()
    # prioritize specific outcomes
    for term in ("resigned", "checkmated", "timeout", "abandoned", "forfeit"):
        if w == term or b == term:
            return term
    if w in {"agreed", "stalemate", "draw"} or b in {"agreed", "stalemate", "draw"}:
        return "draw"
    if w == "win":
        return "win"
    if b == "win":
        return "win"
    return None

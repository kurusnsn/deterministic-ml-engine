from fastapi import FastAPI, Body, HTTPException, Request
import chess
import chess.pgn
import logging
import time
from typing import Dict, Optional, List
import hashlib
from observability import (
    init_observability,
    instrument_fastapi,
    set_request_context,
    clear_request_context,
    record_http_metrics,
    start_event_loop_lag_monitor,
)

init_observability("eco")
logger = logging.getLogger(__name__)

app = FastAPI()
instrument_fastapi(app)


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or request.headers.get("x-requestid")
    route = f"{request.method} {request.url.path}"
    set_request_context(route, request_id, "eco")
    start = time.perf_counter()
    response = None
    try:
        response = await call_next(request)
        return response
    finally:
        route_obj = request.scope.get("route")
        route_path = getattr(route_obj, "path", request.url.path)
        route = f"{request.method} {route_path}"
        set_request_context(route, request_id, "eco")
        duration_ms = (time.perf_counter() - start) * 1000
        status_code = response.status_code if response else 500
        record_http_metrics(route, request.method, status_code, duration_ms)
        clear_request_context()

position_to_eco: Dict[str, Dict[str, str]] = {}
# New indexes for mainline lookups
eco_to_mainline: Dict[str, List[str]] = {}
name_to_mainline: Dict[str, List[str]] = {}
name_to_eco: Dict[str, str] = {}
_openings_cached: Optional[List[Dict]] = None

def position_hash(board: chess.Board) -> str:
    """
    Create a hash of the position that's independent of move order.
    Uses piece placement, castling rights, and side to move.
    """
    fen_parts = board.fen().split()

    position_key = f"{fen_parts[0]} {fen_parts[1]} {fen_parts[2]}"
    return hashlib.md5(position_key.encode()).hexdigest()[:16]

def load_eco():
    """Build a position->ECO index from eco.pgn"""
    global position_to_eco, eco_to_mainline, name_to_mainline, name_to_eco, _openings_cached
    position_to_eco = {}
    eco_to_mainline = {}
    name_to_mainline = {}
    name_to_eco = {}
    _openings_cached = None
    games_processed = 0
    positions_added = 0

    try:
        with open("eco.pgn", "r", encoding="utf-8") as f:
            while True:
                try:
                    game = chess.pgn.read_game(f)
                    if game is None:
                        break

                    eco = game.headers.get("ECO", "Unknown")
                    name = game.headers.get("Opening", "Unknown Opening")
                    variation = game.headers.get("Variation", "")
                    
                    full_name = f"{name}: {variation}" if variation else name

                    board = game.board()
                    games_processed += 1

                    # Record positions after each move in the main line
                    move_count = 0
                    san_moves: List[str] = []
                    for move in game.mainline_moves():
                        # SAN for the current move before pushing
                        try:
                            san = board.san(move)
                            san_moves.append(san)
                        except Exception:
                            pass
                        board.push(move)
                        move_count += 1
                        
                        pos_hash = position_hash(board)
                        
                        if pos_hash not in position_to_eco:
                            position_to_eco[pos_hash] = {
                                "eco": eco,
                                "name": full_name,
                                "moves": move_count
                            }
                            positions_added += 1

                    # Store representative mainline - keep LONGEST line for each ECO
                    if eco and san_moves:
                        if eco not in eco_to_mainline or len(san_moves) > len(eco_to_mainline[eco]):
                            eco_to_mainline[eco] = san_moves

                    # Store by full name (including variation) - always store, don't skip
                    key = full_name.lower()
                    if key and san_moves:
                        # Always store/update - prefer longer lines
                        if key not in name_to_mainline or len(san_moves) > len(name_to_mainline[key]):
                            name_to_mainline[key] = san_moves
                        if eco and key not in name_to_eco:
                            name_to_eco[key] = eco

                except Exception as e:
                    logger.warning(f"Error processing game {games_processed + 1}: {e}")
                    continue

    except FileNotFoundError:
        # Graceful: allow service to run without eco.pgn (empty indexes)
        logger.warning("eco.pgn file not found — ECO endpoints will return empty results")
        position_to_eco = {}
        eco_to_mainline = {}
        name_to_mainline = {}
        name_to_eco = {}
        return
    except Exception as e:
        logger.error(f"Error loading ECO database: {e}")
        raise

    logger.info(f"Loaded {games_processed} games, {positions_added} unique positions")
    # build cached openings list lazily (on first /openings request)

@app.on_event("startup")
async def startup():
    await start_event_loop_lag_monitor()
    load_eco()

@app.post("/eco")
def get_opening(payload: dict = Body(...)):
    """
    Get opening information for a given FEN position
    """
    fen = payload.get("fen")
    if not fen:
        return {"error": "FEN string required", "name": "Unknown Opening"}
    
    try:
        # Validate FEN
        board = chess.Board(fen)
        pos_hash = position_hash(board)
        
        result = position_to_eco.get(pos_hash)
        if result:
            return {
                "eco": result["eco"],
                "name": result["name"],
                "moves_deep": result["moves"],
                "found": True
            }
        else:
            return {
                "name": "Unknown Opening",
                "eco": None,
                "found": False
            }
            
    except ValueError as e:
        return {"error": f"Invalid FEN: {str(e)}", "name": "Unknown Opening"}
    except Exception as e:
        logger.error(f"Error processing FEN {fen}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/stats")
def get_stats():
    """Get statistics about the loaded ECO database"""
    return {
        "total_positions": len(position_to_eco),
        "sample_openings": list(set([pos["name"] for pos in list(position_to_eco.values())[:10]]))
    }

@app.get("/healthz")
def health():
    return {
        "ok": True,
        "openings_loaded": len(position_to_eco),
        "service": "eco"
    }

@app.post("/search")
def search_opening(payload: dict = Body(...)):
    """
    Search for openings by name (partial match)
    """
    query = payload.get("query", "").lower()
    if not query:
        return {"error": "Query string required"}
    
    matches = []
    seen_names = set()
    
    for pos_data in position_to_eco.values():
        name = pos_data["name"]
        if query in name.lower() and name not in seen_names:
            matches.append({
                "eco": pos_data["eco"],
                "name": name
            })
            seen_names.add(name)
            
        if len(matches) >= 20:  # Limit results
            break
    
    return {"matches": matches, "count": len(matches)}


@app.get("/openings")
def get_all_openings(max_moves: int = 16, limit: Optional[int] = None):
    """
    Return all known openings with representative mainline (san), derived from eco.pgn.
    Results are cached in memory; use query params to control slicing and count.
    """
    global _openings_cached
    items: List[Dict]
    if _openings_cached is None:
        # Build once from name_to_mainline to keep unique-by-name entries
        items = []
        for name, san in name_to_mainline.items():
            items.append({
                "name": name,
                "eco": name_to_eco.get(name),
                "san_full": san,  # keep full; slicing applied per request
            })
        _openings_cached = items
    else:
        items = _openings_cached

    # Shape output per request
    shaped = []
    for it in items:
        shaped.append({
            "name": it["name"],
            "eco": it.get("eco"),
            "san": it.get("san_full", [])[: max_moves if (max_moves and max_moves > 0) else None],
        })
    if isinstance(limit, int) and limit > 0:
        shaped = shaped[:limit]
    return {"count": len(shaped), "openings": shaped}


@app.post("/eco/mainline")
def get_opening_mainline(payload: dict = Body(...)):
    """
    Return a representative mainline (SAN moves) for a given opening.
    Accepts:
      - eco: exact ECO code (e.g., "B20")
      - name: opening name (exact, case-insensitive)
      - query: partial name search fallback
      - max_moves: limit number of SAN moves returned (default 16)
    """
    eco = (payload.get("eco") or "").strip()
    name = (payload.get("name") or "").strip().lower()
    query = (payload.get("query") or "").strip().lower()
    max_moves = int(payload.get("max_moves") or 16)

    def limit(moves: List[str]) -> List[str]:
        return moves[:max_moves] if max_moves and max_moves > 0 else moves

    # 1) Try by exact ECO code
    if eco and eco in eco_to_mainline:
        line = eco_to_mainline.get(eco, [])
        # find a display name if possible
        disp_name = None
        # attempt to find a name with this eco
        for n, e in name_to_eco.items():
            if e == eco:
                disp_name = n
                break
        return {"eco": eco, "name": disp_name, "san": limit(line), "found": True}

    # 2) Try exact name match
    if name and name in name_to_mainline:
        line = name_to_mainline[name]
        eco_code = name_to_eco.get(name)
        return {"eco": eco_code, "name": name, "san": limit(line), "found": True}

    # 3) Partial name search
    if query:
        for n, line in name_to_mainline.items():
            if query in n:
                eco_code = name_to_eco.get(n)
                return {"eco": eco_code, "name": n, "san": limit(line), "found": True}

    return {"found": False, "san": []}

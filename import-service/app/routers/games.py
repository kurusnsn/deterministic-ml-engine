from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import json
import logging
import time
from app.services import lichess, chesscom
from app.services import parser as game_parser
from app.models.game import FetchRequest, NormalizedGame
from urllib.parse import urlparse
from observability import record_external_api_duration

logger = logging.getLogger(__name__)

router = APIRouter()


# SECURITY INPUT-4: SSRF Protection - URL Allowlist
ALLOWED_DOMAINS = [
    "lichess.org",
    "www.lichess.org",
    "chess.com",
    "www.chess.com",
]


def validate_url_for_ssrf(url: str) -> bool:
    """
    Validate URL against SSRF attacks.
    
    Rejects:
    - IP literals (IPv4 and IPv6)
    - localhost and loopback
    - Private network ranges (10.x, 192.168.x, 172.16-31.x)
    - Link-local addresses (169.254.x)
    - Cloud metadata endpoints (169.254.169.254)
    - Non-allowed domains
    
    Returns True if URL is safe, raises HTTPException if not.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid URL format")
    
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="URL must have a hostname")
    
    # Block IP literals
    import re
    # IPv4 pattern
    if re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', hostname):
        raise HTTPException(status_code=400, detail="IP addresses not allowed")
    # IPv6 pattern (simplified)
    if ':' in hostname or hostname.startswith('['):
        raise HTTPException(status_code=400, detail="IPv6 addresses not allowed")
    
    # Block localhost and loopback
    blocked_hosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1']
    if hostname.lower() in blocked_hosts:
        raise HTTPException(status_code=400, detail="localhost not allowed")
    
    # Block private network ranges
    private_prefixes = ['10.', '192.168.', '172.16.', '172.17.', '172.18.', 
                        '172.19.', '172.20.', '172.21.', '172.22.', '172.23.',
                        '172.24.', '172.25.', '172.26.', '172.27.', '172.28.',
                        '172.29.', '172.30.', '172.31.', '169.254.']
    for prefix in private_prefixes:
        if hostname.startswith(prefix):
            raise HTTPException(status_code=400, detail="Private network addresses not allowed")
    
    # Check allowlist
    if not any(hostname.endswith(domain) for domain in ALLOWED_DOMAINS):
        raise HTTPException(
            status_code=400, 
            detail=f"Domain not allowed. Supported: lichess.org, chess.com"
        )
    
    return True


@router.post("/fetch")
async def fetch_games(req: FetchRequest):
    """
    Import games from Lichess or Chess.com based on source, username, and filters.
    """

    if req.source == "lichess.org":
        try:
            games = await lichess.fetch_games(req.username, req.filters.dict())
            if req.normalize:
                games = [game_parser.normalize_lichess(g) for g in games]
            return {"source": req.source, "count": len(games), "games": games}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Lichess fetch failed: {str(e)}")

    elif req.source == "chess.com":
        try:
            games = await chesscom.fetch_games(req.username, req.filters.dict())
            if req.normalize:
                games = [game_parser.normalize_chesscom(g) for g in games]
            return {"source": req.source, "count": len(games), "games": games}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Chess.com fetch failed: {str(e)}")

    else:
        raise HTTPException(status_code=400, detail="Unsupported source. Use 'lichess.org' or 'chess.com'.")


@router.post("/fetch/stream")
async def fetch_games_stream(req: FetchRequest):
    """
    Stream games as NDJSON for dynamic UI updates.
    Enforces standard-only (variants excluded) and honors filters.
    """

    async def gen():
        try:
            if req.source == "lichess.org":
                async for g in lichess.fetch_games_stream(req.username, req.filters.dict()):
                    item = game_parser.normalize_lichess(g) if req.normalize else g
                    yield json.dumps(item) + "\n"
            elif req.source == "chess.com":
                async for g in chesscom.fetch_games_stream(req.username, req.filters.dict()):
                    item = game_parser.normalize_chesscom(g) if req.normalize else g
                    yield json.dumps(item) + "\n"
            else:
                yield json.dumps({"error": "Unsupported source"}) + "\n"
        except Exception as e:
            # Surface an error line for the client to handle gracefully
            yield json.dumps({"error": str(e)}) + "\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson")


@router.post("/fetch-by-url")
async def fetch_game_by_url(payload: dict):
    """
    Fetch a single game by URL from Lichess or Chess.com.
    Expected payload: {"url": "...", "source": "lichess.org"|"chess.com"}
    
    SECURITY INPUT-4: URL validated against SSRF allowlist.
    """
    url = payload.get("url")
    source = payload.get("source")
    
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    # SECURITY INPUT-4: Validate URL before any network request
    validate_url_for_ssrf(url)
    
    if source == "lichess.org" or "lichess.org" in url:
        # Extract game ID from Lichess URL
        import re
        match = re.search(r'lichess\.org/([a-zA-Z0-9]{8,12})', url)
        if not match:
            raise HTTPException(status_code=400, detail="Invalid Lichess URL")
        
        game_id = match.group(1)
        
        try:
            # Fetch PGN from Lichess
            import httpx
            async with httpx.AsyncClient() as client:
                request_start = time.perf_counter()
                response = await client.get(f"https://lichess.org/game/export/{game_id}?evals=true&clocks=true")
                record_external_api_duration("lichess", (time.perf_counter() - request_start) * 1000)
                response.raise_for_status()
                pgn = response.text
                
            return {"pgn": pgn, "source": "lichess.org"}
        except Exception as e:
            logger.info(f"ERROR: Lichess fetch failed for ID {game_id}: {str(e)}")
            import traceback
            logger.info(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Failed to fetch from Lichess: {str(e)}")
    
    elif source == "chess.com" or "chess.com" in url:
        # For Chess.com, we need to extract the game ID and fetch via their API
        # Supports: chess.com/game/live/123, chess.com/game/daily/123, chess.com/game/123
        import re
        # Support both /game/live/ID and /live#g=ID
        match = re.search(r'chess\.com/(?:game/(?:(live|daily)/)?|live#g=)(\d+)', url)
        if not match:
            # Last resort: just look for any sequence of 10+ digits after chess.com
            match = re.search(r'chess\.com/.*[=/](\d{9,20})', url)
            
        if not match:
            logger.info(f"DEBUG: Failed to parse Chess.com URL: {url}")
            raise HTTPException(status_code=400, detail="Invalid Chess.com URL")
        
        # The last matched group is always the game ID digits
        game_id = match.group(match.lastindex)
        # The first group is the game type (live/daily), if it matched
        game_type = match.group(1) if match.lastindex >= 2 and match.group(1) else ("daily" if "daily" in url else "live")
        
        logger.info(f"DEBUG: Chess.com game_id={game_id}, game_type={game_type}")
        
        try:
            # Chess.com has a direct game data endpoint
            import httpx
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            }
            async with httpx.AsyncClient(headers=headers) as client:
                # Try the direct game endpoint
                callback_url = f"https://www.chess.com/callback/{game_type}/game/{game_id}"
                request_start = time.perf_counter()
                response = await client.get(callback_url)
                record_external_api_duration("chess.com", (time.perf_counter() - request_start) * 1000)
                response.raise_for_status()
                game_data = response.json()
                
                # 1) Try to extract PGN directly
                if "game" in game_data and game_data["game"].get("pgn"):
                    pgn = game_data["game"]["pgn"]
                    return {"pgn": pgn, "source": "chess.com"}
                
                # 2) Fallback: Fetch from public API using metadata from callback
                # Extract username and date (YYYY.MM.DD)
                players = game_data.get("players", {})
                white = players.get("bottom", {}).get("username") or players.get("white", {}).get("username")
                black = players.get("top", {}).get("username") or players.get("black", {}).get("username")
                
                pgn_headers = game_data.get("game", {}).get("pgnHeaders", {})
                date_str = pgn_headers.get("Date")
                
                username = white or black
                if username and date_str and "." in date_str:
                    parts = date_str.split(".")
                    if len(parts) >= 2:
                        year, month = parts[0], parts[1]
                        # Official API expects lowercase username
                        archive_url = f"https://api.chess.com/pub/player/{username.lower()}/games/{year}/{month}"
                        archive_start = time.perf_counter()
                        archive_resp = await client.get(archive_url, follow_redirects=True)
                        record_external_api_duration("chess.com", (time.perf_counter() - archive_start) * 1000)
                        if archive_resp.status_code == 200:
                            matches = archive_resp.json().get("games", [])
                            for g in matches:
                                if str(game_id) in g.get("url", ""):
                                    return {"pgn": g["pgn"], "source": "chess.com"}
                
                raise HTTPException(status_code=500, detail="No PGN found in Chess.com response or public archives")
        except Exception as e:
            logger.info(f"ERROR: Chess.com fetch failed for ID {game_id}: {str(e)}")
            import traceback
            logger.info(traceback.format_exc())
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=f"Failed to fetch from Chess.com: {str(e)}")
    
    else:
        raise HTTPException(status_code=400, detail="Unsupported source or URL")

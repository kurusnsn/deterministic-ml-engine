from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx, re, math, hashlib, os, json
from typing import List, Optional
from urllib.parse import quote
from datetime import timedelta
import redis

# Connect to Redis
redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
r = redis.from_url(redis_url)

app = FastAPI()

class OpeningRequest(BaseModel):
    moves: List[str]  # SAN moves ["e4","e5","Nf3"]

class OpeningResponse(BaseModel):
    content: Optional[str]
    title: Optional[str]
    cached: bool = False

def ply_prefix(ply: int) -> str:
    num = math.floor((ply + 1) / 2)
    return f"{num}." if ply % 2 == 1 else f"{num}..."

def create_wikibooks_path(moves: List[str]) -> str:
    if not moves or len(moves) > 30:
        return ""
    parts = []
    for i, move in enumerate(moves):
        clean = re.sub(r"[+!#?]", "", move)
        parts.append(f"{ply_prefix(i+1)}{clean}")
    path = "/".join(parts)
    return path if len(path) <= 230 else ""  # limit for title length

def get_cache_key(path: str) -> str:
    return hashlib.md5(path.encode()).hexdigest()

def get_cached(path: str) -> Optional[dict]:
    val = r.get(get_cache_key(path))
    return json.loads(val) if val else None

def set_cache(path: str, content: str, title: str):
    data = {"content": content, "title": title, "cached": True}
    r.setex(get_cache_key(path), timedelta(hours=24), json.dumps(data))

def transform_html(html: str, title: str) -> str:
    html = re.sub(r"<h1>.+</h1>", "", html, flags=re.DOTALL)
    html = re.sub(r"<p>(<br />|\s)*</p>", "", html)
    html = html.replace('<h2><span id="Theory_table">Theory table</span></h2>', "")
    html = re.sub(
        r"For explanation of theory tables see theory table and for notation see algebraic notation.?",
        "",
        html,
    )
    html = html.replace(
        "When contributing to this Wikibook, please follow the Conventions for organization.",
        "",
    )
    return (
        html
        + f'<p><a target="_blank" href="https://en.wikibooks.org/wiki/{title}">Read more on WikiBooks</a></p>'
    )

@app.post("/opening-theory", response_model=OpeningResponse)
async def get_opening_theory(req: OpeningRequest):
    print(f"OpeningBook: Received request with moves: {req.moves}")
    path = create_wikibooks_path(req.moves)
    print(f"OpeningBook: Created path: '{path}'")
    if not path:
        print("OpeningBook: No path created, returning empty response")
        return OpeningResponse(content=None, title=None)

    cached = get_cached(path)
    if cached:
        print(f"OpeningBook: Returning cached data for path: {path}")
        return OpeningResponse(**cached)

    title = f"Chess_Opening_Theory/{path}"
    url = f"https://en.wikibooks.org/w/api.php?titles={quote(title)}&redirects&origin=*&action=query&prop=extracts&formatversion=2&format=json&exchars=1200&stable=1"
    print(f"OpeningBook: Fetching from WikiBooks URL: {url}")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            print(f"OpeningBook: WikiBooks API response: {data}")
            page = data.get("query", {}).get("pages", [{}])[0]
            if page.get("missing") or not page.get("extract"):
                print(f"OpeningBook: Page missing or no extract found for: {title}")
                return OpeningResponse(content=None, title=None)

            html = transform_html(page["extract"], title)
            set_cache(path, html, title)
            print(f"OpeningBook: Returning content for: {title}")
            return OpeningResponse(content=html, title=title, cached=False)

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="WikiBooks timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")

@app.get("/cache-stats")
async def cache_stats():
    return {"cached_keys": r.dbsize()}

@app.get("/health")
async def health():
    return {"status": "ok", "service": "opening-book-standalone", "note": "This might be the wrong service"}

@app.get("/test-path")
async def test_path(moves: str = "e4"):
    """Test endpoint to see what path gets generated"""
    move_list = moves.split(",")
    path = create_wikibooks_path(move_list)
    title = f"Chess_Opening_Theory/{path}" if path else None
    return {
        "moves": move_list,
        "path": path,
        "title": title,
        "url": f"https://en.wikibooks.org/w/api.php?titles={quote(title)}&redirects&origin=*&action=query&prop=extracts&formatversion=2&format=json&exchars=1200&stable=1" if title else None
    }

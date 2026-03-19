import argparse
import asyncio
import json
from typing import Optional

import httpx


async def main():
    parser = argparse.ArgumentParser(description="Test /games/fetch for Chess.com")
    parser.add_argument("--username", required=True, help="Chess.com username")
    parser.add_argument("--host", default="http://localhost:8000", help="Import service base URL")
    parser.add_argument("--max", type=int, default=10, help="Max games to fetch")
    parser.add_argument("--perfType", choices=["bullet", "blitz", "rapid", "daily"], default=None)
    parser.add_argument("--color", choices=["white", "black"], default=None)
    parser.add_argument("--rated", choices=["true", "false"], default=None)
    parser.add_argument("--since", type=int, default=None, help="Since timestamp (ms)")
    parser.add_argument("--until", type=int, default=None, help="Until timestamp (ms)")

    args = parser.parse_args()

    filters = {"max": args.max}
    if args.perfType:
        filters["perfType"] = args.perfType
    if args.color:
        filters["color"] = args.color
    if args.rated is not None:
        filters["rated"] = args.rated == "true"
    if args.since is not None:
        filters["since"] = args.since
    if args.until is not None:
        filters["until"] = args.until

    payload = {
        "source": "chess.com",
        "username": args.username,
        "filters": filters,
    }

    url = f"{args.host}/games/fetch"
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(url, json=payload)
        print(f"Status: {r.status_code}")
        try:
            data = r.json()
        except Exception:
            print(r.text)
            return
        print(json.dumps({
            "source": data.get("source"),
            "count": data.get("count"),
            "sample_game_keys": list(data.get("games", [{}])[0].keys()) if data.get("games") else [],
        }, indent=2))


if __name__ == "__main__":
    asyncio.run(main())


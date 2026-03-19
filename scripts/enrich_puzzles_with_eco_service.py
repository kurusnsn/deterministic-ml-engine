"""
Enrich puzzles with ECO metadata using the ECO service API.

This script fetches puzzles without ECO data and uses the eco-service
to classify them based on their FEN position.

Usage:
    python scripts/enrich_puzzles_with_eco_service.py

Environment variables:
    DATABASE_URL    - Postgres connection string (required)
    ECO_SERVICE_URL - URL of ECO service (default: http://localhost:5002)
    BATCH_SIZE      - Number of puzzles to process in parallel (default: 50)
"""

import asyncio
import os
from typing import Optional, Dict, Any

import asyncpg
import httpx

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://your_db_user:your_db_password@localhost:5432/ostadchess")
ECO_SERVICE_URL = os.getenv("ECO_SERVICE_URL", "http://localhost:5002")
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "50"))


async def classify_position(client: httpx.AsyncClient, fen: str) -> Optional[Dict[str, Any]]:
    """Classify a position using the ECO service."""
    try:
        response = await client.post(
            f"{ECO_SERVICE_URL}/eco",
            json={"fen": fen},
            timeout=5.0
        )
        if response.status_code == 200:
            data = response.json()
            # Only return if found
            if data.get("found"):
                # Parse the name to extract opening and variation
                full_name = data.get("name", "")
                if ": " in full_name:
                    opening, variation = full_name.split(": ", 1)
                else:
                    opening = full_name
                    variation = None

                return {
                    "eco": data.get("eco"),
                    "name": opening,
                    "variation": variation
                }
    except Exception as e:
        pass  # Silent fail for individual puzzles
    return None


async def enrich_puzzles():
    """Enrich puzzles with ECO data from the ECO service."""
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable must be set.")

    conn = await asyncpg.connect(DATABASE_URL)

    try:
        # Get count of puzzles without ECO
        total_without_eco = await conn.fetchval(
            "SELECT COUNT(*) FROM puzzles WHERE eco IS NULL OR eco = ''"
        )
        print(f"Found {total_without_eco} puzzles without ECO classification")

        if total_without_eco == 0:
            print("All puzzles already have ECO data!")
            return

        processed = 0
        updated = 0

        async with httpx.AsyncClient() as client:
            while True:
                # Fetch batch of puzzles without ECO
                puzzles = await conn.fetch(
                    """
                    SELECT id, fen
                    FROM puzzles
                    WHERE eco IS NULL OR eco = ''
                    LIMIT $1
                    """,
                    BATCH_SIZE
                )

                if not puzzles:
                    break

                # Process batch in parallel
                tasks = [classify_position(client, puzzle['fen']) for puzzle in puzzles]
                results = await asyncio.gather(*tasks)

                # Update database with results
                updates = []
                for puzzle, result in zip(puzzles, results):
                    processed += 1
                    if result and result.get('eco'):
                        updates.append((
                            result.get('eco'),
                            result.get('name'),
                            result.get('variation'),
                            puzzle['id']
                        ))

                if updates:
                    await conn.executemany(
                        """
                        UPDATE puzzles
                        SET eco = $1, opening = $2, variation = $3
                        WHERE id = $4
                        """,
                        updates
                    )
                    updated += len(updates)

                print(f"Processed {processed}/{total_without_eco} puzzles, updated {updated}...", end='\r')

        print(f"\nFinished! Processed {processed} puzzles, updated {updated} with ECO data")

    finally:
        await conn.close()


def main():
    asyncio.run(enrich_puzzles())


if __name__ == "__main__":
    main()

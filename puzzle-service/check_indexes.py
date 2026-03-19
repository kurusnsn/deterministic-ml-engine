import asyncio
import os
import asyncpg

DATABASE_URL = os.getenv("DATABASE_URL")

async def check_indexes():
    if not DATABASE_URL:
        print("DATABASE_URL not set")
        return

    try:
        conn = await asyncpg.connect(DATABASE_URL)
        rows = await conn.fetch("""
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'puzzles';
        """)
        
        print(f"Found {len(rows)} indexes on 'puzzles' table:")
        for row in rows:
            print(f"- {row['indexname']}: {row['indexdef']}")
            
        await conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(check_indexes())

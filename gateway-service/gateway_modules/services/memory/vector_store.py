"""
Vector store module for Personal Trainer feature.
Handles vector embeddings and semantic search over game summaries using pgvector.
"""

import os
import json
import asyncpg
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import httpx


# OpenAI embedding model - using ada-002 for 1536-dimension vectors
EMBEDDING_MODEL = "text-embedding-ada-002"
EMBEDDING_DIMENSION = 1536


@dataclass
class GameDocument:
    """A game document retrieved from vector search."""
    game_id: str
    user_id: str
    summary_text: str
    metadata: Dict[str, Any]
    similarity_score: float = 0.0


async def get_embedding(text: str) -> List[float]:
    """
    Generate embedding for text using OpenAI's embedding API.
    
    Args:
        text: Text to embed
        
    Returns:
        List of floats representing the embedding vector
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set in environment")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": EMBEDDING_MODEL,
                "input": text
            }
        )
        response.raise_for_status()
        data = response.json()
        return data["data"][0]["embedding"]


async def init_vector_store(pool: asyncpg.Pool) -> None:
    """
    Ensure pgvector extension is enabled and tables exist.
    This is called on app startup.
    
    Args:
        pool: Database connection pool
    """
    async with pool.acquire() as conn:
        # Check if pgvector extension exists
        try:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        except Exception as e:
            print(f"Warning: Could not create pgvector extension: {e}")
            print("Vector search may not be available. Ensure pgvector is installed.")


async def index_game_summary(
    pool: asyncpg.Pool,
    user_id: str,
    game_id: int,
    summary_text: str,
    metadata: Dict[str, Any]
) -> None:
    """
    Generate embedding for a game summary and store in vector table.
    
    Args:
        pool: Database connection pool
        user_id: User ID who owns the game
        game_id: Game ID
        summary_text: 2-4 sentence summary of the game
        metadata: Dictionary with time_control_bucket, side, played_at, etc.
    """
    # Generate embedding
    try:
        embedding = await get_embedding(summary_text)
    except Exception as e:
        print(f"Failed to generate embedding for game {game_id}: {e}")
        return
    
    # Store in database
    async with pool.acquire() as conn:
        # Upsert embedding
        await conn.execute(
            """
            INSERT INTO game_embeddings (user_id, game_id, summary_text, embedding, metadata)
            VALUES ($1, $2, $3, $4::vector, $5)
            ON CONFLICT (game_id) DO UPDATE SET
                summary_text = EXCLUDED.summary_text,
                embedding = EXCLUDED.embedding,
                metadata = EXCLUDED.metadata
            """,
            user_id,
            game_id,
            summary_text,
            f"[{','.join(str(x) for x in embedding)}]",
            json.dumps(metadata)
        )
        
        # Update games.memory_indexed_at
        await conn.execute(
            "UPDATE games SET memory_indexed_at = NOW() WHERE id = $1",
            game_id
        )


async def search_user_games(
    pool: asyncpg.Pool,
    user_id: str,
    query_text: str,
    filters: Optional[Dict[str, Any]] = None,
    k: int = 20
) -> List[GameDocument]:
    """
    Search for games semantically similar to query text.
    Always filters by user_id for security.
    
    Args:
        pool: Database connection pool
        user_id: User ID to filter by (required for security)
        query_text: Text to search for
        filters: Optional filters for time_control_bucket, side, themes, result
        k: Number of results to return
        
    Returns:
        List of GameDocument objects sorted by similarity
    """
    filters = filters or {}
    
    # Generate query embedding
    try:
        query_embedding = await get_embedding(query_text)
    except Exception as e:
        print(f"Failed to generate query embedding: {e}")
        return []
    
    # Build query with filters
    # Start with base query using cosine similarity
    query = """
        SELECT 
            game_id,
            user_id,
            summary_text,
            metadata,
            1 - (embedding <=> $1::vector) as similarity
        FROM game_embeddings
        WHERE user_id = $2
    """
    params: List[Any] = [
        f"[{','.join(str(x) for x in query_embedding)}]",
        user_id
    ]
    param_idx = 3
    
    # Add optional filters based on metadata JSONB
    if filters.get("time_control_bucket"):
        query += f" AND metadata->>'time_control_bucket' = ${param_idx}"
        params.append(filters["time_control_bucket"])
        param_idx += 1
    
    if filters.get("side"):
        query += f" AND metadata->>'side' = ${param_idx}"
        params.append(filters["side"])
        param_idx += 1
    
    if filters.get("result"):
        query += f" AND metadata->>'result' = ${param_idx}"
        params.append(filters["result"])
        param_idx += 1
    
    # Order by similarity and limit
    query += f" ORDER BY embedding <=> $1::vector LIMIT ${param_idx}"
    params.append(k)
    
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
    
    results = []
    for row in rows:
        doc = GameDocument(
            game_id=str(row["game_id"]),
            user_id=str(row["user_id"]),
            summary_text=row["summary_text"],
            metadata=json.loads(row["metadata"]) if isinstance(row["metadata"], str) else row["metadata"],
            similarity_score=float(row["similarity"])
        )
        results.append(doc)
    
    return results


async def get_unindexed_games(
    pool: asyncpg.Pool,
    user_id: str,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """
    Get games that haven't been indexed for memory yet.
    
    Args:
        pool: Database connection pool
        user_id: User ID
        limit: Maximum number of games to return
        
    Returns:
        List of game records that need indexing
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, pgn, source, time_control, result, opponent_username,
                   played_at, opening_eco, opening_name, provider
            FROM games
            WHERE user_id = $1
              AND memory_indexed_at IS NULL
            ORDER BY played_at DESC
            LIMIT $2
            """,
            user_id,
            limit
        )
        return [dict(r) for r in rows]


async def count_indexed_games(
    pool: asyncpg.Pool,
    user_id: str,
    time_control_bucket: Optional[str] = None,
    side: Optional[str] = None
) -> int:
    """
    Count how many games have been indexed for a user.
    
    Args:
        pool: Database connection pool
        user_id: User ID
        time_control_bucket: Optional filter
        side: Optional filter
        
    Returns:
        Number of indexed games
    """
    query = "SELECT COUNT(*) FROM game_embeddings WHERE user_id = $1"
    params: List[Any] = [user_id]
    param_idx = 2
    
    if time_control_bucket:
        query += f" AND metadata->>'time_control_bucket' = ${param_idx}"
        params.append(time_control_bucket)
        param_idx += 1
    
    if side:
        query += f" AND metadata->>'side' = ${param_idx}"
        params.append(side)
        param_idx += 1
    
    async with pool.acquire() as conn:
        count = await conn.fetchval(query, *params)
        return count or 0

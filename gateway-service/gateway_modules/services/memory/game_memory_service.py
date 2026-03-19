"""
Game memory service for Personal Trainer feature.
Handles per-game summarization and indexing into the vector store.
"""

import os
import json
import asyncpg
import httpx
from typing import Dict, Any, Optional, List
from datetime import datetime

from .vector_store import index_game_summary


# Time control buckets
TIME_CONTROL_BUCKETS = {
    "bullet": 180,      # < 3 min
    "blitz": 600,       # 3-10 min
    "rapid": 1800,      # 10-30 min
    "classical": None   # 30+ min
}


def classify_time_control(time_control: Optional[str]) -> str:
    """
    Classify a time control string into a bucket.
    
    Args:
        time_control: Time control string like "180+0" or "blitz"
        
    Returns:
        Bucket name: 'bullet', 'blitz', 'rapid', or 'classical'
    """
    if not time_control:
        return "blitz"  # Default
    
    tc = time_control.lower()
    
    # Handle named formats
    if "bullet" in tc:
        return "bullet"
    if "blitz" in tc:
        return "blitz"
    if "rapid" in tc:
        return "rapid"
    if "classical" in tc or "standard" in tc:
        return "classical"
    
    # Parse numeric format (e.g., "180+0", "600")
    try:
        import re
        match = re.match(r"(\d+)(?:\+(\d+))?", tc)
        if match:
            base_time = int(match.group(1))
            increment = int(match.group(2) or 0)
            # Effective time = base + 40 * increment
            effective_time = base_time + (40 * increment)
            
            if effective_time < 180:
                return "bullet"
            elif effective_time < 600:
                return "blitz"
            elif effective_time < 1800:
                return "rapid"
            else:
                return "classical"
    except Exception:
        pass
    
    return "blitz"  # Default fallback


def extract_user_color(pgn: str, user_id: str) -> str:
    """
    Extract which color the user played from PGN.
    For now, returns 'white' as default. In production, would check game metadata.
    
    Args:
        pgn: PGN string
        user_id: User ID
        
    Returns:
        'white' or 'black'
    """
    # TODO: Implement proper extraction based on linked accounts
    # For now, check PGN headers if we have a username mapping
    return "white"  # Default


def build_game_summary_input(game: Dict[str, Any], analysis: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Build structured input for game summarization from existing game and analysis data.
    Uses only existing data, no new computations.
    
    Args:
        game: Game record from database
        analysis: Optional analysis data from repertoire service
        
    Returns:
        Dictionary with all fields needed for LLM summarization
    """
    time_control_bucket = classify_time_control(game.get("time_control"))
    
    # Extract result
    result = game.get("result", "")
    result_normalized = "unknown"
    if result in ["1-0", "win"]:
        result_normalized = "win"
    elif result in ["0-1", "loss"]:
        result_normalized = "loss"
    elif result in ["1/2-1/2", "draw"]:
        result_normalized = "draw"
    
    # Build base input from game data
    input_data = {
        "game_id": game.get("id"),
        "time_control_bucket": time_control_bucket,
        "time_control_raw": game.get("time_control", ""),
        "side": extract_user_color(game.get("pgn", ""), str(game.get("user_id", ""))),
        "opponent_username": game.get("opponent_username", "Unknown"),
        "result": result_normalized,
        "played_at": game.get("played_at"),
        "opening_eco": game.get("opening_eco", ""),
        "opening_name": game.get("opening_name", "Unknown Opening"),
        "source": game.get("source", game.get("provider", "unknown")),
    }
    
    # Add analysis data if available
    if analysis:
        input_data.update({
            "has_blunders": analysis.get("blunder_count", 0) > 0,
            "blunder_count": analysis.get("blunder_count", 0),
            "has_brilliants": analysis.get("brilliant_count", 0) > 0,
            "brilliant_count": analysis.get("brilliant_count", 0),
            "is_comeback": analysis.get("is_comeback", False),
            "is_saved_draw": analysis.get("is_saved_draw", False),
            "avg_centipawn_loss": analysis.get("avg_centipawn_loss"),
            "accuracy": analysis.get("accuracy"),
            "move_count": analysis.get("move_count", 0),
        })
    else:
        # Defaults when no analysis available
        input_data.update({
            "has_blunders": False,
            "blunder_count": 0,
            "has_brilliants": False,
            "brilliant_count": 0,
            "is_comeback": False,
            "is_saved_draw": False,
            "avg_centipawn_loss": None,
            "accuracy": None,
            "move_count": None,
        })
    
    return input_data


async def summarize_game_for_memory(game_input: Dict[str, Any]) -> str:
    """
    Generate a 2-4 sentence summary of a game for memory indexing.
    Uses the existing LLM infrastructure (Modal/OpenAI fallback).
    
    IMPORTANT: The LLM is instructed to ONLY use provided fields and
    NEVER invent move sequences, evaluations, or tactical patterns.
    
    Args:
        game_input: Structured input from build_game_summary_input()
        
    Returns:
        Short summary string for vector indexing
    """
    # Build prompt with strict instructions
    prompt = f"""You are summarizing a chess game for later retrieval. Write a concise 2-4 sentence summary.

STRICT RULES:
- ONLY use the information provided below
- NEVER invent move sequences, evaluations, or specific positions
- Focus on: time control, opening, result, and any notable features (blunders, brilliants, comebacks)

GAME DATA:
- Time Control: {game_input.get('time_control_bucket', 'unknown')} ({game_input.get('time_control_raw', '')})
- Color Played: {game_input.get('side', 'unknown')}
- Opponent: {game_input.get('opponent_username', 'Unknown')}
- Result: {game_input.get('result', 'unknown')}
- Opening: {game_input.get('opening_name', 'Unknown')} ({game_input.get('opening_eco', '')})
- Blunders: {game_input.get('blunder_count', 0)}
- Brilliants: {game_input.get('brilliant_count', 0)}
- Comeback Win: {game_input.get('is_comeback', False)}
- Saved Draw: {game_input.get('is_saved_draw', False)}

Write a brief factual summary (2-4 sentences):"""

    # Try Modal LLM first, fall back to OpenAI
    llm_url = os.getenv("LLM_URL")
    api_key = os.getenv("OPENAI_API_KEY")
    
    try:
        if llm_url:
            # Try Modal endpoint
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    llm_url,
                    json={
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 200,
                        "temperature": 0.3
                    }
                )
                if response.status_code == 200:
                    data = response.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    if content:
                        return content.strip()
        
        # Fallback to OpenAI
        if api_key:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 200,
                        "temperature": 0.3
                    }
                )
                response.raise_for_status()
                data = response.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                if content:
                    return content.strip()
    
    except Exception as e:
        print(f"LLM summarization failed: {e}")
    
    # Ultimate fallback: generate deterministic summary
    return _generate_fallback_summary(game_input)


def _generate_fallback_summary(game_input: Dict[str, Any]) -> str:
    """Generate a simple deterministic summary when LLM fails."""
    parts = []
    
    # Time control and opening
    tc = game_input.get("time_control_bucket", "unknown")
    opening = game_input.get("opening_name", "Unknown Opening")
    side = game_input.get("side", "unknown")
    parts.append(f"A {tc} game playing as {side} with the {opening}.")
    
    # Result
    result = game_input.get("result", "unknown")
    opponent = game_input.get("opponent_username", "opponent")
    if result == "win":
        parts.append(f"Won against {opponent}.")
    elif result == "loss":
        parts.append(f"Lost to {opponent}.")
    elif result == "draw":
        parts.append(f"Drew against {opponent}.")
    
    # Notable features
    if game_input.get("is_comeback"):
        parts.append("This was a comeback victory.")
    if game_input.get("has_brilliants"):
        parts.append(f"Featured {game_input.get('brilliant_count', 0)} brilliant moves.")
    if game_input.get("blunder_count", 0) >= 3:
        parts.append(f"Had {game_input.get('blunder_count')} blunders.")
    
    return " ".join(parts)


async def process_game_for_memory(
    pool: asyncpg.Pool,
    user_id: str,
    game_id: int,
    analysis: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Full pipeline to process a game for memory indexing.
    1. Load game from DB
    2. Build summary input
    3. Generate summary with LLM
    4. Index to vector store
    5. Update memory state
    
    Args:
        pool: Database connection pool
        user_id: User ID
        game_id: Game ID to process
        analysis: Optional pre-loaded analysis data
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Load game
        async with pool.acquire() as conn:
            game = await conn.fetchrow(
                """
                SELECT id, pgn, source, time_control, result, opponent_username,
                       played_at, opening_eco, opening_name, provider, user_id
                FROM games
                WHERE id = $1 AND user_id = $2
                """,
                game_id,
                user_id
            )
            
            if not game:
                print(f"Game {game_id} not found for user {user_id}")
                return False
            
            game_dict = dict(game)
        
        # Build summary input
        game_input = build_game_summary_input(game_dict, analysis)
        
        # Generate summary
        summary = await summarize_game_for_memory(game_input)
        
        # Build metadata for filtering
        metadata = {
            "time_control_bucket": game_input["time_control_bucket"],
            "side": game_input["side"],
            "result": game_input["result"],
            "opening_eco": game_input.get("opening_eco", ""),
            "opening_name": game_input.get("opening_name", ""),
            "played_at": game_input.get("played_at").isoformat() if game_input.get("played_at") else None,
            "source": game_input.get("source", ""),
            "has_brilliant": game_input.get("has_brilliants", False),
            "is_comeback": game_input.get("is_comeback", False),
        }
        
        # Index to vector store
        await index_game_summary(pool, user_id, game_id, summary, metadata)
        
        # Update memory state
        async with pool.acquire() as conn:
            played_at = game_dict.get("played_at")
            await conn.execute(
                """
                INSERT INTO user_game_memory_state (user_id, last_processed_game_at, created_at, updated_at)
                VALUES ($1, $2, NOW(), NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    last_processed_game_at = GREATEST(
                        user_game_memory_state.last_processed_game_at,
                        EXCLUDED.last_processed_game_at
                    ),
                    updated_at = NOW()
                """,
                user_id,
                played_at
            )
        
        return True
        
    except Exception as e:
        print(f"Failed to process game {game_id} for memory: {e}")
        return False


async def process_unindexed_games(
    pool: asyncpg.Pool,
    user_id: str,
    limit: int = 50
) -> int:
    """
    Process all unindexed games for a user.
    
    Args:
        pool: Database connection pool
        user_id: User ID
        limit: Maximum games to process in one batch
        
    Returns:
        Number of games successfully processed
    """
    from .vector_store import get_unindexed_games
    
    games = await get_unindexed_games(pool, user_id, limit)
    processed = 0
    
    for game in games:
        success = await process_game_for_memory(pool, user_id, game["id"])
        if success:
            processed += 1
    
    return processed

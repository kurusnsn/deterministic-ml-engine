"""
Memory snapshot service for Personal Trainer feature.
Handles aggregation of user stats and LLM coaching generation.
"""

import os
import json
import asyncpg
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

from .vector_store import search_user_games, count_indexed_games


# Minimum games required before generating a snapshot
MIN_GAMES_FOR_SNAPSHOT = 5

# Minimum new games before triggering a rebuild
MIN_NEW_GAMES_FOR_REBUILD = 5

# Maximum age before forcing a rebuild (in hours)
MAX_SNAPSHOT_AGE_HOURS = 24


async def compute_raw_stats_for_user(
    pool: asyncpg.Pool,
    user_id: str,
    time_control: str,
    side: str
) -> Dict[str, Any]:
    """
    Compute aggregated statistics from user's games using existing analysis data.
    All computations are deterministic - no LLM calls.
    
    Args:
        pool: Database connection pool
        user_id: User ID
        time_control: 'bullet', 'blitz', 'rapid', 'classical', or 'all'
        side: 'white', 'black', or 'both'
        
    Returns:
        Dictionary with aggregated statistics
    """
    # Build query filters
    tc_filter = ""
    if time_control != "all":
        tc_filter = f"AND metadata->>'time_control_bucket' = '{time_control}'"
    
    side_filter = ""
    if side != "both":
        side_filter = f"AND metadata->>'side' = '{side}'"
    
    async with pool.acquire() as conn:
        # Get basic game counts and results
        basic_stats = await conn.fetchrow(f"""
            SELECT 
                COUNT(*) as sample_size,
                COUNT(*) FILTER (WHERE metadata->>'result' = 'win') as wins,
                COUNT(*) FILTER (WHERE metadata->>'result' = 'loss') as losses,
                COUNT(*) FILTER (WHERE metadata->>'result' = 'draw') as draws,
                COUNT(*) FILTER (WHERE (metadata->>'has_brilliant')::boolean = true) as games_with_brilliants,
                COUNT(*) FILTER (WHERE (metadata->>'is_comeback')::boolean = true) as comeback_wins
            FROM game_embeddings
            WHERE user_id = $1 {tc_filter} {side_filter}
        """, user_id)
        
        sample_size = basic_stats["sample_size"] or 0
        wins = basic_stats["wins"] or 0
        losses = basic_stats["losses"] or 0
        draws = basic_stats["draws"] or 0
        
        # Calculate score
        score = (wins + 0.5 * draws) / sample_size if sample_size > 0 else 0.5
        
        # Get opening statistics
        opening_stats_rows = await conn.fetch(f"""
            SELECT 
                metadata->>'opening_eco' as eco,
                metadata->>'opening_name' as name,
                COUNT(*) as games,
                COUNT(*) FILTER (WHERE metadata->>'result' = 'win') as wins,
                COUNT(*) FILTER (WHERE metadata->>'result' = 'draw') as draws
            FROM game_embeddings
            WHERE user_id = $1 {tc_filter} {side_filter}
            GROUP BY metadata->>'opening_eco', metadata->>'opening_name'
            ORDER BY COUNT(*) DESC
            LIMIT 10
        """, user_id)
        
        opening_stats = []
        for row in opening_stats_rows:
            games = row["games"] or 0
            row_wins = row["wins"] or 0
            row_draws = row["draws"] or 0
            row_score = (row_wins + 0.5 * row_draws) / games if games > 0 else 0.5
            opening_stats.append({
                "eco": row["eco"] or "Unknown",
                "name": row["name"] or "Unknown Opening",
                "games": games,
                "score": round(row_score, 3),
            })
        
        # Get key positions stats for blunder distribution by phase
        phase_stats = {"opening": 0, "middlegame": 0, "endgame": 0}
        phase_rows = await conn.fetch(f"""
            SELECT phase, COUNT(*) as count
            FROM key_positions
            WHERE user_id = $1 
              AND eval_loss_cp < -100
              {"AND time_control_bucket = '" + time_control + "'" if time_control != "all" else ""}
              {"AND side = '" + side + "'" if side != "both" else ""}
            GROUP BY phase
        """, user_id)
        
        for row in phase_rows:
            phase = row["phase"]
            if phase in phase_stats:
                phase_stats[phase] = row["count"] or 0
        
        # Calculate blunders per game
        total_blunders = sum(phase_stats.values())
        blunders_per_game = total_blunders / sample_size if sample_size > 0 else 0
        
    return {
        "sample_size": sample_size,
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "score": round(score, 3),
        "blunders_per_game": round(blunders_per_game, 2),
        "blunder_distribution": phase_stats,
        "games_with_brilliants": basic_stats["games_with_brilliants"] or 0,
        "comeback_wins": basic_stats["comeback_wins"] or 0,
        "top_openings": opening_stats,
    }


async def select_key_positions_for_training(
    pool: asyncpg.Pool,
    user_id: str,
    time_control: str,
    side: str,
    limit: int = 30
) -> List[Dict[str, Any]]:
    """
    Select high-signal positions for training puzzles and PV study.
    
    Selection priorities:
    1. Largest eval losses (biggest blunders)
    2. Recurring motifs/tags
    3. Endgame failures
    4. Brilliant/comeback positions
    
    Args:
        pool: Database connection pool
        user_id: User ID
        time_control: Filter by time control
        side: Filter by side
        limit: Maximum positions to return
        
    Returns:
        List of key position records
    """
    tc_filter = ""
    if time_control != "all":
        tc_filter = f"AND time_control_bucket = '{time_control}'"
    
    side_filter = ""
    if side != "both":
        side_filter = f"AND side = '{side}'"
    
    async with pool.acquire() as conn:
        # Get positions with worst eval losses
        rows = await conn.fetch(f"""
            SELECT 
                id, game_id, move_number, fen_before, side_to_move,
                played_move_san, best_move_san, pv_san, eval_loss_cp,
                phase, time_control_bucket, side, tags, outcome_impact
            FROM key_positions
            WHERE user_id = $1 {tc_filter} {side_filter}
            ORDER BY eval_loss_cp ASC
            LIMIT $2
        """, user_id, limit)
        
        positions = []
        for row in rows:
            positions.append({
                "position_id": f"game_{row['game_id']}_move_{row['move_number']}",
                "id": row["id"],
                "game_id": row["game_id"],
                "move_number": row["move_number"],
                "fen_before": row["fen_before"],
                "side_to_move": row["side_to_move"],
                "played_move_san": row["played_move_san"],
                "best_move_san": row["best_move_san"],
                "pv_san": json.loads(row["pv_san"]) if isinstance(row["pv_san"], str) else (row["pv_san"] or []),
                "eval_loss_cp": row["eval_loss_cp"],
                "phase": row["phase"],
                "time_control_bucket": row["time_control_bucket"],
                "side": row["side"],
                "tags": json.loads(row["tags"]) if isinstance(row["tags"], str) else (row["tags"] or []),
                "outcome_impact": row["outcome_impact"],
            })
        
        return positions


async def rebuild_memory_snapshot(
    pool: asyncpg.Pool,
    user_id: str,
    time_control: str,
    side: str
) -> bool:
    """
    Rebuild the memory snapshot for a user/time_control/side combination.
    
    Steps:
    1. Compute raw_stats from database
    2. Search vector store for representative games
    3. Select key positions for training
    4. Build LLM prompt with stats + games + positions
    5. Generate coach_summary and recommendations
    6. Upsert into user_memory_snapshot
    7. Update user_game_memory_state
    
    Args:
        pool: Database connection pool
        user_id: User ID
        time_control: Time control bucket
        side: Side filter
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # 1. Compute raw stats
        raw_stats = await compute_raw_stats_for_user(pool, user_id, time_control, side)
        
        if raw_stats["sample_size"] < MIN_GAMES_FOR_SNAPSHOT:
            # Not enough games yet
            return False
        
        # 2. Get representative games from vector store
        filters = {}
        if time_control != "all":
            filters["time_control_bucket"] = time_control
        if side != "both":
            filters["side"] = side
        
        game_docs = await search_user_games(
            pool, user_id,
            query_text="important games with blunders brilliants comebacks tactical mistakes",
            filters=filters,
            k=30
        )
        
        game_summaries = [doc.summary_text for doc in game_docs[:20]]
        
        # 3. Select key positions
        key_positions = await select_key_positions_for_training(pool, user_id, time_control, side, limit=20)
        
        # 4 & 5. Generate coaching with LLM
        coach_summary, recommendations = await _generate_coaching_with_llm(
            raw_stats, game_summaries, key_positions
        )
        
        # 6. Upsert snapshot
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO user_memory_snapshot 
                    (user_id, time_control, side, sample_size, raw_stats, recommendations, coach_summary, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                ON CONFLICT (user_id, time_control, side) DO UPDATE SET
                    sample_size = EXCLUDED.sample_size,
                    raw_stats = EXCLUDED.raw_stats,
                    recommendations = EXCLUDED.recommendations,
                    coach_summary = EXCLUDED.coach_summary,
                    updated_at = NOW()
                """,
                user_id,
                time_control,
                side,
                raw_stats["sample_size"],
                json.dumps(raw_stats),
                json.dumps(recommendations),
                coach_summary
            )
            
            # 7. Update memory state
            await conn.execute(
                """
                INSERT INTO user_game_memory_state (user_id, last_memory_rebuild_at, created_at, updated_at)
                VALUES ($1, NOW(), NOW(), NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    last_memory_rebuild_at = NOW(),
                    updated_at = NOW()
                """,
                user_id
            )
        
        # 8. Build persistent trainer snapshot (feature-flagged, no DB changes)
        try:
            from .config import ENABLE_PERSISTENT_TRAINER
            if ENABLE_PERSISTENT_TRAINER:
                from .trainer_events import build_trainer_snapshot
                build_trainer_snapshot(user_id, time_control, side, raw_stats)
        except Exception as e:
            # Persistent trainer is optional, don't fail the main rebuild
            print(f"Persistent trainer snapshot failed: {e}")
        
        return True
        
    except Exception as e:
        print(f"Failed to rebuild memory snapshot for user {user_id}: {e}")
        return False


async def _generate_coaching_with_llm(
    raw_stats: Dict[str, Any],
    game_summaries: List[str],
    key_positions: List[Dict[str, Any]]
) -> tuple:
    """
    Generate coaching summary and recommendations using LLM.
    
    Args:
        raw_stats: Aggregated statistics
        game_summaries: List of game summary texts
        key_positions: List of key position records
        
    Returns:
        Tuple of (coach_summary, recommendations)
    """
    import httpx
    
    # Build position descriptors (without full FEN/PV, just metadata)
    position_descs = []
    for pos in key_positions[:15]:
        desc = f"- Position {pos['position_id']}: {pos['phase']} phase, {pos['side_to_move']} to move"
        if pos.get('tags'):
            desc += f", themes: {', '.join(pos['tags'][:3])}"
        if pos.get('eval_loss_cp'):
            desc += f", eval loss: {abs(pos['eval_loss_cp'])} cp"
        position_descs.append(desc)
    
    # Build the prompt
    prompt = f"""You are a chess coach analyzing a player's recent games. Generate coaching feedback based on their statistics.

STRICT RULES:
- ONLY use the statistics and information provided
- NEVER invent specific move sequences or evaluations
- Focus on patterns and actionable advice

PLAYER STATISTICS:
- Sample size: {raw_stats['sample_size']} games
- Score: {raw_stats['score']:.1%}
- Wins: {raw_stats['wins']}, Losses: {raw_stats['losses']}, Draws: {raw_stats['draws']}
- Blunders per game: {raw_stats['blunders_per_game']}
- Blunder distribution: Opening {raw_stats['blunder_distribution']['opening']}, Middlegame {raw_stats['blunder_distribution']['middlegame']}, Endgame {raw_stats['blunder_distribution']['endgame']}
- Games with brilliant moves: {raw_stats['games_with_brilliants']}
- Comeback wins: {raw_stats['comeback_wins']}

TOP OPENINGS:
{json.dumps(raw_stats['top_openings'], indent=2)}

KEY POSITIONS (showing themes and phases):
{chr(10).join(position_descs) if position_descs else 'No key positions analyzed yet.'}

RECENT GAME SUMMARIES:
{chr(10).join([f"- {s}" for s in game_summaries[:10]]) if game_summaries else 'No game summaries available.'}

Generate a JSON response with this EXACT structure:
{{
    "coach_summary": "1-3 paragraph coaching summary highlighting strengths and areas to improve...",
    "recommendations": {{
        "openings": [
            {{"eco": "ECO_CODE", "name": "Opening Name", "action": "lean_into|patch|avoid", "reason": "..."}}
        ],
        "focus_areas": [
            "Area 1 to focus on",
            "Area 2 to focus on"
        ],
        "puzzles": [
            {{"position_id": "...", "theme": "...", "priority": "high|medium|low", "reason": "..."}}
        ],
        "pv_lines": [
            {{"position_id": "...", "display_name": "...", "reason": "...", "study_hint": "..."}}
        ]
    }}
}}

Return ONLY the JSON, no other text:"""

    # Try LLM
    llm_url = os.getenv("LLM_URL")
    api_key = os.getenv("OPENAI_API_KEY")
    
    try:
        response_text = None
        
        if api_key:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 1500,
                        "temperature": 0.4
                    }
                )
                response.raise_for_status()
                data = response.json()
                response_text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        
        if response_text:
            # Parse JSON (handle potential markdown code blocks)
            text = response_text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            
            result = json.loads(text)
            return result.get("coach_summary", ""), result.get("recommendations", {})
    
    except Exception as e:
        print(f"LLM coaching generation failed: {e}")
    
    # Fallback to simple recommendations
    return _generate_fallback_coaching(raw_stats, key_positions)


def _generate_fallback_coaching(
    raw_stats: Dict[str, Any],
    key_positions: List[Dict[str, Any]]
) -> tuple:
    """Generate simple coaching without LLM."""
    # Determine main weakness
    blunder_dist = raw_stats["blunder_distribution"]
    worst_phase = max(blunder_dist, key=blunder_dist.get)
    
    summary_parts = []
    summary_parts.append(f"Based on {raw_stats['sample_size']} games, you have a {raw_stats['score']:.1%} score.")
    
    if raw_stats["blunders_per_game"] > 1:
        summary_parts.append(f"You're averaging {raw_stats['blunders_per_game']:.1f} blunders per game, primarily in the {worst_phase}.")
    
    if raw_stats["games_with_brilliants"] > 0:
        summary_parts.append(f"You've shown {raw_stats['games_with_brilliants']} games with brilliant moves - great tactical vision!")
    
    coach_summary = " ".join(summary_parts)
    
    # Build recommendations
    focus_areas = []
    if blunder_dist["endgame"] > blunder_dist["opening"]:
        focus_areas.append("Endgame technique and calculation")
    if blunder_dist["opening"] > 5:
        focus_areas.append("Opening preparation and theory")
    focus_areas.append("Tactical pattern recognition")
    
    # Add puzzle recommendations from key positions
    puzzles = []
    for pos in key_positions[:5]:
        puzzles.append({
            "position_id": pos["position_id"],
            "theme": pos["tags"][0] if pos.get("tags") else "tactical",
            "priority": "high" if pos.get("eval_loss_cp", 0) < -200 else "medium",
            "reason": f"Critical {pos['phase']} position"
        })
    
    # Add PV line recommendations
    pv_lines = []
    for pos in key_positions[:3]:
        if pos.get("pv_san"):
            pv_lines.append({
                "position_id": pos["position_id"],
                "display_name": f"{pos['phase'].title()} improvement",
                "reason": f"Study the best continuation from this {pos['phase']} position",
                "study_hint": "Focus on the key move and understand why it's best"
            })
    
    recommendations = {
        "openings": [],  # Would need more data to recommend
        "focus_areas": focus_areas,
        "puzzles": puzzles,
        "pv_lines": pv_lines
    }
    
    return coach_summary, recommendations


async def get_memory_snapshot(
    pool: asyncpg.Pool,
    user_id: str,
    time_control: str,
    side: str
) -> Optional[Dict[str, Any]]:
    """
    Get existing memory snapshot for a user.
    
    Args:
        pool: Database connection pool
        user_id: User ID
        time_control: Time control filter
        side: Side filter
        
    Returns:
        Snapshot data or None if not found
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, user_id, time_control, side, sample_size, 
                   raw_stats, recommendations, coach_summary, updated_at
            FROM user_memory_snapshot
            WHERE user_id = $1 AND time_control = $2 AND side = $3
            """,
            user_id, time_control, side
        )
        
        if not row:
            return None
        
        return {
            "id": row["id"],
            "user_id": str(row["user_id"]),
            "time_control": row["time_control"],
            "side": row["side"],
            "sample_size": row["sample_size"],
            "raw_stats": json.loads(row["raw_stats"]) if isinstance(row["raw_stats"], str) else row["raw_stats"],
            "recommendations": json.loads(row["recommendations"]) if isinstance(row["recommendations"], str) else row["recommendations"],
            "coach_summary": row["coach_summary"],
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None
        }


async def should_rebuild_snapshot(
    pool: asyncpg.Pool,
    user_id: str,
    time_control: str,
    side: str
) -> bool:
    """
    Check if a snapshot should be rebuilt based on new games or age.
    
    Args:
        pool: Database connection pool
        user_id: User ID
        time_control: Time control filter
        side: Side filter
        
    Returns:
        True if rebuild is needed
    """
    async with pool.acquire() as conn:
        # Get memory state
        state = await conn.fetchrow(
            """
            SELECT last_processed_game_at, last_memory_rebuild_at
            FROM user_game_memory_state
            WHERE user_id = $1
            """,
            user_id
        )
        
        if not state:
            return True  # No state yet, should build
        
        last_rebuild = state["last_memory_rebuild_at"]
        
        # Check age
        if last_rebuild:
            age = datetime.now(last_rebuild.tzinfo) - last_rebuild
            if age > timedelta(hours=MAX_SNAPSHOT_AGE_HOURS):
                return True
        else:
            return True  # Never rebuilt
        
        # Count new games since last rebuild
        tc_filter = ""
        if time_control != "all":
            tc_filter = f"AND metadata->>'time_control_bucket' = '{time_control}'"
        
        side_filter = ""
        if side != "both":
            side_filter = f"AND metadata->>'side' = '{side}'"
        
        new_games = await conn.fetchval(f"""
            SELECT COUNT(*) FROM game_embeddings
            WHERE user_id = $1
              AND created_at > $2
              {tc_filter} {side_filter}
        """, user_id, last_rebuild)
        
        return (new_games or 0) >= MIN_NEW_GAMES_FOR_REBUILD


async def get_user_game_count(
    pool: asyncpg.Pool,
    user_id: str,
    time_control: Optional[str] = None,
    side: Optional[str] = None
) -> int:
    """
    Get the number of indexed games for a user.
    
    Args:
        pool: Database connection pool
        user_id: User ID
        time_control: Optional filter
        side: Optional filter
        
    Returns:
        Game count
    """
    return await count_indexed_games(
        pool, user_id,
        time_control_bucket=time_control if time_control != "all" else None,
        side=side if side != "both" else None
    )

import asyncpg
import json
from datetime import datetime, timedelta
from uuid import UUID
from .models import TrainerStatus
from .state_machine import TrainerStateMachine

DEEP_UPDATE_GAME_THRESHOLD = 20
DEEP_UPDATE_DAYS_THRESHOLD = 7

class DeepUpdateJob:
    """
    Heavy job for long-term pattern recognition and LC0 positional probes.
    Triggered by game volume or time elapsed.
    """

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def run_for_user(self, user_id: UUID):
        async with self.pool.acquire() as conn:
            # 1. Check thresholds
            stats = await conn.fetchrow(
                """
                SELECT state, last_deep_update_at, new_games_since_deep_update 
                FROM trainer_state 
                WHERE user_id = $1
                """,
                user_id
            )

            if not stats or stats['state'] != TrainerStatus.ACTIVE_TRAINER:
                return "ineligible"

            last_update = stats['last_deep_update_at'] or (datetime.now() - timedelta(days=365))
            days_elapsed = (datetime.now() - last_update).days
            games_count = stats['new_games_since_deep_update']

            if games_count < DEEP_UPDATE_GAME_THRESHOLD and days_elapsed < DEEP_UPDATE_DAYS_THRESHOLD:
                return "threshold_not_met"

            # 2. Perform Deep Analysis (Mocking heavy compute)
            # This would call Modal apps for LC0 probes and concept grounding over the last N games.
            lc0_insights = {
                "king_safety_trends": "Improving",
                "space_usage": "Moderate",
                "weak_square_awareness": "Low"
            }
            
            long_term_patterns = {
                "recurring_tactical_misses": ["back-rank mate vulnerability", "forks"],
                "opening_strength": "High in e4 lines",
                "endgame_conversion": "Need work on rook endgames"
            }
            
            narrative_focus = "Improving fundamental positional awareness and rook endgame transitions."

            # 3. Store Trainer Snapshot
            async with conn.transaction():
                await conn.execute(
                    """
                    INSERT INTO trainer_snapshots (user_id, narrative_focus, long_term_patterns, lc0_insights)
                    VALUES ($1, $2, $3, $4)
                    """,
                    user_id, narrative_focus, json.dumps(long_term_patterns), json.dumps(lc0_insights)
                )

                # 4. Reset thresholds
                await conn.execute(
                    """
                    UPDATE trainer_state 
                    SET last_deep_update_at = NOW(),
                        new_games_since_deep_update = 0
                    WHERE user_id = $1
                    """,
                    user_id
                )

        return "success"

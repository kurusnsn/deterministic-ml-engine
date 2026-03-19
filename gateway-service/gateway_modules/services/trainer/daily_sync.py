import asyncpg
import json
from datetime import datetime, date
from typing import List, Optional
from uuid import UUID
from .models import TrainerStatus
from .state_machine import TrainerStateMachine

class DailySyncJob:
    """
    Automated job to fetch new games and generate daily commentary.
    Runs at most once per day per user.
    """

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def run_for_user(self, user_id: UUID):
        sm = TrainerStateMachine(self.pool)
        state = await sm.get_state(user_id)
        
        if state != TrainerStatus.ACTIVE_TRAINER:
            return None

        async with self.pool.acquire() as conn:
            # 1. Check if we've already synced today
            today = date.today()
            already_synced = await conn.fetchval(
                "SELECT 1 FROM trainer_daily_commentary WHERE user_id = $1 AND report_date = $2",
                user_id, today
            )
            if already_synced:
                return "already_synced_today"

            # 2. Get the last sync timestamp
            last_sync = await conn.fetchval(
                "SELECT last_daily_sync_at FROM trainer_state WHERE user_id = $1",
                user_id
            ) or datetime.min

            # 3. Fetch new games since last sync
            new_games = await conn.fetch(
                """
                SELECT id, pgn, time_control, result 
                FROM games 
                WHERE user_id = $1 AND played_at > $2
                ORDER BY played_at ASC
                """,
                user_id, last_sync
            )

            if not new_games:
                return "no_new_games"

            # 4. Analyze games and extract facts (placeholder for real logic)
            game_ids = [g['id'] for g in new_games]
            
            # Weighted handling for Bullet games (Tactical errors only)
            tactical_accuracy = self._compute_weighted_accuracy(new_games)
            
            # 5. Generate commentary (Mocking LLM call)
            # In production, this would use a RAG prompt with game facts + LLM
            commentary = f"Analyzed {len(new_games)} new games. Your tactical accuracy was {tactical_accuracy:.1%}. "
            commentary += "Keep focusing on converting late-game advantages."

            # 6. Store commentary (Idempotent per date)
            await conn.execute(
                """
                INSERT INTO trainer_daily_commentary (user_id, report_date, commentary_text, game_ids_analyzed)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id, report_date) DO UPDATE SET
                    commentary_text = EXCLUDED.commentary_text,
                    game_ids_analyzed = EXCLUDED.game_ids_analyzed
                """,
                user_id, today, commentary, game_ids
            )

            # 7. Update trainer state
            await conn.execute(
                """
                UPDATE trainer_state 
                SET last_daily_sync_at = NOW(),
                    new_games_since_deep_update = new_games_since_deep_update + $1
                WHERE user_id = $2
                """,
                len(new_games), user_id
            )

        return "success"

    def _compute_weighted_accuracy(self, games: List[asyncpg.Record]) -> float:
        """
        Weights tactical errors for bullet games, excluding them from 
        strategic or opening conclusions.
        """
        total_weight = 0
        weighted_success = 0
        
        for game in games:
            is_bullet = game['time_control'] == 'bullet'
            weight = 0.5 if is_bullet else 1.0
            
            # Placeholder for actual accuracy metric
            accuracy = 0.8 if game['result'] == 'win' else 0.6
            
            weighted_success += accuracy * weight
            total_weight += weight
            
        return weighted_success / total_weight if total_weight > 0 else 0.0

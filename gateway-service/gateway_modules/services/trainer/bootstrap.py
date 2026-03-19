import asyncpg
from typing import List, Dict, Any
from uuid import UUID
import json
from .models import TrainerStatus
from .state_machine import TrainerStateMachine

MIN_BOOTSTRAP_GAMES = 30
MAX_BOOTSTRAP_GAMES = 50

async def run_bootstrap(pool: asyncpg.Pool, user_id: UUID, linked_account_id: int):
    """
    Fetches historical games and generates initial baseline reports.
    Transitions state to ACTIVE_TRAINER after completion.
    """
    sm = TrainerStateMachine(pool)
    
    # 1. Fetch historical games for this account
    # In a real scenario, this would call sync_orchestrator.sync_single_provider
    # For now, we assume games are already being synced or will be shortly.
    
    async with pool.acquire() as conn:
        # Get games for this user from the specified account
        games = await conn.fetch(
            """
            SELECT id, time_control, played_at 
            FROM games 
            WHERE user_id = $1 
            ORDER BY played_at DESC 
            LIMIT $2
            """,
            user_id, MAX_BOOTSTRAP_GAMES
        )
        
        if len(games) < MIN_BOOTSTRAP_GAMES:
            # We don't have enough games yet to build a quality baseline
            # We stay in BOOTSTRAP_REPORTS_CREATED until daily sync fills it up
            return False

        # 2. Group games by time control
        tc_groups = {}
        for game in games:
            tc = game['time_control'] or 'unknown'
            if tc not in tc_groups:
                tc_groups[tc] = []
            tc_groups[tc].append(game['id'])

        # 3. Generate baseline reports for each major time control
        for tc, game_ids in tc_groups.items():
            if len(game_ids) < 5:  # Arbitrary threshold for a report
                continue
                
            # Compute summary metrics (mocked for now, would use real analysis)
            summary_metrics = {
                "total_games": len(game_ids),
                "tactical_accuracy": 0.75, # Placeholder
                "opening_familiarity": 0.6, # Placeholder
                "snapshot_type": "baseline"
            }

            await conn.execute(
                """
                INSERT INTO trainer_reports (user_id, source_account_id, time_control, game_ids, summary_metrics, is_bootstrap)
                VALUES ($1, $2, $3, $4, $5, TRUE)
                """,
                user_id, linked_account_id, tc, game_ids, json.dumps(summary_metrics)
            )

    # 4. Finalize state
    await sm.activate_trainer(user_id)
    return True

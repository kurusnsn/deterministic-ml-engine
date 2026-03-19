import asyncpg
from typing import Optional
from uuid import UUID
from datetime import datetime
from .models import TrainerStatus

class TrainerStateMachine:
    """
    Handles state transitions for the Personal Trainer system.
    Ensures that transitions are explicit and persisted.
    """

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def get_state(self, user_id: UUID) -> Optional[TrainerStatus]:
        async with self.pool.acquire() as conn:
            state = await conn.fetchval(
                "SELECT state FROM trainer_state WHERE user_id = $1",
                user_id
            )
            return TrainerStatus(state) if state else None

    async def initialize_user(self, user_id: UUID):
        """Add user to trainer_state if not already present."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO trainer_state (user_id, state)
                VALUES ($1, 'NO_ACCOUNT')
                ON CONFLICT (user_id) DO NOTHING
                """,
                user_id
            )

    async def link_account(self, user_id: UUID, linked_account_id: int):
        """
        Transition to BOOTSTRAP_REPORTS_CREATED if currently NO_ACCOUNT or NEEDS_RELINK.
        This should be called after external account linking is successful.
        """
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                current_state = await conn.fetchval(
                    "SELECT state FROM trainer_state WHERE user_id = $1 FOR UPDATE",
                    user_id
                )
                
                # If no state yet, initialize it
                if not current_state:
                    await conn.execute(
                        "INSERT INTO trainer_state (user_id, state, linked_account_id) VALUES ($1, 'NO_ACCOUNT', $2)",
                        user_id, linked_account_id
                    )
                    current_state = 'NO_ACCOUNT'

                # Only move to BOOTSTRAP if we don't have active reports
                # The actual bootstrap logic (fetching games) happens in bootstrap.py
                if current_state in [TrainerStatus.NO_ACCOUNT, TrainerStatus.NEEDS_RELINK]:
                    await conn.execute(
                        """
                        UPDATE trainer_state 
                        SET state = 'BOOTSTRAP_REPORTS_CREATED', 
                            linked_account_id = $1,
                            updated_at = NOW()
                        WHERE user_id = $2
                        """,
                        linked_account_id, user_id
                    )
                    return True
        return False

    async def unlink_account(self, user_id: UUID, reason: str = "account_removed"):
        """
        Irreversible deactivation of all current reports and state reset.
        """
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # 1. Deactivate all active reports for this user
                await conn.execute(
                    """
                    UPDATE trainer_reports 
                    SET status = 'inactive', 
                        deactivation_reason = $1 
                    WHERE user_id = $2 AND status = 'active'
                    """,
                    reason, user_id
                )

                # 2. Transition state to NEEDS_RELINK
                await conn.execute(
                    """
                    UPDATE trainer_state 
                    SET state = 'NEEDS_RELINK', 
                        linked_account_id = NULL,
                        updated_at = NOW()
                    WHERE user_id = $1
                    """,
                    user_id
                )

    async def activate_trainer(self, user_id: UUID):
        """Move from BOOTSTRAP_REPORTS_CREATED to ACTIVE_TRAINER."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE trainer_state SET state = 'ACTIVE_TRAINER', updated_at = NOW() WHERE user_id = $1",
                user_id
            )

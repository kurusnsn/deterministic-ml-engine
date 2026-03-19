import asyncpg
from typing import List, Optional
from uuid import uuid4
from datetime import datetime

from ..models.repertoire import (
    RepertoireBucket,
    RepertoireBucketOpening,
    RepertoireType,
    RepertoirePuzzle,
)


class UserRepertoireService:
    """Service for managing user-controlled repertoires (core/secondary/experimental)."""

    @staticmethod
    async def get_user_repertoires(pool: asyncpg.Pool, user_id: str) -> List[RepertoireBucket]:
        """Fetch all repertoires for a user, including openings."""
        if not user_id:
            return []

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT r.id, r.user_id, r.name, r.type, r.color, r.time_control, r.created_at, r.updated_at,
                       coalesce(json_agg(o.*) FILTER (WHERE o.id IS NOT NULL), '[]') AS openings
                FROM user_repertoires r
                LEFT JOIN user_repertoire_openings o ON o.repertoire_id = r.id
                WHERE r.user_id = $1
                GROUP BY r.id
                ORDER BY r.created_at ASC
                """,
                user_id,
            )

            repertoires: List[RepertoireBucket] = []
            for row in rows:
                openings = []
                for o in row["openings"]:
                    openings.append(
                        RepertoireBucketOpening(
                            eco_code=o["eco_code"],
                            color=o["color"],
                            note=o.get("note"),
                        )
                    )
                puzzles = await UserRepertoireService._fetch_puzzles(conn, row["id"])
                repertoires.append(
                    RepertoireBucket(
                        id=str(row["id"]),
                        user_id=row["user_id"],
                        name=row["name"],
                        type=row["type"],
                        color=row["color"],
                        openings=openings,
                        puzzles=puzzles,
                        time_control=row.get("time_control"),
                        created_at=row["created_at"],
                        updated_at=row["updated_at"],
                    )
                )
            return repertoires

    @staticmethod
    async def create_repertoire(
        pool: asyncpg.Pool,
        user_id: str,
        name: str,
        type: RepertoireType,
        color: str,
        openings: Optional[List[RepertoireBucketOpening]] = None,
        puzzles: Optional[List[RepertoirePuzzle]] = None,
        time_control: Optional[str] = None,
    ) -> RepertoireBucket:
        """Create a new repertoire bucket."""
        if color not in ("white", "black", "both"):
            raise ValueError("Invalid color; must be white, black, or both")

        async with pool.acquire() as conn:
            async with conn.transaction():
                rep_id = uuid4()
                await conn.execute(
                    """
                    INSERT INTO user_repertoires (id, user_id, name, type, color, time_control)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    rep_id,
                    user_id,
                    name,
                    type,
                    color,
                    time_control,
                )

                if openings:
                    await UserRepertoireService._insert_openings(conn, rep_id, openings)
                if puzzles:
                    await UserRepertoireService.save_repertoire_puzzles(pool, str(rep_id), puzzles, conn=conn)

                row = await conn.fetchrow(
                    """
                    SELECT id, user_id, name, type, color, time_control, created_at, updated_at
                    FROM user_repertoires WHERE id = $1
                    """,
                    rep_id,
                )

        return RepertoireBucket(
            id=str(row["id"]),
            user_id=row["user_id"],
            name=row["name"],
            type=row["type"],
            color=row["color"],
            openings=openings or [],
            puzzles=puzzles or None,
            time_control=row.get("time_control"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    async def update_repertoire(
        pool: asyncpg.Pool,
        user_id: str,
        repertoire_id: str,
        name: Optional[str] = None,
        color: Optional[str] = None,
    ) -> Optional[RepertoireBucket]:
        """Rename or change color of a repertoire bucket. Enforces ownership."""
        if color and color not in ("white", "black", "both"):
            raise ValueError("Invalid color; must be white, black, or both")

        async with pool.acquire() as conn:
            # Ensure ownership
            owner = await conn.fetchval(
                "SELECT user_id FROM user_repertoires WHERE id = $1", repertoire_id
            )
            if not owner or owner != user_id:
                return None

            fields = []
            params = []
            idx = 1
            if name:
                fields.append(f"name = ${idx}")
                params.append(name)
                idx += 1
            if color:
                fields.append(f"color = ${idx}")
                params.append(color)
                idx += 1
            if not fields:
                # Nothing to update - just return existing
                row = await conn.fetchrow(
                    """
                    SELECT id, user_id, name, type, color, created_at, updated_at
                    FROM user_repertoires WHERE id = $1
                    """,
                    repertoire_id,
                )
                if not row:
                    return None
                openings = await UserRepertoireService._fetch_openings(conn, repertoire_id)
                puzzles = await UserRepertoireService._fetch_puzzles(conn, repertoire_id)
                return RepertoireBucket(
                    id=str(row["id"]),
                    user_id=row["user_id"],
                    name=row["name"],
                    type=row["type"],
                    color=row["color"],
                    openings=openings,
                    puzzles=puzzles,
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )

            params.append(repertoire_id)
            set_clause = ", ".join(fields)
            await conn.execute(
                f"""
                UPDATE user_repertoires
                SET {set_clause}, updated_at = NOW()
                WHERE id = ${idx}
                """,
                *params,
            )

            row = await conn.fetchrow(
                """
                SELECT id, user_id, name, type, color, created_at, updated_at
                FROM user_repertoires WHERE id = $1
                """,
                repertoire_id,
            )
            if not row:
                return None
            openings = await UserRepertoireService._fetch_openings(conn, repertoire_id)
            puzzles = await UserRepertoireService._fetch_puzzles(conn, repertoire_id)
            return RepertoireBucket(
                id=str(row["id"]),
                user_id=row["user_id"],
                name=row["name"],
                type=row["type"],
                color=row["color"],
                openings=openings,
                puzzles=puzzles,
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    @staticmethod
    async def delete_repertoire(pool: asyncpg.Pool, user_id: str, repertoire_id: str) -> bool:
        """Delete a repertoire bucket (and its openings). Enforces ownership."""
        async with pool.acquire() as conn:
            owner = await conn.fetchval(
                "SELECT user_id FROM user_repertoires WHERE id = $1", repertoire_id
            )
            if not owner or owner != user_id:
                return False

            await conn.execute(
                "DELETE FROM user_repertoires WHERE id = $1",
                repertoire_id,
            )
            return True

    @staticmethod
    async def set_repertoire_openings(
        pool: asyncpg.Pool,
        user_id: str,
        repertoire_id: str,
        openings: List[RepertoireBucketOpening],
    ) -> Optional[RepertoireBucket]:
        """Replace all openings for a repertoire. Enforces ownership."""
        async with pool.acquire() as conn:
            owner = await conn.fetchval(
                "SELECT user_id FROM user_repertoires WHERE id = $1", repertoire_id
            )
            if not owner or owner != user_id:
                return None

            async with conn.transaction():
                await conn.execute(
                    "DELETE FROM user_repertoire_openings WHERE repertoire_id = $1",
                    repertoire_id,
                )
                if openings:
                    await UserRepertoireService._insert_openings(conn, repertoire_id, openings)
                await conn.execute(
                    "UPDATE user_repertoires SET updated_at = NOW() WHERE id = $1",
                    repertoire_id,
                )

                row = await conn.fetchrow(
                    """
                    SELECT id, user_id, name, type, color, created_at, updated_at
                    FROM user_repertoires WHERE id = $1
                    """,
                    repertoire_id,
                )
                if not row:
                    return None
                puzzles = await UserRepertoireService._fetch_puzzles(conn, repertoire_id)
                return RepertoireBucket(
                    id=str(row["id"]),
                    user_id=row["user_id"],
                    name=row["name"],
                    type=row["type"],
                    color=row["color"],
                    openings=openings,
                    puzzles=puzzles,
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )

    @staticmethod
    async def _insert_openings(conn: asyncpg.Connection, repertoire_id, openings: List[RepertoireBucketOpening]):
        """Helper to bulk insert openings."""
        values = [
            (uuid4(), repertoire_id, o.eco_code, o.color, o.note)
            for o in openings
        ]
        await conn.copy_records_to_table(
            "user_repertoire_openings",
            records=values,
            columns=["id", "repertoire_id", "eco_code", "color", "note"],
        )

    @staticmethod
    async def _fetch_openings(conn: asyncpg.Connection, repertoire_id: str) -> List[RepertoireBucketOpening]:
        rows = await conn.fetch(
            """
            SELECT eco_code, color, note
            FROM user_repertoire_openings
            WHERE repertoire_id = $1
            """,
            repertoire_id,
        )
        return [
            RepertoireBucketOpening(
                eco_code=row["eco_code"],
                color=row["color"],
                note=row["note"],
            ) for row in rows
        ]

    @staticmethod
    async def _fetch_puzzles(conn: asyncpg.Connection, repertoire_id: str) -> Optional[List[RepertoirePuzzle]]:
        rows = await conn.fetch(
            """
            SELECT puzzle_id, eco_code, move_number, mistake_type, source_report_id
            FROM user_repertoire_puzzles
            WHERE repertoire_id = $1
            """,
            repertoire_id,
        )
        if not rows:
            return None
        return [
            RepertoirePuzzle(
                puzzle_id=row["puzzle_id"],
                eco_code=row["eco_code"],
                move_number=row["move_number"],
                mistake_type=row["mistake_type"],
                source_report_id=row["source_report_id"],
            )
            for row in rows
        ]

    @staticmethod
    async def save_repertoire_puzzles(
        pool: asyncpg.Pool,
        repertoire_id: str,
        puzzles: List[RepertoirePuzzle],
        conn: Optional[asyncpg.Connection] = None,
    ):
        """
        Persist puzzles associated with a repertoire.
        """
        if not puzzles:
            return

        insert_sql = """
            INSERT INTO user_repertoire_puzzles
                (repertoire_id, puzzle_id, eco_code, move_number, mistake_type, source_report_id)
            VALUES ($1, $2, $3, $4, $5, $6)
        """

        if conn:
            for p in puzzles:
                await conn.execute(
                    insert_sql,
                    repertoire_id,
                    p.puzzle_id,
                    p.eco_code,
                    p.move_number,
                    p.mistake_type,
                    p.source_report_id,
                )
            return

        async with pool.acquire() as acquired_conn:
            async with acquired_conn.transaction():
                for p in puzzles:
                    await acquired_conn.execute(
                        insert_sql,
                        repertoire_id,
                        p.puzzle_id,
                        p.eco_code,
                        p.move_number,
                        p.mistake_type,
                        p.source_report_id,
                    )

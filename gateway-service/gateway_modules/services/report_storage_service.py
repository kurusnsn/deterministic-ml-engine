"""
Report storage service for managing saved repertoire reports.
"""

import json
import uuid
import time
from typing import List, Optional, Dict, Any
from datetime import datetime
import asyncpg

from ..models.repertoire import RepertoireReport
from ..storage.report_object_store import get_report_object_store

HEAVY_REPORT_FIELDS = ["engine_analysis", "generated_puzzles", "weak_lines", "charts_additional"]


def _strip_heavy_fields(report_data: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of the report without large fields to keep DB rows small."""
    trimmed = dict(report_data)
    for key in HEAVY_REPORT_FIELDS:
        if key in trimmed:
            trimmed[key] = None
    return trimmed


class ReportStorageService:
    """Service for managing saved repertoire reports in the database."""

    @staticmethod
    async def save_report(
        pool: asyncpg.Pool,
        user_id: Optional[str],
        session_id: Optional[str],
        name: str,
        report: RepertoireReport,
        source_usernames: Optional[List[str]] = None,
        time_control: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Save a repertoire report to the database.

        Args:
            pool: Database connection pool
            user_id: User ID (for authenticated users)
            session_id: Session ID (for anonymous users)
            name: Display name for the report
            report: The repertoire report to save
            source_usernames: List of usernames this report was generated from
            time_control: Time control filter used for this report (e.g., 'blitz', 'rapid')

        Returns:
            Dictionary with saved report metadata
        """
        # Extract metadata from the report
        total_games = report.total_games
        overall_winrate = report.overall_winrate

        # Extract preview openings (top 5 most frequent openings)
        preview_openings = []
        all_openings = []

        # Collect all openings from both colors
        for repertoire in [report.white_repertoire, report.black_repertoire]:
            for group in repertoire.values():
                all_openings.extend(group.openings)

        # Sort by frequency and take top 5
        all_openings.sort(key=lambda x: x.frequency, reverse=True)
        preview_openings = [opening.eco_code for opening in all_openings[:5]]

        # Determine if this is a multi-account report
        is_multi_account = source_usernames and len(source_usernames) > 1

        # Convert report to JSON
        report_dict = report.dict()
        analysis_date = report_dict.get("analysis_date")
        if isinstance(analysis_date, datetime):
            report_dict["analysis_date"] = analysis_date.isoformat()

        store = get_report_object_store()
        report_id = str(uuid.uuid4())
        report_data_backend = "db"
        report_data_key = None
        report_data_size = None

        report_json_full = json.dumps(report_dict)
        report_json_db = report_json_full

        if store.enabled:
            report_data_key, report_data_size = await store.put_report(report_id, report_json_full)
            report_data_backend = "s3"
            report_json_db = json.dumps(_strip_heavy_fields(report_dict))

        async with pool.acquire() as conn:
            # Insert the report
            # Note: saved_reports_owner_check constraint requires exactly one of user_id/session_id
            # If user_id is set, session_id must be NULL (and vice versa)
            effective_user_id = user_id if user_id else None
            effective_session_id = session_id if not user_id else None
            
            query = """
                INSERT INTO saved_reports (
                    id, user_id, session_id, name, report_data, source_usernames,
                    is_multi_account, total_games, overall_winrate, preview_openings, time_control,
                    report_data_backend, report_data_key, report_data_size_bytes
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING id, created_at, updated_at
            """

            try:
                row = await conn.fetchrow(
                    query,
                    report_id,
                    effective_user_id,
                    effective_session_id,
                    name,
                    report_json_db,
                    source_usernames or [],
                    is_multi_account,
                    total_games,
                    overall_winrate,
                    preview_openings,
                    time_control,
                    report_data_backend,
                    report_data_key,
                    report_data_size
                )
            except Exception:
                if store.enabled and report_data_key:
                    await store.delete_report(report_data_key)
                raise

            return {
                "id": str(row["id"]),
                "name": name,
                "created_at": row["created_at"].isoformat(),
                "updated_at": row["updated_at"].isoformat(),
                "total_games": total_games,
                "overall_winrate": overall_winrate,
                "preview_openings": preview_openings,
                "source_usernames": source_usernames or [],
                "is_multi_account": is_multi_account,
                "time_control": time_control
            }

    @staticmethod
    async def get_reports_list(
        pool: asyncpg.Pool,
        user_id: Optional[str],
        session_id: Optional[str],
        player_filters: Optional[List[str]] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get a list of saved reports for a user/session.

        Args:
            pool: Database connection pool
            user_id: User ID (for authenticated users)
            session_id: Session ID (for anonymous users)
            player_filters: Optional list of usernames to filter by
            limit: Maximum number of reports to return
            offset: Number of reports to skip

        Returns:
            List of report metadata dictionaries
        """
        conditions = []
        params = []
        param_count = 0

        # Add owner filter - check both user_id AND session_id for logged-in users
        # This ensures users see reports created before and after login
        if user_id and session_id:
            param_count += 1
            user_param = param_count
            params.append(user_id)
            param_count += 1
            session_param = param_count
            params.append(session_id)
            conditions.append(f"(user_id = ${user_param} OR session_id = ${session_param})")
        elif user_id:
            param_count += 1
            conditions.append(f"user_id = ${param_count}")
            params.append(user_id)
        elif session_id:
            param_count += 1
            conditions.append(f"session_id = ${param_count}")
            params.append(session_id)
        else:
            return []

        # Add player filter if specified
        if player_filters:
            param_count += 1
            conditions.append(f"source_usernames && ${param_count}")
            params.append(player_filters)

        # Construct query
        where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""

        param_count += 1
        limit_param = f"${param_count}"
        params.append(limit)

        param_count += 1
        offset_param = f"${param_count}"
        params.append(offset)

        query = f"""
            SELECT id, name, created_at, updated_at, total_games, overall_winrate,
                   preview_openings, source_usernames, is_multi_account, time_control
            FROM saved_reports
            {where_clause}
            ORDER BY created_at DESC
            LIMIT {limit_param} OFFSET {offset_param}
        """

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

            return [
                {
                    "id": str(row["id"]),
                    "name": row["name"],
                    "created_at": row["created_at"].isoformat(),
                    "updated_at": row["updated_at"].isoformat(),
                    "total_games": row["total_games"],
                    "overall_winrate": row["overall_winrate"],
                    "preview_openings": row["preview_openings"] or [],
                    "source_usernames": row["source_usernames"] or [],
                    "is_multi_account": row["is_multi_account"] or False,
                    "time_control": row["time_control"]
                }
                for row in rows
            ]

    @staticmethod
    async def get_report_by_id(
        pool: asyncpg.Pool,
        report_id: str,
        user_id: Optional[str],
        session_id: Optional[str],
        lite: bool = False
    ) -> Optional[Any]:
        """
        Get a full report by ID.

        Args:
            pool: Database connection pool
            report_id: Report ID to fetch
            user_id: User ID (for authenticated users)
            session_id: Session ID (for anonymous users)
            lite: If True, excludes heavy fields (engine_analysis, generated_puzzles, etc.)

        Returns:
            RepertoireReport dict or None if not found
        """
        t_start = time.perf_counter()
        
        conditions = [f"id = $1"]
        params = [report_id]

        # Add owner filter
        if user_id:
            conditions.append(f"user_id = $2")
            params.append(user_id)
        elif session_id:
            conditions.append(f"session_id = $2")
            params.append(session_id)
        else:
            return None

        where_clause = " WHERE " + " AND ".join(conditions)
        query = f"SELECT report_data, report_data_backend, report_data_key FROM saved_reports{where_clause}"

        async with pool.acquire() as conn:
            t_query_start = time.perf_counter()
            row = await conn.fetchrow(query, *params)
            t_query_end = time.perf_counter()

            if not row:
                return None

            t_parse_start = time.perf_counter()
            try:
                backend = row["report_data_backend"]
                key = row["report_data_key"]
            except (KeyError, IndexError):
                backend = None
                key = None
            if backend == "s3" and key:
                store = get_report_object_store()
                if not store.enabled:
                    raise RuntimeError("Report stored in S3 but REPORT_STORAGE_BACKEND is not enabled")
                report_data = await store.get_report(key)
                raw_size = len(json.dumps(report_data))
            else:
                report_data = json.loads(row["report_data"])
                raw_size = len(row["report_data"])
            t_parse_end = time.perf_counter()
            
            # If lite mode, strip heavy fields before returning
            if lite:
                for heavy_key in HEAVY_REPORT_FIELDS:
                    if heavy_key in report_data:
                        report_data[heavy_key] = None
            
            t_end = time.perf_counter()
            
            # Log performance diagnostics
            print(f"[ReportLoad] report_id={report_id} lite={lite}")
            print(f"[ReportLoad] DB query: {(t_query_end - t_query_start)*1000:.1f}ms")
            print(f"[ReportLoad] JSON parse: {(t_parse_end - t_parse_start)*1000:.1f}ms")
            print(f"[ReportLoad] Raw JSON size: {raw_size/1024:.1f} KB ({raw_size/1024/1024:.2f} MB)")
            print(f"[ReportLoad] Total: {(t_end - t_start)*1000:.1f}ms")
            
            # Return raw dict directly - skip Pydantic validation for faster loading
            return report_data

    @staticmethod
    async def get_report_heavy_fields(
        pool: asyncpg.Pool,
        report_id: str,
        user_id: Optional[str],
        session_id: Optional[str],
        fields: Optional[List[str]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get only the heavy fields of a report for lazy loading.
        
        Args:
            pool: Database connection pool
            report_id: Report ID to fetch
            user_id: User ID (for authenticated users)
            session_id: Session ID (for anonymous users)
            fields: List of fields to fetch (default: all heavy fields)

        Returns:
            Dict with requested heavy fields only
        """
        t_start = time.perf_counter()
        
        conditions = [f"id = $1"]
        params = [report_id]

        if user_id:
            conditions.append(f"user_id = $2")
            params.append(user_id)
        elif session_id:
            conditions.append(f"session_id = $2")
            params.append(session_id)
        else:
            return None

        where_clause = " WHERE " + " AND ".join(conditions)

        heavy_fields = fields or HEAVY_REPORT_FIELDS

        # Check storage backend first so we can handle S3-backed reports.
        async with pool.acquire() as conn:
            backend_row = await conn.fetchrow(
                f"SELECT report_data_backend, report_data_key FROM saved_reports{where_clause}",
                *params,
            )

            if not backend_row:
                return None

            backend = backend_row["report_data_backend"]
            key = backend_row["report_data_key"]

            if backend != "s3" or not key:
                # Use PostgreSQL JSONB operators to extract only requested fields
                field_extractions = [f"report_data->'{f}' as {f}" for f in heavy_fields]
                query = f"SELECT {', '.join(field_extractions)} FROM saved_reports{where_clause}"

                t_query_start = time.perf_counter()
                row = await conn.fetchrow(query, *params)
                t_query_end = time.perf_counter()

                if not row:
                    return None

                result = {}
                t_parse_start = time.perf_counter()
                for field in heavy_fields:
                    val = row.get(field)
                    if val is not None:
                        # JSONB extraction returns string, need to parse
                        result[field] = json.loads(val) if isinstance(val, str) else val
                t_parse_end = time.perf_counter()

                print(f"[ReportHeavyFields] report_id={report_id} fields={heavy_fields}")
                print(f"[ReportHeavyFields] DB query: {(t_query_end - t_query_start)*1000:.1f}ms")
                print(f"[ReportHeavyFields] JSON parse: {(t_parse_end - t_parse_start)*1000:.1f}ms")
                print(f"[ReportHeavyFields] Total: {(time.perf_counter() - t_start)*1000:.1f}ms")

                return result

        store = get_report_object_store()
        if not store.enabled:
            raise RuntimeError("Report stored in S3 but REPORT_STORAGE_BACKEND is not enabled")

        report_data = await store.get_report(key)
        return {field: report_data.get(field) for field in heavy_fields if field in report_data}

    @staticmethod
    async def delete_report(
        pool: asyncpg.Pool,
        report_id: str,
        user_id: Optional[str],
        session_id: Optional[str]
    ) -> bool:
        """
        Delete a report by ID.

        Args:
            pool: Database connection pool
            report_id: Report ID to delete
            user_id: User ID (for authenticated users)
            session_id: Session ID (for anonymous users)

        Returns:
            True if deleted, False if not found
        """
        conditions = [f"id = $1"]
        params = [report_id]

        # Add owner filter
        if user_id:
            conditions.append(f"user_id = $2")
            params.append(user_id)
        elif session_id:
            conditions.append(f"session_id = $2")
            params.append(session_id)
        else:
            return False

        where_clause = " WHERE " + " AND ".join(conditions)
        query = f"DELETE FROM saved_reports{where_clause}"

        store = get_report_object_store()
        report_key = None

        async with pool.acquire() as conn:
            if store.enabled:
                backend_row = await conn.fetchrow(
                    f"SELECT report_data_backend, report_data_key FROM saved_reports{where_clause}",
                    *params,
                )
                if backend_row and backend_row["report_data_backend"] == "s3":
                    report_key = backend_row["report_data_key"]

            result = await conn.execute(query, *params)

        deleted = "DELETE 1" in result
        if deleted and report_key:
            await store.delete_report(report_key)
        return deleted

    @staticmethod
    async def update_report_name(
        pool: asyncpg.Pool,
        report_id: str,
        new_name: str,
        user_id: Optional[str],
        session_id: Optional[str]
    ) -> bool:
        """
        Update a report's name.

        Args:
            pool: Database connection pool
            report_id: Report ID to update
            new_name: New name for the report
            user_id: User ID (for authenticated users)
            session_id: Session ID (for anonymous users)

        Returns:
            True if updated, False if not found
        """
        conditions = [f"id = $1"]
        params = [report_id, new_name]

        # Add owner filter
        if user_id:
            conditions.append(f"user_id = $3")
            params.append(user_id)
        elif session_id:
            conditions.append(f"session_id = $3")
            params.append(session_id)
        else:
            return False

        where_clause = " WHERE " + " AND ".join(conditions)
        query = f"""
            UPDATE saved_reports
            SET name = $2, updated_at = NOW()
            {where_clause}
        """

        async with pool.acquire() as conn:
            result = await conn.execute(query, *params)
            return "UPDATE 1" in result

    @staticmethod
    async def get_reports_count(
        pool: asyncpg.Pool,
        user_id: Optional[str],
        session_id: Optional[str],
        player_filters: Optional[List[str]] = None
    ) -> int:
        """
        Get the total count of reports for a user.

        Args:
            pool: Database connection pool
            user_id: User ID (for authenticated users)
            session_id: Session ID (for anonymous users)
            player_filters: Optional list of usernames to filter by

        Returns:
            Total number of reports
        """
        conditions = []
        params = []
        param_count = 0

        # Add owner filter - check both user_id AND session_id for logged-in users
        if user_id and session_id:
            param_count += 1
            user_param = param_count
            params.append(user_id)
            param_count += 1
            session_param = param_count
            params.append(session_id)
            conditions.append(f"(user_id = ${user_param} OR session_id = ${session_param})")
        elif user_id:
            param_count += 1
            conditions.append(f"user_id = ${param_count}")
            params.append(user_id)
        elif session_id:
            param_count += 1
            conditions.append(f"session_id = ${param_count}")
            params.append(session_id)
        else:
            return 0

        # Add player filter if specified
        if player_filters:
            param_count += 1
            conditions.append(f"source_usernames && ${param_count}")
            params.append(player_filters)

        where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
        query = f"SELECT COUNT(*) FROM saved_reports{where_clause}"

        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, *params)
            return row[0] if row else 0

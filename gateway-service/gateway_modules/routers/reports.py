"""
Reports router - Saved repertoire reports CRUD and share clips.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Query
import logging
import asyncpg

from gateway_modules.dependencies import get_pool, get_owner_from_request, log_activity
from gateway_modules.services.report_storage_service import ReportStorageService
from gateway_modules.observability import increment_analysis_requests

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analysis", tags=["reports"])


@router.get("/reports")
async def get_saved_reports(request: Request, players: str = "", limit: int = 50, offset: int = 0):
    """Get saved repertoire reports with optional player filtering"""
    auth_header = request.headers.get("Authorization", "")
    session_header = request.headers.get("x-session-id", "")
    logger.info(
        "[Reports] Auth header present: %s, Session header: %s...",
        bool(auth_header),
        session_header[:20] if session_header else "None",
        extra={"domain": "reports"},
    )

    user_id, session_id = get_owner_from_request(request)
    logger.info(
        "[Reports] user_id=%s, session_id=%s",
        user_id,
        session_id,
        extra={"domain": "reports"},
    )
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    try:
        player_filters = [p.strip() for p in players.split(",") if p.strip()] if players else []

        pool = await get_pool()
        async with pool.acquire() as conn:
            if user_id:
                linked_accounts_rows = await conn.fetch(
                    "SELECT platform, username FROM linked_accounts WHERE user_id = $1",
                    user_id
                )
                setting_row = await conn.fetchrow(
                    "SELECT setting_value FROM user_settings WHERE user_id = $1 AND setting_key = 'show_only_my_games'",
                    user_id
                )
            else:
                linked_accounts_rows = await conn.fetch(
                    "SELECT platform, username FROM linked_accounts WHERE session_id = $1",
                    session_id
                )
                setting_row = await conn.fetchrow(
                    "SELECT setting_value FROM user_settings WHERE session_id = $1 AND setting_key = 'show_only_my_games'",
                    session_id
                )

            linked_usernames = [row["username"] for row in linked_accounts_rows]
            show_only_my_games = bool(setting_row["setting_value"]) if setting_row else False

            if not player_filters and show_only_my_games:
                player_filters = linked_usernames

        reports = await ReportStorageService.get_reports_list(
            pool, user_id, session_id, player_filters, limit, offset
        )

        total_count = await ReportStorageService.get_reports_count(
            pool, user_id, session_id, player_filters
        )

        return {
            "reports": reports,
            "total_count": total_count,
            "linked_accounts": [{"platform": row["platform"], "username": row["username"]} for row in linked_accounts_rows],
            "show_only_my_games": show_only_my_games,
            "active_filters": player_filters
        }

    except Exception as e:
        logger.error(
            "Error getting saved reports: %s",
            str(e),
            extra={"domain": "reports"},
        )
        raise HTTPException(status_code=500, detail=f"Failed to get saved reports: {str(e)}")


@router.post("/reports")
async def save_repertoire_report(request: Request):
    """Save a repertoire report"""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    try:
        body = await request.json()
        name = body.get("name", "").strip()
        report_data = body.get("report_data", {})

        if not name:
            raise HTTPException(status_code=400, detail="Report name is required")

        if not report_data:
            raise HTTPException(status_code=400, detail="Report data is required")

        from gateway_modules.models.repertoire import RepertoireReport
        report = RepertoireReport(**report_data)

        source_usernames = body.get("source_usernames", [])
        
        time_control = body.get("time_control")
        if not time_control and body.get("import_request"):
            time_control = body.get("import_request", {}).get("time_control")

        pool = await get_pool()
        saved_report = await ReportStorageService.save_report(
            pool, user_id, session_id, name, report, source_usernames, time_control
        )

        await log_activity(
            pool, user_id, session_id, "report_generated",
            subject_id=saved_report.get("id"),
            meta={"name": name, "total_games": report.total_games}
        )

        return saved_report

    except Exception as e:
        logger.error(
            "Error saving report: %s",
            str(e),
            extra={"domain": "reports"},
        )
        raise HTTPException(status_code=500, detail=f"Failed to save report: {str(e)}")


@router.get("/reports/usernames")
async def get_reports_source_usernames(request: Request):
    """Get unique source_usernames from all saved reports for the current user/session"""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        return {"usernames": []}

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            if user_id:
                rows = await conn.fetch(
                    """
                    SELECT DISTINCT unnest(source_usernames) as username
                    FROM saved_reports
                    WHERE user_id = $1 
                      AND source_usernames IS NOT NULL 
                      AND array_length(source_usernames, 1) > 0
                    ORDER BY username
                    """,
                    user_id
                )
            elif session_id:
                rows = await conn.fetch(
                    """
                    SELECT DISTINCT unnest(source_usernames) as username
                    FROM saved_reports
                    WHERE session_id = $1 
                      AND source_usernames IS NOT NULL 
                      AND array_length(source_usernames, 1) > 0
                    ORDER BY username
                    """,
                    session_id
                )
            else:
                rows = []
            
            usernames = [row["username"] for row in rows if row["username"]]
            return {"usernames": usernames}

    except Exception as e:
        logger.error(
            "Error getting report usernames: %s",
            str(e),
            extra={"domain": "reports"},
        )
        return {"usernames": []}


@router.get("/reports/{report_id}")
async def get_saved_report(report_id: str, request: Request, lite: bool = False):
    """Get a specific saved report"""
    increment_analysis_requests("/analysis/reports/{id}")
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    try:
        pool = await get_pool()
        report = await ReportStorageService.get_report_by_id(pool, report_id, user_id, session_id, lite=lite)

        if not report:
            raise HTTPException(status_code=404, detail="Report not found")

        return report

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Error getting report %s: %s",
            report_id,
            str(e),
            extra={"domain": "reports"},
        )
        raise HTTPException(status_code=500, detail=f"Failed to get report: {str(e)}")


@router.delete("/reports/{report_id}")
async def delete_saved_report(report_id: str, request: Request):
    """Delete a saved report"""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    try:
        pool = await get_pool()
        deleted = await ReportStorageService.delete_report(pool, report_id, user_id, session_id)

        if not deleted:
            raise HTTPException(status_code=404, detail="Report not found")

        return {"success": True, "message": "Report deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Error deleting report %s: %s",
            report_id,
            str(e),
            extra={"domain": "reports"},
        )
        raise HTTPException(status_code=500, detail=f"Failed to delete report: {str(e)}")


@router.put("/reports/{report_id}")
async def update_saved_report(report_id: str, request: Request):
    """Update a saved report (currently only name updates supported)"""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    try:
        body = await request.json()
        new_name = body.get("name", "").strip()

        if not new_name:
            raise HTTPException(status_code=400, detail="Report name is required")

        pool = await get_pool()
        updated = await ReportStorageService.update_report_name(
            pool, report_id, new_name, user_id, session_id
        )

        if not updated:
            raise HTTPException(status_code=404, detail="Report not found")

        return {"success": True, "message": "Report updated successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Error updating report {report_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update report: {str(e)}")


@router.get("/reports/{report_id}/heavy")
async def get_saved_report_heavy_fields(
    report_id: str,
    request: Request,
    fields: str = Query("engine_analysis,generated_puzzles,weak_lines,charts_additional", description="Comma-separated list of fields to fetch")
):
    """Get only the heavy/large fields of a saved report for lazy loading.
    
    Available fields:
    - engine_analysis: Full move-by-move analysis data
    - generated_puzzles: Puzzles generated from blunders/mistakes
    - weak_lines: Identified weak lines in the player's repertoire
    - charts_additional: Additional chart data (eval swings, tactical patterns)
    """
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    try:
        pool = await get_pool()
        
        requested_fields = [f.strip() for f in fields.split(",") if f.strip()]
        valid_fields = ["engine_analysis", "generated_puzzles", "weak_lines", "charts_additional"]
        requested_fields = [f for f in requested_fields if f in valid_fields]
        
        if not requested_fields:
            raise HTTPException(status_code=400, detail=f"No valid fields specified. Valid options: {valid_fields}")
        
        heavy_data = await ReportStorageService.get_report_heavy_fields(
            pool, report_id, user_id, session_id, fields=requested_fields
        )

        if not heavy_data:
            raise HTTPException(status_code=404, detail="Report not found")

        return heavy_data

    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Error getting heavy fields for report {report_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get report fields: {str(e)}")


@router.get("/activities/heatmap")
async def get_activity_heatmap(request: Request, weeks: int = Query(52, ge=1, le=104)):
    """Get activity heatmap data for GitHub-style visualization."""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT DATE(created_at) as date, COUNT(*) as count
                FROM activities
                WHERE (user_id = $1 OR session_id = $2)
                  AND created_at >= NOW() - INTERVAL '1 week' * $3
                GROUP BY DATE(created_at)
                ORDER BY date
                """,
                user_id, session_id, weeks
            )

        return {
            "data": [
                {
                    "date": row["date"].isoformat() if row["date"] else None,
                    "count": row["count"]
                }
                for row in rows
            ],
            "weeks": weeks
        }

    except Exception as e:
        logger.info(f"Error fetching activity heatmap: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch activity data: {str(e)}")

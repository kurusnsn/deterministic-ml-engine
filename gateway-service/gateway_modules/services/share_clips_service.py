"""
Share Clips Service - Manages shareable game review clips.

This service handles CRUD operations for share clips and provides
utilities for generating slugs and building render payloads.

Data Sources (read from existing analysis, NO new computations):
- Game metadata (games table)
- Move analysis (from /analysis/game endpoint response)
- Engine annotations (from game_review_service.build_move_review_annotations)
"""

import uuid
import secrets
import string
from typing import Optional, Dict, Any, List
from datetime import datetime
import asyncpg


def generate_unique_slug(san: str, classification: Optional[str], move_index: int) -> str:
    """
    Generate a unique, readable slug for a share clip.
    
    Format: {san}-{classification}-{move_index}-{random}
    Example: "nxe5-brilliant-23-a7b2"
    
    Args:
        san: SAN move notation (e.g., "Nxe5")
        classification: Move classification (e.g., "brilliant", "blunder")
        move_index: Index of the move in the game
    
    Returns:
        Unique slug string
    """
    # Clean SAN for URL (remove special chars like +, #, =)
    clean_san = san.lower().replace("+", "").replace("#", "").replace("=", "")
    
    # Generate random suffix
    random_suffix = ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(4))
    
    parts = [clean_san]
    if classification:
        parts.append(classification.lower())
    parts.append(str(move_index))
    parts.append(random_suffix)
    
    return "-".join(parts)


def build_render_payload(
    analysis_id: str,
    game_id: Optional[int],
    primary_move_index: int,
    move_data: Dict[str, Any],
    game_meta: Dict[str, Any],
    visual_options: Dict[str, bool]
) -> Dict[str, Any]:
    """
    Build the render payload for a share clip.
    
    This is the data structure passed to the renderer service.
    All data must come from existing analysis results - NO new computations.
    
    Args:
        analysis_id: ID of the analysis/report
        game_id: Optional game ID
        primary_move_index: Index of the featured move
        move_data: Move-specific data (fen, san, eval, classification, commentary, arrows)
        game_meta: Game metadata (opponent, result, time_control, etc.)
        visual_options: Display options (show_threat_arrows, show_move_classification)
    
    Returns:
        Render payload dictionary
    """
    return {
        "analysis_id": analysis_id,
        "game_id": game_id,
        "primary_move_index": primary_move_index,
        "frame": {
            "fen": move_data.get("fen", ""),
            "san": move_data.get("san", ""),
            "eval_cp_before": move_data.get("eval_cp_before", 0),
            "eval_cp_after": move_data.get("eval_cp_after", 0),
            "classification": move_data.get("classification"),
            "commentary": move_data.get("commentary", ""),
            "threat_arrows": move_data.get("threat_arrows", [])
        },
        "visual_options": visual_options,
        "game_meta": game_meta
    }


class ShareClipsService:
    """Service for managing share clips in the database."""

    @staticmethod
    async def create_clip(
        pool: asyncpg.Pool,
        user_id: str,
        game_id: Optional[int],
        analysis_id: str,
        primary_move_index: int,
        slug: str,
        show_threat_arrows: bool = True,
        show_move_classification: bool = True,
        render_payload: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Create a new share clip record.
        
        Args:
            pool: Database connection pool
            user_id: Owner user ID
            game_id: Optional game ID
            analysis_id: Analysis/report ID
            primary_move_index: Featured move index
            slug: Unique URL slug
            show_threat_arrows: Whether to show threat arrows
            show_move_classification: Whether to show classification badge
            render_payload: Optional render payload JSON
        
        Returns:
            Created clip record as dict
        """
        import json
        
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO share_clips (
                    user_id, game_id, analysis_id, primary_move_index, slug,
                    show_threat_arrows, show_move_classification, render_payload
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id, slug, created_at, updated_at
                """,
                user_id,
                game_id,
                analysis_id,
                primary_move_index,
                slug,
                show_threat_arrows,
                show_move_classification,
                json.dumps(render_payload) if render_payload else None
            )
            
            return {
                "id": str(row["id"]),
                "slug": row["slug"],
                "created_at": row["created_at"].isoformat(),
                "updated_at": row["updated_at"].isoformat()
            }

    @staticmethod
    async def get_clip_by_id(
        pool: asyncpg.Pool,
        clip_id: str,
        user_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get a share clip by ID, optionally filtering by owner.
        
        Args:
            pool: Database connection pool
            clip_id: Clip UUID
            user_id: Optional owner filter
        
        Returns:
            Clip record as dict or None if not found
        """
        import json
        
        async with pool.acquire() as conn:
            if user_id:
                row = await conn.fetchrow(
                    """
                    SELECT * FROM share_clips WHERE id = $1 AND user_id = $2
                    """,
                    clip_id,
                    user_id
                )
            else:
                row = await conn.fetchrow(
                    """
                    SELECT * FROM share_clips WHERE id = $1
                    """,
                    clip_id
                )
            
            if not row:
                return None
            
            return _row_to_dict(row)

    @staticmethod
    async def get_clip_by_slug(
        pool: asyncpg.Pool,
        slug: str,
        public_only: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        Get a share clip by its public slug.
        
        Args:
            pool: Database connection pool
            slug: URL slug
            public_only: If True, only return if is_public=True
        
        Returns:
            Clip record as dict or None if not found
        """
        async with pool.acquire() as conn:
            if public_only:
                row = await conn.fetchrow(
                    """
                    SELECT * FROM share_clips WHERE slug = $1 AND is_public = TRUE
                    """,
                    slug
                )
            else:
                row = await conn.fetchrow(
                    """
                    SELECT * FROM share_clips WHERE slug = $1
                    """,
                    slug
                )
            
            if not row:
                return None
            
            return _row_to_dict(row)

    @staticmethod
    async def update_clip_urls(
        pool: asyncpg.Pool,
        clip_id: str,
        gif_url: Optional[str] = None,
        thumbnail_url: Optional[str] = None
    ) -> bool:
        """
        Update the rendered image URLs for a clip.
        
        Args:
            pool: Database connection pool
            clip_id: Clip UUID
            gif_url: URL to rendered GIF/PNG
            thumbnail_url: URL to thumbnail image
        
        Returns:
            True if updated, False if not found
        """
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE share_clips
                SET gif_url = COALESCE($2, gif_url),
                    thumbnail_url = COALESCE($3, thumbnail_url),
                    updated_at = NOW()
                WHERE id = $1
                """,
                clip_id,
                gif_url,
                thumbnail_url
            )
            return "UPDATE 1" in result

    @staticmethod
    async def get_user_clips(
        pool: asyncpg.Pool,
        user_id: str,
        limit: int = 20,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get clips owned by a user.
        
        Args:
            pool: Database connection pool
            user_id: Owner user ID
            limit: Maximum results
            offset: Pagination offset
        
        Returns:
            List of clip records
        """
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM share_clips
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                user_id,
                limit,
                offset
            )
            
            return [_row_to_dict(row) for row in rows]

    @staticmethod
    async def delete_clip(
        pool: asyncpg.Pool,
        clip_id: str,
        user_id: str
    ) -> bool:
        """
        Delete a share clip.
        
        Args:
            pool: Database connection pool
            clip_id: Clip UUID
            user_id: Owner user ID (for authorization)
        
        Returns:
            True if deleted, False if not found
        """
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM share_clips WHERE id = $1 AND user_id = $2
                """,
                clip_id,
                user_id
            )
            return "DELETE 1" in result


def _row_to_dict(row: asyncpg.Record) -> Dict[str, Any]:
    """Convert a database row to a dictionary."""
    import json
    
    result = dict(row)
    
    # Convert UUID to string
    if result.get("id"):
        result["id"] = str(result["id"])
    if result.get("user_id"):
        result["user_id"] = str(result["user_id"])
    
    # Convert timestamps to ISO strings
    if result.get("created_at"):
        result["created_at"] = result["created_at"].isoformat()
    if result.get("updated_at"):
        result["updated_at"] = result["updated_at"].isoformat()
    
    # Parse render_payload JSON
    if result.get("render_payload") and isinstance(result["render_payload"], str):
        result["render_payload"] = json.loads(result["render_payload"])
    
    return result

"""
Add Openings Service - Import openings into repertoire buckets.

Provides functionality to:
1. Copy openings from another user repertoire bucket
2. Copy openings from the global ECO opening catalog

All imports are COPIES - no references are created. Source data is never modified.
Provenance metadata is stored in the 'note' field for traceability.
"""

import asyncpg
from typing import List, Optional, Dict, Any
from uuid import uuid4

from ..models.repertoire import RepertoireBucketOpening


async def add_openings_from_repertoire(
    pool: asyncpg.Pool,
    user_id: str,
    target_repertoire_id: str,
    source_repertoire_id: str,
    eco_codes: List[str],
) -> Dict[str, Any]:
    """
    Copy selected openings from a source repertoire bucket to a target bucket.
    
    Args:
        pool: Database connection pool
        user_id: ID of the authenticated user (must own both buckets)
        target_repertoire_id: ID of the bucket to add openings to
        source_repertoire_id: ID of the bucket to copy openings from
        eco_codes: List of ECO codes to import
        
    Returns:
        {added: int, duplicates: int, errors: [str]}
        
    Raises:
        ValueError: If user doesn't own one of the buckets
    """
    if not eco_codes:
        return {"added": 0, "duplicates": 0, "errors": []}
    
    async with pool.acquire() as conn:
        # Validate ownership of both buckets
        target_owner = await conn.fetchval(
            "SELECT user_id FROM user_repertoires WHERE id = $1",
            target_repertoire_id
        )
        if not target_owner or target_owner != user_id:
            raise ValueError("Target repertoire not found or not owned by user")
        
        source_owner = await conn.fetchval(
            "SELECT user_id FROM user_repertoires WHERE id = $1",
            source_repertoire_id
        )
        if not source_owner or source_owner != user_id:
            raise ValueError("Source repertoire not found or not owned by user")
        
        # Get source repertoire name for provenance
        source_name = await conn.fetchval(
            "SELECT name FROM user_repertoires WHERE id = $1",
            source_repertoire_id
        )
        
        # Get openings from source bucket matching the eco_codes
        source_openings = await conn.fetch(
            """
            SELECT eco_code, color, note
            FROM user_repertoire_openings
            WHERE repertoire_id = $1 AND eco_code = ANY($2)
            """,
            source_repertoire_id,
            eco_codes
        )
        
        if not source_openings:
            return {"added": 0, "duplicates": 0, "errors": ["No matching openings found in source"]}
        
        # Get existing eco_codes in target to detect duplicates
        existing_codes = await conn.fetch(
            """
            SELECT eco_code, color
            FROM user_repertoire_openings
            WHERE repertoire_id = $1
            """,
            target_repertoire_id
        )
        existing_set = {(row["eco_code"], row["color"]) for row in existing_codes}
        
        added = 0
        duplicates = 0
        
        async with conn.transaction():
            for opening in source_openings:
                eco_code = opening["eco_code"]
                color = opening["color"]
                original_note = opening["note"] or ""
                
                # Check if already exists in target
                if (eco_code, color) in existing_set:
                    duplicates += 1
                    continue
                
                # Create provenance note
                provenance = f"Imported from: {source_name}"
                if original_note:
                    note = f"{original_note} | {provenance}"
                else:
                    note = provenance
                
                # Insert new opening
                await conn.execute(
                    """
                    INSERT INTO user_repertoire_openings (id, repertoire_id, eco_code, color, note)
                    VALUES ($1, $2, $3, $4, $5)
                    """,
                    uuid4(),
                    target_repertoire_id,
                    eco_code,
                    color,
                    note
                )
                added += 1
            
            # Update target repertoire's updated_at
            await conn.execute(
                "UPDATE user_repertoires SET updated_at = NOW() WHERE id = $1",
                target_repertoire_id
            )
        
        return {"added": added, "duplicates": duplicates, "errors": []}


async def add_openings_from_catalog(
    pool: asyncpg.Pool,
    user_id: str,
    target_repertoire_id: str,
    catalog_openings: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Copy openings from the ECO catalog to a target repertoire bucket.
    
    Args:
        pool: Database connection pool
        user_id: ID of the authenticated user (must own the bucket)
        target_repertoire_id: ID of the bucket to add openings to
        catalog_openings: List of openings from catalog, each with:
            - eco: ECO code (e.g., "B90")
            - name: Opening name (e.g., "Sicilian Defense: Najdorf Variation")
            - color: "white" or "black" (side to play)
            
    Returns:
        {added: int, duplicates: int, errors: [str]}
        
    Raises:
        ValueError: If user doesn't own the bucket
    """
    if not catalog_openings:
        return {"added": 0, "duplicates": 0, "errors": []}
    
    async with pool.acquire() as conn:
        # Validate ownership
        owner = await conn.fetchval(
            "SELECT user_id FROM user_repertoires WHERE id = $1",
            target_repertoire_id
        )
        if not owner or owner != user_id:
            raise ValueError("Repertoire not found or not owned by user")
        
        # Get existing eco_codes in target to detect duplicates
        existing_codes = await conn.fetch(
            """
            SELECT eco_code, color
            FROM user_repertoire_openings
            WHERE repertoire_id = $1
            """,
            target_repertoire_id
        )
        existing_set = {(row["eco_code"], row["color"]) for row in existing_codes}
        
        added = 0
        duplicates = 0
        errors = []
        
        async with conn.transaction():
            for opening in catalog_openings:
                eco = opening.get("eco", "").strip()
                name = opening.get("name", "").strip()
                color = opening.get("color", "").strip().lower()
                
                # Validate required fields
                if not eco:
                    errors.append(f"Missing ECO code for opening: {name}")
                    continue
                
                if color not in ("white", "black"):
                    errors.append(f"Invalid color '{color}' for {eco}")
                    continue
                
                # Check if already exists in target
                if (eco, color) in existing_set:
                    duplicates += 1
                    continue
                
                # Create provenance note with opening name
                note = f"From catalog: {name}" if name else "From catalog"
                
                # Insert new opening
                await conn.execute(
                    """
                    INSERT INTO user_repertoire_openings (id, repertoire_id, eco_code, color, note)
                    VALUES ($1, $2, $3, $4, $5)
                    """,
                    uuid4(),
                    target_repertoire_id,
                    eco,
                    color,
                    note
                )
                added += 1
            
            # Update target repertoire's updated_at
            await conn.execute(
                "UPDATE user_repertoires SET updated_at = NOW() WHERE id = $1",
                target_repertoire_id
            )
        
        return {"added": added, "duplicates": duplicates, "errors": errors}


async def get_openings_for_import(
    pool: asyncpg.Pool,
    user_id: str,
    repertoire_id: str,
) -> List[Dict[str, Any]]:
    """
    Get openings from a repertoire bucket for the import selection UI.
    
    Args:
        pool: Database connection pool
        user_id: ID of the authenticated user (must own the bucket)
        repertoire_id: ID of the bucket to get openings from
        
    Returns:
        List of openings: [{eco_code, color, note}]
        
    Raises:
        ValueError: If user doesn't own the bucket
    """
    async with pool.acquire() as conn:
        # Validate ownership
        owner = await conn.fetchval(
            "SELECT user_id FROM user_repertoires WHERE id = $1",
            repertoire_id
        )
        if not owner or owner != user_id:
            raise ValueError("Repertoire not found or not owned by user")
        
        rows = await conn.fetch(
            """
            SELECT eco_code, color, note
            FROM user_repertoire_openings
            WHERE repertoire_id = $1
            ORDER BY eco_code
            """,
            repertoire_id
        )
        
        return [
            {
                "eco_code": row["eco_code"],
                "color": row["color"],
                "note": row["note"]
            }
            for row in rows
        ]

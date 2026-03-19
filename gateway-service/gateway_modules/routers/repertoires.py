from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import List
from uuid import UUID
import asyncpg

from gateway_modules.models.repertoire_api import Repertoire, RepertoireCreate, RepertoireUpdate
from gateway_modules.models import repertoire_db

router = APIRouter()

@router.post("/repertoires", response_model=Repertoire, status_code=status.HTTP_201_CREATED)
async def create_repertoire(
    repertoire: RepertoireCreate,
    request: Request,
    pool: asyncpg.Pool = Depends(lambda: None), # Will be overridden by app.get_pool
):
    from app import get_pool, get_owner_from_request, ALLOW_ANON_STUDIES
    
    # Manually get pool if needed (Depends(get_pool) usually handles this but we need to avoid circular import at definition time)
    # Actually, Depends(get_pool) works fine if get_pool is imported locally or passed.
    # But since we're using APIRouter.post, we can use the Dependency Injection.
    
    # Let's use a better approach: just import inside the function.
    pool = await get_pool()
    user_id, session_id = get_owner_from_request(request)
    
    if not user_id:
        if not (ALLOW_ANON_STUDIES and session_id):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not authenticated")

    # Check for duplicate (same name + same ECO codes for the same user)
    existing = await repertoire_db.find_duplicate_repertoire(
        pool=pool,
        user_id=user_id,
        session_id=session_id,
        name=repertoire.name,
        eco_codes=repertoire.eco_codes
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A repertoire with the name '{repertoire.name}' and similar openings already exists"
        )

    db_repertoire = await repertoire_db.create_repertoire(
        pool=pool,
        user_id=user_id,
        session_id=session_id,
        name=repertoire.name,
        eco_codes=repertoire.eco_codes,
        openings=[o.dict() for o in repertoire.openings],
        source_report_id=repertoire.source_report_id,
        category=repertoire.category,
        color=repertoire.color
    )
    return db_repertoire.to_dict()


@router.get("/repertoires", response_model=List[Repertoire])
async def list_repertoires(
    request: Request,
    favorite: bool = None,
    report_id: UUID = None,
):
    from app import get_pool, get_owner_from_request, ALLOW_ANON_STUDIES
    pool = await get_pool()
    user_id, session_id = get_owner_from_request(request)
    
    if not user_id:
        if not (ALLOW_ANON_STUDIES and session_id):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not authenticated")

    repertoires = await repertoire_db.get_repertoires_by_owner(
        pool, user_id=user_id, session_id=session_id, favorite=favorite
    )

    if report_id:
        repertoires = [r for r in repertoires if r.source_report_id == report_id]

    return [r.to_dict() for r in repertoires]


@router.get("/repertoires/stats")
async def get_repertoire_stats(
    request: Request,
):
    from app import get_pool, get_owner_from_request, ALLOW_ANON_STUDIES
    pool = await get_pool()
    user_id, session_id = get_owner_from_request(request)
    
    if not user_id:
        if not (ALLOW_ANON_STUDIES and session_id):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not authenticated")

    repertoires = await repertoire_db.get_repertoires_by_owner(
        pool, user_id=user_id, session_id=session_id
    )

    # Calculate stats
    total_repertoires = len(repertoires)
    favorite_count = sum(1 for r in repertoires if r.favorite)
    categories = {}
    total_winrate_sum = 0

    for r in repertoires:
        # Count categories
        category = r.category or 'core'
        categories[category] = categories.get(category, 0) + 1

        # Calculate weighted winrate
        openings = r.openings or []
        total_games = sum(o.get('games_count', 0) for o in openings)
        if total_games > 0:
            winrate_sum = sum(o.get('winrate', 0.0) * o.get('games_count', 0) for o in openings)
            total_winrate_sum += winrate_sum / total_games

    avg_winrate = total_winrate_sum / total_repertoires if total_repertoires > 0 else 0.0

    return {
        "total_repertoires": total_repertoires,
        "favorite_count": favorite_count,
        "categories": categories,
        "avg_winrate": avg_winrate
    }


@router.get("/repertoires/{repertoire_id}", response_model=Repertoire)
async def get_repertoire(
    repertoire_id: UUID,
    request: Request,
):
    from app import get_pool, get_owner_from_request, ALLOW_ANON_STUDIES
    pool = await get_pool()
    user_id, session_id = get_owner_from_request(request)
    
    if not user_id:
        if not (ALLOW_ANON_STUDIES and session_id):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not authenticated")

    db_repertoire = await repertoire_db.get_repertoire_by_id(
        pool, repertoire_id=repertoire_id, user_id=user_id, session_id=session_id
    )
    if not db_repertoire:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repertoire not found")

    return db_repertoire.to_dict()


@router.patch("/repertoires/{repertoire_id}", response_model=Repertoire)
async def update_repertoire(
    repertoire_id: UUID,
    repertoire: RepertoireUpdate,
    request: Request,
):
    from app import get_pool, get_owner_from_request, ALLOW_ANON_STUDIES
    pool = await get_pool()
    user_id, session_id = get_owner_from_request(request)
    
    if not user_id:
        if not (ALLOW_ANON_STUDIES and session_id):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not authenticated")

    update_data = repertoire.dict(exclude_unset=True)
    if 'openings' in update_data and update_data['openings'] is not None:
        update_data['openings'] = [o.dict() for o in repertoire.openings if o is not None]

    updated_repertoire = await repertoire_db.update_repertoire(
        pool=pool,
        repertoire_id=repertoire_id,
        user_id=user_id,
        session_id=session_id,
        updates=update_data
    )
    if not updated_repertoire:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repertoire not found")

    return updated_repertoire.to_dict()


@router.delete("/repertoires/{repertoire_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repertoire(
    repertoire_id: UUID,
    request: Request,
):
    from app import get_pool, get_owner_from_request, ALLOW_ANON_STUDIES
    pool = await get_pool()
    user_id, session_id = get_owner_from_request(request)
    
    if not user_id:
        if not (ALLOW_ANON_STUDIES and session_id):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not authenticated")

    success = await repertoire_db.delete_repertoire(
        pool, repertoire_id=repertoire_id, user_id=user_id, session_id=session_id
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repertoire not found")

    return

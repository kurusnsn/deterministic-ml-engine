"""
Analysis router - Chess analysis endpoints with Stockfish and LLM commentary.

NOTE: This router contains large, complex endpoints that were extracted from app.py.
The analyze_with_llm and streaming endpoints contain significant GPU routing logic.
Future refactoring should extract the LLM logic into a dedicated service.
"""

import os
import time
import asyncio
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
import httpx
import asyncpg

from gateway_modules.dependencies import (
    get_pool,
    get_owner_from_request,
    log_activity,
)
import logging

logger = logging.getLogger(__name__)
from gateway_modules.chess_utils import (
    compute_move_facts,
    describe_board_state,
    summarize_stockfish,
    update_book_move_classifications,
)
from gateway_modules.gpu_routing import get_gpu_status

router = APIRouter(tags=["analysis"])

# Environment variables
STOCKFISH_URL = os.getenv("STOCKFISH_URL", "http://stockfish:8000")
ECO_URL = os.getenv("ECO_URL", "http://eco:8000")
LLM_URL = os.getenv("LLM_URL", "http://localhost:8001")
LLM_SERVICE_URL = os.getenv("LLM_SERVICE_URL", "")
UNIFIED_INFERENCE_URL = os.getenv("UNIFIED_INFERENCE_URL", "")

# GPU status tracking
_last_gpu_response = None


def update_gpu_status():
    """Update the GPU status after a successful response."""
    global _last_gpu_response
    _last_gpu_response = time.time()


def is_gpu_likely_cold():
    """Check if GPU is likely cold (hasn't been used recently)."""
    if _last_gpu_response is None:
        return True
    return (time.time() - _last_gpu_response) > 600  # 10 minutes


def should_use_modal_gpu():
    """Determine if we should route to Modal GPU or use fallback."""
    if not LLM_URL or "localhost" in LLM_URL:
        return False, "No LLM URL configured"
    
    if is_gpu_likely_cold():
        return False, "GPU likely cold"
    
    return True, "GPU available"


# Rate limiter setup
limiter = Limiter(key_func=get_remote_address)


def get_stockfish_limit():
    """Dynamic rate limit for stockfish endpoint."""
    return "100/minute"


@router.post("/stockfish")
async def analyze_stockfish(request: Request, payload: dict):
    """Forward analysis request to Stockfish service."""
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{STOCKFISH_URL}/analyze", json=payload)
        return r.json()


@router.post("/chess/analyze")
async def analyze_position(payload: dict, request: Request):
    """
    Analyze a chess position with Stockfish and ECO lookup.
    Returns evaluation, best moves, and opening information.
    """
    fen = payload.get("fen")
    if not fen:
        raise HTTPException(status_code=400, detail="FEN is required")

    results = {}

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Get Stockfish analysis
        try:
            depth = payload.get("depth", 18)
            sf_resp = await client.post(
                f"{STOCKFISH_URL}/analyze",
                json={"fen": fen, "depth": depth}
            )
            results["stockfish"] = sf_resp.json()
        except Exception as e:
            results["stockfish"] = {"error": str(e)}

        # Get ECO classification
        try:
            eco_resp = await client.get(f"{ECO_URL}/classify?fen={fen}")
            results["eco"] = eco_resp.json()
        except Exception as e:
            results["eco"] = {"error": str(e)}

        # Update book move classifications
        if "error" not in results.get("stockfish", {}):
            results["stockfish"] = await update_book_move_classifications(
                results["stockfish"], fen, client
            )

    return results


@router.post("/chess/analyze_with_llm")
async def analyze_with_llm(payload: dict, request: Request):
    """
    Analyze a position with Stockfish + LLM commentary.
    
    This is a complex endpoint that:
    1. Gets Stockfish evaluation
    2. Gets ECO classification
    3. Computes position heuristics
    4. Routes to GPU or API fallback for LLM commentary
    """
    fen = payload.get("fen")
    current_fen = payload.get("current_fen", fen)
    last_move = payload.get("last_move")
    move_from = payload.get("move_from")
    move_to = payload.get("move_to")
    include_llm = payload.get("include_llm", True)

    if not fen:
        raise HTTPException(status_code=400, detail="FEN is required")

    results = {}

    # Get Stockfish and ECO analysis
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            depth = payload.get("depth", 18)
            sf_resp = await client.post(
                f"{STOCKFISH_URL}/analyze",
                json={"fen": fen, "depth": depth}
            )
            results["stockfish"] = sf_resp.json()
        except Exception as e:
            results["stockfish"] = {"error": str(e)}

        try:
            eco_resp = await client.get(f"{ECO_URL}/classify?fen={fen}")
            results["eco"] = eco_resp.json()
        except Exception as e:
            results["eco"] = {"error": str(e)}

        # Update book move classifications
        if "error" not in results.get("stockfish", {}):
            results["stockfish"] = await update_book_move_classifications(
                results["stockfish"], fen, client
            )

    # Compute position heuristics
    if last_move and move_from and move_to:
        move_facts = compute_move_facts(fen, current_fen, move_from, move_to, last_move)
        results["move_facts"] = move_facts

    # Skip LLM if not requested
    if not include_llm:
        user_id, session_id = get_owner_from_request(request)
        pool = await get_pool()
        await log_activity(
            pool, user_id, session_id, "game_analyzed",
            meta={"fen": fen, "include_llm": False}
        )
        return results

    # LLM Commentary
    try:
        stockfish_info = results.get("stockfish", {})
        eco_info = results.get("eco", {})
        
        eval_cp = stockfish_info.get("evaluation", {}).get("value")
        eval_mate = stockfish_info.get("evaluation", {}).get("mate")
        best_move = stockfish_info.get("best_move", "")
        
        if eval_mate is not None:
            display_eval = f"Mate in {abs(eval_mate)}"
        elif eval_cp is not None:
            display_eval = f"{eval_cp / 100.0:+.2f}"
        else:
            display_eval = "N/A"
        
        # Build LLM prompt
        board_desc = describe_board_state(current_fen)
        eco_code = eco_info.get("eco", "")
        opening_name = eco_info.get("name", "")
        
        system_message = {
            "role": "system",
            "content": """You are a concise chess coach. Analyze the position briefly in 2-3 sentences.
Focus on: piece activity, pawn structure, king safety, and tactical opportunities."""
        }
        
        user_content = f"""Position: {board_desc}
Last move: {last_move or 'N/A'}
Evaluation: {display_eval}
Best move: {best_move}
Opening: {eco_code} {opening_name}

Provide brief analysis."""
        
        user_message = {"role": "user", "content": user_content}
        llm_messages = [system_message, user_message]
        
        # Call LLM service
        use_modal, _ = should_use_modal_gpu()
        llm_provider = "modal-gpu" if use_modal else "api-fallback"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            llm_timer = time.perf_counter()
            
            if use_modal and LLM_URL:
                llm_resp = await client.post(
                    f"{LLM_URL}/v1/chat/completions",
                    json={
                        "model": "llm",
                        "messages": llm_messages,
                        "max_tokens": 150,
                        "temperature": 0.7,
                    }
                )
                if llm_resp.status_code == 200:
                    update_gpu_status()
                    llm_data = llm_resp.json()
                else:
                    llm_data = {"error": f"LLM error: {llm_resp.status_code}"}
            else:
                # Fallback path - could call OpenAI or return heuristic summary
                llm_data = {
                    "choices": [{
                        "message": {
                            "role": "assistant",
                            "content": summarize_stockfish(stockfish_info.get("analysis", []))
                        }
                    }],
                    "_provider": "heuristic-fallback"
                }
            
            llm_latency_ms = int((time.perf_counter() - llm_timer) * 1000)
            
            if isinstance(llm_data, dict):
                llm_data["_provider"] = llm_provider
                llm_data["_latency_ms"] = llm_latency_ms
            
            results["llm"] = llm_data

    except Exception as e:
        logger.info(f"[LLM] Error: {e}")
        results["llm"] = {"error": str(e)}

    # Log activity
    user_id, session_id = get_owner_from_request(request)
    pool = await get_pool()
    await log_activity(
        pool, user_id, session_id, "game_analyzed",
        meta={"fen": fen, "include_llm": include_llm}
    )

    return results


@router.post("/chess/analyze_with_llm/stream")
async def analyze_with_llm_stream(payload: dict):
    """
    Streaming version of analyze_with_llm.
    Returns SSE with status updates and text chunks.
    """
    async def event_generator():
        fen = payload.get("fen")
        current_fen = payload.get("current_fen", fen)
        last_move = payload.get("last_move")
        move_from = payload.get("move_from")
        move_to = payload.get("move_to")
        include_llm = payload.get("include_llm", True)
        mode = payload.get("mode", "heuristics")

        if not fen:
            yield f"data: {json.dumps({'type': 'error', 'error': 'FEN is required'})}\n\n"
            return

        results = {}

        # Get Stockfish and ECO analysis
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                depth = payload.get("depth", 18)
                sf_resp = await client.post(
                    f"{STOCKFISH_URL}/analyze",
                    json={"fen": fen, "depth": depth}
                )
                results["stockfish"] = sf_resp.json()
            except Exception as e:
                results["stockfish"] = {"error": str(e)}

            try:
                eco_resp = await client.get(f"{ECO_URL}/classify?fen={fen}")
                results["eco"] = eco_resp.json()
            except Exception as e:
                results["eco"] = {"error": str(e)}

            if "error" not in results.get("stockfish", {}):
                results["stockfish"] = await update_book_move_classifications(
                    results["stockfish"], fen, client
                )

        # Compute heuristics
        tier1_start = time.perf_counter()
        
        if last_move and move_from and move_to:
            move_facts = compute_move_facts(fen, current_fen, move_from, move_to, last_move)
            results["move_facts"] = move_facts
            
            # Generate heuristic commentary
            stockfish_info = results.get("stockfish", {})
            commentary = summarize_stockfish(stockfish_info.get("analysis", []))
            results["heuristics"] = {"commentary": commentary}
        
        tier1_latency = int((time.perf_counter() - tier1_start) * 1000)

        # For heuristics mode, return immediately
        if mode == "heuristics" or not include_llm:
            yield f"data: {json.dumps({'type': 'status', 'provider': 'local-heuristics', 'mode': mode})}\n\n"
            commentary_text = results.get("heuristics", {}).get("commentary", "Analysis complete.")
            yield f"data: {json.dumps({'type': 'chunk', 'text': commentary_text})}\n\n"
            yield f"data: {json.dumps({'type': 'complete', 'full_response': results, 'tier': 1, 'latency_ms': tier1_latency})}\n\n"
            return

        # LLM mode - get full commentary
        yield f"data: {json.dumps({'type': 'status', 'provider': 'llm', 'mode': mode})}\n\n"
        
        try:
            use_modal, _ = should_use_modal_gpu()
            
            # Build prompt
            board_desc = describe_board_state(current_fen)
            stockfish_info = results.get("stockfish", {})
            eco_info = results.get("eco", {})
            
            eval_cp = stockfish_info.get("evaluation", {}).get("value")
            display_eval = f"{eval_cp / 100.0:+.2f}" if eval_cp else "N/A"
            
            messages = [
                {
                    "role": "system",
                    "content": "You are a concise chess coach. Analyze briefly in 2-3 sentences."
                },
                {
                    "role": "user",
                    "content": f"Position: {board_desc}\nLast move: {last_move}\nEval: {display_eval}"
                }
            ]
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                if use_modal and LLM_URL:
                    llm_resp = await client.post(
                        f"{LLM_URL}/v1/chat/completions",
                        json={
                            "model": "llm",
                            "messages": messages,
                            "max_tokens": 150,
                            "stream": True,
                        }
                    )
                    
                    if llm_resp.status_code == 200:
                        update_gpu_status()
                        async for line in llm_resp.aiter_lines():
                            if line.startswith("data: "):
                                data = line[6:]
                                if data == "[DONE]":
                                    break
                                try:
                                    chunk = json.loads(data)
                                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        yield f"data: {json.dumps({'type': 'chunk', 'text': content})}\n\n"
                                except:
                                    pass
                    else:
                        yield f"data: {json.dumps({'type': 'error', 'error': f'LLM error: {llm_resp.status_code}'})}\n\n"
                else:
                    # Fallback to heuristics
                    commentary = summarize_stockfish(stockfish_info.get("analysis", []))
                    yield f"data: {json.dumps({'type': 'chunk', 'text': commentary})}\n\n"
            
            yield f"data: {json.dumps({'type': 'complete', 'full_response': results})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/evaluate/heuristics")
async def evaluate_position_heuristics(payload: dict):
    """
    Evaluate a position using fast local heuristics.
    Returns piece activity, pawn structure, and tactical patterns.
    """
    fen = payload.get("fen")
    if not fen:
        raise HTTPException(status_code=400, detail="FEN is required")
    
    try:
        import chess
        board = chess.Board(fen)
        
        # Basic heuristics
        result = {
            "fen": fen,
            "turn": "white" if board.turn else "black",
            "is_check": board.is_check(),
            "is_checkmate": board.is_checkmate(),
            "is_stalemate": board.is_stalemate(),
            "legal_moves": board.legal_moves.count(),
            "material": {
                "white": sum(len(board.pieces(pt, chess.WHITE)) * val 
                            for pt, val in [(chess.PAWN, 1), (chess.KNIGHT, 3), 
                                           (chess.BISHOP, 3), (chess.ROOK, 5), 
                                           (chess.QUEEN, 9)]),
                "black": sum(len(board.pieces(pt, chess.BLACK)) * val 
                            for pt, val in [(chess.PAWN, 1), (chess.KNIGHT, 3), 
                                           (chess.BISHOP, 3), (chess.ROOK, 5), 
                                           (chess.QUEEN, 9)])
            }
        }
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid FEN: {str(e)}")


@router.get("/chess/gpu-status")
async def gpu_status_endpoint():
    """Return current GPU warm-up status for the frontend loading indicator."""
    return get_gpu_status()

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import chess
import chess.engine
import asyncio
import os
import time
from observability import (
    init_observability,
    instrument_fastapi,
    set_request_context,
    clear_request_context,
    record_http_metrics,
    start_event_loop_lag_monitor,
)

init_observability("stockfish")

STOCKFISH_PATH = "/usr/games/stockfish"

app = FastAPI()
instrument_fastapi(app)


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or request.headers.get("x-requestid")
    route = f"{request.method} {request.url.path}"
    set_request_context(route, request_id, "stockfish")
    start = time.perf_counter()
    response = None
    try:
        response = await call_next(request)
        return response
    finally:
        route_obj = request.scope.get("route")
        route_path = getattr(route_obj, "path", request.url.path)
        route = f"{request.method} {route_path}"
        set_request_context(route, request_id, "stockfish")
        duration_ms = (time.perf_counter() - start) * 1000
        status_code = response.status_code if response else 500
        record_http_metrics(route, request.method, status_code, duration_ms)
        clear_request_context()

# SECURITY INFRA-1: Production-safe CORS configuration
_env = os.getenv("ENV", "development").lower()
if _env == "production":
    cors_env = os.getenv("CORS_ALLOW_ORIGINS")
    if not cors_env:
        raise RuntimeError("CORS_ALLOW_ORIGINS must be set in production")
    allow_origins = [o.strip() for o in cors_env.split(",") if o.strip()]
    if "*" in allow_origins:
        raise RuntimeError("CORS_ALLOW_ORIGINS cannot contain '*' in production")
else:
    allow_origins = ["*"]  # Development only

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = None
engine_lock = asyncio.Lock()


def get_tactical_context(board, move):
    """
    Return tactical context for a move:
    - attackers and defenders of the destination square
    - whether the destination is defended more/less
    """
    context = {}
    dest = move.to_square

    # Pieces attacking the destination
    white_attackers = list(board.attackers(chess.WHITE, dest))
    black_attackers = list(board.attackers(chess.BLACK, dest))

    context["attackers_white"] = [board.piece_at(sq).symbol() + "@" + chess.square_name(sq) 
                                  for sq in white_attackers if board.piece_at(sq)]
    context["attackers_black"] = [board.piece_at(sq).symbol() + "@" + chess.square_name(sq) 
                                  for sq in black_attackers if board.piece_at(sq)]

    # Count attackers/defenders relative to the move's player
    if board.turn == chess.WHITE:
        context["defenders"] = len(white_attackers)
        context["attackers"] = len(black_attackers)
    else:
        context["defenders"] = len(black_attackers)
        context["attackers"] = len(white_attackers)

    if context["attackers"] == 0:
        context["safety"] = "safe"
    elif context["defenders"] >= context["attackers"]:
        context["safety"] = "defended"
    else:
        context["safety"] = "hanging"

    return context

def get_all_attacked_squares(board):
    """
    Return a dictionary of all squares attacked by white and black.
    """
    attacked_squares = {
        "white": [],
        "black": []
    }
    for square in chess.SQUARES:
        if board.is_attacked_by(chess.WHITE, square):
            attacked_squares["white"].append(chess.square_name(square))
        if board.is_attacked_by(chess.BLACK, square):
            attacked_squares["black"].append(chess.square_name(square))
    return attacked_squares

def get_attacked_pieces(board):
    """
    Return all pieces currently under attack, for both sides.
    """
    attacked_pieces = {
        "white": [],
        "black": []
    }
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if not piece:
            continue
        if board.is_attacked_by(not piece.color, square):
            if piece.color == chess.WHITE:
                attacked_pieces["white"].append(f"{piece.symbol()}@{chess.square_name(square)}")
            else:
                attacked_pieces["black"].append(f"{piece.symbol()}@{chess.square_name(square)}")
    return attacked_pieces

# -----------------------------
# FastAPI lifecycle
# -----------------------------
@app.on_event("startup")
async def startup_event():
    await start_event_loop_lag_monitor()
    global engine
    try:
        _, engine = await chess.engine.popen_uci(STOCKFISH_PATH)
        await engine.configure({"Threads": 2, "Hash": 128})
    except Exception as e:
        raise RuntimeError(f"Failed to start Stockfish: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    global engine
    if engine:
        await engine.quit()


# -----------------------------
# Request model
# -----------------------------
class AnalysisRequest(BaseModel):
    fen: str
    depth: int = 12
    multipv: int = 1
    rich_analysis: bool = False
    eval_before: int = 0  # Position eval before the move (for classification context)


# -----------------------------
# Helpers
# -----------------------------
def classify_move(
    eval_drop: int,
    is_best: bool = False,
    second_best_drop: int = 0,
    is_capture: bool = False,
    is_sacrifice: bool = False,
    move_number: int = 1,
    eval_before: int = 0,
    only_good_move: bool = False
) -> str:
    """Classify move based on centipawn loss and move characteristics (Lichess-strict).

    Args:
        eval_drop: Centipawn loss compared to best move (absolute value)
        is_best: Whether this is the best move (rank 1)
        second_best_drop: Centipawn difference between best and 2nd best move
        is_capture: Whether the move is a capture
        is_sacrifice: Whether the move is a GENUINE sacrifice (uses is_genuine_sacrifice())
        move_number: Move number in the game (for book classification)
        eval_before: Position evaluation before this move (for context)
        only_good_move: Whether this is the only good move (2nd best much worse)

    Returns:
        Classification string: brilliant, great, best, excellent, good, book, inaccuracy, mistake, blunder
    """
    # Best move or extremely close (within 10cp)
    if is_best or eval_drop <= 10:
        # BRILLIANT - Lichess strict criteria:
        # 1. Genuine sacrifice that's the best move, OR
        # 2. Only good move in a non-crushing position
        # Must NOT be from an already crushing position (checked in is_genuine_sacrifice/is_only_good_move)
        if is_sacrifice:
            return "brilliant"
        if only_good_move:
            return "brilliant"

        # GREAT - Significantly better than 2nd best (100+cp gap) but NOT a sacrifice
        if second_best_drop >= 100:
            return "great"

        # Book status is determined by ECO database lookup in gateway-service
        # (not by move number heuristic)

        return "best"

    # EXCELLENT - Very close to best (Lichess-style: within 20cp)
    if eval_drop <= 20:
        return "excellent"

    # GOOD - Reasonable alternative (Lichess-style: within 40cp)
    if eval_drop <= 40:
        return "good"

    # INACCURACY - Small mistake (40-100cp loss)
    if eval_drop <= 100:
        return "inaccuracy"

    # MISTAKE - Moderate error (100-300cp loss)
    if eval_drop <= 300:
        return "mistake"

    # BLUNDER - Major error (300+cp loss)
    return "blunder"


def get_move_flags(board: chess.Board, move: chess.Move):
    flags = {
        "is_check": board.gives_check(move),
        "is_capture": board.is_capture(move),
        "is_promotion": move.promotion is not None,
        "is_castle": board.is_castling(move),
        "captured_piece": None,
    }
    if flags["is_capture"]:
        captured = board.piece_at(move.to_square)
        if captured:
            flags["captured_piece"] = captured.symbol()
    return flags


def get_material_balance(board: chess.Board) -> int:
    piece_values = {1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 0}  # P, N, B, R, Q, K
    white_material = sum(
        piece_values.get(p.piece_type, 0) for p in board.piece_map().values() if p.color == chess.WHITE
    )
    black_material = sum(
        piece_values.get(p.piece_type, 0) for p in board.piece_map().values() if p.color == chess.BLACK
    )
    return white_material - black_material


def is_genuine_sacrifice(
    board: chess.Board,
    move: chess.Move,
    is_capture: bool,
    eval_before: int,
    is_best_move: bool
) -> bool:
    """
    Determine if a move is a GENUINE sacrifice (Lichess-strict).

    A genuine sacrifice must:
    1. Give up material (not just trade down)
    2. Be the best move (or near-best)
    3. Not be played from an already crushing position

    Returns True only for genuine sacrifices that deserve "brilliant".
    """
    # Must be the best move - sacrifices that lose are just blunders
    if not is_best_move:
        return False

    # Don't give brilliant for obvious winning/losing positions
    # If already +5 or more, finding the best move isn't that special
    if abs(eval_before) >= 500:
        return False

    piece_values = {1: 100, 2: 300, 3: 300, 4: 500, 5: 900, 6: 0}  # P, N, B, R, Q, K in cp

    if is_capture:
        attacking_piece = board.piece_at(move.from_square)
        captured_piece = board.piece_at(move.to_square)

        if attacking_piece and captured_piece:
            attacker_cp = piece_values.get(attacking_piece.piece_type, 0)
            captured_cp = piece_values.get(captured_piece.piece_type, 0)

            # Only a sacrifice if the capturing piece CAN BE RECAPTURED
            # Qxb7 taking undefended bishop is NOT a sacrifice - just winning material
            temp_board = board.copy()
            temp_board.push(move)
            dest_square = move.to_square

            # After the capture, is our piece attacked by opponent?
            # temp_board.turn is now opponent's turn
            if temp_board.is_attacked_by(temp_board.turn, dest_square):
                # Piece can be recaptured - calculate net material loss
                net_loss = attacker_cp - captured_cp
                if net_loss >= 200:
                    return True

    # Non-capture sacrifice: Check if piece is left en prise (hanging)
    temp_board = board.copy()
    temp_board.push(move)
    dest_square = move.to_square
    moving_piece = temp_board.piece_at(dest_square)

    if moving_piece:
        piece_value = piece_values.get(moving_piece.piece_type, 0)

        # After push, temp_board.turn is the OPPONENT's turn
        # So temp_board.turn = opponent who might attack the piece
        # And not temp_board.turn = moving player who might defend
        opponent_color = temp_board.turn
        moving_player_color = not temp_board.turn

        # Is the destination square attacked by opponent?
        if temp_board.is_attacked_by(opponent_color, dest_square):
            # Is it defended by the moving player?
            if not temp_board.is_attacked_by(moving_player_color, dest_square):
                # Piece is hanging - this is a sacrifice if valuable (at least minor piece)
                if piece_value >= 300:
                    return True

    return False


def is_only_good_move(second_best_drop: int, eval_before: int) -> bool:
    """
    Determine if this is the "only good move" scenario (Lichess-style).

    Returns true when:
    - Second best move is 150+cp worse than best (stricter than 100cp)
    - Position wasn't already completely won/lost
    """
    # Must have a significant gap to 2nd best
    if second_best_drop < 150:
        return False

    # Position shouldn't be completely won/lost already
    if abs(eval_before) >= 500:
        return False

    return True


def get_king_safety_score(board: chess.Board) -> int:
    white_king = board.king(chess.WHITE)
    black_king = board.king(chess.BLACK)
    if not white_king or not black_king:
        return 0
    white_danger = sum(
        1 for sq in chess.SquareSet(chess.BB_KING_ATTACKS[white_king]) if board.is_attacked_by(chess.BLACK, sq)
    )
    black_danger = sum(
        1 for sq in chess.SquareSet(chess.BB_KING_ATTACKS[black_king]) if board.is_attacked_by(chess.WHITE, sq)
    )
    return black_danger - white_danger


def get_center_control(board: chess.Board) -> int:
    center = [chess.D4, chess.D5, chess.E4, chess.E5]
    white = sum(1 for sq in center if board.is_attacked_by(chess.WHITE, sq))
    black = sum(1 for sq in center if board.is_attacked_by(chess.BLACK, sq))
    return white - black


def get_position_features(board: chess.Board, move: chess.Move):
    temp = board.copy()
    temp.push(move)
    return {
        "mobility": temp.legal_moves.count(),
        "material_balance": get_material_balance(temp),
        "king_safety": get_king_safety_score(temp),
        "center_control": get_center_control(temp),
    }


def pv_to_san(board: chess.Board, pv):
    """Safely convert PV line into SAN moves by replaying on a copy."""
    temp = board.copy()
    san_moves = []
    for move in pv:
        try:
            san = temp.san(move)
            san_moves.append(san)
            temp.push(move)
        except Exception:
            san_moves.append(move.uci())
            break
    return san_moves


# -----------------------------
# Endpoints
# -----------------------------
@app.get("/healthz")
def healthz():
    return {"ok": True, "engine_path": STOCKFISH_PATH}


@app.post("/analyze")
async def analyze(req: AnalysisRequest):
    global engine
    if not engine:
        raise HTTPException(status_code=500, detail="Engine not initialized")

    board = chess.Board(req.fen)

    async with engine_lock:  # prevent race conditions
        try:
            info = await engine.analyse(
                board,
                chess.engine.Limit(depth=req.depth, time=1.5),
                multipv=min(req.multipv, 20),
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Engine error: {str(e)}")

    # First pass: extract scores to determine best and second-best
    scores = []
    for entry in info:
        if entry["score"].is_mate():
            # Normalize scores to White's perspective regardless of side to move
            score_pov = entry["score"].pov(chess.WHITE)
            numeric_score = 10000 if score_pov.mate() > 0 else -10000
        else:
            score_pov = entry["score"].pov(chess.WHITE)
            numeric_score = score_pov.score()
        scores.append(numeric_score)

    best_score = scores[0] if len(scores) > 0 else 0
    second_best_score = scores[1] if len(scores) > 1 else best_score
    second_best_drop = abs(best_score - second_best_score)

    # Get move number from FEN (fullmove number is after 5th space)
    move_number = int(req.fen.split()[-1]) if req.fen.split()[-1].isdigit() else 1

    # Second pass: build results with classification
    results = []
    for i, entry in enumerate(info):
        pv_list = entry.get("pv") or []
        if not pv_list:
            # Skip entries without PV to avoid crashing on malformed engine output
            continue

        move = pv_list[0]

        # Extract score
        if entry["score"].is_mate():
            score_pov = entry["score"].pov(chess.WHITE)
            score = f"mate {score_pov.mate()}"
            numeric_score = scores[i]
        else:
            score_pov = entry["score"].pov(chess.WHITE)
            numeric_score = score_pov.score()
            score = numeric_score

        # Convert PV safely
        pv_moves = pv_to_san(board, pv_list[:8])
        pv_uci = [m.uci() for m in pv_list[:8]]

        # Prepare temp board for rich analysis
        temp_board = board.copy()
        temp_board.push(move)

        # Get move flags for classification
        move_flags = get_move_flags(board, move)
        is_capture = move_flags["is_capture"]

        # Use strict sacrifice detection (Lichess-style)
        # Only genuine sacrifices that are best moves from non-crushing positions
        genuine_sacrifice = is_genuine_sacrifice(
            board=board,
            move=move,
            is_capture=is_capture,
            eval_before=req.eval_before,
            is_best_move=(i == 0)
        )

        # Check if this is the "only good move" scenario
        only_good_move_flag = is_only_good_move(
            second_best_drop=second_best_drop,
            eval_before=req.eval_before
        ) if i == 0 else False

        result = {
            "rank": i + 1,
            "move": board.san(move),
            "uci": move.uci(),
            "score": score,
            "depth": entry.get("depth", req.depth),
            "nodes": entry.get("nodes", 0),
            "pv": pv_moves,
            "pv_uci": pv_uci,
            "classification": classify_move(
                eval_drop=abs(best_score - numeric_score),
                is_best=(i == 0),
                second_best_drop=second_best_drop,
                is_capture=is_capture,
                is_sacrifice=genuine_sacrifice,
                move_number=move_number,
                eval_before=req.eval_before,
                only_good_move=only_good_move_flag
            ),
            "flags": move_flags,
        }

        if req.rich_analysis:
            result["features"] = get_position_features(board, move)
            result["tactical_context"] = get_tactical_context(board, move)
            result["attacks"] = get_all_attacked_squares(temp_board)
            result["attacked_pieces"] = get_attacked_pieces(temp_board)

        results.append(result)

    first_score = info[0]["score"].pov(chess.WHITE)
    best_mate = first_score.mate()
    best_cp = first_score.score()

    return {
        "fen": req.fen,
        "analysis": results,
        "multipv": req.multipv,
        "best_score": best_score,
        "cp": best_cp,
        "mate": best_mate
    }

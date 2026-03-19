"""
Chess utility functions for the gateway service.

Contains FEN parsing, move analysis, and board description functions.
These are pure functions that don't depend on FastAPI or database.
"""

import chess
import httpx
from typing import Optional

# Service URLs
import os
ECO_URL = os.getenv("ECO_URL", "http://eco:8000")


async def is_book_position(fen: str, client: httpx.AsyncClient) -> bool:
    """
    Check if a position (FEN) is in the ECO opening database.
    Returns True if the position is found in the opening database.
    """
    try:
        eco_resp = await client.post(f"{ECO_URL}/eco", json={"fen": fen}, timeout=5.0)
        if eco_resp.status_code == 200:
            eco_data = eco_resp.json()
            return eco_data.get("found", False)
    except Exception:
        # If ECO service fails, assume not a book position
        pass
    return False


async def apply_move_to_fen(fen: str, uci_move: str) -> Optional[str]:
    """
    Apply a UCI move to a FEN position and return the resulting FEN.
    Returns None if the move is invalid.
    """
    try:
        board = chess.Board(fen)
        move = chess.Move.from_uci(uci_move)
        if move in board.legal_moves:
            board.push(move)
            return board.fen()
    except Exception:
        pass
    return None


async def update_book_move_classifications(
    stockfish_result: dict,
    current_fen: str,
    client: httpx.AsyncClient,
    max_move_number: int = 15
) -> dict:
    """
    Update move classifications to mark book moves.
    A move is a book move if:
    1. The position after the move is in the ECO database
    2. It's not already brilliant or great
    3. We're still in the opening phase (move_number <= max_move_number)
    
    Returns updated stockfish_result with book move classifications.
    """
    # Extract move number from FEN (fullmove number is the last field)
    try:
        move_number = int(current_fen.split()[-1]) if current_fen.split()[-1].isdigit() else 1
    except Exception:
        move_number = 1
    
    # Only check for book moves in the opening phase
    if move_number > max_move_number:
        return stockfish_result

    # Check if we have analysis results
    if "error" in stockfish_result or "analysis" not in stockfish_result:
        return stockfish_result

    analysis = stockfish_result["analysis"]

    # Check ALL moves to see if they lead to a book position
    for move_analysis in analysis:
        classification = move_analysis.get("classification", "")

        # Skip if already has a meaningful classification that should take precedence
        if classification in ["brilliant", "great", "blunder", "mistake", "miss", "inaccuracy"]:
            continue

        # Get the UCI move
        uci_move = move_analysis.get("uci")
        if not uci_move:
            continue

        # Apply the move to get the resulting FEN
        resulting_fen = await apply_move_to_fen(current_fen, uci_move)
        if not resulting_fen:
            continue

        # Check if the resulting position is in the ECO database
        is_book = await is_book_position(resulting_fen, client)

        if is_book:
            # Mark as book move (only if not already brilliant/great and not a bad move)
            move_analysis["classification"] = "book"
    
    return stockfish_result


def summarize_stockfish(analysis: list) -> str:
    """
    Turn Stockfish analysis JSON into a short readable summary of recommended moves.
    """
    lines = []

    lines.append("Top engine recommendations for the current position:")

    for m in analysis[:3]:  # only top 3 moves
        flags = [k for k, v in m.get("flags", {}).items() if v]
        features = m.get("features", {})
        tactical = m.get("tactical_context", {})
        attacks = m.get("attacks", {})
        attacked_pieces = m.get("attacked_pieces", {})

        line = (
            f"Move {m['move']} (uci: {m['uci']}): "
            f"Eval {m['score']} ({m['classification']}); "
            f"Depth {m.get('depth', '?')}, Nodes {m.get('nodes', '?')}\n"
            f"Features -> Mobility {features.get('mobility', '?')}, "
            f"Center {features.get('center_control', '?')}, "
            f"King safety {features.get('king_safety', '?')}, "
            f"Material {features.get('material_balance', '?')}\n"
            f"Tactical -> Safety: {tactical.get('safety', '?')}, "
            f"White attackers: {', '.join(tactical.get('attackers_white', []))}, "
            f"Black attackers: {', '.join(tactical.get('attackers_black', []))}\n"
            f"Squares attacked -> White: {', '.join(attacks.get('white', []))}, "
            f"Black: {', '.join(attacks.get('black', []))}\n"
            f"Pieces under attack -> White: {', '.join(attacked_pieces.get('white', []))}, "
            f"Black: {', '.join(attacked_pieces.get('black', []))}\n"
            f"Flags: {', '.join(flags) if flags else 'none'}"
        )
        lines.append(line)
    return "\n\n".join(lines)


def parse_fen_to_board_description(fen: str) -> str:
    """
    Parse FEN string into human-readable board description.
    This prevents LLM from hallucinating about non-existent pieces.
    """
    try:
        board = chess.Board(fen)

        # Collect pieces by color
        white_pieces = {
            'pawns': [],
            'knights': [],
            'bishops': [],
            'rooks': [],
            'queens': [],
            'king': None
        }

        black_pieces = {
            'pawns': [],
            'knights': [],
            'bishops': [],
            'rooks': [],
            'queens': [],
            'king': None
        }

        # Map piece types to readable names
        piece_map = {
            chess.PAWN: 'pawns',
            chess.KNIGHT: 'knights',
            chess.BISHOP: 'bishops',
            chess.ROOK: 'rooks',
            chess.QUEEN: 'queens',
            chess.KING: 'king'
        }

        # Iterate through all squares
        for square in chess.SQUARES:
            piece = board.piece_at(square)
            if piece:
                square_name = chess.square_name(square)
                piece_type_name = piece_map[piece.piece_type]

                if piece.color == chess.WHITE:
                    if piece_type_name == 'king':
                        white_pieces['king'] = square_name
                    else:
                        white_pieces[piece_type_name].append(square_name)
                else:
                    if piece_type_name == 'king':
                        black_pieces['king'] = square_name
                    else:
                        black_pieces[piece_type_name].append(square_name)

        # Build description
        lines = []
        lines.append("EXACT BOARD STATE (use this, not opening theory):")

        # White pieces
        white_desc = []
        if white_pieces['pawns']:
            white_desc.append(f"pawns on {', '.join(sorted(white_pieces['pawns']))}")
        if white_pieces['knights']:
            white_desc.append(f"knights on {', '.join(sorted(white_pieces['knights']))}")
        if white_pieces['bishops']:
            white_desc.append(f"bishops on {', '.join(sorted(white_pieces['bishops']))}")
        if white_pieces['rooks']:
            white_desc.append(f"rooks on {', '.join(sorted(white_pieces['rooks']))}")
        if white_pieces['queens']:
            white_desc.append(f"queens on {', '.join(sorted(white_pieces['queens']))}")
        if white_pieces['king']:
            white_desc.append(f"king on {white_pieces['king']}")

        lines.append(f"White has: {'; '.join(white_desc)}")

        # Black pieces
        black_desc = []
        if black_pieces['pawns']:
            black_desc.append(f"pawns on {', '.join(sorted(black_pieces['pawns']))}")
        if black_pieces['knights']:
            black_desc.append(f"knights on {', '.join(sorted(black_pieces['knights']))}")
        if black_pieces['bishops']:
            black_desc.append(f"bishops on {', '.join(sorted(black_pieces['bishops']))}")
        if black_pieces['rooks']:
            black_desc.append(f"rooks on {', '.join(sorted(black_pieces['rooks']))}")
        if black_pieces['queens']:
            black_desc.append(f"queens on {', '.join(sorted(black_pieces['queens']))}")
        if black_pieces['king']:
            black_desc.append(f"king on {black_pieces['king']}")

        lines.append(f"Black has: {'; '.join(black_desc)}")

        # Critical note to prevent hallucination
        lines.append("\nCRITICAL: This is the COMPLETE and EXACT board state.")
        lines.append("- Every piece on the board is listed above")
        lines.append("- If a square is NOT listed, it is EMPTY (no piece there)")
        lines.append("- Do NOT assume pieces exist based on opening theory")
        lines.append("- Analyze ONLY what is explicitly stated above")

        return "\n".join(lines)

    except Exception as e:
        return f"Could not parse FEN: {e}"


def describe_board_state(fen: str) -> str:
    """
    Historical alias retained for compatibility with streaming endpoints.
    """
    return parse_fen_to_board_description(fen)


def compute_move_facts(fen_before: str, fen_after: str, move_from: str, move_to: str, move_san: str) -> dict:
    """
    Compute factual information about a chess move that can be narrated by the LLM.
    This prevents LLM from hallucinating chess consequences.
    """
    try:
        board_before = chess.Board(fen_before)
        board_after = chess.Board(fen_after)

        from_square = chess.parse_square(move_from)
        to_square = chess.parse_square(move_to)

        # Get the piece that moved
        piece = board_after.piece_at(to_square)
        if not piece:
            return {"error": "No piece found at destination"}

        piece_names = {
            chess.PAWN: "pawn",
            chess.KNIGHT: "knight",
            chess.BISHOP: "bishop",
            chess.ROOK: "rook",
            chess.QUEEN: "queen",
            chess.KING: "king"
        }
        piece_type = piece_names.get(piece.piece_type, "piece")
        piece_color = "White" if piece.color == chess.WHITE else "Black"

        facts = {
            "piece_type": piece_type,
            "piece_color": piece_color,
            "from_square": move_from,
            "to_square": move_to,
            "move_san": move_san,
        }

        # Squares controlled by the moved piece in new position
        controlled_squares = []
        for square in chess.SQUARES:
            if board_after.is_attacked_by(piece.color, square):
                # Check if this specific piece attacks this square
                attackers = board_after.attackers(piece.color, square)
                if to_square in attackers:
                    controlled_squares.append(chess.square_name(square))
        facts["squares_controlled"] = sorted(controlled_squares)

        # Pieces NEWLY defended by the moved piece that are UNDER ATTACK
        # Only report meaningful defenses - pieces the opponent is actually attacking
        defended_pieces = []
        for square in chess.SQUARES:
            target_piece = board_after.piece_at(square)
            if target_piece and target_piece.color == piece.color and square != to_square:
                # Check if this piece now defends this square
                attackers_after = board_after.attackers(piece.color, square)
                if to_square in attackers_after:
                    # Check if it was already defended by this piece before the move
                    attackers_before = board_before.attackers(piece.color, square)
                    was_defended_by_this_piece = from_square in attackers_before

                    if not was_defended_by_this_piece:
                        # Only report if the piece is actually under attack by opponent
                        is_under_attack = board_after.is_attacked_by(not piece.color, square)
                        if is_under_attack:
                            sq_name = chess.square_name(square)
                            defended_pieces.append(f"{piece_names.get(target_piece.piece_type, 'piece')} on {sq_name}")
        facts["pieces_defended"] = defended_pieces

        # Pieces NEWLY attacked by the moved piece (enemy pieces it now threatens)
        attacked_pieces = []
        for square in chess.SQUARES:
            target_piece = board_after.piece_at(square)
            if target_piece and target_piece.color != piece.color:
                attackers_after = board_after.attackers(piece.color, square)
                if to_square in attackers_after:
                    # Check if it was already attacked by this piece before
                    attackers_before = board_before.attackers(piece.color, square)
                    was_attacked_by_this_piece = from_square in attackers_before

                    if not was_attacked_by_this_piece:
                        attacked_pieces.append(f"{piece_names.get(target_piece.piece_type, 'piece')} on {chess.square_name(square)}")
        facts["pieces_attacked"] = attacked_pieces

        # Hanging pieces - friendly pieces under attack without adequate defense
        # This catches missed threats and blunders
        hanging_pieces = []
        for square in chess.SQUARES:
            target_piece = board_after.piece_at(square)
            if target_piece and target_piece.color == piece.color:
                # Skip the king (can't be "hanging" in normal sense)
                if target_piece.piece_type == chess.KING:
                    continue

                # Check if under attack by opponent
                opponent_attackers = board_after.attackers(not piece.color, square)
                if opponent_attackers:
                    # Count defenders (friendly pieces defending this square)
                    defenders = board_after.attackers(piece.color, square)

                    num_attackers = len(opponent_attackers)
                    num_defenders = len(defenders)

                    # Piece is hanging if attackers > defenders
                    # Also consider piece values for trades
                    if num_attackers > num_defenders:
                        sq_name = chess.square_name(square)
                        hanging_pieces.append(f"{piece_names.get(target_piece.piece_type, 'piece')} on {sq_name}")
                    elif num_attackers == num_defenders and num_attackers > 0:
                        # Equal attackers/defenders - check if trade is bad
                        # Get the lowest value attacker
                        piece_values = {
                            chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
                            chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0
                        }
                        target_value = piece_values.get(target_piece.piece_type, 0)

                        # Find lowest value attacker
                        min_attacker_value = 10
                        for attacker_sq in opponent_attackers:
                            attacker = board_after.piece_at(attacker_sq)
                            if attacker:
                                attacker_value = piece_values.get(attacker.piece_type, 0)
                                min_attacker_value = min(min_attacker_value, attacker_value)

                        # If lowest attacker is worth less than target, it's a bad trade
                        if min_attacker_value < target_value:
                            sq_name = chess.square_name(square)
                            hanging_pieces.append(f"{piece_names.get(target_piece.piece_type, 'piece')} on {sq_name}")

        facts["hanging_pieces"] = hanging_pieces

        # Check for lines/diagonals opened (for pawns and other pieces)
        lines_opened = []

        # Check if a bishop's diagonal was opened
        # For pawns: check if moving opened diagonal for bishop
        if piece.piece_type == chess.PAWN:
            # Check both bishops
            for bishop_square in board_after.pieces(chess.BISHOP, piece.color):
                bishop_sq_name = chess.square_name(bishop_square)

                # Determine bishop color (light or dark squared)
                is_light_square = (chess.square_file(bishop_square) + chess.square_rank(bishop_square)) % 2 == 1
                bishop_type = "light-squared" if is_light_square else "dark-squared"

                # Count squares bishop attacks before and after
                attacks_before = len(list(board_before.attacks(bishop_square)))
                attacks_after = len(list(board_after.attacks(bishop_square)))

                if attacks_after > attacks_before:
                    lines_opened.append(f"{bishop_type} bishop on {bishop_sq_name}")

        # Check if rook files were opened
        if piece.piece_type == chess.PAWN:
            for rook_square in board_after.pieces(chess.ROOK, piece.color):
                rook_sq_name = chess.square_name(rook_square)
                attacks_before = len(list(board_before.attacks(rook_square)))
                attacks_after = len(list(board_after.attacks(rook_square)))

                if attacks_after > attacks_before:
                    lines_opened.append(f"rook on {rook_sq_name}")

        # Also check queen
        if piece.piece_type == chess.PAWN:
            for queen_square in board_after.pieces(chess.QUEEN, piece.color):
                queen_sq_name = chess.square_name(queen_square)
                attacks_before = len(list(board_before.attacks(queen_square)))
                attacks_after = len(list(board_after.attacks(queen_square)))

                if attacks_after > attacks_before:
                    lines_opened.append(f"queen on {queen_sq_name}")

        facts["lines_opened"] = lines_opened

        # Check if rooks are connected (no pieces between them on same rank)
        rooks = list(board_after.pieces(chess.ROOK, piece.color))
        rooks_connected = False
        if len(rooks) == 2:
            rook1, rook2 = rooks
            # Check if on same rank
            if chess.square_rank(rook1) == chess.square_rank(rook2):
                rank = chess.square_rank(rook1)
                file1, file2 = chess.square_file(rook1), chess.square_file(rook2)
                min_file, max_file = min(file1, file2), max(file1, file2)

                # Check for pieces between them
                blocked = False
                for f in range(min_file + 1, max_file):
                    sq = chess.square(f, rank)
                    if board_after.piece_at(sq):
                        blocked = True
                        break
                rooks_connected = not blocked
            # Check if on same file
            elif chess.square_file(rook1) == chess.square_file(rook2):
                file = chess.square_file(rook1)
                rank1, rank2 = chess.square_rank(rook1), chess.square_rank(rook2)
                min_rank, max_rank = min(rank1, rank2), max(rank1, rank2)

                blocked = False
                for r in range(min_rank + 1, max_rank):
                    sq = chess.square(file, r)
                    if board_after.piece_at(sq):
                        blocked = True
                        break
                rooks_connected = not blocked

        facts["rooks_connected"] = rooks_connected

        # Check for special move properties
        # Reconstruct the move to check flags
        try:
            move = chess.Move(from_square, to_square)
            facts["is_check"] = board_after.is_check()
            facts["is_capture"] = board_before.piece_at(to_square) is not None
            facts["is_castling"] = board_before.is_castling(move)

            # Check captured piece
            captured = board_before.piece_at(to_square)
            if captured:
                facts["captured_piece"] = piece_names.get(captured.piece_type, "piece")
            else:
                facts["captured_piece"] = None

        except Exception:
            facts["is_check"] = False
            facts["is_capture"] = False
            facts["is_castling"] = False
            facts["captured_piece"] = None

        # Castling rights
        facts["can_castle_kingside"] = board_after.has_kingside_castling_rights(piece.color)
        facts["can_castle_queenside"] = board_after.has_queenside_castling_rights(piece.color)

        # Central control (d4, d5, e4, e5)
        central_squares = [chess.D4, chess.D5, chess.E4, chess.E5]
        central_controlled = []
        for sq in central_squares:
            if to_square in board_after.attackers(piece.color, sq):
                central_controlled.append(chess.square_name(sq))
        facts["central_squares_controlled"] = central_controlled

        return facts

    except Exception as e:
        return {"error": str(e)}

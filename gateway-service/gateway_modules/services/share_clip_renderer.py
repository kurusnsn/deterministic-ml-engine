"""
Share Clip Renderer Service.

Generates static PNG images for share clips with the following layout:
- Commentary region (top)
- Board + Eval bar (center)
- Move strip with classification (bottom)
- SprintChess logo (corner)

Uses Pillow for image generation. Renders FEN positions using python-chess.
"""

import os
import io
import uuid
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass
from PIL import Image, ImageDraw, ImageFont


# ==============================================================================
# Configuration
# ==============================================================================

CANVAS_WIDTH = 1080
CANVAS_HEIGHT = 1080
BOARD_SIZE = 600
BOARD_SQUARE_SIZE = BOARD_SIZE // 8

# Layout regions (x, y, width, height)
COMMENTARY_REGION = (60, 40, 960, 160)
BOARD_REGION = (240, 220, BOARD_SIZE, BOARD_SIZE)
EVAL_BAR_REGION = (180, 220, 40, BOARD_SIZE)
MOVE_STRIP_REGION = (60, 850, 960, 130)
LOGO_REGION = (880, 980, 160, 60)

# Colors
COLORS = {
    "background": (15, 23, 42),  # Dark slate
    "board_light": (240, 217, 181),  # Lichess light square
    "board_dark": (181, 136, 99),  # Lichess dark square
    "highlight": (255, 255, 0, 100),  # Yellow highlight
    "text_primary": (255, 255, 255),
    "text_secondary": (148, 163, 184),
    "eval_white": (255, 255, 255),
    "eval_black": (0, 0, 0),
    "brilliant": (27, 173, 166),
    "great": (37, 150, 190),
    "best": (150, 188, 75),
    "good": (150, 175, 139),
    "inaccuracy": (247, 192, 69),
    "mistake": (229, 143, 42),
    "blunder": (202, 52, 49),
    "miss": (202, 52, 49),
}

# Classification badge colors
CLASSIFICATION_COLORS = {
    "brilliant": (27, 173, 166),
    "great": (37, 150, 190),
    "best": (150, 188, 75),
    "excellent": (150, 188, 75),
    "good": (150, 175, 139),
    "book": (168, 136, 101),
    "inaccuracy": (247, 192, 69),
    "mistake": (229, 143, 42),
    "miss": (202, 52, 49),
    "blunder": (202, 52, 49),
}


# ==============================================================================
# Data Classes
# ==============================================================================

@dataclass
class RenderPayload:
    """Data required to render a share clip."""
    analysis_id: str
    game_id: Optional[int]
    primary_move_index: int
    frame: Dict[str, Any]
    visual_options: Dict[str, bool]
    game_meta: Dict[str, Any]


@dataclass
class RenderResult:
    """Result of rendering a share clip."""
    image_bytes: bytes
    image_path: Optional[str]
    thumbnail_bytes: Optional[bytes]
    thumbnail_path: Optional[str]


# ==============================================================================
# Rendering Functions
# ==============================================================================

def render_share_clip(payload: Dict[str, Any]) -> RenderResult:
    """
    Render a share clip image from a render payload.
    
    Args:
        payload: Render payload dictionary containing frame, visual_options, etc.
    
    Returns:
        RenderResult with image bytes and optional file paths
    """
    frame = payload.get("frame", {})
    visual_options = payload.get("visual_options", {})
    game_meta = payload.get("game_meta", {})
    
    # Create canvas
    img = Image.new("RGB", (CANVAS_WIDTH, CANVAS_HEIGHT), COLORS["background"])
    draw = ImageDraw.Draw(img)
    
    # Load fonts (fallback to default if not available)
    try:
        font_title = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 48)
        font_body = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 28)
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20)
        font_eval = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
    except (OSError, IOError):
        font_title = ImageFont.load_default()
        font_body = ImageFont.load_default()
        font_small = ImageFont.load_default()
        font_eval = ImageFont.load_default()
    
    # 1. Draw commentary region
    _draw_commentary_region(draw, frame, font_title, font_body)
    
    # 2. Draw eval bar
    eval_cp = frame.get("eval_cp_after", 0)
    _draw_eval_bar(draw, eval_cp)
    
    # 3. Draw board
    fen = frame.get("fen", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
    _draw_board(img, draw, fen)
    
    # 4. Draw threat arrows (if enabled)
    if visual_options.get("show_threat_arrows", True):
        threat_arrows = frame.get("threat_arrows", [])
        _draw_arrows(draw, threat_arrows)
    
    # 5. Draw move strip
    san = frame.get("san", "")
    classification = frame.get("classification")
    eval_before = frame.get("eval_cp_before", 0)
    eval_after = frame.get("eval_cp_after", 0)
    show_classification = visual_options.get("show_move_classification", True)
    _draw_move_strip(draw, san, classification, eval_before, eval_after, 
                      show_classification, font_body, font_small)
    
    # 6. Draw logo
    _draw_logo(draw, font_small)
    
    # Convert to bytes
    buffer = io.BytesIO()
    img.save(buffer, format="PNG", quality=95)
    image_bytes = buffer.getvalue()
    
    # Create thumbnail (400x400)
    thumbnail = img.copy()
    thumbnail.thumbnail((400, 400), Image.Resampling.LANCZOS)
    thumb_buffer = io.BytesIO()
    thumbnail.save(thumb_buffer, format="PNG", quality=85)
    thumbnail_bytes = thumb_buffer.getvalue()
    
    return RenderResult(
        image_bytes=image_bytes,
        image_path=None,
        thumbnail_bytes=thumbnail_bytes,
        thumbnail_path=None
    )


def _draw_commentary_region(draw: ImageDraw.Draw, frame: Dict, font_title, font_body):
    """Draw the commentary section at the top."""
    x, y, w, h = COMMENTARY_REGION
    
    # Build title from classification and SAN
    san = frame.get("san", "Move")
    classification = frame.get("classification", "")
    
    if classification:
        title = f"{classification.title()} {san}!"
    else:
        title = san
    
    # Draw title
    draw.text((x, y), title, fill=COLORS["text_primary"], font=font_title)
    
    # Draw commentary
    commentary = frame.get("commentary", "")
    if commentary:
        # Truncate if too long
        if len(commentary) > 100:
            commentary = commentary[:97] + "..."
        draw.text((x, y + 70), commentary, fill=COLORS["text_secondary"], font=font_body)


def _draw_eval_bar(draw: ImageDraw.Draw, eval_cp: int):
    """Draw the evaluation bar."""
    x, y, w, h = EVAL_BAR_REGION
    
    # Clamp eval to [-1000, 1000]
    clamped = max(-1000, min(1000, eval_cp))
    
    # Convert to percentage (0.5 = equal, 1.0 = white winning, 0.0 = black winning)
    # Using sigmoid-like mapping
    pct = 0.5 + (clamped / 2000)
    
    # Draw black portion (top)
    black_height = int(h * (1 - pct))
    draw.rectangle([x, y, x + w, y + black_height], fill=COLORS["eval_black"])
    
    # Draw white portion (bottom)
    draw.rectangle([x, y + black_height, x + w, y + h], fill=COLORS["eval_white"])
    
    # Draw border
    draw.rectangle([x, y, x + w, y + h], outline=(100, 100, 100), width=2)


def _draw_board(img: Image.Image, draw: ImageDraw.Draw, fen: str):
    """Draw the chess board with pieces."""
    x, y, size, _ = BOARD_REGION
    square_size = size // 8
    
    # Draw squares
    for rank in range(8):
        for file in range(8):
            sq_x = x + file * square_size
            sq_y = y + rank * square_size
            
            is_light = (rank + file) % 2 == 0
            color = COLORS["board_light"] if is_light else COLORS["board_dark"]
            
            draw.rectangle([sq_x, sq_y, sq_x + square_size, sq_y + square_size], fill=color)
    
    # Parse FEN and draw pieces
    try:
        import chess
        board = chess.Board(fen)
        
        # Unicode piece symbols
        PIECE_SYMBOLS = {
            chess.KING: {"w": "♔", "b": "♚"},
            chess.QUEEN: {"w": "♕", "b": "♛"},
            chess.ROOK: {"w": "♖", "b": "♜"},
            chess.BISHOP: {"w": "♗", "b": "♝"},
            chess.KNIGHT: {"w": "♘", "b": "♞"},
            chess.PAWN: {"w": "♙", "b": "♟"},
        }
        
        try:
            piece_font = ImageFont.truetype("/System/Library/Fonts/Apple Symbols.ttf", 50)
        except (OSError, IOError):
            piece_font = ImageFont.load_default()
        
        for square in chess.SQUARES:
            piece = board.piece_at(square)
            if piece:
                file = chess.square_file(square)
                rank = 7 - chess.square_rank(square)  # Flip for display
                
                sq_x = x + file * square_size + square_size // 4
                sq_y = y + rank * square_size + square_size // 6
                
                color = "w" if piece.color == chess.WHITE else "b"
                symbol = PIECE_SYMBOLS.get(piece.piece_type, {}).get(color, "?")
                
                # Draw piece with shadow effect
                draw.text((sq_x + 2, sq_y + 2), symbol, fill=(50, 50, 50), font=piece_font)
                piece_color = (255, 255, 255) if color == "w" else (30, 30, 30)
                draw.text((sq_x, sq_y), symbol, fill=piece_color, font=piece_font)
                
    except ImportError:
        # If chess library not available, just show empty board
        pass
    except ValueError:
        # Invalid FEN
        pass


def _draw_arrows(draw: ImageDraw.Draw, arrows: list):
    """Draw threat/move arrows on the board."""
    if not arrows:
        return
    
    x, y, size, _ = BOARD_REGION
    square_size = size // 8
    
    for arrow in arrows:
        from_sq = arrow.get("from", "")
        to_sq = arrow.get("to", "")
        arrow_type = arrow.get("type", "attack")
        
        if len(from_sq) != 2 or len(to_sq) != 2:
            continue
        
        # Convert algebraic to coordinates
        try:
            from_file = ord(from_sq[0]) - ord('a')
            from_rank = 7 - (int(from_sq[1]) - 1)
            to_file = ord(to_sq[0]) - ord('a')
            to_rank = 7 - (int(to_sq[1]) - 1)
            
            from_x = x + from_file * square_size + square_size // 2
            from_y = y + from_rank * square_size + square_size // 2
            to_x = x + to_file * square_size + square_size // 2
            to_y = y + to_rank * square_size + square_size // 2
            
            # Choose color based on arrow type
            if arrow_type == "attack":
                color = (239, 68, 68, 200)  # Red
            else:
                color = (34, 197, 94, 200)  # Green
            
            draw.line([(from_x, from_y), (to_x, to_y)], fill=color, width=8)
            
        except (ValueError, IndexError):
            continue


def _draw_move_strip(draw: ImageDraw.Draw, san: str, classification: Optional[str],
                      eval_before: int, eval_after: int, show_classification: bool,
                      font_body, font_small):
    """Draw the move strip at the bottom."""
    x, y, w, h = MOVE_STRIP_REGION
    
    # Draw background
    draw.rounded_rectangle([x, y, x + w, y + h], radius=15, 
                            fill=(30, 41, 59), outline=(71, 85, 105), width=2)
    
    # Draw move SAN
    move_text = san
    if classification in ("brilliant", "blunder"):
        move_text += "!!" if classification == "brilliant" else "??"
    elif classification in ("great", "mistake"):
        move_text += "!" if classification == "great" else "?"
    
    draw.text((x + 30, y + 40), move_text, fill=COLORS["text_primary"], font=font_body)
    
    # Draw classification badge (if enabled)
    if show_classification and classification:
        badge_color = CLASSIFICATION_COLORS.get(classification, (100, 100, 100))
        badge_x = x + 200
        badge_y = y + 35
        badge_w = 120
        badge_h = 40
        
        draw.rounded_rectangle([badge_x, badge_y, badge_x + badge_w, badge_y + badge_h],
                                radius=8, fill=badge_color)
        draw.text((badge_x + 10, badge_y + 8), classification.title(), 
                   fill=(255, 255, 255), font=font_small)
    
    # Draw eval delta
    eval_text = f"Eval: {_format_eval(eval_before)} → {_format_eval(eval_after)}"
    draw.text((x + 600, y + 45), eval_text, fill=COLORS["text_secondary"], font=font_small)


def _draw_logo(draw: ImageDraw.Draw, font):
    """Draw SprintChess logo text."""
    x, y, w, h = LOGO_REGION
    draw.text((x, y), "SprintChess", fill=COLORS["text_secondary"], font=font)


def _format_eval(cp: int) -> str:
    """Format centipawn value as readable eval string."""
    if abs(cp) >= 10000:
        return "M" if cp > 0 else "-M"
    
    pawns = cp / 100
    if pawns >= 0:
        return f"+{pawns:.1f}"
    return f"{pawns:.1f}"


# ==============================================================================
# File Storage (Local Filesystem for MVP)
# ==============================================================================

def save_rendered_clip(
    clip_id: str,
    render_result: RenderResult,
    output_dir: str = "/tmp/share_clips"
) -> Tuple[str, str]:
    """
    Save rendered clip to local filesystem.
    
    Args:
        clip_id: Unique clip ID for filename
        render_result: RenderResult with image bytes
        output_dir: Directory to save files
    
    Returns:
        Tuple of (image_path, thumbnail_path)
    """
    os.makedirs(output_dir, exist_ok=True)
    
    image_path = os.path.join(output_dir, f"{clip_id}.png")
    thumb_path = os.path.join(output_dir, f"{clip_id}_thumb.png")
    
    with open(image_path, "wb") as f:
        f.write(render_result.image_bytes)
    
    if render_result.thumbnail_bytes:
        with open(thumb_path, "wb") as f:
            f.write(render_result.thumbnail_bytes)
    
    return image_path, thumb_path

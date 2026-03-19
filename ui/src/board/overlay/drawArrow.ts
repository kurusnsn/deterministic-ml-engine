/**
 * Phase 5: Implemented - Arrow drawing utilities
 */

import { Arrow } from "../core/useBoardStore";
import { RenderContext } from "./overlayRenderer";
import { squareToXY } from "../core/coords";

// ===== KNIGHT MOVE DETECTION =====

/**
 * Detect if a move is a knight move based on the L-shape pattern
 * Knights move 2 squares in one direction and 1 in perpendicular
 */
function isKnightMove(from: string, to: string): boolean {
    const fileDiff = Math.abs(from.charCodeAt(0) - to.charCodeAt(0));
    const rankDiff = Math.abs(parseInt(from[1]) - parseInt(to[1]));
    return (fileDiff === 2 && rankDiff === 1) || (fileDiff === 1 && rankDiff === 2);
}

// ===== KNIGHT ARROW DRAWING =====

/**
 * Draw an L-shaped arrow for knight moves
 * Uses a two-segment path with rounded corner
 */
function drawKnightArrow(arrow: Arrow, context: RenderContext): void {
    const { ctx, boardSize, orientation, dpr } = context;

    const fromCoords = squareToXY(arrow.from, boardSize, orientation);
    const toCoords = squareToXY(arrow.to, boardSize, orientation);

    const S = boardSize / 8;
    const bodyWidth = S * 0.18;
    const headLength = S * 0.30;
    const headWidth = S * 0.25;
    const cornerRadius = S * 0.15;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Determine L-shape direction
    const dx = toCoords.x - fromCoords.x;
    const dy = toCoords.y - fromCoords.y;
    const fileDiff = Math.abs(arrow.from.charCodeAt(0) - arrow.to.charCodeAt(0));
    const rankDiff = Math.abs(parseInt(arrow.from[1]) - parseInt(arrow.to[1]));

    // Knight moves: 2 in one direction, 1 in perpendicular
    // Choose path: horizontal-first or vertical-first based on which is the "2" move
    let midX: number, midY: number;

    if (fileDiff === 2) {
        // Horizontal (file) is the long leg
        midX = toCoords.x;
        midY = fromCoords.y;
    } else {
        // Vertical (rank) is the long leg
        midX = fromCoords.x;
        midY = toCoords.y;
    }

    // Calculate start offset
    const startOffset = S * 0.45;
    const angle1 = Math.atan2(midY - fromCoords.y, midX - fromCoords.x);
    const xStart = fromCoords.x + Math.cos(angle1) * startOffset;
    const yStart = fromCoords.y + Math.sin(angle1) * startOffset;

    // Calculate end position (shortened for arrowhead)
    const angle2 = Math.atan2(toCoords.y - midY, toCoords.x - midX);
    const endLen = Math.hypot(toCoords.x - midX, toCoords.y - midY) - headLength;
    const xEnd = midX + Math.cos(angle2) * endLen;
    const yEnd = midY + Math.sin(angle2) * endLen;

    // Draw L-shaped path
    ctx.strokeStyle = arrow.color;
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    ctx.lineWidth = bodyWidth;
    ctx.beginPath();
    ctx.moveTo(xStart, yStart);

    // Draw to corner with slight curve
    ctx.lineTo(midX, midY);
    ctx.lineTo(xEnd, yEnd);
    ctx.stroke();

    // Draw arrow head
    ctx.beginPath();
    ctx.moveTo(toCoords.x, toCoords.y);
    ctx.lineTo(
        xEnd + Math.cos(angle2 + Math.PI / 2) * headWidth,
        yEnd + Math.sin(angle2 + Math.PI / 2) * headWidth
    );
    ctx.lineTo(
        xEnd + Math.cos(angle2 - Math.PI / 2) * headWidth,
        yEnd + Math.sin(angle2 - Math.PI / 2) * headWidth
    );
    ctx.closePath();
    ctx.fillStyle = arrow.color;
    ctx.fill();

    ctx.restore();
}

// ===== ARROW DRAWING =====

/**
 * Draw a single arrow on the canvas
 * Uses exact proportions from react-chessboard for perfect visual match
 * @param arrow - Arrow to draw
 * @param context - Rendering context
 */
export function drawArrow(arrow: Arrow, context: RenderContext): void {
    // Check if this is a knight move and use L-shaped arrow
    if (arrow.isKnight || isKnightMove(arrow.from, arrow.to)) {
        drawKnightArrow(arrow, context);
        return;
    }

    const { ctx, boardSize, orientation, dpr } = context;

    // Get center coordinates of from/to squares
    const fromCoords = squareToXY(arrow.from, boardSize, orientation);
    const toCoords = squareToXY(arrow.to, boardSize, orientation);

    // Square size
    const S = boardSize / 8;

    // Use same proportions as react-chessboard for identical appearance
    // User corrected: "arrow body should be 20%"
    const bodyWidth = S * 0.20;      // 20% of square
    const headLength = S * 0.35;     // 35% of square
    const headWidth = S * 0.30;      // 30% of square

    // Save context state
    ctx.save();

    // Scale for device pixel ratio
    ctx.scale(dpr, dpr);

    // Build vector from source to target
    const dx = toCoords.x - fromCoords.x;
    const dy = toCoords.y - fromCoords.y;
    const angle = Math.atan2(dy, dx);

    // Calculate start offset (45% of square size towards target)
    // User requested: "decrease offset by 5%" -> 50% - 5% = 45%
    const startOffset = S * 0.45;
    const xStart = fromCoords.x + Math.cos(angle) * startOffset;
    const yStart = fromCoords.y + Math.sin(angle) * startOffset;

    // Shorten line by headLength so head sits on target square
    const len = Math.hypot(dx, dy) - headLength;
    const xEnd = fromCoords.x + Math.cos(angle) * len;
    const yEnd = fromCoords.y + Math.sin(angle) * len;

    // Extend body slightly to overlap with arrowhead and prevent gap
    // The overlap ensures seamless connection between body and head
    const bodyOverlap = bodyWidth * 0.5;
    const xBodyEnd = xEnd + Math.cos(angle) * bodyOverlap;
    const yBodyEnd = yEnd + Math.sin(angle) * bodyOverlap;

    // Draw arrow body (line)
    ctx.strokeStyle = arrow.color;
    ctx.lineCap = "butt";
    ctx.lineWidth = bodyWidth;
    ctx.beginPath();
    ctx.moveTo(xStart, yStart); // Start from offset
    ctx.lineTo(xBodyEnd, yBodyEnd); // End with slight overlap into arrowhead
    ctx.stroke();

    // Draw arrow head (triangle)
    ctx.beginPath();
    ctx.moveTo(toCoords.x, toCoords.y); // Point at target
    ctx.lineTo(
        xEnd + Math.cos(angle + Math.PI / 2) * headWidth,
        yEnd + Math.sin(angle + Math.PI / 2) * headWidth
    );
    ctx.lineTo(
        xEnd + Math.cos(angle - Math.PI / 2) * headWidth,
        yEnd + Math.sin(angle - Math.PI / 2) * headWidth
    );
    ctx.closePath();

    ctx.fillStyle = arrow.color;
    ctx.fill();

    // Restore context state
    ctx.restore();
}

/**
 * Draw arrowhead at the end of an arrow
 * @param ctx - Canvas context
 * @param x - X position
 * @param y - Y position
 * @param angle - Arrow angle in radians
 * @param size - Arrowhead size
 * @param color - Arrow color
 */
function drawArrowHead(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    size: number,
    color: string
): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Draw larger triangular arrowhead with wider base
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size * 0.6); // Wider triangle
    ctx.lineTo(-size, size * 0.6);
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.fill();

    ctx.restore();
}

/**
 * Draw all arrows
 * @param arrows - Array of arrows to draw
 * @param context - Rendering context
 */
export function drawArrows(arrows: Arrow[], context: RenderContext): void {
    arrows.forEach((arrow) => drawArrow(arrow, context));
}


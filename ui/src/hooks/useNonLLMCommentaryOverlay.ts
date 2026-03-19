/**
 * useNonLLMCommentaryOverlay Hook
 *
 * Manages the canvas overlay for Chess.com-style tactical visualizations.
 * Draws arrows, lines, and highlights based on affordance data.
 *
 * This hook is feature-flagged - returns no-ops when disabled.
 */

import { useCallback, useRef, useEffect } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type AffordanceType =
    | 'HIGHLIGHT'
    | 'ARROW'
    | 'LINE'
    | 'SHADED_FILE'
    | 'SHADED_RANK'
    | 'PAWN_PATH'
    | 'SHOW_FOLLOW_UP'
    | 'SHOW_CHECKMATE'
    | 'SHOW_TACTIC'
    | 'SHOW_IDEA'
    | 'SHOW_MISSED_TACTIC'
    | 'SHOW_FREE_PIECE';

export interface Affordance {
    type: AffordanceType;
    pattern?: string;
    squares?: string[];
    from?: string;
    to?: string | string[];
    file?: string;
    rank?: number;
    line?: string[];
    color?: string;
    /** For SHOW_IDEA affordances */
    idea?: string;
}

export interface NonLLMCommentary {
    text: string;
    label?: string;
    idea?: string;
    confidence?: number;
    category?: string;
    affordances: Affordance[];
}

interface UseNonLLMCommentaryOverlayOptions {
    /** Whether the non-LLM commentary feature is enabled */
    enabled: boolean;
    /** Canvas element ref for drawing */
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    /** Board size in pixels */
    boardSize: number;
    /** Board orientation */
    orientation: 'white' | 'black';
}

// ============================================================================
// COLOR PALETTE
// ============================================================================

const COLORS: Record<string, string> = {
    red: 'rgba(255, 50, 50, 0.7)',
    orange: 'rgba(255, 165, 0, 0.7)',
    yellow: 'rgba(255, 220, 50, 0.6)',
    green: 'rgba(50, 200, 50, 0.6)',
    blue: 'rgba(50, 100, 255, 0.6)',
};

// Pattern-specific default colors
const PATTERN_COLORS: Record<string, string> = {
    passed_pawn: 'orange',
    fork: 'red',
    pin: 'orange',
    skewer: 'orange',
    discovered_attack: 'red',
    fianchetto: 'green',
    open_file: 'blue',
    back_rank: 'red',
};

// ============================================================================
// COORDINATE HELPERS
// ============================================================================

function squareToPixel(
    square: string,
    boardSize: number,
    orientation: 'white' | 'black'
): { x: number; y: number } {
    const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = parseInt(square[1]) - 1;
    const squareSize = boardSize / 8;

    if (orientation === 'white') {
        return {
            x: (file + 0.5) * squareSize,
            y: (7.5 - rank) * squareSize,
        };
    } else {
        return {
            x: (7.5 - file) * squareSize,
            y: (rank + 0.5) * squareSize,
        };
    }
}

function fileToPixelX(
    file: string,
    boardSize: number,
    orientation: 'white' | 'black'
): number {
    const fileIndex = file.charCodeAt(0) - 'a'.charCodeAt(0);
    const squareSize = boardSize / 8;

    if (orientation === 'white') {
        return fileIndex * squareSize;
    } else {
        return (7 - fileIndex) * squareSize;
    }
}

function rankToPixelY(
    rank: number,
    boardSize: number,
    orientation: 'white' | 'black'
): number {
    const squareSize = boardSize / 8;

    if (orientation === 'white') {
        return (8 - rank) * squareSize;
    } else {
        return (rank - 1) * squareSize;
    }
}

// ============================================================================
// DRAWING FUNCTIONS
// ============================================================================

function drawArrow(
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: string,
    squareSize: number
) {
    const headLen = squareSize * 0.25;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);
    const len = Math.sqrt(dx * dx + dy * dy);

    // Shorten arrow to leave room for head
    const endX = to.x - Math.cos(angle) * headLen * 0.5;
    const endY = to.y - Math.sin(angle) * headLen * 0.5;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = squareSize * 0.15;
    ctx.lineCap = 'butt';

    // Draw line
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Draw arrowhead
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
        to.x - headLen * Math.cos(angle - Math.PI / 6),
        to.y - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
        to.x - headLen * Math.cos(angle + Math.PI / 6),
        to.y - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function drawLine(
    ctx: CanvasRenderingContext2D,
    points: { x: number; y: number }[],
    color: string,
    squareSize: number
) {
    if (points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = squareSize * 0.1;
    ctx.lineCap = 'round';
    ctx.setLineDash([squareSize * 0.15, squareSize * 0.1]);

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.restore();
}

function drawHighlight(
    ctx: CanvasRenderingContext2D,
    center: { x: number; y: number },
    color: string,
    squareSize: number
) {
    const size = squareSize * 0.9;
    const radius = squareSize * 0.08;

    ctx.save();
    ctx.fillStyle = color;

    // Rounded rectangle
    ctx.beginPath();
    ctx.roundRect(center.x - size / 2, center.y - size / 2, size, size, radius);
    ctx.fill();
    ctx.restore();
}

function drawShadedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string
) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
}

function drawPawnPath(
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: string,
    squareSize: number
) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = squareSize * 0.08;
    ctx.setLineDash([squareSize * 0.12, squareSize * 0.08]);
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // Star/crown at promotion square
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(to.x, to.y, squareSize * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(to.x, to.y, squareSize * 0.18, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

// ============================================================================
// HOOK
// ============================================================================

export function useNonLLMCommentaryOverlay({
    enabled,
    canvasRef,
    boardSize,
    orientation,
}: UseNonLLMCommentaryOverlayOptions) {
    const activeAffordanceRef = useRef<Affordance | null>(null);

    const clearOverlay = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        activeAffordanceRef.current = null;
    }, [canvasRef]);

    const drawOverlay = useCallback(
        (affordance: Affordance) => {
            if (!enabled) return;

            const canvas = canvasRef.current;
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Clear previous
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            activeAffordanceRef.current = affordance;

            const squareSize = boardSize / 8;
            const colorName = affordance.color || PATTERN_COLORS[affordance.pattern || ''] || 'orange';
            const color = COLORS[colorName] || COLORS.orange;

            switch (affordance.type) {
                case 'ARROW': {
                    if (!affordance.from) return;
                    const from = squareToPixel(affordance.from, boardSize, orientation);
                    const targets = Array.isArray(affordance.to)
                        ? affordance.to
                        : affordance.to
                            ? [affordance.to]
                            : [];

                    for (const target of targets) {
                        const to = squareToPixel(target, boardSize, orientation);
                        drawArrow(ctx, from, to, color, squareSize);
                    }
                    break;
                }

                case 'LINE': {
                    if (!affordance.squares || affordance.squares.length < 2) return;
                    const points = affordance.squares.map((sq) =>
                        squareToPixel(sq, boardSize, orientation)
                    );
                    drawLine(ctx, points, color, squareSize);
                    break;
                }

                case 'HIGHLIGHT': {
                    if (!affordance.squares) return;
                    for (const sq of affordance.squares) {
                        const center = squareToPixel(sq, boardSize, orientation);
                        drawHighlight(ctx, center, color, squareSize);
                    }
                    break;
                }

                case 'SHADED_FILE': {
                    if (!affordance.file) return;
                    const x = fileToPixelX(affordance.file, boardSize, orientation);
                    drawShadedRect(ctx, x, 0, squareSize, boardSize, color);
                    break;
                }

                case 'SHADED_RANK': {
                    if (affordance.rank === undefined) return;
                    const y = rankToPixelY(affordance.rank, boardSize, orientation);
                    drawShadedRect(ctx, 0, y, boardSize, squareSize, color);
                    break;
                }

                case 'PAWN_PATH': {
                    if (!affordance.from || !affordance.to) return;
                    const from = squareToPixel(affordance.from, boardSize, orientation);
                    const toSq = typeof affordance.to === 'string' ? affordance.to : affordance.to[0];
                    if (!toSq) return;
                    const to = squareToPixel(toSq, boardSize, orientation);
                    drawPawnPath(ctx, from, to, color, squareSize);
                    break;
                }

                // Interactive types don't draw - they're button triggers
                case 'SHOW_FOLLOW_UP':
                case 'SHOW_CHECKMATE':
                case 'SHOW_TACTIC':
                case 'SHOW_IDEA':
                case 'SHOW_MISSED_TACTIC':
                case 'SHOW_FREE_PIECE':
                    break;
            }
        },
        [enabled, canvasRef, boardSize, orientation]
    );

    // Clear overlay on board size or orientation change
    useEffect(() => {
        clearOverlay();
    }, [boardSize, orientation, clearOverlay]);

    // Return no-ops if disabled
    if (!enabled) {
        return {
            drawOverlay: () => { },
            clearOverlay: () => { },
            activeAffordance: null,
        };
    }

    return {
        drawOverlay,
        clearOverlay,
        activeAffordance: activeAffordanceRef.current,
    };
}

export default useNonLLMCommentaryOverlay;

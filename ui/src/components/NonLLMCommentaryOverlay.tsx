/**
 * NonLLMCommentaryOverlay Component
 *
 * Wrapper component that provides the canvas overlay for tactical visualizations.
 * This should be placed as a sibling to the chessboard, absolutely positioned
 * to overlay the board.
 *
 * Usage:
 * ```tsx
 * <div className="relative">
 *   <Chessboard {...props} />
 *   <NonLLMCommentaryOverlay
 *     enabled={featureEnabled}
 *     boardSize={boardSize}
 *     orientation={orientation}
 *     affordance={activeAffordance}
 *   />
 * </div>
 * ```
 */

'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import type { Affordance } from '@/hooks/useNonLLMCommentaryOverlay';

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
// TYPES
// ============================================================================

interface NonLLMCommentaryOverlayProps {
    /** Whether the feature is enabled */
    enabled: boolean;
    /** Board size in pixels */
    boardSize: number;
    /** Board orientation */
    orientation: 'white' | 'black';
    /** Active affordance to render */
    affordance: Affordance | null;
    /** Additional CSS classes */
    className?: string;
}

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

    return orientation === 'white'
        ? fileIndex * squareSize
        : (7 - fileIndex) * squareSize;
}

function rankToPixelY(
    rank: number,
    boardSize: number,
    orientation: 'white' | 'black'
): number {
    const squareSize = boardSize / 8;

    return orientation === 'white'
        ? (8 - rank) * squareSize
        : (rank - 1) * squareSize;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const NonLLMCommentaryOverlay: React.FC<NonLLMCommentaryOverlayProps> = ({
    enabled,
    boardSize,
    orientation,
    affordance,
    className = '',
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Draw the affordance on canvas
    const drawAffordance = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!affordance || !enabled) return;

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
                ctx.fillStyle = color;
                ctx.fillRect(x, 0, squareSize, boardSize);
                break;
            }

            case 'SHADED_RANK': {
                if (affordance.rank === undefined) return;
                const y = rankToPixelY(affordance.rank, boardSize, orientation);
                ctx.fillStyle = color;
                ctx.fillRect(0, y, boardSize, squareSize);
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
        }
    }, [affordance, enabled, boardSize, orientation]);

    // Re-draw when affordance changes
    useEffect(() => {
        drawAffordance();
    }, [drawAffordance]);

    // Don't render if disabled
    if (!enabled) {
        return null;
    }

    return (
        <canvas
            ref={canvasRef}
            width={boardSize}
            height={boardSize}
            className={`tactical-canvas-overlay ${className}`}
            aria-hidden="true"
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 10 }}
        />
    );
};

// ============================================================================
// DRAWING HELPERS
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

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = squareSize * 0.15;
    ctx.lineCap = 'butt';

    // Draw line
    const endX = to.x - Math.cos(angle) * headLen * 0.5;
    const endY = to.y - Math.sin(angle) * headLen * 0.5;

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

    ctx.beginPath();
    ctx.roundRect(center.x - size / 2, center.y - size / 2, size, size, radius);
    ctx.fill();
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

    // Crown at promotion square
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

export default NonLLMCommentaryOverlay;

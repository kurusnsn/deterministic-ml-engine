/**
 * Tactical Overlay Component
 *
 * SVG canvas overlay for visualizing tactical patterns on the chessboard.
 * Renders arrows, lines, highlights, and other affordances based on
 * non_llm_commentary data.
 */

'use client';

import React, { useMemo } from 'react';

// Affordance types from backend
interface Affordance {
    type: 'HIGHLIGHT' | 'ARROW' | 'LINE' | 'SHADED_FILE' | 'SHADED_RANK' | 'PAWN_PATH';
    squares?: string[];
    from?: string;
    to?: string | string[];
    file?: string;
    rank?: number;
    color?: string;
    multiple?: boolean;
}

interface TacticalOverlayProps {
    /** Size of the board in pixels */
    boardSize: number;
    /** Board orientation */
    orientation: 'white' | 'black';
    /** Active affordance to render (from hover or click) */
    affordance: Affordance | null;
    /** Additional CSS classes */
    className?: string;
}

// Color mappings
const COLORS: Record<string, string> = {
    red: 'rgba(255, 0, 0, 0.6)',
    orange: 'rgba(255, 165, 0, 0.6)',
    yellow: 'rgba(255, 255, 0, 0.5)',
    green: 'rgba(0, 255, 0, 0.5)',
    blue: 'rgba(0, 100, 255, 0.5)',
};

/**
 * Convert algebraic square to pixel coordinates
 */
function squareToCoords(
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

/**
 * Get file index (0-7) from file letter
 */
function fileToIndex(file: string): number {
    return file.charCodeAt(0) - 'a'.charCodeAt(0);
}

/**
 * Tactical Overlay
 *
 * Renders SVG visualizations for tactical patterns:
 * - Arrows for forks, discovered attacks
 * - Lines for pins, skewers
 * - Highlights for key squares
 * - Shaded files/ranks for open files, back rank
 * - Pawn paths for passed pawns
 */
export const TacticalOverlay: React.FC<TacticalOverlayProps> = ({
    boardSize,
    orientation,
    affordance,
    className = '',
}) => {
    const squareSize = boardSize / 8;

    // Memoize rendered elements
    const elements = useMemo(() => {
        if (!affordance) return null;

        const color = COLORS[affordance.color || 'red'] || COLORS.red;

        switch (affordance.type) {
            case 'ARROW': {
                const from = affordance.from;
                const targets = Array.isArray(affordance.to) ? affordance.to : [affordance.to];

                if (!from) return null;

                const fromCoords = squareToCoords(from, boardSize, orientation);

                return targets.filter(Boolean).map((to, i) => {
                    if (!to) return null;
                    const toCoords = squareToCoords(to, boardSize, orientation);

                    // Calculate arrow head position (slightly before end)
                    const dx = toCoords.x - fromCoords.x;
                    const dy = toCoords.y - fromCoords.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const headOffset = squareSize * 0.3;
                    const endX = toCoords.x - (dx / len) * headOffset;
                    const endY = toCoords.y - (dy / len) * headOffset;

                    return (
                        <g key={`arrow-${i}`}>
                            <line
                                x1={fromCoords.x}
                                y1={fromCoords.y}
                                x2={endX}
                                y2={endY}
                                stroke={color}
                                strokeWidth={squareSize * 0.15}
                                strokeLinecap="round"
                            />
                            {/* Arrow head */}
                            <polygon
                                points={`
                                    ${toCoords.x},${toCoords.y}
                                    ${endX - (dy / len) * squareSize * 0.2},${endY + (dx / len) * squareSize * 0.2}
                                    ${endX + (dy / len) * squareSize * 0.2},${endY - (dx / len) * squareSize * 0.2}
                                `}
                                fill={color}
                            />
                        </g>
                    );
                });
            }

            case 'LINE': {
                const squares = affordance.squares;
                if (!squares || squares.length < 2) return null;

                const coords = squares
                    .filter(Boolean)
                    .map(sq => squareToCoords(sq, boardSize, orientation));

                return (
                    <line
                        x1={coords[0].x}
                        y1={coords[0].y}
                        x2={coords[coords.length - 1].x}
                        y2={coords[coords.length - 1].y}
                        stroke={color}
                        strokeWidth={squareSize * 0.12}
                        strokeLinecap="round"
                        strokeDasharray={`${squareSize * 0.2} ${squareSize * 0.1}`}
                    />
                );
            }

            case 'HIGHLIGHT': {
                const squares = affordance.squares;
                if (!squares) return null;

                return squares.map((sq, i) => {
                    if (!sq) return null;
                    const coords = squareToCoords(sq, boardSize, orientation);

                    return (
                        <rect
                            key={`highlight-${i}`}
                            x={coords.x - squareSize * 0.45}
                            y={coords.y - squareSize * 0.45}
                            width={squareSize * 0.9}
                            height={squareSize * 0.9}
                            fill={color}
                            rx={squareSize * 0.1}
                        />
                    );
                });
            }

            case 'SHADED_FILE': {
                const file = affordance.file;
                if (!file) return null;

                const fileIndex = fileToIndex(file);
                const x = orientation === 'white'
                    ? fileIndex * squareSize
                    : (7 - fileIndex) * squareSize;

                return (
                    <rect
                        x={x}
                        y={0}
                        width={squareSize}
                        height={boardSize}
                        fill={color}
                    />
                );
            }

            case 'SHADED_RANK': {
                const rank = affordance.rank;
                if (rank === undefined) return null;

                const y = orientation === 'white'
                    ? (8 - rank) * squareSize
                    : (rank - 1) * squareSize;

                return (
                    <rect
                        x={0}
                        y={y}
                        width={boardSize}
                        height={squareSize}
                        fill={color}
                    />
                );
            }

            case 'PAWN_PATH': {
                const from = affordance.from;
                const to = affordance.to;

                if (!from || !to || typeof to !== 'string') return null;

                const fromCoords = squareToCoords(from, boardSize, orientation);
                const toCoords = squareToCoords(to as string, boardSize, orientation);

                // Draw dashed arrow for pawn path
                return (
                    <g>
                        <line
                            x1={fromCoords.x}
                            y1={fromCoords.y}
                            x2={toCoords.x}
                            y2={toCoords.y}
                            stroke={color}
                            strokeWidth={squareSize * 0.1}
                            strokeDasharray={`${squareSize * 0.15} ${squareSize * 0.1}`}
                            strokeLinecap="round"
                        />
                        {/* Star/crown at promotion square */}
                        <circle
                            cx={toCoords.x}
                            cy={toCoords.y}
                            r={squareSize * 0.2}
                            fill={color}
                            stroke="white"
                            strokeWidth={2}
                        />
                    </g>
                );
            }

            default:
                return null;
        }
    }, [affordance, boardSize, orientation, squareSize]);

    if (!affordance) return null;

    return (
        <svg
            className={`absolute inset-0 pointer-events-none ${className}`}
            width={boardSize}
            height={boardSize}
            style={{ zIndex: 10 }}
        >
            {elements}
        </svg>
    );
};

export default TacticalOverlay;

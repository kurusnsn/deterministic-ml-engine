/**
 * Phase 2: Implemented - Coordinate mapping utilities
 */

import { Square } from "chess.js";

// ===== TYPE DEFINITIONS =====

export interface Coordinates {
    x: number;
    y: number;
}

// ===== COORDINATE MAPPING =====

/**
 * Convert a chess square to canvas coordinates (center of square)
 * @param square - Chess square (e.g., "e4")
 * @param boardSize - Size of the board in pixels
 * @param orientation - Board orientation
 * @returns Center coordinates of the square
 */
export function squareToXY(
    square: Square,
    boardSize: number,
    orientation: "white" | "black"
): Coordinates {
    const squareSize = boardSize / 8;

    // Parse square (e.g., "e4" -> file=4, rank=3)
    const file = square.charCodeAt(0) - "a".charCodeAt(0); // 0-7 (a-h)
    const rank = parseInt(square[1]) - 1; // 0-7 (1-8)

    // Calculate visual file/rank based on orientation
    let visualFile: number;
    let visualRank: number;

    if (orientation === "white") {
        // White at bottom: file stays same, rank inverted
        visualFile = file;
        visualRank = 7 - rank;
    } else {
        // Black at bottom: both inverted
        visualFile = 7 - file;
        visualRank = rank;
    }

    // Calculate center coordinates
    const x = (visualFile + 0.5) * squareSize;
    const y = (visualRank + 0.5) * squareSize;

    return { x, y };
}

/**
 * Convert canvas coordinates to chess square
 * @param x - X coordinate on canvas
 * @param y - Y coordinate on canvas
 * @param boardSize - Size of the board in pixels
 * @param orientation - Board orientation
 * @returns Chess square or null if out of bounds
 */
export function xyToSquare(
    x: number,
    y: number,
    boardSize: number,
    orientation: "white" | "black"
): Square | null {
    const squareSize = boardSize / 8;

    // Calculate visual file/rank from coordinates
    const visualFile = Math.floor(x / squareSize);
    const visualRank = Math.floor(y / squareSize);

    // Check bounds
    if (visualFile < 0 || visualFile > 7 || visualRank < 0 || visualRank > 7) {
        return null;
    }

    // Convert visual coordinates to chess coordinates based on orientation
    let file: number;
    let rank: number;

    if (orientation === "white") {
        // White at bottom
        file = visualFile;
        rank = 7 - visualRank;
    } else {
        // Black at bottom
        file = 7 - visualFile;
        rank = visualRank;
    }

    // Convert to square notation
    const fileChar = String.fromCharCode("a".charCodeAt(0) + file);
    const rankChar = (rank + 1).toString();

    return `${fileChar}${rankChar}` as Square;
}

/**
 * Get the square size in pixels
 * @param boardSize - Size of the board in pixels
 * @returns Size of one square
 */
export function getSquareSize(boardSize: number): number {
    return boardSize / 8;
}

/**
 * Get corner coordinates of a square
 * @param square - Chess square
 * @param boardSize - Size of the board in pixels
 * @param orientation - Board orientation
 * @returns Top-left corner coordinates and size
 */
export function getSquareBounds(
    square: Square,
    boardSize: number,
    orientation: "white" | "black"
): { x: number; y: number; size: number } {
    const center = squareToXY(square, boardSize, orientation);
    const size = getSquareSize(boardSize);

    return {
        x: center.x - size / 2,
        y: center.y - size / 2,
        size,
    };
}

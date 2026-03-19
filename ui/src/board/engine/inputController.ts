/**
 * Input Controller
 *
 * Extracted input handling logic from ChessBoard.tsx.
 * Handles click, drag, and drop interactions with the chess board.
 */

import { Chess, Square, Move } from "chess.js";
import { BoardConfig } from "./types";

// ===== LEGAL MOVE COMPUTATION =====

/**
 * Get all legal target squares for a piece on the given square.
 *
 * @param game - Chess.js instance
 * @param square - The square to get moves for
 * @returns Array of legal target squares
 */
export function getLegalMovesForSquare(game: Chess, square: Square): Square[] {
    const moves = game.moves({ square, verbose: true });
    return moves
        .map((m) => m.to)
        .filter((sq): sq is Square => /^[a-h][1-8]$/.test(sq));
}

/**
 * Check if a square has a piece that belongs to the current player.
 *
 * @param game - Chess.js instance
 * @param square - The square to check
 * @returns true if the square has a piece of the current turn
 */
export function isOwnPiece(game: Chess, square: Square): boolean {
    const piece = game.get(square);
    return piece !== null && piece !== undefined && piece.color === game.turn();
}

// ===== CLICK HANDLING =====

export interface ClickResult {
    /** Type of click action taken */
    action: "select" | "move" | "deselect" | "reselect" | "none";
    /** The square that was clicked */
    square: Square;
    /** If action is "move", the source square */
    from?: Square;
    /** If action is "move", whether the move is legal */
    isLegal?: boolean;
    /** Legal moves for the selected piece (if selecting) */
    legalMoves?: Square[];
}

/**
 * Handle a square click, determining the appropriate action.
 *
 * Click logic:
 * 1. If no piece is selected and clicking own piece -> select it
 * 2. If a piece is selected and clicking a legal target -> move
 * 3. If a piece is selected and clicking another own piece -> reselect
 * 4. If a piece is selected and clicking elsewhere -> deselect
 *
 * @param game - Chess.js instance
 * @param config - Board configuration
 * @param square - The clicked square
 * @param selectedSquare - Currently selected square (or null)
 * @returns ClickResult describing what action to take
 */
export function handleClick(
    game: Chess,
    config: BoardConfig,
    square: Square,
    selectedSquare: Square | null
): ClickResult {
    // Case 1: No piece selected
    if (!selectedSquare) {
        if (isOwnPiece(game, square)) {
            const legalMoves = config.highlightLegalMoves ? getLegalMovesForSquare(game, square) : [];
            return {
                action: "select",
                square,
                legalMoves,
            };
        }
        return { action: "none", square };
    }

    // Case 2: Piece is selected
    const legalMoves = getLegalMovesForSquare(game, selectedSquare);
    const isLegalTarget = legalMoves.includes(square);

    if (isLegalTarget) {
        // Move to the target square
        return {
            action: "move",
            square,
            from: selectedSquare,
            isLegal: true,
        };
    }

    // Check if clicking another own piece
    if (isOwnPiece(game, square)) {
        if (square === selectedSquare) {
            // Clicking same piece -> deselect
            return { action: "deselect", square };
        }
        // Clicking different own piece -> reselect
        const newLegalMoves = config.highlightLegalMoves ? getLegalMovesForSquare(game, square) : [];
        return {
            action: "reselect",
            square,
            legalMoves: newLegalMoves,
        };
    }

    // Clicking elsewhere -> attempt move (might be illegal)
    if (config.allowIllegalMoves) {
        return {
            action: "move",
            square,
            from: selectedSquare,
            isLegal: false,
        };
    }

    // Deselect
    return { action: "deselect", square };
}

// ===== DRAG HANDLING =====

export interface DragStartResult {
    /** Whether drag should be allowed */
    allowed: boolean;
    /** The source square */
    square: Square;
    /** Legal target squares (for highlighting) */
    legalMoves: Square[];
}

/**
 * Handle the start of a piece drag.
 *
 * @param game - Chess.js instance
 * @param config - Board configuration
 * @param piece - The piece being dragged (e.g., 'wP', 'bK')
 * @param square - The square the piece is on
 * @returns DragStartResult
 */
export function handleDragStart(
    game: Chess,
    config: BoardConfig,
    piece: string,
    square: Square
): DragStartResult {
    // Check if dragging is enabled
    if (!config.draggable) {
        return { allowed: false, square, legalMoves: [] };
    }

    // Check if it's the player's piece
    // Piece format is like 'wP', 'bK' where first char is color
    const pieceColor = piece[0] === "w" ? "w" : "b";
    const isOwnTurn = pieceColor === game.turn();

    // In certain modes we might allow dragging opponent pieces for analysis
    if (!isOwnTurn && !config.allowIllegalMoves) {
        return { allowed: false, square, legalMoves: [] };
    }

    // Get legal moves for highlighting
    const legalMoves = config.highlightLegalMoves ? getLegalMovesForSquare(game, square) : [];

    return {
        allowed: true,
        square,
        legalMoves,
    };
}

export interface DragEndResult {
    /** Clear the dragging state */
    clearDrag: boolean;
}

/**
 * Handle the end of a piece drag (cleanup).
 *
 * @returns DragEndResult
 */
export function handleDragEnd(): DragEndResult {
    return { clearDrag: true };
}

// ===== DROP HANDLING =====

export interface DropResult {
    /** Whether the drop should be processed as a move */
    shouldMove: boolean;
    /** Source square */
    from: Square;
    /** Target square */
    to: Square;
    /** Whether the move is legal */
    isLegal: boolean;
}

/**
 * Handle a piece drop.
 *
 * @param game - Chess.js instance
 * @param config - Board configuration
 * @param from - Source square
 * @param to - Target square
 * @returns DropResult
 */
export function handleDrop(
    game: Chess,
    config: BoardConfig,
    from: Square,
    to: Square
): DropResult {
    const isLegal = getLegalMovesForSquare(game, from).includes(to);

    if (!isLegal && !config.allowIllegalMoves) {
        return {
            shouldMove: false,
            from,
            to,
            isLegal: false,
        };
    }

    return {
        shouldMove: true,
        from,
        to,
        isLegal,
    };
}

// ===== KEYBOARD HANDLING =====

export type NavigationAction = "back" | "forward" | "start" | "end" | "none";

/**
 * Map keyboard events to navigation actions.
 *
 * @param event - The keyboard event
 * @returns NavigationAction
 */
export function getNavigationAction(event: KeyboardEvent): NavigationAction {
    // Don't handle if user is typing in an input
    if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
    ) {
        return "none";
    }

    switch (event.key) {
        case "ArrowLeft":
            return "back";
        case "ArrowRight":
            return "forward";
        case "Home":
            return "start";
        case "End":
            return "end";
        default:
            return "none";
    }
}

// ===== WHEEL HANDLING =====

export type WheelAction = "back" | "forward" | "none";

/**
 * Map wheel events to navigation actions.
 *
 * @param event - The wheel event
 * @param boardElement - The board DOM element (for containment check)
 * @returns WheelAction
 */
export function getWheelAction(event: WheelEvent, boardElement: HTMLElement | null): WheelAction {
    if (!boardElement) return "none";

    const path = event.composedPath();
    if (!path.includes(boardElement)) {
        return "none";
    }

    if (event.deltaY > 0) {
        return "forward";
    } else if (event.deltaY < 0) {
        return "back";
    }

    return "none";
}

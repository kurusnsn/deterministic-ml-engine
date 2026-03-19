/**
 * Move Handlers
 *
 * Extracted move handling logic from ChessBoard.tsx.
 * Provides functions for executing moves, playing sounds, and notifying callbacks.
 */

import { Chess, Move, Square, PieceSymbol } from "chess.js";
import { BoardConfig, MoveResult, SoundType, MoveContext } from "./types";

// ===== SOUND MAPPING =====

/**
 * Determine which sound to play based on move characteristics.
 */
export function getSoundType(move: Move, isCheck: boolean): SoundType {
    if (move.flags.includes("k") || move.flags.includes("q")) {
        return "castle";
    }
    if (move.promotion) {
        return "promote";
    }
    if (isCheck) {
        return "check";
    }
    if (move.captured) {
        return "capture";
    }
    return "move";
}

// ===== MOVE RESULT CONVERSION =====

/**
 * Convert chess.js Move to our standardized MoveResult format.
 * This format is used for callbacks and backend communication.
 */
export function toMoveResult(move: Move, fen: string): MoveResult {
    return {
        from: move.from,
        to: move.to,
        san: move.san,
        fen,
        promotion: move.promotion,
        captured: move.captured,
        flags: move.flags,
        piece: move.piece,
        color: move.color,
    };
}

// ===== MOVE VALIDATION =====

/**
 * Check if a move is legal in the current position.
 *
 * @param game - Chess.js instance
 * @param from - Source square
 * @param to - Target square
 * @returns true if the move is legal
 */
export function isLegalMove(game: Chess, from: Square, to: Square): boolean {
    const moves = game.moves({ square: from, verbose: true });
    return moves.some((m) => m.to === to);
}

/**
 * Check if a move would be a promotion.
 *
 * @param game - Chess.js instance
 * @param from - Source square
 * @param to - Target square
 * @returns true if this is a pawn promotion move
 */
export function isPromotionMove(game: Chess, from: Square, to: Square): boolean {
    const piece = game.get(from);
    if (!piece || piece.type !== "p") return false;

    const toRank = to[1];
    return (piece.color === "w" && toRank === "8") || (piece.color === "b" && toRank === "1");
}

// ===== MOVE EXECUTION =====

export interface ExecuteMoveOptions {
    from: Square;
    to: Square;
    promotion?: PieceSymbol;
}

export interface ExecuteMoveResult {
    success: boolean;
    move?: Move;
    fen: string;
    error?: string;
    soundType?: SoundType;
    moveResult?: MoveResult;
}

/**
 * Execute a move on the chess.js instance.
 *
 * @param game - Chess.js instance
 * @param options - Move options (from, to, promotion)
 * @returns Result with success status, move details, and sound type
 */
export function executeMove(game: Chess, options: ExecuteMoveOptions): ExecuteMoveResult {
    const { from, to, promotion } = options;
    const fenBefore = game.fen();

    try {
        const move = game.move({
            from,
            to,
            promotion,
        });

        if (!move) {
            return {
                success: false,
                fen: fenBefore,
                error: "Invalid move",
            };
        }

        const fenAfter = game.fen();
        const isCheck = game.isCheck();
        const soundType = getSoundType(move, isCheck);
        const moveResult = toMoveResult(move, fenAfter);

        return {
            success: true,
            move,
            fen: fenAfter,
            soundType,
            moveResult,
        };
    } catch (error) {
        return {
            success: false,
            fen: fenBefore,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

// ===== PROMOTION DETECTION =====

/**
 * Determine the promotion piece from a piece string.
 * react-chessboard passes piece strings like 'wQ', 'bR', etc.
 *
 * @param pieceString - Piece string from react-chessboard (e.g., 'wQ')
 * @returns The promotion piece type, or 'q' as default
 */
export function getPromotionPiece(pieceString?: string): PieceSymbol {
    if (!pieceString || pieceString.length < 2) return "q";

    const pieceType = pieceString[1]?.toLowerCase();
    if (pieceType && ["q", "r", "b", "n"].includes(pieceType)) {
        return pieceType as PieceSymbol;
    }
    return "q";
}

// ===== CALLBACK INVOCATION =====

/**
 * Invoke the appropriate config callbacks after a move.
 *
 * @param config - Board configuration
 * @param moveResult - The move that was made
 */
export function invokeCallbacks(config: BoardConfig, moveResult: MoveResult): void {
    // Call the general onMove callback
    config.onMove?.(moveResult);

    // Call onDrop if provided
    config.onDrop?.(moveResult);

    // Call onPositionChange
    config.onPositionChange?.(moveResult.fen);
}

/**
 * Invoke illegal move callback.
 *
 * @param config - Board configuration
 * @param reason - Why the move was illegal
 * @param from - Source square
 * @param to - Target square
 */
export function invokeIllegalMoveCallback(
    config: BoardConfig,
    reason: string,
    from: Square,
    to: Square
): void {
    config.onIllegalMove?.(reason, from, to);
}

// ===== PUZZLE MODE HELPERS =====

/**
 * Check if a move matches the expected puzzle solution.
 *
 * @param moveResult - The move that was made
 * @param correctMove - The expected move in UCI format
 * @returns true if the move is correct
 */
export function isPuzzleMoveCorrect(moveResult: MoveResult, correctMove: string): boolean {
    const playedUci = `${moveResult.from}${moveResult.to}${moveResult.promotion || ""}`;
    return playedUci === correctMove;
}

// ===== HIGH-LEVEL MOVE HANDLER =====

export interface HandleMoveOptions {
    game: Chess;
    config: BoardConfig;
    from: Square;
    to: Square;
    promotion?: PieceSymbol;
    // Optional callbacks for side effects
    onBeforeMove?: () => void;
    onAfterMove?: (result: ExecuteMoveResult) => void;
    onIllegalMove?: () => void;
}

/**
 * High-level move handler that coordinates validation, execution, and callbacks.
 *
 * This is the main entry point for handling a move attempt.
 *
 * @param options - Move handling options
 * @returns The execution result
 */
export function handleMove(options: HandleMoveOptions): ExecuteMoveResult {
    const { game, config, from, to, promotion, onBeforeMove, onAfterMove, onIllegalMove } = options;

    // Check if the move is legal
    const legal = isLegalMove(game, from, to);

    if (!legal && !config.allowIllegalMoves) {
        onIllegalMove?.();
        invokeIllegalMoveCallback(config, "Illegal move", from, to);
        return {
            success: false,
            fen: game.fen(),
            error: "Illegal move",
        };
    }

    // Determine promotion piece if needed
    let promotionPiece = promotion;
    if (!promotionPiece && isPromotionMove(game, from, to)) {
        promotionPiece = "q"; // Default to queen, UI should show picker
    }

    // Execute the move
    onBeforeMove?.();
    const result = executeMove(game, { from, to, promotion: promotionPiece });

    if (result.success && result.moveResult) {
        // Invoke callbacks
        invokeCallbacks(config, result.moveResult);

        // Handle puzzle-specific logic
        if (config.mode === "puzzle" && config.puzzle?.correctMove) {
            const isCorrect = isPuzzleMoveCorrect(result.moveResult, config.puzzle.correctMove);
            if (isCorrect) {
                config.puzzle.onSolved?.();
            } else {
                config.puzzle.onFailed?.(
                    `${result.moveResult.from}${result.moveResult.to}${result.moveResult.promotion || ""}`
                );
            }
        }
    }

    onAfterMove?.(result);
    return result;
}

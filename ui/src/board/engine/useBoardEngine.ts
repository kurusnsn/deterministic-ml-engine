/**
 * useBoardEngine Hook
 *
 * Main hook that composes all engine functionality into a unified API.
 * This is what ChessBoard.tsx uses to manage all game logic.
 *
 * Features:
 * - Chess.js game instance management
 * - Config-driven behavior (analyze, puzzle, review, opening modes)
 * - Input handling (click, drag, drop)
 * - Move execution with callbacks
 * - Position control (load FEN/PGN, reset)
 */

"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { Chess, Square, PieceSymbol, Move, Color } from "chess.js";
import {
    BoardConfig,
    BoardEngineAPI,
    EngineState,
    MoveResult,
    SoundType,
} from "./types";
import { mergeConfig } from "./boardConfig";
import {
    executeMove,
    isLegalMove,
    isPromotionMove,
    getPromotionPiece,
    invokeCallbacks,
    invokeIllegalMoveCallback,
    isPuzzleMoveCorrect,
    toMoveResult,
    getSoundType,
} from "./moveHandlers";
import {
    handleClick,
    handleDragStart,
    handleDragEnd,
    handleDrop,
    getLegalMovesForSquare as getSquareLegalMoves,
    isOwnPiece,
} from "./inputController";
import {
    loadFen as loadFenToGame,
    loadPgn as loadPgnToGame,
    resetToStart as resetGame,
    getGameStatus,
} from "./fenController";

// ===== HOOK OPTIONS =====

export interface UseBoardEngineOptions {
    /** Initial FEN position */
    initialFen?: string;
    /** Initial PGN */
    initialPgn?: string;
    /** Board configuration (will be merged with defaults) */
    config?: Partial<BoardConfig>;
    /** Callback when sound should be played */
    onPlaySound?: (sound: SoundType) => void;
}

// ===== MAIN HOOK =====

/**
 * Main board engine hook.
 *
 * Provides a complete API for managing chess game state, handling user input,
 * and coordinating with the configuration system.
 *
 * @example
 * ```tsx
 * const engine = useBoardEngine({
 *   config: {
 *     mode: "analyze",
 *     arrows: true,
 *     threats: true,
 *     onMove: (move) => console.log("Move:", move.san),
 *   },
 * });
 *
 * return (
 *   <UniversalBoard
 *     position={engine.state.fen}
 *     onPieceDrop={engine.onDrop}
 *     onSquareClick={engine.onSquareClick}
 *   />
 * );
 * ```
 */
export function useBoardEngine(options: UseBoardEngineOptions = {}): BoardEngineAPI {
    const { initialFen, initialPgn, config: configOverrides, onPlaySound } = options;

    // Merge config with defaults
    const config = useMemo(() => mergeConfig(configOverrides || {}), [configOverrides]);

    // Chess.js game instance
    const gameRef = useRef<Chess | null>(null);

    // Lazy initialization of chess.js
    if (!gameRef.current) {
        gameRef.current = new Chess();
        if (initialFen) {
            try {
                gameRef.current.load(initialFen);
            } catch {
                console.warn("[useBoardEngine] Invalid initial FEN, using starting position");
            }
        } else if (initialPgn) {
            try {
                gameRef.current.loadPgn(initialPgn);
            } catch {
                console.warn("[useBoardEngine] Invalid initial PGN, using starting position");
            }
        }
    }

    const game = gameRef.current;

    // ===== STATE =====

    const [fen, setFen] = useState(() => game.fen());
    const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
    const [legalMoves, setLegalMoves] = useState<Square[]>([]);
    const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);

    // ===== DERIVED STATE =====

    const state: EngineState = useMemo(
        () => ({
            fen,
            turn: game.turn(),
            selectedSquare,
            legalMoves,
            lastMove,
            isGameOver: game.isGameOver(),
            status: getGameStatus(game),
        }),
        [fen, selectedSquare, legalMoves, lastMove]
    );

    // ===== MOVE EXECUTION =====

    const makeMove = useCallback(
        (from: Square, to: Square, promotion?: PieceSymbol): MoveResult | null => {
            // Check if move is legal
            const legal = isLegalMove(game, from, to);

            if (!legal && !config.allowIllegalMoves) {
                onPlaySound?.("illegal");
                invokeIllegalMoveCallback(config, "Illegal move", from, to);
                return null;
            }

            // Determine promotion piece
            let promotionPiece = promotion;
            if (!promotionPiece && isPromotionMove(game, from, to)) {
                promotionPiece = "q"; // Default to queen
            }

            // Execute the move
            const result = executeMove(game, { from, to, promotion: promotionPiece });

            if (!result.success || !result.moveResult) {
                onPlaySound?.("illegal");
                return null;
            }

            // Play sound
            if (result.soundType) {
                onPlaySound?.(result.soundType);
            }

            // Update state
            setFen(result.fen);
            setLastMove({ from, to });
            setSelectedSquare(null);
            setLegalMoves([]);

            // Invoke callbacks
            invokeCallbacks(config, result.moveResult);

            // Handle puzzle mode
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

            return result.moveResult;
        },
        [config, onPlaySound]
    );

    // ===== MOVE VALIDATION =====

    const validateMove = useCallback(
        (from: Square, to: Square): boolean => {
            return isLegalMove(game, from, to);
        },
        []
    );

    // ===== SELECTION =====

    const selectSquare = useCallback(
        (square: Square): void => {
            if (!isOwnPiece(game, square)) {
                setSelectedSquare(null);
                setLegalMoves([]);
                return;
            }

            setSelectedSquare(square);
            if (config.highlightLegalMoves) {
                setLegalMoves(getSquareLegalMoves(game, square));
            }
        },
        [config.highlightLegalMoves]
    );

    const clearSelection = useCallback((): void => {
        setSelectedSquare(null);
        setLegalMoves([]);
    }, []);

    // ===== POSITION CONTROL =====

    const loadFen = useCallback((newFen: string): boolean => {
        const success = loadFenToGame(game, newFen);
        if (success) {
            setFen(game.fen());
            setSelectedSquare(null);
            setLegalMoves([]);
            setLastMove(null);
            config.onPositionChange?.(game.fen());
        }
        return success;
    }, [config]);

    const loadPgn = useCallback((pgn: string): boolean => {
        const success = loadPgnToGame(game, pgn);
        if (success) {
            setFen(game.fen());
            setSelectedSquare(null);
            setLegalMoves([]);
            setLastMove(null);
            config.onPositionChange?.(game.fen());
        }
        return success;
    }, [config]);

    const resetToStart = useCallback((): void => {
        resetGame(game);
        setFen(game.fen());
        setSelectedSquare(null);
        setLegalMoves([]);
        setLastMove(null);
        config.onPositionChange?.(game.fen());
    }, [config]);

    // ===== QUERIES =====

    const getLegalMovesForSquare = useCallback((square: Square): Square[] => {
        return getSquareLegalMoves(game, square);
    }, []);

    const getPosition = useCallback((): string => {
        return game.fen();
    }, []);

    const getTurn = useCallback((): Color => {
        return game.turn();
    }, []);

    const isCheck = useCallback((): boolean => {
        return game.isCheck();
    }, []);

    const isCheckmate = useCallback((): boolean => {
        return game.isCheckmate();
    }, []);

    // ===== INPUT HANDLERS =====

    const onSquareClick = useCallback(
        (square: Square): void => {
            const result = handleClick(game, config, square, selectedSquare);

            switch (result.action) {
                case "select":
                    setSelectedSquare(square);
                    setLegalMoves(result.legalMoves || []);
                    config.onSelect?.(square);
                    break;

                case "reselect":
                    setSelectedSquare(square);
                    setLegalMoves(result.legalMoves || []);
                    config.onSelect?.(square);
                    break;

                case "move":
                    if (result.from) {
                        makeMove(result.from, square);
                    }
                    break;

                case "deselect":
                    setSelectedSquare(null);
                    setLegalMoves([]);
                    break;

                case "none":
                default:
                    break;
            }
        },
        [config, selectedSquare, makeMove]
    );

    const onDragStart = useCallback(
        (piece: string, sourceSquare: Square): void => {
            const result = handleDragStart(game, config, piece, sourceSquare);

            if (result.allowed) {
                setSelectedSquare(sourceSquare);
                setLegalMoves(result.legalMoves);
            }
        },
        [config]
    );

    const onDragEnd = useCallback((): void => {
        handleDragEnd();
        // Don't clear selection here - let drop handler or click handler manage it
    }, []);

    const onDrop = useCallback(
        (sourceSquare: Square, targetSquare: Square, piece: string): boolean => {
            const result = handleDrop(game, config, sourceSquare, targetSquare);

            if (!result.shouldMove) {
                onPlaySound?.("illegal");
                setSelectedSquare(null);
                setLegalMoves([]);
                return false;
            }

            // Determine promotion
            let promotion: PieceSymbol | undefined;
            if (isPromotionMove(game, sourceSquare, targetSquare)) {
                promotion = getPromotionPiece(piece);
            }

            const moveResult = makeMove(sourceSquare, targetSquare, promotion);

            // Clear selection after drop regardless of success
            setSelectedSquare(null);
            setLegalMoves([]);

            return moveResult !== null;
        },
        [config, makeMove, onPlaySound]
    );

    // ===== RETURN API =====

    return {
        state,
        makeMove,
        validateMove,
        selectSquare,
        clearSelection,
        loadFen,
        loadPgn,
        resetToStart,
        getLegalMovesForSquare,
        getPosition,
        getTurn,
        isCheck,
        isCheckmate,
        onSquareClick,
        onDragStart,
        onDragEnd,
        onDrop,
    };
}

export default useBoardEngine;

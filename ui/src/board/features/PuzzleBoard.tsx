/**
 * PuzzleBoard
 *
 * A puzzle-specific board component that uses the board engine with puzzle mode.
 * This component wraps ConfigurableChessBoard with puzzle-specific logic.
 *
 * Features:
 * - Move validation against expected puzzle solution
 * - Visual feedback for correct/incorrect moves
 * - Callbacks for puzzle completion
 *
 * This is intended as a drop-in replacement for embedded puzzle boards.
 */

"use client";

import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { Square } from "chess.js";
import { ConfigurableChessBoard } from "@/board/react/ConfigurableChessBoard";
import { BoardConfig, MoveResult } from "@/board/engine/types";
import { useBoardEngine } from "@/board/engine/useBoardEngine";

// ===== PROPS =====

export interface PuzzleBoardProps {
    /** Initial FEN position for the puzzle */
    fen: string;
    /** Expected correct move(s) in UCI format (e.g., "e2e4" or ["e2e4", "d2d4"]) */
    solution: string | string[];
    /** Board orientation */
    orientation?: "white" | "black";
    /** Board size in pixels */
    boardSize?: number;
    /** Callback when puzzle is solved correctly */
    onSolved?: () => void;
    /** Callback when an incorrect move is made */
    onIncorrect?: (attemptedMove: string) => void;
    /** Callback when any move is made (for tracking) */
    onMove?: (move: MoveResult) => void;
    /** Whether to show hints for legal moves */
    showHints?: boolean;
    /** Behavior when incorrect move is made */
    failBehavior?: "shake" | "block" | "hint";
    /** Additional className */
    className?: string;
}

// ===== COMPONENT =====

export function PuzzleBoard({
    fen,
    solution,
    orientation = "white",
    boardSize = 400,
    onSolved,
    onIncorrect,
    onMove,
    showHints = false,
    failBehavior = "shake",
    className,
}: PuzzleBoardProps) {
    // Convert solution to array if string
    const solutionMoves = useMemo(
        () => (typeof solution === "string" ? [solution] : solution),
        [solution]
    );

    // Track current solution index (for multi-move puzzles)
    const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
    const [isSolved, setIsSolved] = useState(false);
    const [shakeKey, setShakeKey] = useState(0);

    // Engine ref to control the board
    const engineRef = useRef<ReturnType<typeof useBoardEngine> | null>(null);

    // Get the current expected move
    const expectedMove = solutionMoves[currentMoveIndex];

    // Handle move attempt
    const handleMove = useCallback(
        (move: MoveResult) => {
            // Notify external handler
            onMove?.(move);

            // Check if the move matches the expected solution
            const playedUci = `${move.from}${move.to}${move.promotion || ""}`;

            if (playedUci === expectedMove) {
                // Correct move!
                const nextIndex = currentMoveIndex + 1;

                if (nextIndex >= solutionMoves.length) {
                    // Puzzle solved!
                    setIsSolved(true);
                    onSolved?.();
                } else {
                    // More moves needed
                    setCurrentMoveIndex(nextIndex);
                }
            } else {
                // Incorrect move
                onIncorrect?.(playedUci);

                if (failBehavior === "shake") {
                    setShakeKey((k) => k + 1);
                }

                // In a real implementation, we might undo the move here
                // For now, the puzzle continues with the incorrect position
            }
        },
        [expectedMove, currentMoveIndex, solutionMoves.length, onSolved, onIncorrect, onMove, failBehavior]
    );

    // Build puzzle config
    const config = useMemo<Partial<BoardConfig>>(
        () => ({
            mode: "puzzle",
            draggable: !isSolved,
            highlightLegalMoves: showHints,
            highlightLastMove: true,
            puzzle: {
                correctMove: expectedMove,
                failBehavior,
                onSolved,
                onFailed: onIncorrect,
            },
            onMove: handleMove,
        }),
        [expectedMove, isSolved, showHints, failBehavior, handleMove, onSolved, onIncorrect]
    );

    // Reset when puzzle changes
    useEffect(() => {
        setCurrentMoveIndex(0);
        setIsSolved(false);
    }, [fen, solution]);

    return (
        <div
            key={shakeKey}
            className={`${className || ""} ${failBehavior === "shake" && shakeKey > 0 ? "animate-shake" : ""}`}
        >
            <ConfigurableChessBoard
                config={config}
                initialFen={fen}
                boardSize={boardSize}
                orientation={orientation}
                showOverlay={true}
                engineRef={engineRef}
            />

            {/* Puzzle status indicator */}
            {isSolved && (
                <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 rounded pointer-events-none">
                    <span className="text-green-400 text-xl font-bold">✓ Solved!</span>
                </div>
            )}
        </div>
    );
}

export default PuzzleBoard;

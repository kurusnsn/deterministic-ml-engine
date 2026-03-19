/**
 * ReviewBoard
 *
 * A game review-specific board component that uses the board engine with review mode.
 * This component is designed for navigating through analyzed games.
 *
 * Features:
 * - Read-only or editable navigation
 * - Move annotations display
 * - Best move highlighting
 * - Navigation controls
 *
 * This is intended as a drop-in replacement for embedded review boards.
 */

"use client";

import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { Square } from "chess.js";
import { ConfigurableChessBoard } from "@/board/react/ConfigurableChessBoard";
import { BoardConfig, MoveResult, MoveAnnotation } from "@/board/engine/types";
import { useBoardEngine } from "@/board/engine/useBoardEngine";

// ===== PROPS =====

export interface ReviewBoardProps {
    /** Move list as FEN positions */
    positions: string[];
    /** Current position index */
    currentIndex?: number;
    /** Move annotations */
    annotations?: MoveAnnotation[];
    /** Board orientation */
    orientation?: "white" | "black";
    /** Board size in pixels */
    boardSize?: number;
    /** Whether navigation is allowed */
    allowNavigation?: boolean;
    /** Whether making moves is allowed (for analysis variations) */
    allowMoves?: boolean;
    /** Show best move arrow */
    showBestMove?: boolean;
    /** Callback when position changes */
    onPositionChange?: (index: number, fen: string) => void;
    /** Callback when a move is made (if allowed) */
    onMove?: (move: MoveResult) => void;
    /** Additional className */
    className?: string;
}

// ===== COMPONENT =====

export function ReviewBoard({
    positions,
    currentIndex = 0,
    annotations = [],
    orientation = "white",
    boardSize = 400,
    allowNavigation = true,
    allowMoves = false,
    showBestMove = true,
    onPositionChange,
    onMove,
    className,
}: ReviewBoardProps) {
    const [internalIndex, setInternalIndex] = useState(currentIndex);
    const engineRef = useRef<ReturnType<typeof useBoardEngine> | null>(null);

    // Sync with external index
    useEffect(() => {
        setInternalIndex(currentIndex);
    }, [currentIndex]);

    // Get current position
    const currentFen = positions[internalIndex] || positions[0];

    // Get annotation for current position
    const currentAnnotation = annotations.find((a) => a.ply === internalIndex);

    // Navigation handlers
    const goToMove = useCallback(
        (index: number) => {
            if (!allowNavigation) return;
            const clampedIndex = Math.max(0, Math.min(index, positions.length - 1));
            setInternalIndex(clampedIndex);
            onPositionChange?.(clampedIndex, positions[clampedIndex]);
        },
        [allowNavigation, positions, onPositionChange]
    );

    const goBack = useCallback(() => goToMove(internalIndex - 1), [internalIndex, goToMove]);
    const goForward = useCallback(() => goToMove(internalIndex + 1), [internalIndex, goToMove]);
    const goToStart = useCallback(() => goToMove(0), [goToMove]);
    const goToEnd = useCallback(() => goToMove(positions.length - 1), [positions.length, goToMove]);

    // Handle keyboard navigation
    useEffect(() => {
        if (!allowNavigation) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            switch (e.key) {
                case "ArrowLeft":
                    e.preventDefault();
                    goBack();
                    break;
                case "ArrowRight":
                    e.preventDefault();
                    goForward();
                    break;
                case "Home":
                    e.preventDefault();
                    goToStart();
                    break;
                case "End":
                    e.preventDefault();
                    goToEnd();
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [allowNavigation, goBack, goForward, goToStart, goToEnd]);

    // Build review config
    const config = useMemo<Partial<BoardConfig>>(
        () => ({
            mode: "review",
            draggable: allowMoves,
            highlightLegalMoves: allowMoves,
            highlightLastMove: true,
            arrows: showBestMove,
            review: {
                annotations,
                showBestMove,
                editable: allowMoves,
            },
            onMove,
        }),
        [allowMoves, showBestMove, annotations, onMove]
    );

    return (
        <div className={`flex flex-col gap-2 ${className || ""}`}>
            <ConfigurableChessBoard
                config={config}
                initialFen={currentFen}
                boardSize={boardSize}
                orientation={orientation}
                showOverlay={true}
                engineRef={engineRef}
            />

            {/* Annotation display */}
            {currentAnnotation && (
                <div className="text-sm p-2 bg-zinc-800 rounded">
                    {currentAnnotation.classification && (
                        <span
                            className={`font-semibold ${currentAnnotation.classification === "brilliant"
                                    ? "text-cyan-400"
                                    : currentAnnotation.classification === "blunder"
                                        ? "text-red-400"
                                        : "text-zinc-400"
                                }`}
                        >
                            {currentAnnotation.classification}
                        </span>
                    )}
                    {currentAnnotation.comment && <p className="text-zinc-300 mt-1">{currentAnnotation.comment}</p>}
                </div>
            )}

            {/* Navigation controls */}
            {allowNavigation && (
                <div className="flex justify-center gap-2">
                    <button
                        onClick={goToStart}
                        disabled={internalIndex === 0}
                        className="px-3 py-1 bg-zinc-700 rounded disabled:opacity-50"
                    >
                        ⏮
                    </button>
                    <button
                        onClick={goBack}
                        disabled={internalIndex === 0}
                        className="px-3 py-1 bg-zinc-700 rounded disabled:opacity-50"
                    >
                        ◀
                    </button>
                    <span className="px-3 py-1 text-zinc-400">
                        {internalIndex + 1} / {positions.length}
                    </span>
                    <button
                        onClick={goForward}
                        disabled={internalIndex >= positions.length - 1}
                        className="px-3 py-1 bg-zinc-700 rounded disabled:opacity-50"
                    >
                        ▶
                    </button>
                    <button
                        onClick={goToEnd}
                        disabled={internalIndex >= positions.length - 1}
                        className="px-3 py-1 bg-zinc-700 rounded disabled:opacity-50"
                    >
                        ⏭
                    </button>
                </div>
            )}
        </div>
    );
}

export default ReviewBoard;

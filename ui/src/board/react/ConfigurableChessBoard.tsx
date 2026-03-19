/**
 * ConfigurableChessBoard
 *
 * A lightweight, config-driven chess board component built on useBoardEngine.
 * This component is designed for pages that need a simpler board without all
 * the analysis features of the full ChessBoard.
 *
 * Use cases:
 * - Puzzle trainer (just needs move validation)
 * - Game review (read-only navigation)
 * - Opening trainer (book moves + navigation)
 * - Embedded boards in other features
 *
 * For full analysis features (LLM, move tree, engine analysis), use ChessBoard.tsx.
 */

"use client";

import React, { useCallback, useMemo, useEffect } from "react";
import { Square } from "chess.js";
import useSound from "use-sound";
import { useBoardEngine, BoardConfig, SoundType, mergeConfig } from "@/board/engine";
import { UniversalBoard } from "@/board/react/UniversalBoard";
import { useBoardStore, Highlight } from "@/board/core/useBoardStore";
import { useChessDrawing } from "@/app/hooks/useChessDrawing";

// ===== PROPS =====

export interface ConfigurableChessBoardProps {
    /** Board configuration */
    config?: Partial<BoardConfig>;
    /** Initial FEN position */
    initialFen?: string;
    /** Initial PGN */
    initialPgn?: string;
    /** Board size in pixels */
    boardSize?: number;
    /** Board orientation */
    orientation?: "white" | "black";
    /** Whether to show the overlay canvas */
    showOverlay?: boolean;
    /** Additional class name */
    className?: string;
    /** Callback when position changes */
    onPositionChange?: (fen: string) => void;
    /** External ref to access engine API */
    engineRef?: React.MutableRefObject<ReturnType<typeof useBoardEngine> | null>;
}

// ===== STYLES =====

const HIGHLIGHT_COLOR = "rgba(255, 205, 50, 0.5)";

// ===== COMPONENT =====

export function ConfigurableChessBoard({
    config,
    initialFen,
    initialPgn,
    boardSize = 500,
    orientation = "white",
    showOverlay = true,
    className,
    onPositionChange,
    engineRef,
}: ConfigurableChessBoardProps) {
    // ===== SOUND HOOKS =====
    const [playMove] = useSound("/sounds/move-self.mp3", { volume: 0.5 });
    const [playCapture] = useSound("/sounds/capture.mp3", { volume: 0.5 });
    const [playCastle] = useSound("/sounds/castle.mp3", { volume: 0.5 });
    const [playCheck] = useSound("/sounds/move-check.mp3", { volume: 0.5 });
    const [playPromote] = useSound("/sounds/promote.mp3", { volume: 0.5 });
    const [playIllegal] = useSound("/sounds/illegal.mp3", { volume: 0.5 });

    // ===== SOUND CALLBACK =====
    const handlePlaySound = useCallback(
        (sound: SoundType) => {
            switch (sound) {
                case "move":
                    playMove();
                    break;
                case "capture":
                    playCapture();
                    break;
                case "castle":
                    playCastle();
                    break;
                case "check":
                    playCheck();
                    break;
                case "promote":
                    playPromote();
                    break;
                case "illegal":
                    playIllegal();
                    break;
            }
        },
        [playMove, playCapture, playCastle, playCheck, playPromote, playIllegal]
    );

    // ===== ENGINE =====
    const mergedConfig = useMemo(
        () =>
            mergeConfig({
                ...config,
                onPositionChange: (fen: string) => {
                    config?.onPositionChange?.(fen);
                    onPositionChange?.(fen);
                },
            }),
        [config, onPositionChange]
    );

    const engine = useBoardEngine({
        initialFen,
        initialPgn,
        config: mergedConfig,
        onPlaySound: handlePlaySound,
    });

    // Expose engine via ref if provided
    useEffect(() => {
        if (engineRef) {
            engineRef.current = engine;
        }
    }, [engine, engineRef]);

    // ===== DRAWING =====
    const drawing = useChessDrawing(orientation);

    // ===== STORE INTEGRATION =====
    const setHoveredSquare = useBoardStore((s) => s.setHoveredSquare);
    const setHighlights = useBoardStore((s) => s.setHighlights);
    const hoveredSquare = useBoardStore((s) => s.hoveredSquare);
    const ripples = useBoardStore((s) => s.ripples);

    // ===== SYNC HIGHLIGHTS TO STORE =====
    useEffect(() => {
        const highlights: Highlight[] = [];

        // Note: Legal moves moved to customSquareStyles to render UNDER pieces

        // User-drawn circles
        drawing.drawnCircles.forEach((circle) => {
            highlights.push({
                square: circle.square,
                type: "userCircle",
                color: circle.color,
            });
        });

        setHighlights(highlights);
    }, [engine.state.legalMoves, drawing.drawnCircles, setHighlights]);

    // ===== SYNC BOARD SIZE TO STORE =====
    useEffect(() => {
        useBoardStore.setState({
            boardSize,
            orientation,
            fen: engine.state.fen,
        });
    }, [boardSize, orientation, engine.state.fen]);

    // ===== CUSTOM SQUARE STYLES =====
    const customSquareStyles = useMemo(() => {
        const styles: Record<string, React.CSSProperties> = {};

        // Last move highlights
        if (engine.state.lastMove && mergedConfig.highlightLastMove) {
            styles[engine.state.lastMove.from] = { backgroundColor: HIGHLIGHT_COLOR };
            styles[engine.state.lastMove.to] = { backgroundColor: HIGHLIGHT_COLOR };
        }

        // Selected square highlight
        if (engine.state.selectedSquare) {
            styles[engine.state.selectedSquare] = { backgroundColor: HIGHLIGHT_COLOR };
        }

        // Legal Moves (Dots) - Rendered here to be UNDER pieces
        engine.state.legalMoves.forEach((sq) => {
            const existing = styles[sq] || {};
            styles[sq] = {
                ...existing,
                backgroundImage: "radial-gradient(circle, rgba(0, 0, 0, 0.2) 25%, transparent 25%)",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                borderRadius: "50%"
            };
        });

        // Ripples - Rendered here to be UNDER pieces
        ripples.forEach((r) => {
            const existing = styles[r.square] || {};
            styles[r.square] = {
                ...existing,
                animation: "ripple-effect 0.6s ease-out"
            };
        });

        // Hover highlight
        if (hoveredSquare && hoveredSquare !== engine.state.selectedSquare) {
            const existing = styles[hoveredSquare] || {};
            styles[hoveredSquare] = {
                ...existing,
                boxShadow: "inset 0 0 0 1px white",
            };
        }

        return styles;
    }, [engine.state.lastMove, engine.state.selectedSquare, hoveredSquare, mergedConfig.highlightLastMove, engine.state.legalMoves, ripples]);

    // ===== HANDLERS =====
    // Note: onPieceDrop only gives us source and target, not the piece
    // For promotion, we default to queen - the dialog handling is separate
    const handleDrop = useCallback(
        (source: string, target: string): boolean => {
            // Trigger ripple
            useBoardStore.getState().addRipple(target as Square);
            // Default to queen for promotion - react-chessboard handles the dialog separately
            return engine.onDrop(source as Square, target as Square, "wQ");
        },
        [engine]
    );

    const handleSquareClick = useCallback(
        (square: Square) => {
            // Trigger ripple
            useBoardStore.getState().addRipple(square);
            engine.onSquareClick(square);
        },
        [engine]
    );

    const handleDragBegin = useCallback(
        (piece: string, sourceSquare: Square) => {
            useBoardStore.getState().addRipple(sourceSquare);
            setHoveredSquare(null);
            engine.onDragStart(piece, sourceSquare);
        },
        [engine, setHoveredSquare]
    );

    const handleDragEnd = useCallback(() => {
        engine.onDragEnd();
    }, [engine]);

    // ===== RENDER =====
    return (
        <div
            className={`relative ${className || ""}`}
            style={{ width: boardSize, height: boardSize }}
            onMouseDown={drawing.handleMouseDown}
            onMouseUp={drawing.handleMouseUp}
            onContextMenu={drawing.handleContextMenu}
        >
            <UniversalBoard
                position={engine.state.fen}
                boardWidth={boardSize}
                boardOrientation={orientation}
                customDropSquareStyle={{ boxShadow: "inset 0 0 0 1px white" }}
                onPieceDrop={handleDrop}
                onSquareClick={handleSquareClick}
                onPieceDragBegin={handleDragBegin}
                onPieceDragEnd={handleDragEnd}
                onMouseOverSquare={setHoveredSquare}
                onMouseOutSquare={() => setHoveredSquare(null)}
                showOverlay={showOverlay}
                customSquareStyles={customSquareStyles}
            />
        </div>
    );
}

export default ConfigurableChessBoard;

"use client";

import { Chessboard } from "react-chessboard";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ForcingLine } from "@/types/openings";
import { useChessDrawing } from "@/app/hooks/useChessDrawing";
import Image from "next/image";
import { NonLLMCommentaryOverlay } from "./NonLLMCommentaryOverlay";
import type { Affordance } from "@/hooks/useNonLLMCommentaryOverlay";
import FeedbackOverlay from "./FeedbackOverlay";
import { Chess, Square } from "chess.js";
import { CapturedPieces } from "@/components/CapturedPieces";

// Canvas overlay for ripples and visual effects
import { OverlayCanvas } from "@/board/overlay/OverlayCanvas";
import { useBoardStore } from "@/board/core/useBoardStore";

interface ChessboardPanelProps {
    fen: string;
    onMove: (sourceSquare: string, targetSquare: string) => boolean;
    onRestart: () => void;
    onPrevious: () => void;
    onNext: () => void;
    onAutoPlay: () => void;
    onHint?: () => void;
    onSolution?: () => void;
    orientation: "white" | "black";
    title: string;
    isAutoPlaying?: boolean;
    currentLine?: ForcingLine | null;
    showHint?: boolean;
    hintSquare?: string | null;
    moveResult?: "correct" | "incorrect" | null;
    lastMoveType?: "move" | "capture" | "castle" | "check" | "promote" | "illegal" | null;
    feedbackSquare?: string | null;
    width?: number;
    affordance?: Affordance | null;
    onDismissFeedback?: () => void;
}

export default function ChessboardPanel(props: ChessboardPanelProps) {
    const {
        fen,
        onMove,
        orientation,
        showHint = false,
        hintSquare = null,
        moveResult = null,
        feedbackSquare = null,
        width,
        affordance,
        onDismissFeedback,
    } = props;
    const [internalWidth, setInternalWidth] = useState(400);
    const boardWidth = width ?? internalWidth;
    const containerRef = useRef<HTMLDivElement>(null);
    const [showFeedback, setShowFeedback] = useState(false);

    // Legal move highlighting (dots on available squares)
    const [legalMoves, setLegalMoves] = useState<Square[]>([]);
    const [captureTargets, setCaptureTargets] = useState<Square[]>([]);
    const [hoveredLegalSquare, setHoveredLegalSquare] = useState<Square | null>(null);

    // Temporary Chess instance for calculating legal moves from FEN
    const tempGame = useMemo(() => new Chess(), []);

    const handleBoardMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        // When showing an incorrect move, a click dismisses it and goes back —
        // don't also start a drawing stroke in the same gesture.
        if (moveResult === "incorrect" && onDismissFeedback) {
            onDismissFeedback();
            return;
        }
        drawing.handleMouseDown(event);
    };

    // Helper to get square position (top-right corner)
    const getSquarePosition = (square: string | null) => {
        if (!square) return null;

        const file = square.charCodeAt(0) - 'a'.charCodeAt(0); // 0-7
        const rank = parseInt(square[1]) - 1; // 0-7

        const squareSize = boardWidth / 8;
        const iconSize = 32;

        // Adjust for board orientation
        const visualFile = orientation === "white" ? file : 7 - file;
        const visualRank = orientation === "white" ? 7 - rank : rank;

        // Position at top-right corner of square
        // Center the 32x32 icon at the top-right corner
        let left = (visualFile + 1) * squareSize - iconSize / 2;
        let top = visualRank * squareSize - iconSize / 2;

        // Clamp values to ensure icon stays within the board bounds
        // Right edge: if icon would go past board edge, shift left
        if (left + iconSize > boardWidth) {
            left = (visualFile + 1) * squareSize - iconSize - 4; // 4px padding from edge
        }
        // Top edge: if icon would go past top, shift down inside square
        if (top < 0) {
            top = visualRank * squareSize + 4; // 4px padding from top
        }

        return { left, top };
    };

    const drawing = useChessDrawing(orientation);

    // Sync board size and orientation with the overlay store
    useEffect(() => {
        useBoardStore.getState().setBoardSize(boardWidth);
    }, [boardWidth]);

    // Clear any stale overlay data from previous pages (e.g., analyze page grid/arrows)
    useEffect(() => {
        useBoardStore.getState().clearOverlays();
    }, []);

    useEffect(() => {
        useBoardStore.getState().setOrientation(orientation);
    }, [orientation]);

    // Wrapper for onMove that adds ripple effect
    const handlePieceDrop = useCallback((sourceSquare: string, targetSquare: string) => {
        // Trigger ripple on drag start
        useBoardStore.getState().addRipple(sourceSquare as Square);
        const result = onMove(sourceSquare, targetSquare);
        if (result) {
            // Trigger ripple on successful drop
            useBoardStore.getState().addRipple(targetSquare as Square);
        }
        setLegalMoves([]);
        setCaptureTargets([]);
        setHoveredLegalSquare(null);
        return result;
    }, [onMove]);

    // Handler for piece drag begin - calculate legal moves for dots
    const handlePieceDragBegin = useCallback((piece: string, sourceSquare: string) => {
        useBoardStore.getState().addRipple(sourceSquare as Square);
        try {
            tempGame.load(fen);
            const moves = tempGame.moves({ square: sourceSquare as Square, verbose: true });
            const legal = moves.map(m => m.to as Square);
            const captures = moves
                .filter((m) => Boolean(m.captured) || m.flags.includes("c") || m.flags.includes("e"))
                .map((m) => m.to as Square);
            setLegalMoves(legal);
            setCaptureTargets(captures);
        } catch {
            setLegalMoves([]);
            setCaptureTargets([]);
        }
    }, [fen, tempGame]);

    // Handler for piece drag end - clear legal moves
    const handlePieceDragEnd = useCallback(() => {
        setLegalMoves([]);
        setCaptureTargets([]);
        setHoveredLegalSquare(null);
    }, []);

    // Show visual feedback - auto-hide after 1 second for correct moves only
    // Incorrect moves persist until user clicks on board to dismiss
    useEffect(() => {
        if (moveResult) {
            setShowFeedback(true);
            if (moveResult === "correct") {
                const timer = setTimeout(() => {
                    setShowFeedback(false);
                }, 1000);
                return () => clearTimeout(timer);
            }
        } else {
            setShowFeedback(false);
        }
    }, [moveResult]);

    useEffect(() => {
        if (width !== undefined) return;

        const calculateBoardSize = () => {
            if (typeof window !== 'undefined') {
                const isMobile = window.innerWidth < 1024;

                if (isMobile) {
                    // Mobile/Tablet: account for page padding
                    const pagePadding = window.innerWidth < 768 ? 32 : 48;
                    const size = Math.min(
                        window.innerWidth - pagePadding,
                        (window.innerHeight * 2) / 3
                    );
                    setInternalWidth(size);
                } else {
                    // Desktop: Match /analyze behavior - account for navbar + padding
                    const availableHeight = window.innerHeight - 200;
                    const availableWidth = window.innerWidth * 0.4;

                    // Scale proportionally with minimum constraint
                    const size = Math.max(
                        320,
                        Math.min(1000, availableWidth, availableHeight)
                    );
                    setInternalWidth(size);
                }
            }
        };
        calculateBoardSize();

        window.addEventListener("resize", calculateBoardSize);
        return () => window.removeEventListener("resize", calculateBoardSize);
    }, [width]);

    return (
        <div className="flex flex-col items-center justify-center gap-6" ref={containerRef} style={{ width: boardWidth }}>
            <div
                className="relative"
                style={{
                    width: boardWidth,
                    height: boardWidth,
                }}
                onMouseDown={handleBoardMouseDown}
                onMouseUp={drawing.handleMouseUp}
                onContextMenu={drawing.handleContextMenu}
                tabIndex={0}
                aria-label="Chessboard"
            >


                <Chessboard
                    position={fen}
                    onPieceDrop={handlePieceDrop}
                    onPieceDragBegin={handlePieceDragBegin}
                    onPieceDragEnd={handlePieceDragEnd}
                    onMouseOverSquare={(square) => {
                        setHoveredLegalSquare(square as Square);
                    }}
                    onMouseOutSquare={() => {
                        setHoveredLegalSquare(null);
                    }}
                    boardOrientation={orientation}
                    arePiecesDraggable={moveResult !== "incorrect"}
                    customBoardStyle={{
                        borderRadius: "4px",
                    }}
                    boardWidth={boardWidth}
                    animationDuration={300}
                    customArrows={drawing.getCustomArrows()}
                    customSquareStyles={{
                        ...(showHint && hintSquare
                            ? {
                                [hintSquare]: {
                                    backgroundColor: "rgba(255, 255, 0, 0.4)",
                                    boxShadow: "inset 0 0 10px rgba(255, 255, 0, 0.6)",
                                },
                            }
                            : {}),
                        ...legalMoves.reduce<Record<string, React.CSSProperties>>((acc, sq) => {
                            const isCaptureTarget = captureTargets.includes(sq);
                            const isHovered = hoveredLegalSquare === sq;
                            acc[sq] = isCaptureTarget
                                ? {
                                    boxShadow: "inset 0 0 0 4px rgba(34, 197, 94, 0.7)",
                                    borderRadius: "9999px",
                                }
                                : {
                                    backgroundImage: "radial-gradient(circle, rgba(0, 0, 0, 0.2) 28%, transparent 28%)",
                                    backgroundRepeat: "no-repeat",
                                    backgroundPosition: "center",
                                    backgroundSize: isHovered ? "36% 36%" : "28% 28%",
                                    transition: "background-size 120ms ease-out",
                                    borderRadius: "50%",
                                };
                            return acc;
                        }, {}),
                        ...drawing.getDrawingSquareStyles(),
                    }}
                />
                <div className="absolute -top-8 left-0 w-full pointer-events-none z-20">
                    <CapturedPieces fen={fen} orientation={orientation} side="top" />
                </div>
                <div className="absolute -bottom-8 left-0 w-full pointer-events-none z-20">
                    <CapturedPieces fen={fen} orientation={orientation} side="bottom" />
                </div>
                {/* Canvas overlay for ripples and visual effects */}
                <OverlayCanvas className="absolute inset-0 pointer-events-none z-10" />

                <NonLLMCommentaryOverlay
                    enabled={true}
                    boardSize={boardWidth}
                    orientation={orientation}
                    affordance={affordance || null}
                />

                {/* Correct move feedback - small icon at top-right of target square */}
                {showFeedback && moveResult === "correct" && feedbackSquare && (() => {
                    const position = getSquarePosition(feedbackSquare);
                    if (!position) return null;

                    return (
                        <div
                            className="absolute pointer-events-none z-20"
                            style={{
                                left: `${position.left}px`,
                                top: `${position.top}px`,
                            }}
                        >
                            <div className="animate-in fade-in zoom-in duration-200">
                                <Image src="/svg/correct.svg" alt="Correct" width={32} height={32} />
                            </div>
                        </div>
                    );
                })()}

                {/* Wrong move feedback - matches puzzle FeedbackOverlay behavior */}
                {moveResult === "incorrect" && feedbackSquare && (
                    <FeedbackOverlay
                        type="miss"
                        targetSquare={feedbackSquare}
                        orientation={orientation}
                        boardWidth={boardWidth}
                    />
                )}
            </div>
        </div>
    );
}

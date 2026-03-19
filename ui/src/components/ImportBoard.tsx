"use client";
import React, { useRef, useCallback, useState, useEffect, useMemo } from "react";
import { Chessboard } from "react-chessboard";
import { Square, Chess } from "chess.js";
import { useChessDrawing } from "../app/hooks/useChessDrawing";

// Canvas overlay for ripples and visual effects
import { OverlayCanvas } from "@/board/overlay/OverlayCanvas";
import { useBoardStore } from "@/board/core/useBoardStore";

export default function ImportBoard({
  fen,
  arrows,
  width = 512,
  orientation = "white",
  onMove,
  onMoveAttempt,
}: {
  fen: string;
  arrows: Array<[Square, Square, string]>;
  width?: number;
  orientation?: "white" | "black";
  onMove?: (move: { from: Square; to: Square; promotion?: string }) => void;
  onMoveAttempt?: (move: { from: Square; to: Square; promotion?: string }) => boolean;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const drawing = useChessDrawing(orientation);

  // Legal move highlighting (dots on available squares)
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const legalMovesStartTimeRef = useRef(0);

  // Temporary Chess instance for calculating legal moves from FEN
  const tempGame = useMemo(() => new Chess(), []);

  // Sync board size and orientation with the overlay store
  useEffect(() => {
    useBoardStore.getState().setBoardSize(width);
  }, [width]);

  // Clear any stale overlay data from previous pages (e.g., analyze page grid/arrows)
  useEffect(() => {
    useBoardStore.getState().clearOverlays();
  }, []);

  useEffect(() => {
    useBoardStore.getState().setOrientation(orientation);
  }, [orientation]);

  // Update legal move highlights in the store (for canvas overlay dots)
  useEffect(() => {
    if (legalMoves.length > 0) {
      legalMovesStartTimeRef.current = performance.now();
    }
    const highlights = legalMoves.map(sq => ({
      square: sq,
      type: "legal" as const,
      color: "rgba(0, 0, 0, 0.2)",
      entering: true,
      startTime: legalMovesStartTimeRef.current
    }));
    useBoardStore.getState().setHighlights(highlights);
  }, [legalMoves]);

  const handlePieceDrop = useCallback((sourceSquare: Square, targetSquare: Square): boolean => {
    // Trigger ripple on successful drop
    useBoardStore.getState().addRipple(targetSquare);

    if (onMoveAttempt) {
      const moveData = { from: sourceSquare, to: targetSquare };
      return onMoveAttempt(moveData);
    }

    // Default behavior: validate move using Chess.js
    const testGame = new Chess(fen);
    try {
      const move = testGame.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q', // Default promotion to queen
      });

      if (move) {
        onMove?.({ from: sourceSquare, to: targetSquare, promotion: move.promotion });
        return true;
      }
    } catch (e) {
      // Invalid move
    }
    return false;
  }, [fen, onMove, onMoveAttempt]);

  // Handler for piece drag begin - calculate legal moves for dots
  const handlePieceDragBegin = useCallback((piece: string, sourceSquare: Square) => {
    useBoardStore.getState().addRipple(sourceSquare);
    try {
      tempGame.load(fen);
      const moves = tempGame.moves({ square: sourceSquare, verbose: true });
      const legal = moves.map(m => m.to as Square);
      setLegalMoves(legal);
    } catch (e) {
      setLegalMoves([]);
    }
  }, [fen, tempGame]);

  // Handler for piece drag end - clear legal moves
  const handlePieceDragEnd = useCallback(() => {
    setLegalMoves([]);
  }, []);

  return (
    <div
      ref={boardRef}
      className="relative"
      style={{ width, height: width }}
    >
      <div
        onMouseDown={drawing.handleMouseDown}
        onMouseUp={drawing.handleMouseUp}
        onContextMenu={drawing.handleContextMenu}
        className="relative"
      >
        <Chessboard
          position={fen}
          boardWidth={width}
          boardOrientation={orientation}
          arePiecesDraggable={true}
          onPieceDrop={handlePieceDrop}
          onPieceDragBegin={handlePieceDragBegin}
          onPieceDragEnd={handlePieceDragEnd}
          customArrows={drawing.getCustomArrows(arrows)}
          customSquareStyles={drawing.getDrawingSquareStyles()}
        />
        {/* Canvas overlay for ripples and visual effects */}
        <OverlayCanvas className="absolute inset-0 pointer-events-none z-10" />
      </div>
    </div>
  );
}


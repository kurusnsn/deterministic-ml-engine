/**
 * Feature composer for analysis mode
 *
 * This is the main analyze board component that assembles:
 * - Board engine (Chess.js)
 * - Move tree (AnalysisController)
 * - Overlay management
 * - Drawing system
 * - Sound effects
 * - Responsive sizing
 *
 * And renders:
 * - BoardShell with BoardSurface
 * - Move history panel
 * - PV lines panel
 * - Opening book
 * - LLM chat panel
 *
 * NOTE: This is a skeleton showing the modular architecture.
 * Full implementation will migrate logic from ChessBoard.tsx.
 */

"use client";

import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { Chess, Square } from "chess.js";

// Board modules
import { BoardShell } from "@/board/react/BoardShell";
import { BoardSurface } from "@/board/react/BoardSurface";
import { useBoardSizing } from "@/board/hooks/useBoardSizing";
import { useBoardSounds, playMoveSound } from "@/board/hooks/useBoardSounds";
import { useBoardDrawing } from "@/board/hooks/useBoardDrawing";
import { useBoardStore, Highlight, Arrow } from "@/board/core/useBoardStore";
import { AnalysisController } from "@/board/core/move-tree";

// UI Components (will be imported from existing locations)
// import ChessMoveTree from "@/components/ChessMoveTree";
// import OpeningBook from "@/components/OpeningBook";
// import PvLinesPanel from "@/components/PvLinesPanel";
// import LLMChatPanel from "@/components/LLMChatPanel";

export interface AnalyzeBoardProps {
  initialPgn?: string;
  initialFen?: string;
  studyId?: string;
  variant?: "default" | "analyze";
}

/**
 * Full-featured analyze board component
 *
 * @example
 * ```tsx
 * <AnalyzeBoard
 *   initialPgn="1. e4 e5 2. Nf3 Nc6"
 *   variant="analyze"
 * />
 * ```
 */
export const AnalyzeBoard: React.FC<AnalyzeBoardProps> = ({
  initialPgn,
  initialFen,
  studyId,
  variant = "analyze",
}) => {
  // ===== SIZING =====
  const { boardSize, isMobile, mounted, resizeHandleProps } = useBoardSizing();

  // ===== GAME ENGINE =====
  const gameRef = useRef(new Chess());
  const game = gameRef.current;
  const [fen, setFen] = useState(game.fen());
  const [orientation, setOrientation] = useState<"white" | "black">("white");

  // ===== MOVE TREE =====
  const [controller] = useState(() => new AnalysisController(game.fen()));
  const [currentPath, setCurrentPath] = useState("");

  // ===== EVALUATION =====
  const [evalScore, setEvalScore] = useState("0.00");
  const [moveEvalMap, setMoveEvalMap] = useState<Record<string, Record<string, number>>>({});
  const [pvLines, setPvLines] = useState<Array<{ moves: string[]; eval: number }>>([]);

  // ===== OVERLAY SETTINGS =====
  const [showGridOverlay, setShowGridOverlay] = useState(true);
  const [maxOverlayBoxes, setMaxOverlayBoxes] = useState(5);
  const [showThreatLines, setShowThreatLines] = useState(false);
  const [threatThreshold, setThreatThreshold] = useState(100);
  const [showArrows, setShowArrows] = useState(true);

  // ===== SOUNDS =====
  const sounds = useBoardSounds();

  // ===== DRAWING =====
  const drawing = useBoardDrawing(orientation);

  // ===== INTERACTION STATE =====
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const [draggingFrom, setDraggingFrom] = useState<Square | null>(null);

  // ===== STORE SELECTORS =====
  const setLastMove = useBoardStore((s) => s.setLastMove);
  const lastMove = useBoardStore((s) => s.lastMove);
  const selectedSquare = useBoardStore((s) => s.selectedSquare);
  const setSelectedSquare = useBoardStore((s) => s.setSelectedSquare);

  // ===== CUSTOM SQUARE STYLES =====
  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    const highlightColor = "rgba(255, 205, 50, 0.5)";

    // Last move highlights
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: highlightColor };
      styles[lastMove.to] = { backgroundColor: highlightColor };
    }

    // Selected square
    if (selectedSquare) {
      styles[selectedSquare] = { backgroundColor: highlightColor };
    }

    // Dragging from
    if (draggingFrom) {
      styles[draggingFrom] = { backgroundColor: highlightColor };
    }

    return styles;
  }, [lastMove, selectedSquare, draggingFrom]);

  // ===== UI OVERLAY DATA =====
  const uiOverlays = useMemo(() => {
    const highlights: Highlight[] = [];
    const userArrows: Arrow[] = [];

    // Legal move dots
    legalMoves.forEach((sq) => {
      highlights.push({
        square: sq,
        type: "legal",
        color: variant === "analyze" ? "rgba(0, 0, 0, 0.2)" : undefined,
        entering: true,
        startTime: performance.now(),
      });
    });

    // User-drawn circles
    const DRAWING_COLORS: Record<string, string> = {
      orange: "rgba(249, 115, 22, 0.9)",
      green: "rgba(34, 197, 94, 0.9)",
      red: "rgba(239, 68, 68, 0.9)",
      blue: "rgba(59, 130, 246, 0.9)",
    };

    drawing.drawnCircles.forEach((circle) => {
      highlights.push({
        square: circle.square,
        type: "userCircle",
        color: DRAWING_COLORS[circle.color] || circle.color,
      });
    });

    // User-drawn arrows
    drawing.drawnArrows.forEach((arrow) => {
      userArrows.push({
        from: arrow.from,
        to: arrow.to,
        color: DRAWING_COLORS[arrow.color] || arrow.color,
      });
    });

    return { highlights, userArrows };
  }, [legalMoves, drawing.drawnCircles, drawing.drawnArrows, variant]);

  // ===== MOVE HANDLER =====
  const handleMove = useCallback(
    (sourceSquare: string, targetSquare: string, piece?: string) => {
      const move = game.move({
        from: sourceSquare as Square,
        to: targetSquare as Square,
        promotion: piece?.toLowerCase().charAt(1) as "q" | "r" | "b" | "n" | undefined,
      });

      if (!move) {
        sounds.playIllegal();
        return false;
      }

      // Play sound based on move type
      playMoveSound(sounds, move, game.isCheck());

      // Update state
      setFen(game.fen());
      setLastMove({ from: sourceSquare as Square, to: targetSquare as Square });

      // Update move tree
      controller.playMove(move.san, game.fen(), move.lan);

      // Clear legal moves
      setLegalMoves([]);
      setDraggingFrom(null);

      return true;
    },
    [game, sounds, controller, setLastMove]
  );

  // ===== DRAG HANDLERS =====
  const handleDragBegin = useCallback(
    (piece: string, sourceSquare: Square) => {
      useBoardStore.getState().addRipple(sourceSquare);

      const moves = game.moves({ square: sourceSquare, verbose: true });
      const legal = moves
        .map((m) => m.to)
        .filter((sq): sq is Square => /^[a-h][1-8]$/.test(sq));

      setDraggingFrom(sourceSquare);
      setLegalMoves(legal);
    },
    [game]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingFrom(null);
    setLegalMoves([]);
  }, []);

  // ===== CLICK HANDLER =====
  const handleSquareClick = useCallback(
    (square: Square) => {
      useBoardStore.getState().addRipple(square);

      if (selectedSquare) {
        // Try to make move from selected to clicked
        const success = handleMove(selectedSquare, square);
        if (success) {
          setSelectedSquare(null);
          return;
        }
      }

      // Select the square if it has a piece
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
        const moves = game.moves({ square, verbose: true });
        const legal = moves
          .map((m) => m.to)
          .filter((sq): sq is Square => /^[a-h][1-8]$/.test(sq));
        setLegalMoves(legal);
      } else {
        setSelectedSquare(null);
        setLegalMoves([]);
      }
    },
    [game, selectedSquare, setSelectedSquare, handleMove]
  );

  // ===== FLIP BOARD =====
  const flipBoard = useCallback(() => {
    setOrientation((o) => (o === "white" ? "black" : "white"));
  }, []);

  // ===== RENDER =====
  if (!mounted) {
    // SSR placeholder
    return <div style={{ width: 500, height: 500 }} />;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Board area */}
      <div className="flex flex-col items-center">
        <BoardShell
          fen={fen}
          orientation={orientation}
          boardSize={boardSize}
          evalScore={evalScore}
          className="mb-8"
        >
          <BoardSurface
            position={fen}
            boardSize={boardSize}
            orientation={orientation}
            customSquareStyles={customSquareStyles}
            customDropSquareStyle={{ boxShadow: "inset 0 0 0 1px white" }}
            onPieceDrop={(source, target) => handleMove(source, target)}
            onPieceDragBegin={handleDragBegin}
            onPieceDragEnd={handleDragEnd}
            onSquareClick={handleSquareClick}
            onDrawingMouseDown={drawing.handleMouseDown}
            onDrawingMouseUp={drawing.handleMouseUp}
            onContextMenu={drawing.handleContextMenu}
            showResizeHandle={!isMobile}
            resizeHandleProps={resizeHandleProps}
          />
        </BoardShell>

        {/* Navigation controls (placeholder) */}
        <div className="flex gap-2">
          <button onClick={flipBoard} className="px-3 py-1 bg-gray-200 rounded">
            Flip
          </button>
          {/* Add more navigation buttons here */}
        </div>
      </div>

      {/* Side panels area (placeholder) */}
      <div
        className="flex flex-col gap-4"
        style={{
          width: isMobile ? "100%" : boardSize / 1.5,
          minWidth: 320,
        }}
      >
        {/* Move history, PV lines, opening book, LLM panel go here */}
        <div className="p-4 bg-gray-100 rounded">
          <p className="text-sm text-gray-600">
            Side panels (move history, PV lines, etc.) will be wired here.
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Current path: {currentPath || "(root)"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AnalyzeBoard;

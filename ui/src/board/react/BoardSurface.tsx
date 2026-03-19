/**
 * Smart board layer with event wiring
 *
 * Responsibilities:
 * - Wraps UniversalBoard with event capture div
 * - Captures drawing events (right-click, left-click clear)
 * - Syncs hover/drag state to store
 * - Handles sizing/retina sync
 */

"use client";

import React, { useCallback, CSSProperties } from "react";
import { Square } from "chess.js";
import { UniversalBoard } from "./UniversalBoard";
import { useBoardStore } from "@/board/core/useBoardStore";

export interface BoardSurfaceProps {
  // Position
  position: string; // FEN
  boardSize: number;
  orientation: "white" | "black";

  // Styling
  customSquareStyles?: Record<string, CSSProperties>;
  customDropSquareStyle?: CSSProperties;
  showOverlay?: boolean;

  // Board interaction handlers
  onPieceDrop?: (sourceSquare: string, targetSquare: string) => boolean;
  onPieceDragBegin?: (piece: string, sourceSquare: Square) => void;
  onPieceDragEnd?: () => void;
  onSquareClick?: (square: Square) => void;
  onPromotionPieceSelect?: (sourceSquare: Square, targetSquare: Square) => string;

  // Drawing event handlers (from useBoardDrawing)
  onDrawingMouseDown?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDrawingMouseUp?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;

  // Optional resize handle
  showResizeHandle?: boolean;
  resizeHandleProps?: {
    onMouseDown: (e: React.MouseEvent) => void;
    className: string;
  };

  // Additional class name for outer wrapper
  className?: string;
}

/**
 * Smart board surface that wires UniversalBoard to state and events
 *
 * This component:
 * 1. Renders UniversalBoard with overlay
 * 2. Wraps it in a div that captures drawing events (since canvas has pointerEvents: none)
 * 3. Syncs hover state to the board store
 * 4. Optionally renders a resize handle
 *
 * @example
 * ```tsx
 * const drawing = useBoardDrawing(orientation);
 *
 * <BoardSurface
 *   position={fen}
 *   boardSize={boardSize}
 *   orientation={orientation}
 *   onPieceDrop={handleMove}
 *   onDrawingMouseDown={drawing.handleMouseDown}
 *   onDrawingMouseUp={drawing.handleMouseUp}
 *   onContextMenu={drawing.handleContextMenu}
 *   showResizeHandle={true}
 *   resizeHandleProps={resizeHandleProps}
 * />
 * ```
 */
export const BoardSurface: React.FC<BoardSurfaceProps> = ({
  position,
  boardSize,
  orientation,
  customSquareStyles,
  customDropSquareStyle,
  showOverlay = true,
  onPieceDrop,
  onPieceDragBegin,
  onPieceDragEnd,
  onSquareClick,
  onPromotionPieceSelect,
  onDrawingMouseDown,
  onDrawingMouseUp,
  onContextMenu,
  showResizeHandle = false,
  resizeHandleProps,
  className,
}) => {
  // Store actions for hover state
  const setHoveredSquare = useBoardStore((state) => state.setHoveredSquare);

  // Wrap hover handlers to sync with store
  const handleMouseOverSquare = useCallback(
    (square: Square) => {
      setHoveredSquare(square);
    },
    [setHoveredSquare]
  );

  const handleMouseOutSquare = useCallback(() => {
    setHoveredSquare(null);
  }, [setHoveredSquare]);

  // Wrap drag end to clear hover
  const handlePieceDragEnd = useCallback(() => {
    setHoveredSquare(null);
    onPieceDragEnd?.();
  }, [setHoveredSquare, onPieceDragEnd]);

  return (
    <div
      className={`relative ${className || ""}`}
      style={{ width: boardSize, height: boardSize }}
      onMouseDown={onDrawingMouseDown}
      onMouseUp={onDrawingMouseUp}
      onContextMenu={onContextMenu}
    >
      <UniversalBoard
        position={position}
        boardWidth={boardSize}
        boardOrientation={orientation}
        onPieceDrop={onPieceDrop}
        onPieceDragBegin={onPieceDragBegin}
        onPieceDragEnd={handlePieceDragEnd}
        onSquareClick={onSquareClick}
        onMouseOverSquare={handleMouseOverSquare}
        onMouseOutSquare={handleMouseOutSquare}
        onPromotionPieceSelect={onPromotionPieceSelect}
        customSquareStyles={customSquareStyles}
        customDropSquareStyle={customDropSquareStyle}
        showOverlay={showOverlay}
      />

      {/* Optional resize handle */}
      {showResizeHandle && resizeHandleProps && (
        <div {...resizeHandleProps} />
      )}
    </div>
  );
};

export default BoardSurface;

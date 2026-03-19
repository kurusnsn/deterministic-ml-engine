/**
 * Layout component for board with peripherals
 *
 * Renders:
 * - Evaluation bar (left side)
 * - Board content slot (center)
 * - Captured pieces (top and bottom of board)
 *
 * No feature logic, pure layout.
 */

"use client";

import React from "react";
import EvaluationBar from "@/components/EvaluationBar";
import { CapturedPieces } from "@/components/CapturedPieces";

export interface BoardShellProps {
  // Position state
  fen: string;
  orientation: "white" | "black";
  boardSize: number;

  // Evaluation
  evalScore: string;

  // Board content slot (BoardSurface or any board component)
  children: React.ReactNode;

  // Options
  showEvalBar?: boolean;
  showCapturedPieces?: boolean;

  // Additional class name for outer wrapper
  className?: string;
}

/**
 * Layout shell for the chess board with evaluation bar and captured pieces
 *
 * This is a pure layout component with no feature logic.
 * Pass the board (BoardSurface or UniversalBoard) as children.
 *
 * @example
 * ```tsx
 * <BoardShell
 *   fen={fen}
 *   orientation={orientation}
 *   boardSize={boardSize}
 *   evalScore={evalScore}
 * >
 *   <BoardSurface
 *     position={fen}
 *     boardSize={boardSize}
 *     orientation={orientation}
 *     onPieceDrop={handleMove}
 *     ...
 *   />
 * </BoardShell>
 * ```
 */
export const BoardShell: React.FC<BoardShellProps> = ({
  fen,
  orientation,
  boardSize,
  evalScore,
  children,
  showEvalBar = true,
  showCapturedPieces = true,
  className,
}) => {
  return (
    <div className={`flex items-center gap-0 ${className || ""}`}>
      {/* Evaluation bar (left side) */}
      {showEvalBar && (
        <div className="w-8" style={{ height: boardSize }}>
          <EvaluationBar evalScore={evalScore} orientation={orientation} />
        </div>
      )}

      {/* Board container */}
      <div
        className="relative bg-white"
        style={{
          width: boardSize,
          height: boardSize,
          maxWidth: "90vw",
          maxHeight: "90vw",
        }}
      >
        {/* Top captured pieces */}
        {showCapturedPieces && (
          <div className="absolute -top-8 left-0 w-full">
            <CapturedPieces fen={fen} orientation={orientation} side="top" />
          </div>
        )}

        {/* Board content slot */}
        {children}

        {/* Bottom captured pieces */}
        {showCapturedPieces && (
          <div className="absolute -bottom-8 left-0 w-full">
            <CapturedPieces fen={fen} orientation={orientation} side="bottom" />
          </div>
        )}
      </div>
    </div>
  );
};

export default BoardShell;

"use client";
import React from "react";
import { Square } from "chess.js";

type MoveEvalMap = Record<string, Record<string, number>>;

interface Props {
  moveEvalMap: MoveEvalMap;
  orientation: "white" | "black";
  draggingFrom: Square | null;
  selectedSquare?: Square | null;
  legalTargets: Square[];
  maxBoxes?: number; // Maximum number of eval boxes to show (priority to best moves)
}

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"];
const squares: Square[] = ranks
  .slice()
  .reverse()
  .flatMap((r) => files.map((f) => (f + r) as Square));

const OverlayGrid: React.FC<Props> = ({
  moveEvalMap,
  orientation,
  draggingFrom,
  selectedSquare,
  legalTargets,
  maxBoxes = Infinity, // Default to showing all boxes
}) => {
  const getBestTargetForSquare = (
    from: string
  ): { to: string; score: number } | null => {
    const targets = moveEvalMap[from];
    if (!targets) return null;
    const best = Object.entries(targets).reduce((best, [to, val]) => {
      if (best === null || val > best[1]) return [to, val];
      return best;
    }, null as [string, number] | null);
    return best ? { to: best[0], score: best[1] } : null;
  };

  const getScoreInfo = (
    from: string,
    to: string
  ): { score: string; color: string } | null => {
    const value = moveEvalMap[from]?.[to];
    if (value === undefined) return null;

    const allScores = Object.values(moveEvalMap).flatMap((targets) =>
      Object.values(targets)
    );
    const bestScore = Math.max(...allScores);
    const diff = bestScore - value;

    const scoreLabel =
      value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;

    let color;
    if (value === bestScore) {
      color = "bg-blue-700"; // absolute best
    } else if (diff < 2) {
      color = "bg-green-500"; // very close (≤ 0.2 pawns worse)
    } else if (diff < 5) {
      color = "bg-yellow-500"; // moderate (≤ 0.5 pawns worse)
    } else {
      color = "bg-red-600"; // clearly worse
    }

    return { score: scoreLabel, color };
  };

  const squareOrder =
    orientation === "white" ? squares : [...squares].reverse();

  // Calculate which squares should show boxes based on maxBoxes limit
  const getTopMoveSquares = (): Set<string> => {
    if (maxBoxes === Infinity || (draggingFrom || selectedSquare)) {
      // When dragging/selecting, show all legal targets
      return new Set();
    }

    // Collect all source squares with their best moves
    const sourceMoves: Array<{ from: string; to: string; score: number }> = [];
    for (const from in moveEvalMap) {
      const best = getBestTargetForSquare(from);
      if (best) {
        sourceMoves.push({ from, to: best.to, score: best.score });
      }
    }

    // Sort by score (highest first) and take top N
    sourceMoves.sort((a, b) => b.score - a.score);
    const topMoves = sourceMoves.slice(0, maxBoxes);

    // Return set of source squares to show
    return new Set(topMoves.map(m => m.from));
  };

  const topMoveSquares = getTopMoveSquares();

  return (
    <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
      {squareOrder.map((square) => {
        let info: { score: string; color: string } | null = null;

        if (
          (draggingFrom && legalTargets.includes(square)) ||
          (selectedSquare && legalTargets.includes(square))
        ) {
          const fromSquare = draggingFrom || selectedSquare;
          if (fromSquare) {
            info = getScoreInfo(fromSquare, square);
          }
        } else if (!draggingFrom && !selectedSquare) {
          // Show best move for each piece when nothing is selected/dragged
          // Only show if within maxBoxes limit
          for (const from in moveEvalMap) {
            const best = getBestTargetForSquare(from);
            if (best && from === square && (topMoveSquares.size === 0 || topMoveSquares.has(from))) {
              info = getScoreInfo(from, best.to);
              break;
            }
          }
        }

        return (
          <div key={square} className="relative w-full h-full">
            {info && (
              <div
                className={`absolute top-0 right-0 m-0.5 text-[10px] text-white font-bold px-1 rounded ${info.color}`}
              >
                {info.score}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default OverlayGrid;

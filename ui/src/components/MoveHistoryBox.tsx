"use client";

import React from "react";

interface MoveHistoryBoxProps {
  moves: string[];
  currentMoveIndex: number;
  onMoveClick?: (index: number) => void;
}

export default function MoveHistoryBox({
  moves,
  currentMoveIndex,
  onMoveClick
}: MoveHistoryBoxProps) {
  // Group moves into pairs (white, black)
  const movePairs: Array<{ num: number; white: string; black?: string; whiteIndex: number; blackIndex?: number }> = [];

  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      num: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
      whiteIndex: i,
      blackIndex: moves[i + 1] ? i + 1 : undefined
    });
  }

  return (
    <div className="w-full h-full bg-gray-50 dark:bg-zinc-900 rounded-lg p-3 border border-gray-200 dark:border-zinc-800 shadow-sm flex flex-col">
      <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-zinc-800 pb-2 shrink-0">Move History</h3>
      {movePairs.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">No moves yet</p>
      ) : (
        <div className="space-y-0.5 overflow-y-auto flex-1">
          {movePairs.map((pair) => (
            <div key={pair.num} className="flex items-center text-sm font-mono">
              {/* Move number */}
              <span className="text-gray-400 dark:text-gray-500 w-8 shrink-0">{pair.num}.</span>

              {/* White move */}
              <button
                type="button"
                onClick={() => onMoveClick?.(pair.whiteIndex)}
                className={`
                  px-2 py-0.5 rounded cursor-pointer flex-1 max-w-[80px] text-left
                  transition-colors duration-150
                  ${currentMoveIndex === pair.whiteIndex
                    ? "bg-[#739552] text-white font-medium"
                    : "text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }
                `}
                aria-current={currentMoveIndex === pair.whiteIndex ? "true" : undefined}
              >
                {pair.white}
              </button>

              {/* Black move */}
              {pair.black && (
                <button
                  type="button"
                  onClick={() => pair.blackIndex !== undefined && onMoveClick?.(pair.blackIndex)}
                  className={`
                    px-2 py-0.5 rounded cursor-pointer flex-1 max-w-[80px] text-left
                    transition-colors duration-150
                    ${currentMoveIndex === pair.blackIndex
                      ? "bg-[#739552] text-white font-medium"
                      : "text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }
                  `}
                  aria-current={currentMoveIndex === pair.blackIndex ? "true" : undefined}
                >
                  {pair.black}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

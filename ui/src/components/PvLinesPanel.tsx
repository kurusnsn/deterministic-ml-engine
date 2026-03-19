"use client";
import React, { useState } from "react";
import { PieceSymbol, Chess, Color } from "chess.js";
import Image from "next/image";
import { fenAfter } from "@/utils/fenAfter";
import MiniBoardTooltip from "./MiniBoardTooltip";
import { ChevronDown, ChevronRight } from "lucide-react";

export type PvLine = {
  score: number;      // engine score in pawns (e.g. 0.34 for +0.34)
  moves: string[];    // UCI moves like ["e2e4", "e7e5", "g1f3"]
};

interface Props {
  pvLines: PvLine[];
  startingFen: string;
  orientation?: "white" | "black";
  onClickMove?: (pv: PvLine, moveIndex: number) => void;
}



const PvLinesPanel: React.FC<Props> = ({
  pvLines,
  startingFen,
  orientation = "white",
  onClickMove,
}) => {
  // Tooltip state
  const [showTip, setShowTip] = useState(false);
  const [tipFen, setTipFen] = useState(startingFen);

  // Track which lines are expanded
  const [expandedLines, setExpandedLines] = useState<Set<number>>(new Set());

  const toggleLine = (idx: number) => {
    setExpandedLines(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-1 font-mono text-xs relative">
      {pvLines.map((line, idx) => {
        // ... existing UCI to SAN conversion ...
        const temp = new Chess(startingFen);
        const sanMoves: { san: string; piece: PieceSymbol; color: Color; ply: number }[] = [];

        for (const uci of line.moves) {
          if (!uci || uci.length < 4) continue;
          try {
            const move = temp.move({
              from: uci.slice(0, 2),
              to: uci.slice(2, 4),
              promotion: uci.length > 4 ? uci[4] : undefined,
            });
            if (!move) break;
            sanMoves.push({
              san: move.san,
              piece: move.piece,
              color: move.color,
              ply: (move as any).ply
            });
          } catch {
            break;
          }
        }

        const isExpanded = expandedLines.has(idx);

        return (
          <div
            key={idx}
            className="group relative bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded px-2 py-1.5 transition-colors duration-150"
          >
            {/* Single line layout with score and moves */}
            <div className="flex items-start gap-2">
              {/* Score - compact, left-aligned, with top padding for baseline alignment */}
              <div className="font-semibold text-black shrink-0 pt-0.5">
                {line.score > 0 ? `+${line.score.toFixed(2)}` : line.score.toFixed(2)}
              </div>

              {/* Moves - all on one line, wrapping handled by CSS */}
              <div className={`flex-1 min-w-0 leading-tight ${!isExpanded ? 'line-clamp-1' : ''}`}>
                {sanMoves.map((m, moveIdx) => {
                  const fullMove = Math.ceil(m.ply / 2);
                  const showMoveNum = m.ply % 2 === 1;

                  return (
                    <span key={moveIdx} className="inline-block">
                      {showMoveNum && (
                        <span className="text-gray-500 mr-0.5">{fullMove}.</span>
                      )}
                      <button
                        onClick={() => {
                          onClickMove?.(line, moveIdx);
                          setShowTip(false);
                        }}
                        onMouseEnter={() => {
                          const fen = fenAfter(startingFen, line.moves, moveIdx);
                          setTipFen(fen);
                          setShowTip(true);
                        }}
                        onMouseLeave={() => setShowTip(false)}
                        className="inline-flex items-center px-0.5 rounded hover:bg-slate-300 active:bg-slate-400 transition-colors"
                        title={m.san}
                      >
                        <span className="flex items-center justify-center w-4 h-4 mr-0.5 select-none relative">
                          <Image
                            src={`/svg/Chess_${m.piece}${m.color === 'w' ? 'l' : 'd'}t45.svg`}
                            alt={m.piece}
                            fill
                            className="object-contain"
                            unoptimized
                          />
                        </span>
                        <span className="text-gray-800">{m.san}</span>
                      </button>
                      <span className="mr-1 inline-block"> </span>
                    </span>
                  );
                })}
              </div>

              {/* Expand/Collapse button for long lines */}
              {sanMoves.length > 4 && (
                <button
                  onClick={() => toggleLine(idx)}
                  className="flex-shrink-0 p-0.5 rounded hover:bg-slate-200 transition-colors mt-0.5"
                  aria-label={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-gray-600" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-gray-600" />
                  )}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Tooltip */}
      <MiniBoardTooltip
        show={showTip}
        fen={tipFen}
        orientation={orientation}
      />
    </div>
  );
};

export default PvLinesPanel;

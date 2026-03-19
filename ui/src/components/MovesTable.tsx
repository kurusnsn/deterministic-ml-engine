"use client";
import React, { useState } from "react";
import { MoveStat } from "@/app/hooks/useOpeningGraph";
import { getPerformanceDetails } from "@/lib/openingMetrics";
import { TooltipPortal } from "./TooltipPortal";

export default function MovesTable({
  moves,
  onMove,
  perspective = 'white',
  highlightArrow,
  highlightedMove,
}: {
  moves: MoveStat[];
  onMove: (nextFen: string) => void;
  perspective?: 'white' | 'black';
  highlightArrow?: (move: MoveStat | null) => void;
  highlightedMove?: MoveStat | null;
}) {
  const [tooltip, setTooltip] = useState<{
    content: React.ReactNode;
    top: number;
    left: number;
  } | null>(null);

  // Calculate percentage like openingtree
  const percentage = (count: number, total: number) => {
    return (count / total) * 100;
  };

  // Get progress label like openingtree (only show when >= 10%)
  const getProgressLabel = (count: number, total: number, showAsPercentage = false) => {
    const pct = percentage(count, total);
    if (pct < 10) return '';
    return showAsPercentage ? `${pct.toFixed(1)}%` : count.toString();
  };

  // Handle arrow highlighting like openingtree
  const highlightArrowFn = (move: MoveStat) => {
    return () => {
      if (highlightArrow) {
        highlightArrow(move);
      }
    };
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLSpanElement>, move: MoveStat) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const details = getPerformanceDetails(
      move.avgOpponentElo ? move.avgOpponentElo * move.count : undefined,
      undefined,
      move.wins,
      move.draws,
      move.losses,
      perspective
    );
    setTooltip({
      content: (
        <div className="space-y-1">
          <div className="flex justify-between"><span className="font-medium">Performance</span><span>{details.performanceRating ?? '-'}</span></div>
          <div className="flex justify-between"><span>Results</span><span>{details.results}</span></div>
          <div className="flex justify-between"><span>Avg opponent</span><span>{move.avgOpponentElo ?? '-'}</span></div>
          <div className="flex justify-between"><span>Score</span><span>{details.scoreLabel}</span></div>
          <div className="flex justify-between"><span>Last played</span><span>{move.lastPlayed ? new Date(move.lastPlayed).toLocaleDateString() : '-'}</span></div>
        </div>
      ),
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX + rect.width + 10,
    });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-gray-300">
            <th className="px-3 py-2 font-semibold text-gray-700 text-sm">Move</th>
            <th className="px-3 py-2 font-semibold text-gray-700 text-sm">Games</th>
            <th className="px-3 py-2 font-semibold text-gray-700 text-sm">Results</th>
          </tr>
        </thead>
        <tbody>
          {moves.map((m, idx) => {
            // Use m.count like openingtree's move.details.count (total games reaching position after this move)
            const total = m.count;
            const isHighlighted = highlightedMove && highlightedMove.orig === m.orig && highlightedMove.dest === m.dest;

            return (
              <tr
                key={idx}
                className={`cursor-pointer hover:bg-gray-50 border-b border-gray-100 ${isHighlighted ? 'bg-black text-white' : ''}`}
                onClick={() => onMove(m.nextFen)}
                onMouseOver={highlightArrowFn(m)}
                onMouseOut={() => highlightArrow?.(null)}
              >
                <td className="px-3 py-2 font-mono align-middle text-sm font-medium">{m.san}</td>
                <td className="px-3 py-2 align-middle">
                  <div className="relative inline-flex items-center gap-1 group">
                    <span className="text-sm font-medium">{m.count}</span>
                    <span
                      className="text-gray-400 text-xs"
                      onMouseEnter={(e) => handleMouseEnter(e, m)}
                      onMouseLeave={handleMouseLeave}
                    >

                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 w-full">
                  {/* OpeningTree-style progress bar: white wins (white) -> draws (gray) -> black wins (black) */}
                  <div className="progress" style={{ height: '16px', border: '1px solid #dee2e6' }}>
                    {/* White wins segment (left, white color) */}
                    <div
                      className="progress-bar whiteMove"
                      style={{ width: `${percentage(m.wins, total)}%` }}
                      title={`White wins: ${m.wins}`}
                    >
                      {getProgressLabel(m.wins, total)}
                    </div>
                    {/* Draws segment (middle, gray color) */}
                    <div
                      className="progress-bar grayMove"
                      style={{ width: `${percentage(m.draws, total)}%` }}
                      title={`Draws: ${m.draws}`}
                    >
                      {getProgressLabel(m.draws, total)}
                    </div>
                    {/* Black wins segment (right, black color) */}
                    <div
                      className="progress-bar blackMove"
                      style={{ width: `${percentage(m.losses, total)}%` }}
                      title={`Black wins: ${m.losses}`}
                    >
                      {getProgressLabel(m.losses, total)}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {tooltip && (
        <TooltipPortal>
          <div
            className="absolute bg-white text-gray-800 border rounded shadow p-2 w-40 text-xs"
            style={{ top: tooltip.top, left: tooltip.left }}
          >
            {tooltip.content}
          </div>
        </TooltipPortal>
      )}
    </div>
  );
}

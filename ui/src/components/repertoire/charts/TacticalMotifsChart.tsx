"use client";

import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { TacticalPatternChartEntry, MoveAnalysis } from "@/types/repertoire";
import ChartWrapper from "./ChartWrapper";

interface TacticalMotifsChartProps {
  data?: TacticalPatternChartEntry[];
  moves?: MoveAnalysis[];
}

const MOTIF_COLORS: Record<string, string> = {
  fork: "#8b5cf6",
  pin: "#ec4899",
  skewer: "#14b8a6",
  xray: "#f97316",
  hanging_piece: "#ef4444",
  trapped_piece: "#eab308",
  overloaded_piece: "#06b6d4",
  discovered_attack: "#22c55e",
  default: "#6366f1",
};

export default function TacticalMotifsChart({ data, moves }: TacticalMotifsChartProps) {
  // If data is provided, use it; otherwise compute from moves
  const computeFromMoves = (color: "white" | "black" | "all"): TacticalPatternChartEntry[] => {
    if (!moves || moves.length === 0) return [];

    const filtered = color === "all"
      ? moves
      : moves.filter((m) => {
          const isWhitePly = m.ply % 2 === 1;
          return color === "white" ? isWhitePly : !isWhitePly;
        });

    const motifCounts: Record<string, number> = {};
    filtered.forEach((m) => {
      const h = m.heuristics || {};
      Object.keys(h).forEach((k) => {
        if (typeof (h as any)[k] === "boolean" && (h as any)[k]) {
          motifCounts[k] = (motifCounts[k] || 0) + 1;
        }
      });
    });

    return Object.entries(motifCounts)
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  };

  const getData = (color: "white" | "black" | "all") => {
    if (data && data.length > 0 && color === "all") {
      return [...data].sort((a, b) => b.count - a.count).slice(0, 8);
    }
    return computeFromMoves(color);
  };

  const getInsight = (color: "white" | "black" | "all") => {
    const chartData = getData(color);
    if (chartData.length === 0) return "No tactical patterns detected";
    const top = chartData[0];
    const total = chartData.reduce((sum, d) => sum + d.count, 0);
    return `Most common: ${top.pattern.replace(/_/g, " ")} (${top.count}) | ${total} patterns total`;
  };

  const formatPattern = (pattern: string) => {
    return pattern
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <ChartWrapper
      title="Tactical Motifs"
      insight="Frequency of tactical patterns in your analyzed games"
    >
      {(color) => {
        const chartData = getData(color);
        const insight = getInsight(color);

        return (
          <div className="h-full flex flex-col">
            <p className="text-xs text-muted-foreground mb-2 truncate">{insight}</p>
            <div className="flex-1 min-h-0">
              {chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  No tactical patterns recorded
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="pattern"
                      width={120}
                      tick={{ fontSize: 10 }}
                      tickFormatter={formatPattern}
                    />
                    <Tooltip
                      formatter={(value) => [value, "Count"]}
                      labelFormatter={formatPattern}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={MOTIF_COLORS[entry.pattern] || MOTIF_COLORS.default}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        );
      }}
    </ChartWrapper>
  );
}

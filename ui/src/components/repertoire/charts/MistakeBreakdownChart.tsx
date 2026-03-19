"use client";

import { useMemo } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { MoveAnalysis } from "@/types/repertoire";
import ChartWrapper from "./ChartWrapper";

interface MistakeBreakdownChartProps {
  moves: MoveAnalysis[];
}

const COLORS = {
  blunder: "#ef4444",
  mistake: "#f59e0b",
  inaccuracy: "#a3a3a3",
  good: "#22c55e",
};

export default function MistakeBreakdownChart({ moves }: MistakeBreakdownChartProps) {
  const getData = (color: "white" | "black" | "all") => {
    const filtered = color === "all"
      ? moves
      : moves.filter((m) => {
        const plyIsWhite = m.ply % 2 === 1;
        return color === "white" ? plyIsWhite : !plyIsWhite;
      });

    const counts: Record<string, number> = { inaccuracy: 0, mistake: 0, blunder: 0, good: 0 };
    filtered.forEach((m) => {
      if (m.mistake_type === "inaccuracy") counts.inaccuracy += 1;
      else if (m.mistake_type === "mistake") counts.mistake += 1;
      else if (m.mistake_type === "blunder") counts.blunder += 1;
      else counts.good += 1;
    });

    return [
      { label: "Blunders", value: counts.blunder, color: COLORS.blunder },
      { label: "Mistakes", value: counts.mistake, color: COLORS.mistake },
      { label: "Inaccuracies", value: counts.inaccuracy, color: COLORS.inaccuracy },
      { label: "Good Moves", value: counts.good, color: COLORS.good },
    ].filter((d) => d.value > 0);
  };

  const getInsight = (color: "white" | "black" | "all") => {
    const data = getData(color);
    const total = data.reduce((sum, d) => sum + d.value, 0);
    const good = data.find((d) => d.label === "Good Moves");
    const blunders = data.find((d) => d.label === "Blunders");
    if (total === 0) return "No move data available";
    const goodPct = good ? ((good.value / total) * 100).toFixed(0) : "0";
    const blunderPct = blunders ? ((blunders.value / total) * 100).toFixed(0) : "0";
    return `${goodPct}% good moves | ${blunderPct}% blunders`;
  };

  return (
    <ChartWrapper
      title="Mistake Breakdown"
      insight="Distribution of move quality across your games"
    >
      {(color) => {
        const data = getData(color);
        const insight = getInsight(color);

        return (
          <div className="h-full flex flex-col">
            <p className="text-xs text-muted-foreground mb-2 truncate">{insight}</p>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    key={`pie-${color}-${data.length}`}
                    dataKey="value"
                    nameKey="label"
                    data={data}
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    innerRadius={35}
                    paddingAngle={2}
                    label={({ label, value }) => `${label}: ${value}`}
                    labelLine={{ strokeWidth: 1 }}
                    isAnimationActive={false}
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      }}
    </ChartWrapper>
  );
}

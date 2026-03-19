"use client";

import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Cell } from "recharts";
import { OpeningStats } from "@/types/repertoire";
import ChartWrapper from "./ChartWrapper";

interface OpeningOutcomesChartProps {
  openings: OpeningStats[];
}

export default function OpeningOutcomesChart({ openings }: OpeningOutcomesChartProps) {
  const getData = (color: "white" | "black" | "all") => {
    const filtered = color === "all"
      ? openings
      : openings.filter((o) => o.color === color);

    return [...filtered]
      .map((o) => ({
        name: `${o.eco_code} ${o.opening_name}`.slice(0, 25),
        fullName: `${o.eco_code} ${o.opening_name}`,
        wins: o.wins,
        losses: o.losses,
        draws: o.draws,
        total: o.wins + o.losses + o.draws,
        winrate: o.winrate,
      }))
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  };

  const getInsight = (color: "white" | "black" | "all") => {
    const data = getData(color);
    if (data.length === 0) return "No opening data available";
    const best = data.reduce((a, b) => (a.winrate > b.winrate ? a : b));
    const worst = data.reduce((a, b) => (a.winrate < b.winrate ? a : b));
    return `Best: ${best.name} (${(best.winrate * 100).toFixed(0)}%) | Weakest: ${worst.name} (${(worst.winrate * 100).toFixed(0)}%)`;
  };

  return (
    <ChartWrapper
      title="Opening Outcomes"
      insight="Win/Loss/Draw distribution for your top 5 most played openings"
    >
      {(color) => {
        const data = getData(color);
        const insight = getInsight(color);

        return (
          <div className="h-full flex flex-col">
            <p className="text-xs text-muted-foreground mb-2 truncate">{insight}</p>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => value.length > 20 ? value.slice(0, 18) + "..." : value}
                  />
                  <Tooltip
                    formatter={(value, name) => [value, name]}
                    labelFormatter={(label) => {
                      const item = data.find(d => d.name === label);
                      return item?.fullName || label;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="wins" stackId="a" fill="#22c55e" name="Wins" />
                  <Bar dataKey="losses" stackId="a" fill="#ef4444" name="Losses" />
                  <Bar dataKey="draws" stackId="a" fill="#3b82f6" name="Draws" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      }}
    </ChartWrapper>
  );
}

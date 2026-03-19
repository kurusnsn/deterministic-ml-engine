"use client";

import { useMemo } from "react";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, Legend, ZAxis } from "recharts";
import { TimeUsageEntry } from "@/types/repertoire";
import ChartWrapper from "./ChartWrapper";

interface MoveTimeVsResultChartProps {
  data: TimeUsageEntry[];
}

const RESULT_COLORS = {
  win: "#22c55e",
  loss: "#ef4444",
  draw: "#3b82f6",
};

export default function MoveTimeVsResultChart({ data }: MoveTimeVsResultChartProps) {
  const processData = (color: "white" | "black" | "all") => {
    // Filter by color if specified
    const filtered = color === "all"
      ? data
      : data.filter(entry => entry.color === color);

    return filtered.slice(0, 80).map((entry) => ({
      x: entry.avg_move_time || 0,
      y: entry.moves || 0,
      result: entry.result,
      label: entry.opening,
      color: RESULT_COLORS[entry.result] || "#666",
    }));
  };

  const getInsight = () => {
    if (data.length === 0) return "No time data available";

    const wins = data.filter((d) => d.result === "win");
    const losses = data.filter((d) => d.result === "loss");

    const avgWinTime = wins.length > 0
      ? wins.reduce((sum, d) => sum + (d.avg_move_time || 0), 0) / wins.length
      : 0;
    const avgLossTime = losses.length > 0
      ? losses.reduce((sum, d) => sum + (d.avg_move_time || 0), 0) / losses.length
      : 0;

    if (avgWinTime > 0 && avgLossTime > 0) {
      const diff = avgWinTime - avgLossTime;
      if (Math.abs(diff) > 2) {
        return diff > 0
          ? `You spend ${diff.toFixed(1)}s more per move in wins`
          : `Losses average ${Math.abs(diff).toFixed(1)}s more per move`;
      }
    }

    return `Avg move time: ${((avgWinTime + avgLossTime) / 2).toFixed(1)}s | Slow moves don't always prevent errors`;
  };

  // Format axis ticks to prevent long decimal numbers
  const formatXAxisTick = (value: number) => {
    return `${value.toFixed(1)}s`;
  };

  const formatYAxisTick = (value: number) => {
    return Math.round(value).toString();
  };

  return (
    <ChartWrapper
      title="Move Time vs Result"
      insight="Explore the relationship between thinking time and game outcomes"
      showColorToggle={true}
    >
      {(color) => {
        const points = processData(color);
        const insight = getInsight();

        const wins = points.filter((p) => p.result === "win");
        const losses = points.filter((p) => p.result === "loss");
        const draws = points.filter((p) => p.result === "draw");

        return (
          <div className="h-full flex flex-col">
            <p className="text-xs text-muted-foreground mb-2 truncate">{insight}</p>
            <div className="flex-1 min-h-0">
              {points.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  No time usage data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ left: 10, right: 20, top: 20, bottom: 10 }}>
                    <XAxis
                      dataKey="x"
                      name="Avg Move Time"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={formatXAxisTick}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      dataKey="y"
                      name="Moves"
                      type="number"
                      domain={[0, 'dataMax']}
                      tickFormatter={formatYAxisTick}
                      tick={{ fontSize: 11 }}
                      label={{ value: "Game Length", angle: -90, position: "insideLeft", fontSize: 10 }}
                    />
                    <ZAxis range={[40, 100]} />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      content={({ payload }) => {
                        if (!payload || payload.length === 0) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="bg-card border rounded-lg shadow-lg p-2 text-xs">
                            <p className="font-medium">{data.label}</p>
                            <p>Time: {data.x.toFixed(1)}s/move</p>
                            <p>Moves: {Math.round(data.y)}</p>
                            <p className="capitalize">Result: {data.result}</p>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      wrapperStyle={{ fontSize: 11, paddingBottom: 10 }}
                    />
                    <Scatter name="Wins" data={wins} fill={RESULT_COLORS.win} />
                    <Scatter name="Losses" data={losses} fill={RESULT_COLORS.loss} />
                    <Scatter name="Draws" data={draws} fill={RESULT_COLORS.draw} />
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        );
      }}
    </ChartWrapper>
  );
}

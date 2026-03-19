"use client";

import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { GameLengthHistogramEntry, TimeUsageEntry } from "@/types/repertoire";
import ChartWrapper from "./ChartWrapper";

interface GameLengthDistributionChartProps {
  data: GameLengthHistogramEntry[];
  timeUsage?: TimeUsageEntry[];
}

const BUCKETS = [
  { lower: 0, upper: 20, label: "0-20" },
  { lower: 21, upper: 40, label: "21-40" },
  { lower: 41, upper: 60, label: "41-60" },
  { lower: 61, upper: 80, label: "61-80" },
  { lower: 81, upper: Infinity, label: "81+" },
];

export default function GameLengthDistributionChart({ data, timeUsage }: GameLengthDistributionChartProps) {
  const computeHistogramFromTimeUsage = (entries: TimeUsageEntry[]): GameLengthHistogramEntry[] => {
    const histogram: Record<string, { wins: number; losses: number; draws: number }> = {};

    BUCKETS.forEach(b => {
      histogram[b.label] = { wins: 0, losses: 0, draws: 0 };
    });

    entries.forEach(entry => {
      const moves = entry.moves || 0;
      let bucketLabel = "Unknown";
      for (const bucket of BUCKETS) {
        if (moves >= bucket.lower && moves <= bucket.upper) {
          bucketLabel = bucket.label;
          break;
        }
      }

      if (histogram[bucketLabel]) {
        if (entry.result === "win") histogram[bucketLabel].wins++;
        else if (entry.result === "loss") histogram[bucketLabel].losses++;
        else if (entry.result === "draw") histogram[bucketLabel].draws++;
      }
    });

    return BUCKETS.map(b => ({
      bucket: b.label,
      wins: histogram[b.label].wins,
      losses: histogram[b.label].losses,
      draws: histogram[b.label].draws,
    })).filter(h => h.wins > 0 || h.losses > 0 || h.draws > 0);
  };

  const sortData = (items: GameLengthHistogramEntry[]) => {
    return [...items].sort((a, b) => {
      const aNum = parseInt(a.bucket.match(/\d+/)?.[0] || "0");
      const bNum = parseInt(b.bucket.match(/\d+/)?.[0] || "0");
      return aNum - bNum;
    });
  };

  const getInsight = (items: GameLengthHistogramEntry[]) => {
    if (items.length === 0) return "No game length data available";

    const totalGames = items.reduce((sum, d) => sum + d.wins + d.losses + d.draws, 0);
    const totalWins = items.reduce((sum, d) => sum + d.wins, 0);

    const sorted = [...items].sort(
      (a, b) => (b.wins + b.losses + b.draws) - (a.wins + a.losses + a.draws)
    );
    const mostCommon = sorted[0];

    const shortGames = items.filter((d) => {
      const moves = parseInt(d.bucket.match(/\d+/)?.[0] || "0");
      return moves <= 20;
    });
    const shortLosses = shortGames.reduce((sum, d) => sum + d.losses, 0);
    const shortTotal = shortGames.reduce((sum, d) => sum + d.wins + d.losses + d.draws, 0);

    if (shortLosses > shortTotal * 0.4 && shortTotal > 5) {
      return `Most games: ${mostCommon.bucket} | Watch out: ${shortLosses} losses in short games`;
    }

    return `Most games: ${mostCommon.bucket} moves | ${((totalWins / totalGames) * 100).toFixed(0)}% overall winrate`;
  };

  return (
    <ChartWrapper
      title="Game Length Distribution"
      insight="How game length correlates with your results"
      showColorToggle={true}
    >
      {(color) => {
        // Use time_usage to compute histogram when filtering by color
        let chartData: GameLengthHistogramEntry[];

        if (color === "all") {
          chartData = data;
        } else if (timeUsage && timeUsage.length > 0) {
          const filtered = timeUsage.filter(e => e.color === color);
          chartData = computeHistogramFromTimeUsage(filtered);
        } else {
          // Fallback to all data if no time_usage available
          chartData = data;
        }

        const sortedData = sortData(chartData);
        const insight = getInsight(sortedData);

        return (
          <div className="h-full flex flex-col">
            <p className="text-xs text-muted-foreground mb-2 truncate">{insight}</p>
            <div className="flex-1 min-h-0">
              {sortedData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  No game length data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sortedData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="wins" stackId="a" fill="#22c55e" name="Wins" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="losses" stackId="a" fill="#ef4444" name="Losses" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="draws" stackId="a" fill="#3b82f6" name="Draws" radius={[4, 4, 0, 0]} />
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

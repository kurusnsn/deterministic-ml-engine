"use client";

import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Cell, ReferenceLine } from "recharts";
import { MoveAnalysis } from "@/types/repertoire";
import ChartWrapper from "./ChartWrapper";

interface AccuracyByPhaseChartProps {
  moves: MoveAnalysis[];
}

type PhaseKey = "opening" | "middlegame" | "endgame";

const phaseFromFen = (fen: string | undefined): PhaseKey => {
  if (!fen) return "middlegame";
  const board = fen.split(" ")[0] || "";
  const queens = (board.match(/q/gi) || []).length;
  const material = (board.match(/[prnbqk]/gi) || []).reduce((sum, piece) => {
    const p = piece.toLowerCase();
    const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    return sum + (values[p] || 0);
  }, 0);
  if (queens >= 2) return "opening";
  if (queens === 0 || material <= 20) return "endgame";
  return "middlegame";
};

export default function AccuracyByPhaseChart({ moves }: AccuracyByPhaseChartProps) {
  const getData = (color: "white" | "black" | "all") => {
    const filtered = color === "all"
      ? moves
      : moves.filter((m) => {
          const plyIsWhite = m.ply % 2 === 1;
          return color === "white" ? plyIsWhite : !plyIsWhite;
        });

    const buckets: Record<PhaseKey, { cpLoss: number; count: number; blunders: number }> = {
      opening: { cpLoss: 0, count: 0, blunders: 0 },
      middlegame: { cpLoss: 0, count: 0, blunders: 0 },
      endgame: { cpLoss: 0, count: 0, blunders: 0 },
    };

    filtered.forEach((m) => {
      const phase = phaseFromFen((m as any).fen_after || (m as any).fen_before);
      const loss = Math.abs(m.eval_delta ?? 0);
      buckets[phase].cpLoss += loss;
      buckets[phase].count += 1;
      if (m.mistake_type === "blunder") buckets[phase].blunders += 1;
    });

    return (["opening", "middlegame", "endgame"] as const).map((phase) => {
      const d = buckets[phase];
      const avg = d.count ? d.cpLoss / d.count : 0;
      const acc = d.count ? Math.max(0, Math.min(1, 1 - avg / 300)) * 100 : 0;
      return {
        phase: phase.charAt(0).toUpperCase() + phase.slice(1),
        avgCpLoss: Number(avg.toFixed(1)),
        accuracy: Number(acc.toFixed(1)),
        blunders: d.blunders,
      };
    });
  };

  const getInsight = (color: "white" | "black" | "all") => {
    const data = getData(color);
    const weakest = [...data].sort((a, b) => b.avgCpLoss - a.avgCpLoss)[0];
    const strongest = [...data].sort((a, b) => a.avgCpLoss - b.avgCpLoss)[0];
    if (!weakest || !strongest) return "No phase data available";
    return `Weakest: ${weakest.phase} (${weakest.avgCpLoss} cp avg loss) | Strongest: ${strongest.phase} (${strongest.accuracy.toFixed(0)}% acc)`;
  };

  return (
    <ChartWrapper
      title="Accuracy by Phase"
      insight="Compare your performance across opening, middlegame, and endgame"
    >
      {(color) => {
        const data = getData(color);
        const insight = getInsight(color);

        return (
          <div className="h-full flex flex-col">
            <p className="text-xs text-muted-foreground mb-2 truncate">{insight}</p>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <XAxis dataKey="phase" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="avgCpLoss" name="Avg CP Loss" fill="#f97316" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="accuracy" name="Accuracy %" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="blunders" name="Blunders" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      }}
    </ChartWrapper>
  );
}

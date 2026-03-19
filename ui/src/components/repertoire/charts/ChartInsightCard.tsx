"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  Clock,
  Zap,
  Brain,
  Trophy,
} from "lucide-react";
import { RepertoireReport as RepertoireReportType, OpeningStats, MoveAnalysis } from "@/types/repertoire";
import { cn } from "@/lib/utils";

interface ChartInsightCardProps {
  report: RepertoireReportType;
  openings: OpeningStats[];
}

interface Insight {
  icon: React.ElementType;
  title: string;
  value: string;
  description: string;
  type: "success" | "warning" | "info" | "neutral";
}

export default function ChartInsightCard({ report, openings }: ChartInsightCardProps) {
  const insights = useMemo(() => {
    const result: Insight[] = [];

    // 1. Best performing opening
    const bestOpening = [...openings]
      .filter((o) => o.games_count >= 3)
      .sort((a, b) => b.winrate - a.winrate)[0];

    if (bestOpening) {
      result.push({
        icon: Trophy,
        title: "Best Opening",
        value: `${bestOpening.eco_code}`,
        description: `${(bestOpening.winrate * 100).toFixed(0)}% winrate in ${bestOpening.games_count} games`,
        type: "success",
      });
    }

    // 2. Weakest opening
    const weakestOpening = [...openings]
      .filter((o) => o.games_count >= 3)
      .sort((a, b) => a.winrate - b.winrate)[0];

    if (weakestOpening && weakestOpening.winrate < 0.45) {
      result.push({
        icon: AlertTriangle,
        title: "Needs Work",
        value: `${weakestOpening.eco_code}`,
        description: `Only ${(weakestOpening.winrate * 100).toFixed(0)}% winrate - consider practicing`,
        type: "warning",
      });
    }

    // 3. Phase analysis
    const moves = report.engine_analysis?.moves || [];
    if (moves.length > 0) {
      const phaseStats = computePhaseStats(moves);
      const weakestPhase = Object.entries(phaseStats)
        .sort((a, b) => b[1].avgCpLoss - a[1].avgCpLoss)[0];

      if (weakestPhase && weakestPhase[1].avgCpLoss > 30) {
        result.push({
          icon: Target,
          title: "Focus Area",
          value: weakestPhase[0].charAt(0).toUpperCase() + weakestPhase[0].slice(1),
          description: `Avg ${weakestPhase[1].avgCpLoss.toFixed(0)} cp loss - your weakest phase`,
          type: "info",
        });
      }

      // 4. Blunder rate
      const blunders = moves.filter((m) => m.mistake_type === "blunder").length;
      const blunderRate = (blunders / moves.length) * 100;

      if (blunderRate > 5) {
        result.push({
          icon: Zap,
          title: "Blunder Rate",
          value: `${blunderRate.toFixed(1)}%`,
          description: `${blunders} blunders detected - focus on tactics`,
          type: "warning",
        });
      } else if (blunderRate < 2 && moves.length > 50) {
        result.push({
          icon: Brain,
          title: "Solid Play",
          value: `${blunderRate.toFixed(1)}%`,
          description: `Low blunder rate - good tactical awareness`,
          type: "success",
        });
      }
    }

    // 5. Game length insight
    const histogram = report.game_length_histogram || [];
    if (histogram.length > 0) {
      const shortGames = histogram.filter((h) => {
        const moves = parseInt(h.bucket.match(/\d+/)?.[0] || "0");
        return moves <= 20;
      });
      const shortLosses = shortGames.reduce((sum, h) => sum + h.losses, 0);
      const shortTotal = shortGames.reduce((sum, h) => sum + h.wins + h.losses + h.draws, 0);

      if (shortLosses > shortTotal * 0.5 && shortTotal >= 5) {
        result.push({
          icon: Clock,
          title: "Early Losses",
          value: `${shortLosses}/${shortTotal}`,
          description: `Many losses in short games - check opening prep`,
          type: "warning",
        });
      }
    }

    // 6. Overall trend
    if (report.overall_winrate >= 0.55) {
      result.push({
        icon: TrendingUp,
        title: "Performance",
        value: `${(report.overall_winrate * 100).toFixed(0)}%`,
        description: "Strong overall winrate - keep it up!",
        type: "success",
      });
    } else if (report.overall_winrate < 0.45) {
      result.push({
        icon: TrendingDown,
        title: "Performance",
        value: `${(report.overall_winrate * 100).toFixed(0)}%`,
        description: "Room for improvement in overall results",
        type: "warning",
      });
    }

    return result.slice(0, 6);
  }, [report, openings]);

  const typeStyles = {
    success: "border-l-green-500 bg-green-50/50 dark:bg-green-950/30",
    warning: "border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/30",
    info: "border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/30",
    neutral: "border-l-gray-300 bg-gray-50/50 dark:bg-gray-800/30",
  };

  const iconStyles = {
    success: "text-green-600 dark:text-green-400",
    warning: "text-amber-600 dark:text-amber-400",
    info: "text-blue-600 dark:text-blue-400",
    neutral: "text-gray-600 dark:text-gray-400",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Brain className="w-4 h-4" />
          Key Insights
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          AI-generated highlights from your repertoire analysis
        </p>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Not enough data to generate insights
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {insights.map((insight, index) => (
              <div
                key={index}
                className={cn(
                  "p-3 rounded-lg border-l-4 flex items-start gap-3",
                  typeStyles[insight.type]
                )}
              >
                <insight.icon className={cn("w-5 h-5 mt-0.5 shrink-0", iconStyles[insight.type])} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {insight.title}
                    </span>
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                      {insight.value}
                    </Badge>
                  </div>
                  <p className="text-xs text-foreground mt-0.5 truncate">
                    {insight.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function computePhaseStats(moves: MoveAnalysis[]) {
  const buckets: Record<string, { cpLoss: number; count: number }> = {
    opening: { cpLoss: 0, count: 0 },
    middlegame: { cpLoss: 0, count: 0 },
    endgame: { cpLoss: 0, count: 0 },
  };

  moves.forEach((m) => {
    const phase = phaseFromFen((m as any).fen_after || (m as any).fen_before);
    const loss = Math.abs(m.eval_delta ?? 0);
    buckets[phase].cpLoss += loss;
    buckets[phase].count += 1;
  });

  return Object.fromEntries(
    Object.entries(buckets).map(([phase, data]) => [
      phase,
      {
        avgCpLoss: data.count > 0 ? data.cpLoss / data.count : 0,
        count: data.count,
      },
    ])
  );
}

function phaseFromFen(fen: string | undefined): string {
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
}

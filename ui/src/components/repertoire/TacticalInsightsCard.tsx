"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RepertoireInsight, WeakLine, LC0PremiumOverlay } from '@/types/repertoire';
import { AlertTriangle, TrendingDown, Puzzle, Sparkles, Info, AlertCircle } from 'lucide-react';

interface TacticalInsightsCardProps {
  insights: RepertoireInsight[];
  weak_lines?: WeakLine[];
  engine_analysis?: { moves: any[] };
  /** LC0 premium overlay data (optional) */
  premiumLc0?: LC0PremiumOverlay;
}

/** Icon mapping for LC0 insight types */
const LC0_INSIGHT_ICONS: Record<string, typeof Info> = {
  lc0_disagreement: Info,
  conversion_difficulty: AlertCircle,
  tension_handling: AlertTriangle,
};

/** Color mapping for LC0 insight severity */
const LC0_SEVERITY_COLORS: Record<string, string> = {
  info: "text-blue-500",
  warning: "text-orange-500",
};

export default function TacticalInsightsCard({
  insights,
  weak_lines = [],
  engine_analysis,
  premiumLc0,
}: TacticalInsightsCardProps) {
  // Filter to tactical insights (high priority warnings)
  const tacticalInsights = insights.filter(
    i => i.priority === 'high' && i.type === 'warning'
  );

  // LC0 Premium insights
  const lc0Insights = premiumLc0?.insight_overlays?.extra_insights || [];

  // Calculate eval swing summary
  let avgEvalSwing = 0;
  let worstEvalSwing = 0;
  if (engine_analysis?.moves) {
    const swings = engine_analysis.moves
      .map(m => m.eval_delta || 0)
      .filter(s => s !== 0);
    if (swings.length > 0) {
      avgEvalSwing = swings.reduce((a, b) => a + b, 0) / swings.length / 100; // Convert to pawns
      worstEvalSwing = Math.min(...swings) / 100; // Convert to pawns
    }
  }

  // Get top tactical issues from insights
  const topIssues = tacticalInsights.slice(0, 3);

  if (tacticalInsights.length === 0 && (!weak_lines || weak_lines.length === 0) && lc0Insights.length === 0) {
    return null;
  }

  return (
    <Card className="border-l-4 border-l-orange-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-600" />
          Key Tactical Insights
          {lc0Insights.length > 0 && (
            <Badge className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[10px] py-0 px-1.5">
              <Sparkles className="w-2.5 h-2.5 mr-0.5" />
              +{lc0Insights.length} LC0
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Eval Swing Summary */}
        {engine_analysis?.moves && engine_analysis.moves.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Average Eval Swing</p>
              <p className={`text-lg font-semibold ${avgEvalSwing < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {avgEvalSwing >= 0 ? '+' : ''}{avgEvalSwing.toFixed(2)} pawns
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Worst Eval Swing</p>
              <p className="text-lg font-semibold text-red-600">
                {worstEvalSwing.toFixed(2)} pawns
              </p>
            </div>
          </div>
        )}

        {/* Top Tactical Issues */}
        {topIssues.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Top Tactical Issues:</p>
            <ul className="space-y-1">
              {topIssues.map((insight, idx) => (
                <li key={idx} className="text-sm text-foreground flex items-start gap-2">
                  <TrendingDown className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <span>{insight.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* LC0 Premium Insights (only shown if premium data available) */}
        {lc0Insights.length > 0 && (
          <div className="border-t pt-3 mt-3">
            <p className="text-sm font-medium mb-2 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              LC0 Premium Insights:
            </p>
            <ul className="space-y-2">
              {lc0Insights.slice(0, 3).map((insight, idx) => {
                const Icon = LC0_INSIGHT_ICONS[insight.type] || Info;
                const colorClass = LC0_SEVERITY_COLORS[insight.severity] || "text-muted-foreground";
                return (
                  <li key={`lc0-${idx}`} className="text-sm text-foreground flex items-start gap-2">
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${colorClass}`} />
                    <div>
                      <span className="font-medium">{insight.title}</span>
                      {insight.evidence?.interpretation && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {insight.evidence.interpretation}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {weak_lines && weak_lines.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Scroll to weak lines section
                const element = document.getElementById('weak-lines-section');
                element?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              View Weak Lines ({weak_lines.length})
            </Button>
          )}
          {engine_analysis && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Scroll to puzzles section
                const element = document.getElementById('puzzles-section');
                element?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <Puzzle className="w-4 h-4 mr-2" />
              View Puzzles
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}



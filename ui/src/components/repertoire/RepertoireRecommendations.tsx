"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WeakLine, GeneratedPuzzle, RepertoireInsight } from '@/types/repertoire';
import { Lightbulb, Target, AlertTriangle, Puzzle } from 'lucide-react';

interface RepertoireRecommendationsProps {
  weak_lines: WeakLine[];
  puzzles: GeneratedPuzzle[];
  tactical_insights: RepertoireInsight[];
}

export default function RepertoireRecommendations({
  weak_lines,
  puzzles,
  tactical_insights
}: RepertoireRecommendationsProps) {
  const recommendations = [];

  // Recommendation 1: Avoid worst weak lines
  const worstLines = weak_lines
    .filter(wl => wl.winrate < 0.30)
    .sort((a, b) => a.winrate - b.winrate)
    .slice(0, 3);

  if (worstLines.length > 0) {
    worstLines.forEach(line => {
      const lineDisplay = line.line.slice(0, 4).join(' ');
      recommendations.push({
        type: 'avoid',
        title: `Avoid line: ${lineDisplay}...`,
        description: `This line has only ${Math.round(line.winrate * 100)}% winrate in ${line.games_count} games.`,
        priority: 'high',
        action: 'View Line Details',
        onClick: () => {
          document.getElementById('weak-lines-section')?.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  // Recommendation 2: Practice puzzles for weak lines
  const linesWithPuzzles = weak_lines.filter(wl => wl.puzzle_ids.length > 0);
  if (linesWithPuzzles.length > 0) {
    linesWithPuzzles.forEach(line => {
      const lineDisplay = line.line.slice(0, 4).join(' ');
      recommendations.push({
        type: 'practice',
        title: `Practice puzzles for: ${lineDisplay}...`,
        description: `${line.puzzle_ids.length} puzzles available to improve ${line.tactical_issues[0] || 'positional play'}.`,
        priority: 'medium',
        action: 'View Puzzles',
        onClick: () => {
          document.getElementById('puzzles-section')?.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  // Recommendation 3: Focus on most common tactical issues
  const tacticalIssueCounts: Record<string, number> = {};
  tactical_insights.forEach(insight => {
    if (insight.type === 'warning' && insight.priority === 'high') {
      // Extract issue from message
      const issueMatch = insight.message.match(/by (\w+)/);
      if (issueMatch) {
        const issue = issueMatch[1];
        tacticalIssueCounts[issue] = (tacticalIssueCounts[issue] || 0) + 1;
      }
    }
  });

  const topIssue = Object.entries(tacticalIssueCounts)
    .sort(([, a], [, b]) => b - a)[0];

  if (topIssue) {
    recommendations.push({
      type: 'focus',
      title: `Focus on ${topIssue[0]}`,
      description: `This tactical issue appears ${topIssue[1]} times in your games.`,
      priority: 'high',
      action: 'View Analysis',
      onClick: () => {
        document.getElementById('tactical-insights')?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  if (recommendations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Repertoire Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-sm text-center">
            No specific recommendations at this time. Keep playing and analyzing!
          </p>
        </CardContent>
      </Card>
    );
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-yellow-600" />
          Repertoire Recommendations
        </CardTitle>
        <p className="text-sm text-gray-500">
          Actionable recommendations to improve your opening repertoire
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recommendations.slice(0, 6).map((rec, idx) => {
            const Icon = rec.type === 'avoid' ? AlertTriangle :
                         rec.type === 'practice' ? Puzzle :
                         Target;
            const color = rec.priority === 'high' ? 'border-l-red-500' :
                         rec.priority === 'medium' ? 'border-l-orange-500' :
                         'border-l-blue-500';

            return (
              <Card key={idx} className={`border-l-4 ${color}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Icon className="w-5 h-5 mt-0.5 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <h4 className="font-medium">{rec.title}</h4>
                      <p className="text-sm text-gray-600">{rec.description}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={rec.onClick}
                      >
                        {rec.action}
                      </Button>
                    </div>
                    <Badge variant={rec.priority === 'high' ? 'destructive' : 'secondary'}>
                      {rec.priority}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}







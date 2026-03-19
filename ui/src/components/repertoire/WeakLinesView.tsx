"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WeakLine, GeneratedPuzzle } from '@/types/repertoire';
import { AlertTriangle, Puzzle, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WeakLinesViewProps {
  weak_lines: WeakLine[];
  puzzles?: GeneratedPuzzle[] | null;
  selectedEco?: string;
}

export default function WeakLinesView({
  weak_lines,
  puzzles = [],
  selectedEco
}: WeakLinesViewProps) {
  const [ecoFilter, setEcoFilter] = useState<string>(selectedEco || 'all');

  if (!weak_lines || weak_lines.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weak Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-sm text-center">No weak lines detected.</p>
        </CardContent>
      </Card>
    );
  }

  // Get unique ECOs for filter
  const uniqueEcos = Array.from(new Set(weak_lines.map(wl => wl.eco).filter(Boolean)));

  // Filter by ECO
  const filteredLines = ecoFilter === 'all'
    ? weak_lines
    : weak_lines.filter(wl => wl.eco === ecoFilter);

  if (filteredLines.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weak Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-sm text-center">No weak lines for this ECO.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="weak-lines-section">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            Weak Lines ({filteredLines.length})
          </CardTitle>
          {uniqueEcos.length > 0 && (
            <Select value={ecoFilter} onValueChange={setEcoFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ECOs</SelectItem>
                {uniqueEcos.map(eco => (
                  <SelectItem key={eco} value={eco || ''}>{eco}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <p className="text-sm text-gray-500">
          Opening lines with poor performance that need attention
        </p>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          {filteredLines.map((weakLine) => {
            const linePuzzles = (puzzles || []).filter(p => weakLine.puzzle_ids.includes(p.puzzle_id));
            
            return (
              <AccordionItem key={weakLine.id} value={weakLine.id}>
                <AccordionTrigger>
                  <div className="flex items-center gap-2 text-left">
                    {weakLine.eco && <Badge variant="outline">{weakLine.eco}</Badge>}
                    <span className="text-sm">
                      {weakLine.line.slice(0, 6).join(' ')}
                      {weakLine.line.length > 6 && '...'}
                    </span>
                    <Badge variant="destructive" className="ml-auto">
                      {Math.round(weakLine.winrate * 100)}% WR
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pt-2">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Games</p>
                        <p className="font-semibold">{weakLine.games_count}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Winrate</p>
                        <p className="font-semibold text-red-600">
                          {Math.round(weakLine.winrate * 100)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Avg Eval Swing</p>
                        <p className="font-semibold text-red-600">
                          {weakLine.avg_eval_swing >= 0 ? '+' : ''}
                          {weakLine.avg_eval_swing.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {/* Common mistakes */}
                    {weakLine.common_mistakes.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">Common Mistakes:</p>
                        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                          {weakLine.common_mistakes.map((mistake, idx) => (
                            <li key={idx}>{mistake}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Tactical issues */}
                    {weakLine.tactical_issues.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">Tactical Issues:</p>
                        <div className="flex flex-wrap gap-1">
                          {weakLine.tactical_issues.map((issue) => (
                            <Badge key={issue} variant="secondary" className="text-xs">
                              {issue.replace("_", " ")}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Linked puzzles */}
                    {linePuzzles.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">
                          Practice Puzzles ({linePuzzles.length}):
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const element = document.getElementById('puzzles-section');
                            element?.scrollIntoView({ behavior: 'smooth' });
                          }}
                        >
                          <Puzzle className="w-4 h-4 mr-2" />
                          View Puzzles
                        </Button>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}






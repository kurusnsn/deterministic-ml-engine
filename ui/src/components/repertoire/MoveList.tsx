"use client";

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MoveAnalysis, GeneratedPuzzle } from '@/types/repertoire';
import { GitFork, Pin, AlertTriangle, Puzzle, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MoveListProps {
  moves: MoveAnalysis[];
  puzzles?: GeneratedPuzzle[];
  onPuzzleClick?: (puzzle: GeneratedPuzzle) => void;
}

export default function MoveList({ moves, puzzles = [], onPuzzleClick }: MoveListProps) {
  const [expandedMoves, setExpandedMoves] = useState<Set<number>>(new Set());

  if (!moves || moves.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-gray-500">No move data available.</p>
        </CardContent>
      </Card>
    );
  }

  const toggleExpand = (ply: number) => {
    const newExpanded = new Set(expandedMoves);
    if (newExpanded.has(ply)) {
      newExpanded.delete(ply);
    } else {
      newExpanded.add(ply);
    }
    setExpandedMoves(newExpanded);
  };

  const getMoveColor = (mistakeType: string | null) => {
    if (mistakeType === 'blunder') return 'bg-red-100 border-red-300';
    if (mistakeType === 'mistake') return 'bg-orange-100 border-orange-300';
    if (mistakeType === 'inaccuracy') return 'bg-yellow-100 border-yellow-300';
    return 'bg-gray-50 border-gray-200';
  };

  const hasPuzzle = (ply: number) => {
    return puzzles.some(p => p.move_ply === ply);
  };

  return (
    <div className="space-y-2">
      {moves.map((move) => {
        const isExpanded = expandedMoves.has(move.ply);
        const heuristics = move.heuristics;
        const hasTacticalPattern = 
          heuristics.fork || heuristics.pin || heuristics.skewer || heuristics.xray ||
          heuristics.hanging_piece || heuristics.trapped_piece || 
          heuristics.overloaded_piece || heuristics.discovered_attack;

        return (
          <Card
            key={move.ply}
            className={cn("cursor-pointer transition-all", getMoveColor(move.mistake_type))}
            onClick={() => toggleExpand(move.ply)}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1">
                  <span className="font-mono text-sm font-medium w-12">
                    {Math.floor((move.ply - 1) / 2) + 1}.
                    {move.ply % 2 === 0 ? '..' : ''}
                  </span>
                  <span className="font-medium">{move.move}</span>
                  
                  {/* Icons */}
                  <div className="flex items-center gap-1 ml-2">
                    {heuristics.fork && <GitFork className="w-4 h-4 text-blue-600" title="Fork" />}
                    {heuristics.pin && <Pin className="w-4 h-4 text-purple-600" title="Pin" />}
                    {heuristics.hanging_piece && (
                      <AlertTriangle className="w-4 h-4 text-red-600" title="Hanging piece" />
                    )}
                    {move.mistake_type === 'blunder' && (
                      <Badge variant="destructive" className="text-xs">Blunder</Badge>
                    )}
                    {hasPuzzle(move.ply) && (
                      <Puzzle 
                        className="w-4 h-4 text-green-600" 
                        title="Puzzle available"
                        onClick={(e) => {
                          e.stopPropagation();
                          const puzzle = puzzles.find(p => p.move_ply === move.ply);
                          if (puzzle && onPuzzleClick) {
                            onPuzzleClick(puzzle);
                          }
                        }}
                      />
                    )}
                  </div>

                  {/* Eval display */}
                  <span className="text-xs text-gray-500 ml-auto">
                    {move.eval.mate 
                      ? `Mate ${move.eval.mate}` 
                      : `${move.eval.cp >= 0 ? '+' : ''}${(move.eval.cp / 100).toFixed(1)}`}
                  </span>
                </div>

                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Best move:</span>{' '}
                      <span className="font-mono">{move.best_move}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Eval delta:</span>{' '}
                      <span className={move.eval_delta < 0 ? 'text-red-600' : 'text-green-600'}>
                        {move.eval_delta >= 0 ? '+' : ''}{move.eval_delta}
                      </span>
                    </div>
                  </div>

                  {/* Heuristics */}
                  {hasTacticalPattern && (
                    <div>
                      <p className="text-xs font-medium text-gray-700 mb-1">Tactical patterns:</p>
                      <div className="flex flex-wrap gap-1">
                        {heuristics.fork && <Badge variant="secondary" className="text-xs">Fork</Badge>}
                        {heuristics.pin && <Badge variant="secondary" className="text-xs">Pin</Badge>}
                        {heuristics.skewer && <Badge variant="secondary" className="text-xs">Skewer</Badge>}
                        {heuristics.xray && <Badge variant="secondary" className="text-xs">X-ray</Badge>}
                        {heuristics.hanging_piece && <Badge variant="secondary" className="text-xs">Hanging</Badge>}
                        {heuristics.trapped_piece && <Badge variant="secondary" className="text-xs">Trapped</Badge>}
                        {heuristics.overloaded_piece && <Badge variant="secondary" className="text-xs">Overloaded</Badge>}
                        {heuristics.discovered_attack && <Badge variant="secondary" className="text-xs">Discovered</Badge>}
                      </div>
                    </div>
                  )}

                  {/* Weak squares */}
                  {heuristics.weak_squares.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-700 mb-1">Weak squares:</p>
                      <div className="flex flex-wrap gap-1">
                        {heuristics.weak_squares.map(sq => (
                          <Badge key={sq} variant="outline" className="text-xs">{sq}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pawn structure */}
                  {(heuristics.pawn_structure.isolated_pawns.length > 0 ||
                    heuristics.pawn_structure.doubled_pawns.length > 0 ||
                    heuristics.pawn_structure.passed_pawns.length > 0) && (
                    <div>
                      <p className="text-xs font-medium text-gray-700 mb-1">Pawn structure:</p>
                      <div className="text-xs text-gray-600">
                        {heuristics.pawn_structure.isolated_pawns.length > 0 && (
                          <span>Isolated: {heuristics.pawn_structure.isolated_pawns.join(', ')} </span>
                        )}
                        {heuristics.pawn_structure.doubled_pawns.length > 0 && (
                          <span>Doubled: {heuristics.pawn_structure.doubled_pawns.join(', ')} </span>
                        )}
                        {heuristics.pawn_structure.passed_pawns.length > 0 && (
                          <span>Passed: {heuristics.pawn_structure.passed_pawns.join(', ')}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Mobility */}
                  <div className="text-xs text-gray-500">
                    Mobility: {heuristics.mobility_score} legal moves
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}


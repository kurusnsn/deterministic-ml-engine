"use client";

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { GeneratedPuzzle } from '@/types/repertoire';
import { Chessboard } from 'react-chessboard';
import { Puzzle, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface PuzzleSectionProps {
  puzzles: GeneratedPuzzle[];
  onPlayPuzzle?: (puzzle: GeneratedPuzzle) => void;
}

export default function PuzzleSection({ puzzles, onPlayPuzzle }: PuzzleSectionProps) {
  const router = useRouter();

  if (!puzzles || puzzles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Puzzle className="w-5 h-5" />
            Generated Puzzles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-sm text-center">No puzzles generated from your games.</p>
        </CardContent>
      </Card>
    );
  }

  // Group puzzles by weak_line_id
  const puzzlesByLine = useMemo(() => {
    const grouped: Record<string, GeneratedPuzzle[]> = {};
    const ungrouped: GeneratedPuzzle[] = [];

    for (const puzzle of puzzles) {
      if (puzzle.weak_line_id) {
        if (!grouped[puzzle.weak_line_id]) {
          grouped[puzzle.weak_line_id] = [];
        }
        grouped[puzzle.weak_line_id].push(puzzle);
      } else {
        ungrouped.push(puzzle);
      }
    }

    return { grouped, ungrouped };
  }, [puzzles]);

  const handlePlayPuzzle = (puzzle: GeneratedPuzzle) => {
    if (onPlayPuzzle) {
      onPlayPuzzle(puzzle);
    } else {
      // Default: navigate to puzzles page with this puzzle
      router.push(`/puzzles?puzzle=${puzzle.puzzle_id}`);
    }
  };

  return (
    <Card id="puzzles-section">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Puzzle className="w-5 h-5" />
          Generated Puzzles ({puzzles.length})
        </CardTitle>
        <p className="text-sm text-gray-500">
          Puzzles created from blunders in your games. Practice these positions to improve.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Grouped puzzles by weak line */}
        {Object.keys(puzzlesByLine.grouped).length > 0 && (
          <Accordion type="multiple" className="w-full">
            {Object.entries(puzzlesByLine.grouped).map(([weakLineId, linePuzzles]) => (
              <AccordionItem key={weakLineId} value={weakLineId}>
                <AccordionTrigger>
                  Weak Line {weakLineId} ({linePuzzles.length} puzzles)
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
                    {linePuzzles.map((puzzle) => (
                      <PuzzleCard
                        key={puzzle.puzzle_id}
                        puzzle={puzzle}
                        onPlay={() => handlePlayPuzzle(puzzle)}
                      />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

        {/* Ungrouped puzzles */}
        {puzzlesByLine.ungrouped.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-3">Other Puzzles</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {puzzlesByLine.ungrouped.map((puzzle) => (
                <PuzzleCard
                  key={puzzle.puzzle_id}
                  puzzle={puzzle}
                  onPlay={() => handlePlayPuzzle(puzzle)}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PuzzleCard({ puzzle, onPlay }: { puzzle: GeneratedPuzzle; onPlay: () => void }) {
  const [boardSize, setBoardSize] = useState(200);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex flex-col items-center gap-3">
          {/* Chess board */}
          <div className="w-full flex justify-center">
            <Chessboard
              position={puzzle.fen}
              boardOrientation={puzzle.side_to_move}
              arePiecesDraggable={false}
              boardWidth={boardSize}
              customBoardStyle={{
                borderRadius: "4px",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
              }}
            />
          </div>

          {/* Puzzle info */}
          <div className="w-full space-y-2">
            <div className="text-center">
              <p className="text-sm font-medium">Best: {puzzle.best_move}</p>
              <p className="text-xs text-gray-500">Mistake: {puzzle.mistake_move}</p>
            </div>

            {/* Theme badges */}
            <div className="flex flex-wrap gap-1 justify-center">
              {puzzle.theme.map((theme) => (
                <Badge key={theme} variant="secondary" className="text-xs">
                  {theme.replace("_", " ")}
                </Badge>
              ))}
            </div>

            {/* Play button */}
            <Button
              variant="default"
              size="sm"
              className="w-full"
              onClick={onPlay}
            >
              <Play className="w-4 h-4 mr-2" />
              Play Puzzle
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}







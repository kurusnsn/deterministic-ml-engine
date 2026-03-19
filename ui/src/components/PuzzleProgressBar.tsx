"use client";

import { Progress } from "@/components/ui/progress";

export default function PuzzleProgressBar({ currentUserMove, totalUserMoves }: { currentUserMove: number, totalUserMoves: number }) {
  const progress = totalUserMoves > 0 ? (currentUserMove / totalUserMoves) * 100 : 0;

  return (
    <div className="w-full space-y-2">
      <div className="text-center text-sm font-medium text-foreground">
        Move {currentUserMove} of {totalUserMoves}
      </div>
      <Progress
        value={progress}
        className="h-2 transition-all duration-300 ease-in-out"
      />
    </div>
  );
}

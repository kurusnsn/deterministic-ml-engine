import { useCallback, useEffect, useState } from "react";
import { updateRating } from "@/lib/puzzles/rating";
import type { PuzzleResponse } from "@/lib/api/puzzle";

export type PuzzleControllerState = "idle" | "playing" | "solved" | "failed" | "loading";

interface UsePuzzleControllerOptions {
  puzzle: PuzzleResponse | null;
  userRating: number | null;
  onNext?: () => void;
}

export function usePuzzleController({ puzzle, userRating, onNext }: UsePuzzleControllerOptions) {
  const [state, setState] = useState<PuzzleControllerState>("idle");
  const [displayRating, setDisplayRating] = useState(userRating ?? 1500);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    console.log("Puzzle changed, puzzle ID:", puzzle?.id);
    setDelta(null);
    if (puzzle) {
      console.log("Setting state to 'playing'");
      setState("playing");
    } else {
      console.log("Setting state to 'idle'");
      setState("idle");
    }
  }, [puzzle?.id]);

  useEffect(() => {
    if (userRating !== null) {
      setDisplayRating(userRating);
    }
  }, [userRating]);

  const markSolved = useCallback(() => {
    if (!puzzle) return;
    console.log("markSolved called - setting state to 'solved'");
    const puzzleRating = puzzle.rating ?? displayRating;
    const next = updateRating(displayRating, puzzleRating, true);
    setDelta(next - displayRating);
    setDisplayRating(next);
    setState("solved");
    console.log("State set to 'solved', delta:", next - displayRating);
  }, [displayRating, puzzle]);

  const markFailed = useCallback(() => {
    if (!puzzle) return;
    const puzzleRating = puzzle.rating ?? displayRating;
    const next = updateRating(displayRating, puzzleRating, false);
    setDelta(next - displayRating);
    setDisplayRating(next);
    setState("failed");
  }, [displayRating, puzzle]);

  const applyServerResult = useCallback((newRating: number, ratingDelta: number) => {
    setDisplayRating(newRating);
    setDelta(ratingDelta);
  }, []);

  const nextPuzzle = useCallback(() => {
    console.log("nextPuzzle called - setting state to 'loading'");
    setDelta(null);
    setState("loading");
    onNext?.();
  }, [onNext]);

  return {
    state,
    rating: displayRating,
    delta,
    markSolved,
    markFailed,
    applyServerResult,
    nextPuzzle,
  };
}

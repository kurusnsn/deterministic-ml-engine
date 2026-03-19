"use client";

import { Suspense, useMemo, useCallback, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import ChessBoard from "@/components/ChessBoard";
import type { BoardConfig, MoveResult } from "@/board/engine/types";
import { getSessionId } from "@/lib/session";

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8010";

function AnalyzePageContent() {
  const searchParams = useSearchParams();
  const pageHeading = <h1 className="sr-only">Analyze</h1>;

  // Extract values to avoid complex expressions in dependencies
  const pgnParam = searchParams.get("pgn");
  const fenParam = searchParams.get("fen");
  const studyParam = searchParams.get("study");
  const gameIdParam = searchParams.get("game");
  const plyParam = searchParams.get("ply");

  // State for fetched game PGN
  const [fetchedPgn, setFetchedPgn] = useState<string | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(false);
  const [gameLoadError, setGameLoadError] = useState<string | null>(null);

  // Fetch game PGN by ID when gameIdParam is present
  useEffect(() => {
    if (!gameIdParam) {
      setFetchedPgn(null);
      setGameLoadError(null);
      return;
    }

    const fetchGamePgn = async () => {
      setIsLoadingGame(true);
      setGameLoadError(null);

      try {
        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };

        // Add session header for auth
        const sessionId = getSessionId();
        if (sessionId) {
          headers["x-session-id"] = sessionId;
        }

        const response = await fetch(`${GATEWAY_URL}/games/${gameIdParam}/pgn`, { headers });

        if (!response.ok) {
          throw new Error(`Failed to load game: ${response.status}`);
        }

        const data = await response.json();
        if (data.pgn) {
          setFetchedPgn(data.pgn);
        } else {
          throw new Error("Game PGN not found");
        }
      } catch (err) {
        console.error("[Analyze] Failed to fetch game:", err);
        setGameLoadError(err instanceof Error ? err.message : "Failed to load game");
      } finally {
        setIsLoadingGame(false);
      }
    };

    fetchGamePgn();
  }, [gameIdParam]);

  // Handle moves via config callback (for external integrations)
  const handleAnalyzeMove = useCallback((move: MoveResult) => {
    // This callback can be used by external systems to track moves
    // The ChessBoard component handles all internal logic
    console.log("[Analyze] Move made:", move.san);
  }, []);

  // Board configuration for analyze mode
  const config: Partial<BoardConfig> = useMemo(() => ({
    mode: "analyze",
    draggable: true,
    arrows: true,
    threats: true,
    highlightLastMove: true,
    highlightLegalMoves: true,
    analyze: {
      enableEngine: true,
      enableLLM: true,
    },
    onMove: handleAnalyzeMove,
  }), [handleAnalyzeMove]);

  // Determine the PGN to use: explicit param > fetched from game ID
  const effectivePgn = pgnParam || fetchedPgn;

  // Memoize props to prevent re-renders when searchParams object changes
  const chessBoardProps = useMemo(() => ({
    initialPgn: effectivePgn || undefined,
    initialFen: fenParam || undefined,
    studyId: studyParam || undefined,
    variant: 'analyze' as const,
    config,
    initialPly: plyParam ? parseInt(plyParam, 10) : undefined,
  }), [effectivePgn, fenParam, studyParam, config, plyParam]);

  // Show loading state while fetching game
  if (gameIdParam && isLoadingGame) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        {pageHeading}
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading game...</p>
        </div>
      </div>
    );
  }

  // Show error state if game fetch failed
  if (gameIdParam && gameLoadError) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        {pageHeading}
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to load game</p>
          <p className="text-muted-foreground text-sm">{gameLoadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground transition-colors duration-300">
      {pageHeading}
      <ChessBoard {...chessBoardProps} />
    </div>
  );
}

export default function AnalyzePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
      <AnalyzePageContent />
    </Suspense>
  );
}

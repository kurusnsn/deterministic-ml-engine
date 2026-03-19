"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OpeningGraph, MoveStat } from "./useOpeningGraph";

export type ImportState = {
  gamesLoaded: number;
  currentFen: string;
  moves: MoveStat[];
  results: Array<{ white?: string; black?: string; result?: string }>;
  stopImport: () => void;
  setCurrentFen: (fen: string) => void;
  ingestGames: (games: Array<{ pgn?: string; white?: { username?: string }; black?: { username?: string }; result?: string }>) => Promise<void>;
  beginImport: () => void;
  addGame: (game: { pgn?: string; white?: { username?: string }; black?: { username?: string }; result?: string }) => void;
  endImport: () => void;
  goBack: () => void;
  goForward: () => void;
  goStart: () => void;
  goEnd: () => void;
  buildAll: (games: Array<{ pgn?: string; white?: { username?: string }; black?: { username?: string }; result?: string }>) => void;
};

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function useImportStream(): ImportState {
  const graphRef = useRef(new OpeningGraph());
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false });
  const lastUpdateRef = useRef<number>(0);
  const currentFenRef = useRef<string>(START_FEN);
  const UPDATE_INTERVAL = 3; // update UI every N games
  const UPDATE_MS = 150;     // or at least every 150ms

  const [gamesLoaded, setGamesLoaded] = useState(0);
  const [currentFen, setCurrentFen] = useState(START_FEN);
  const [moves, setMoves] = useState<MoveStat[]>([]);
  const [results, setResults] = useState<Array<{ white?: string; black?: string; result?: string }>>([]);
  const [history, setHistory] = useState<string[]>([START_FEN]);
  const [histIndex, setHistIndex] = useState<number>(0);

  // Keep ref in sync with state
  useEffect(() => {
    currentFenRef.current = currentFen;
  }, [currentFen]);

  const recompute = useCallback((fen: string) => {
    const g = graphRef.current;
    setMoves(g.movesForFen(fen));
    setResults(g.gameResultsForFen(fen));
  }, []);

  const stopImport = useCallback(() => {
    abortRef.current.aborted = true;
  }, []);

  const beginImport = useCallback(() => {
    abortRef.current.aborted = false;
    graphRef.current.reset();
    setGamesLoaded(0);
    setHistory([START_FEN]);
    setHistIndex(0);
    setCurrentFen(START_FEN);
    setTimeout(() => recompute(START_FEN), 0);
  }, [recompute]);

  const addGame = useCallback((game: { pgn?: string; white?: { username?: string }; black?: { username?: string }; result?: string }) => {
    if (abortRef.current.aborted) return;
    graphRef.current.addGame(game);
    setGamesLoaded((n) => {
      const newCount = n + 1;
      // lightweight periodic recompute using the new count
      const now = Date.now();
      if (newCount % UPDATE_INTERVAL === 0 || now - lastUpdateRef.current > UPDATE_MS) {
        // Use setTimeout to avoid synchronous state updates
        setTimeout(() => recompute(currentFenRef.current), 0);
        lastUpdateRef.current = now;
      }
      return newCount;
    });
  }, [recompute]);

  const endImport = useCallback(() => {
    setTimeout(() => recompute(currentFenRef.current), 0);
  }, [recompute]);

  const ingestGames = useCallback(async (games: Array<{ pgn?: string; white?: { username?: string }; black?: { username?: string }; result?: string }>) => {
    abortRef.current.aborted = false;
    const g = graphRef.current;
    g.reset();
    setGamesLoaded(0);

    for (let i = 0; i < games.length; i++) {
      if (abortRef.current.aborted) break;
      g.addGame(games[i]);
      // Update every N games to keep UI responsive
      const now = Date.now();
      if ((i + 1) % UPDATE_INTERVAL === 0 || now - lastUpdateRef.current > UPDATE_MS || i === games.length - 1) {
        setGamesLoaded(i + 1);
        recompute(currentFenRef.current);
        lastUpdateRef.current = now;
        // Yield to UI
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    // Final recompute
    recompute(currentFenRef.current);
  }, [recompute]);

  // Build full graph synchronously (no periodic yields). Useful when user presses Stop.
  const buildAll = useCallback((games: Array<{ pgn?: string; white?: { username?: string }; black?: { username?: string }; result?: string }>) => {
    abortRef.current.aborted = false;
    const g = graphRef.current;
    g.reset();
    for (let i = 0; i < games.length; i++) {
      g.addGame(games[i]);
    }
    setGamesLoaded(games.length);
    setTimeout(() => recompute(currentFenRef.current), 0);
  }, [recompute]);

  const goBack = useCallback(() => {
    setHistIndex((i) => {
      const next = Math.max(0, i - 1);
      const fen = history[next] ?? START_FEN;
      setCurrentFen(fen);
      setTimeout(() => recompute(fen), 0);
      return next;
    });
  }, [history, recompute]);

  const goForward = useCallback(() => {
    setHistIndex((i) => {
      const next = Math.min(history.length - 1, i + 1);
      const fen = history[next] ?? history[history.length - 1];
      setCurrentFen(fen);
      setTimeout(() => recompute(fen), 0);
      return next;
    });
  }, [history, recompute]);

  const goStart = useCallback(() => {
    const fen = history[0] ?? START_FEN;
    setHistIndex(0);
    setCurrentFen(fen);
    setTimeout(() => recompute(fen), 0);
  }, [history, recompute]);

  const goEnd = useCallback(() => {
    const last = history.length - 1;
    const fen = history[last] ?? START_FEN;
    setHistIndex(last);
    setCurrentFen(fen);
    setTimeout(() => recompute(fen), 0);
  }, [history, recompute]);

  const api = useMemo<ImportState>(() => ({
    gamesLoaded,
    currentFen,
    moves,
    results,
    stopImport,
    beginImport,
    addGame,
    endImport,
    goBack,
    goForward,
    goStart,
    goEnd,
    buildAll,
    setCurrentFen: (fen: string) => {
      // If user navigated back then chooses a move, drop forward branch
      setHistory((h) => {
        const trimmed = h.slice(0, histIndex + 1);
        if (trimmed[trimmed.length - 1] !== fen) trimmed.push(fen);
        return trimmed;
      });
      setHistIndex((i) => i + 1);
      setCurrentFen(fen);
      setTimeout(() => recompute(fen), 0);
    },
    ingestGames,
  }), [gamesLoaded, currentFen, moves, results, stopImport, beginImport, addGame, endImport, goBack, goForward, goStart, goEnd, buildAll, ingestGames, recompute, histIndex]);

  return api;
}

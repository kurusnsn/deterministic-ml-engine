import { useCallback, useEffect, useState } from "react";
import { Chess } from "chess.js";
import { PvLinesPanel } from "@/components/PvLinesPanel";
import { useDebounce } from "./useDebounce";
type MoveEvalMap = Record<string, Record<string, number>>;
type PvLine = {
  score: number; // centipawns (e.g. +0.34)
  moves: string[]; // SAN moves ["Nf3", "d5", "c4", ...]
  san?: string[];
};

const GATEWAY_URL =
  (process.env.NEXT_PUBLIC_GATEWAY_URL as string) ?? "/api/gateway";

export function usePrecomputedMoveEvals(game: Chess) {
  const DEBUG = process.env.NEXT_PUBLIC_DEBUG === 'true';
  const [moveEvalMap, setMoveEvalMap] = useState<MoveEvalMap>({});
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [positionEvals, setPositionEvals] = useState<
    Record<string, MoveEvalMap>
  >({});
  const [pvLines, setPvLines] = useState<PvLine[]>([]); // Add this line
  const [pvLine, setPvLine] = useState<string[]>([]);
  const [analysisCache, setAnalysisCache] = useState<
    Record<
      string,
      {
        bestMove: string | null;
        pvLines?: PvLine[];
        pvLine: string[];
        evalScore: string | null;
        opening?: { eco?: string; name?: string; found?: boolean } | null;
      }
    >
  >({});

  const getCachedAnalysis = useCallback(
    (fen: string) => analysisCache[fen] || null,
    [analysisCache]
  );

  const cacheAnalysis = useCallback(
    (
      fen: string,
      data: {
        bestMove: string | null;
        pvLine: string[];
        evalScore: string | null;
      }
    ) => {
      setAnalysisCache((prev) => ({ ...prev, [fen]: data }));
    },
    []
  );

  const clearCache = useCallback(() => {
    setPositionEvals({});
    setAnalysisCache({});
    setMoveEvalMap({});
  }, []);

  // Debounce FEN changes to reduce API calls during rapid moves (80% reduction!)
  const currentFen = game.fen();
  const debouncedFen = useDebounce(currentFen, 300);

  // Clear overlay data IMMEDIATELY when FEN changes (before debounce)
  // This prevents stale arrows from showing after a move
  useEffect(() => {
    // Only clear if the current position doesn't have cached data
    if (!positionEvals[currentFen]) {
      setMoveEvalMap({});
      setPvLines([]);
      setPvLine([]);
    }
  }, [currentFen, positionEvals]);

  useEffect(() => {
    const fen = debouncedFen;
    const controller = new AbortController();
    if (positionEvals[fen]) {
      setMoveEvalMap(positionEvals[fen]);
      const cached = analysisCache[fen];
      if (cached && cached.pvLines) {
        setPvLines(cached.pvLines);
      } else {
        setPvLines([]);
      }
      if (cached && cached.pvLine) {
        setPvLine(cached.pvLine);
      } else {
        setPvLine([]);
      }
      return;
    }



    setMoveEvalMap({});
    setPvLines([]);
    setPvLine([]);

    const fetchEvals = async () => {
      setIsEvaluating(true);
      try {
        const response = await fetch(`${GATEWAY_URL}/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fen, depth: 8, multipv: 20 }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to fetch multi-PV analysis");
        }

        const data = await response.json();
        const resultMap: MoveEvalMap = {};
        const tempPvLines: PvLine[] = [];
        const toHumanScore = (score: number | string): number => {
          if (typeof score === "string") {
            return score.includes("mate")
              ? parseInt(score.split(" ")[1]) > 0
                ? 100
                : -100
              : 0;
          }
          const scaled = score / 10;
          return scaled;
        };

        if (data.stockfish && data.stockfish.analysis) {
          data.stockfish.analysis.forEach((result: any) => {
            const uci = result.uci;
            const score = toHumanScore(result.score);
            const from = uci.slice(0, 2);
            const to = uci.slice(2, 4);
            if (DEBUG) console.log("Stockfish result:", result);

            if (!resultMap[from]) {
              resultMap[from] = {};
            }
            resultMap[from][to] = score;
            if (result.pv_uci && Array.isArray(result.pv_uci)) {
              tempPvLines.push({
                score:
                  typeof result.score === "number" ? result.score / 100 : score,
                moves: result.pv_uci, // UCI moves for navigation
                san: result.pv || [], // SAN moves for display
              });
            }
          });
        }

        // Process evaluation score from the first result for arrows/display
        let calculatedScore: string | null = null;
        if (data.stockfish?.analysis?.[0]) {
          const firstResult = data.stockfish.analysis[0];
          if (typeof firstResult.score === "number") {
            calculatedScore = (firstResult.score / 100).toFixed(2);
          } else if (
            typeof firstResult.score === "string" &&
            firstResult.score.startsWith("mate")
          ) {
            const mateMoves = parseInt(firstResult.score.split(" ")[1], 10);
            if (!Number.isNaN(mateMoves)) {
              calculatedScore = `#${mateMoves}`;
            }
          }
        }

        // Cache the analysis data for arrows/evaluation display
        const analysisData = {
          bestMove: data.stockfish?.analysis?.[0]?.uci || null,
          pvLine: data.stockfish?.analysis?.[0]?.uci
            ? [data.stockfish.analysis[0].uci]
            : [],
          pvLines: tempPvLines,
          evalScore: calculatedScore,
          opening: data.eco
            ? { eco: data.eco.eco, name: data.eco.name, found: data.eco.found }
            : null,
        };


        cacheAnalysis(fen, analysisData);
        setPvLines(tempPvLines);
        setPvLine(analysisData.pvLine);
        if (DEBUG) console.log("Setting pvLines state:", tempPvLines);

        setPositionEvals((prev) => ({
          ...prev,
          [fen]: resultMap,
        }));
        setMoveEvalMap(resultMap);
      } catch (error: any) {
        if (error.name !== "AbortError") {
          if (DEBUG) console.error("Error fetching multi-PV analysis:", error);
          setMoveEvalMap({});
        }
      } finally {
        setIsEvaluating(false);
      }
    };

    fetchEvals();

    return () => {
      controller.abort();
    };
  }, [debouncedFen]); // Use debounced FEN instead of game.fen()

  // Derived state to avoid stale data during renders
  // We use currentFen (not debounced) to ensure immediate clearing on move
  const activeMoveEvalMap = positionEvals[currentFen] || {};
  const activePvLines = analysisCache[currentFen]?.pvLines || [];
  const activePvLine = analysisCache[currentFen]?.pvLine || [];

  return {
    moveEvalMap: activeMoveEvalMap,
    isEvaluating,
    clearCache,
    getCachedAnalysis,
    cacheAnalysis,
    pvLines: activePvLines,
    pvLine: activePvLine,
    debouncedFen
  };
}

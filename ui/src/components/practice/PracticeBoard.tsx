"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import useSound from "use-sound";
import { Lightbulb, ArrowRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { getSessionId } from "@/lib/session";

// Canvas overlay for ripples and visual effects
import { OverlayCanvas } from "@/board/overlay/OverlayCanvas";
import { useBoardStore } from "@/board/core/useBoardStore";
import { CapturedPieces } from "@/components/CapturedPieces";
import FeedbackOverlay from "@/components/FeedbackOverlay";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// REMOVED: Static import causes webpack error with onnxruntime-web in Next.js 15
// import { initMaia, getMaiaMove } from "../../../../lib/engine/maiaEngine";
// Now dynamically imported where used

type Mode = "maia" | "repertoire" | "select-openings";

export interface PracticeBoardRef {
  goToStart: () => void;
  goToPreviousMove: () => void;
  goToNextMove: () => void;
  goToEnd: () => void;
  flipBoard: () => void;
  resignGame: () => void;
  abandonGame: () => void;
  getMoveCount: () => number;
  retryMove: () => void;
  toggleHint: () => void;
}

type NormalizedMove = {
  san: string;
  from: string;
  to: string;
  promotion?: string;
};

type MaiaReason = "checkmate" | "timeout" | "stalemate" | "threefold" | "insufficient" | "draw" | "resign";

type MaiaResultState = {
  outcome: "win" | "loss" | "draw";
  reason: MaiaReason;
  winner: "w" | "b" | null;
  pgn: string;
  resultString: string;
  byCheckmate: boolean;
};

type PendingSave = {
  pgn: string;
  resultString: string;
  reason: MaiaReason;
  winner: "w" | "b" | null;
  startTime?: string | null;
  endTime: string;
  sourceId: string;
  timeControl: string;
};

type TrainingControlsState = {
  isTrainingMode: boolean;
  showRetry: boolean;
  hintsEnabled: boolean;
  canHint: boolean;
};

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "/api/gateway";

interface PracticeBoardProps {
  mode: Mode;
  active: boolean;
  onActiveChange: (v: boolean) => void;
  onStatusChange?: (s: string) => void;
  onMovesChange?: (moves: string[]) => void; // SAN move list from start
  trainingLines?: string[][]; // repertoire/select-openings lines
  repertoireSide?: "white" | "black"; // which side the repertoire is for
  openingNames?: string[]; // names of openings being practiced (matches trainingLines array)
  maiaSide?: "white" | "black";
  maiaTimeControl?: string; // e.g., "5+0", "3+2"
  maiaLevel?: number;
  maiaOpening?: { san: string[]; name: string; eco?: string } | "random";
  maiaSpeed?: "slow" | "normal" | "fast";
  maiaTemperature?: number;
  onBoardSizeChange?: (size: number) => void;
  onTimerUpdate?: (whiteTime: number, blackTime: number, turn: 'w' | 'b') => void;
  onProgressChange?: (current: number, total: number) => void;
  desktopMaxHeight?: number;
  onTrainingControlsChange?: (state: TrainingControlsState) => void;
}

const PracticeBoard = React.forwardRef<PracticeBoardRef, PracticeBoardProps>(({ mode, active, onActiveChange, onStatusChange, onMovesChange, trainingLines, repertoireSide, openingNames, maiaSide = "white", maiaTimeControl = "5+0", maiaLevel = 1500, maiaOpening, maiaSpeed = "normal", maiaTemperature = 0.8, onBoardSizeChange, onTimerUpdate, onProgressChange, desktopMaxHeight, onTrainingControlsChange }, ref) => {
  const gameRef = useRef(new Chess());
  const game = gameRef.current;
  const [fen, setFen] = useState<string>(game.fen());
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [status, setStatus] = useState<string>("Idle");
  const [toast, setToast] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState<number>(500);
  const [hintsEnabled, setHintsEnabled] = useState<boolean>(false);
  const [practiceSide, setPracticeSide] = useState<"white" | "black">("white");
  const opponentTimeoutRef = useRef<number | null>(null);
  const [redoStack, setRedoStack] = useState<any[]>([]); // Stack of moves for redo

  // New: Last move highlighting
  const [lastMoveSquares, setLastMoveSquares] = useState<{ from: Square; to: Square } | null>(null);

  // New: Game start dialog
  const [showStartDialog, setShowStartDialog] = useState<boolean>(false);

  // Feedback state
  const [feedbackType, setFeedbackType] = useState<'correct' | 'miss' | null>(null);
  const [lastMoveTarget, setLastMoveTarget] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState<boolean>(false);
  const getExpectedMovesRef = useRef<(history: string[]) => NormalizedMove[]>(() => []);

  // Legal move highlighting (dots on available squares)
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const [captureTargets, setCaptureTargets] = useState<Square[]>([]);
  const [hoveredLegalSquare, setHoveredLegalSquare] = useState<Square | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const ripples = useBoardStore((s) => s.ripples);

  // Sounds
  const [playMove] = useSound("/sounds/move-self.mp3", { volume: 0.5 });
  const [playCapture] = useSound("/sounds/capture.mp3", { volume: 0.5 });
  const [playCastle] = useSound("/sounds/castle.mp3", { volume: 0.5 });
  const [playCheck] = useSound("/sounds/move-check.mp3", { volume: 0.5 });
  const [playPromote] = useSound("/sounds/promote.mp3", { volume: 0.5 });
  const [playIllegal] = useSound("/sounds/illegal.mp3", { volume: 0.5 });
  const [playNotify] = useSound("/sounds/notify.mp3", { volume: 0.5 }); // Optional: for game over

  // Retry handler
  const handleRetryClick = useCallback(() => {
    if (showRetry) {
      game.undo(); // Undo the incorrect move
      setShowRetry(false);
      setFen(game.fen());
      setStatus("Try again!");
      setFeedbackType(null);
    }
  }, [showRetry, game]);

  const handleHintAction = useCallback(() => {
    if (!active || (mode !== "repertoire" && mode !== "select-openings")) return;
    const expectedMoves = getExpectedMovesRef.current(game.history());
    if (expectedMoves.length === 0) return;

    if (!hintsEnabled) {
      setHintsEnabled(true);
      setStatus("Hint: Move from the highlighted square");
      return;
    }

    const move = expectedMoves[0];
    setStatus(`Solution: ${move.san}`);
    setHintsEnabled(false);
  }, [active, mode, game, hintsEnabled]);

  // Sync board size and orientation with the overlay store
  useEffect(() => {
    useBoardStore.getState().setBoardSize(boardSize);
  }, [boardSize]);

  useEffect(() => {
    useBoardStore.getState().setOrientation(orientation);
  }, [orientation]);

  // Note: Legal move highlights moved to customSquareStyles to render UNDER pieces

  // Helper to play sound for a move (used for both forward and backward navigation)
  const playMoveSound = useCallback((move: { san: string; flags?: string; captured?: string | null; promotion?: string }) => {
    if (move.san.includes('+') || move.san.includes('#')) {
      playCheck();
    } else if (move.flags?.includes('k') || move.flags?.includes('q') || move.san === 'O-O' || move.san === 'O-O-O') {
      playCastle();
    } else if (move.promotion) {
      playPromote();
    } else if (move.captured) {
      playCapture();
    } else {
      playMove();
    }
  }, [playCheck, playCastle, playPromote, playCapture, playMove]);


  // Re-implementing imperative handle with correct logic
  React.useImperativeHandle(ref, () => ({
    goToStart: () => {
      const history = game.history({ verbose: true });
      if (history.length === 0) return;

      // We need to preserve the *entire* future.
      // Current redoStack contains moves *after* current position.
      // history contains moves *before* current position.
      // So new redoStack = [...history, ...redoStack]

      // We need to be careful about move format. 
      // game.history({verbose: true}) returns Move objects.
      // redoStack stores Move objects (from game.undo()).

      // However, we can't access the *current* state of redoStack inside this callback reliably if it's stale?
      // No, it's a hook, it should be fine if we include redoStack in dependency array.
      // But useImperativeHandle dependency array...

      // Let's just use the game object for undoing.
      const movesToUndo: ReturnType<typeof game.undo>[] = [];
      while (true) {
        const move = game.undo();
        if (!move) break;
        movesToUndo.unshift(move);
      }

      setRedoStack(prev => [...movesToUndo, ...prev]);
      setFen(game.fen());
      onMovesChange?.(game.history());
    },
    goToPreviousMove: () => {
      const move = game.undo();
      if (move) {
        playMoveSound(move);
        setRedoStack(prev => [move, ...prev]);
        setFen(game.fen());
        onMovesChange?.(game.history());
      }
    },
    goToNextMove: () => {
      if (redoStack.length === 0) return;
      const move = redoStack[0];
      const result = game.move(move); // move object works with game.move? Yes, usually.
      // chess.js .move() accepts string or object {from, to, promotion}.
      // The object returned by undo() has these fields.
      if (result) {
        playMoveSound(result);
        setRedoStack(prev => prev.slice(1));
        setFen(game.fen());
        onMovesChange?.(game.history());
      }
    },
    goToEnd: () => {
      if (redoStack.length === 0) return;

      // Apply all moves in redoStack
      for (const move of redoStack) {
        game.move(move);
      }
      setRedoStack([]);
      setFen(game.fen());
      onMovesChange?.(game.history());
    },
    flipBoard: () => {
      setOrientation(prev => prev === "white" ? "black" : "white");
    },
    resignGame: () => {
      if (mode === "maia" && active && !gameOverRef.current) {
        // When user resigns, Maia (opponent) wins
        // maiaSide is USER's color, so Maia is the opposite
        const maiaColor = maiaSide === "white" ? "b" : "w";
        concludeMaiaGame({ winner: maiaColor, reason: "resign" });
      }
    },
    abandonGame: () => {
      if (mode === "maia" && active && !gameOverRef.current) {
        // Abandon game without saving - only for games with no user moves
        gameOverRef.current = true;
        // Inline timeout clearing to avoid using callbacks defined later
        if (maiaMoveTimeoutRef.current !== null) {
          clearTimeout(maiaMoveTimeoutRef.current);
          maiaMoveTimeoutRef.current = null;
        }
        if (opponentTimeoutRef.current !== null) {
          clearTimeout(opponentTimeoutRef.current);
          opponentTimeoutRef.current = null;
        }
        setStatus("Game abandoned");
        // Don't set pendingSave - game won't be stored
        onActiveChange(false);
      }
    },
    getMoveCount: () => {
      return game.history().length;
    },
    retryMove: () => {
      handleRetryClick();
    },
    toggleHint: () => {
      handleHintAction();
    }
  }), [redoStack, game, onMovesChange, mode, active, maiaSide, playMoveSound, onActiveChange, handleRetryClick, handleHintAction]);

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        // Previous
        const move = game.undo();
        if (move) {
          playMoveSound(move);
          setRedoStack(prev => [move, ...prev]);
          setFen(game.fen());
          onMovesChange?.(game.history());
        }
      } else if (e.key === "ArrowRight") {
        // Next
        // We need to access the *current* redoStack.
        // Since this effect closes over redoStack, we need to be careful.
        // We can use a ref for redoStack or include it in dependency.
        // If we include it in dependency, we re-attach listener on every step. That's fine.
        if (redoStack.length > 0) {
          const move = redoStack[0];
          const result = game.move(move);
          if (result) {
            playMoveSound(result);
            setRedoStack(prev => prev.slice(1));
            setFen(game.fen());
            onMovesChange?.(game.history());
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redoStack, game, onMovesChange, playMoveSound]);

  // Progress tracking for multi-opening sessions
  const [currentLineIndex, setCurrentLineIndex] = useState<number>(0);
  const [completedLinesCount, setCompletedLinesCount] = useState<number>(0);
  const currentLineIndexRef = useRef<number>(0); // Ref to track line index immediately without waiting for re-render
  const [showCompletionModal, setShowCompletionModal] = useState<boolean>(false);
  const router = useRouter();
  const [maiaResult, setMaiaResult] = useState<MaiaResultState | null>(null);
  const [showResultModal, setShowResultModal] = useState<boolean>(false);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [savingGame, setSavingGame] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const gameOverRef = useRef<boolean>(false);
  const maiaMoveTimeoutRef = useRef<number | null>(null);
  const maiaGameStartRef = useRef<string | null>(null);
  const maiaSessionIdRef = useRef<number>(0);
  const lastActiveRef = useRef<boolean>(false);

  // Simple chess clocks (seconds)
  const parseTC = (tc: string) => {
    const [baseMinRaw, incRaw] = tc.split("+");
    const baseMin = parseInt(baseMinRaw || "0", 10);
    const incSecParsed = parseInt(incRaw || "0", 10);
    const baseSec = (isNaN(baseMin) ? 5 : baseMin) * 60; // interpret base as minutes
    const incSec = isNaN(incSecParsed) ? 0 : incSecParsed; // increment is seconds
    return { baseSec, incSec };
  };
  const { baseSec, incSec } = parseTC(maiaTimeControl);
  const [whiteTime, setWhiteTime] = useState<number>(baseSec);
  const [blackTime, setBlackTime] = useState<number>(baseSec);
  const lastTickRef = useRef<number | null>(null);

  const normalizedLines = useMemo<NormalizedMove[][]>(() => {
    if (!trainingLines || trainingLines.length === 0) return [];

    const sanitizeToken = (board: Chess, raw: string): NormalizedMove | null => {
      const attempt = (notation: string | { from: string; to: string; promotion?: string }) => {
        const result = board.move(notation as any);
        if (!result) return null;
        return {
          san: result.san,
          from: result.from,
          to: result.to,
          promotion: result.promotion || undefined,
        };
      };

      const direct = attempt(raw);
      if (direct) return direct;

      const cleaned = raw.replace(/[?!+#]/g, "");
      if (cleaned !== raw) {
        const cleanedMove = attempt(cleaned);
        if (cleanedMove) return cleanedMove;
      }

      const uci = raw.toLowerCase().replace(/[-\s]/g, "");
      if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = uci.length > 4 ? uci[4] : undefined;
        const uciMove = attempt({ from, to, promotion });
        if (uciMove) return uciMove;
      }

      return null;
    };

    return trainingLines
      .map((line, lineIdx) => {
        const board = new Chess();
        const normalized: NormalizedMove[] = [];

        for (const raw of line) {
          const token = (raw || "").trim();
          if (!token) continue;

          const move = sanitizeToken(board, token);
          if (!move) {
            console.warn("[PracticeBoard] Failed to normalize move", token, "in training line", lineIdx);
            return normalized;
          }

          normalized.push(move);
        }

        return normalized;
      })
      .filter((line) => line.length > 0);
  }, [trainingLines]);

  // maiaSide is the USER's color, not Maia's
  const userColor: "w" | "b" = maiaSide === "white" ? "w" : "b";

  const clearMaiaTimeout = useCallback(() => {
    if (maiaMoveTimeoutRef.current !== null) {
      clearTimeout(maiaMoveTimeoutRef.current);
      maiaMoveTimeoutRef.current = null;
    }
  }, []);

  const clearTrainingTimeout = useCallback(() => {
    if (opponentTimeoutRef.current !== null) {
      clearTimeout(opponentTimeoutRef.current);
      opponentTimeoutRef.current = null;
    }
  }, []);

  const concludeMaiaGame = useCallback(
    ({ winner, reason, byCheckmate = false }: { winner: "w" | "b" | null; reason: MaiaReason; byCheckmate?: boolean }) => {
      if (mode !== "maia" || gameOverRef.current) return;

      gameOverRef.current = true;
      clearMaiaTimeout();
      clearTrainingTimeout();

      const outcome: "win" | "loss" | "draw" =
        winner === null ? "draw" : winner === userColor ? "win" : "loss";

      const resultString = winner ? (winner === "w" ? "1-0" : "0-1") : "1/2-1/2";
      const endTime = new Date().toISOString();

      const reasonLabel: Record<MaiaReason, string> = {
        checkmate: "checkmate",
        timeout: "time",
        stalemate: "stalemate",
        threefold: "threefold repetition",
        insufficient: "insufficient material",
        draw: "draw",
        resign: "resignation"
      };

      game.header("Result", resultString);
      game.header("Termination", reasonLabel[reason]);
      const pgn = game.pgn();

      const statusMsg =
        outcome === "win"
          ? `You won (${reasonLabel[reason]}).`
          : outcome === "loss"
            ? `Maia wins (${reasonLabel[reason]}).`
            : `Draw (${reasonLabel[reason]}).`;

      setStatus(statusMsg);
      setMaiaResult({ outcome, reason, winner, pgn, resultString, byCheckmate });
      setStatus(statusMsg);
      setMaiaResult({ outcome, reason, winner, pgn, resultString, byCheckmate });
      setShowResultModal(true);
      playNotify();
      setPendingSave({
        pgn,
        resultString,
        reason,
        winner,
        startTime: maiaGameStartRef.current,
        endTime,
        sourceId: `maia-${Date.now()}-${maiaSessionIdRef.current}`,
        timeControl: maiaTimeControl,
      });
      onActiveChange(false);
    },
    [mode, clearMaiaTimeout, clearTrainingTimeout, userColor, game, onActiveChange, maiaTimeControl]
  );

  const evaluateMaiaGameState = useCallback((): boolean => {
    if (mode !== "maia" || !active || gameOverRef.current) return false;

    if (game.isCheckmate()) {
      const winner = game.turn() === "w" ? "b" : "w";
      concludeMaiaGame({ winner, reason: "checkmate", byCheckmate: true });
      return true;
    }

    if (game.isStalemate()) {
      concludeMaiaGame({ winner: null, reason: "stalemate" });
      return true;
    }

    if (game.isInsufficientMaterial()) {
      concludeMaiaGame({ winner: null, reason: "insufficient" });
      return true;
    }

    // Note: Threefold repetition removed - it should be claimable, not automatic
    // This prevents premature game endings when practicing with Maia

    if (game.isDraw()) {
      concludeMaiaGame({ winner: null, reason: "draw" });
      return true;
    }

    return false;
  }, [mode, active, concludeMaiaGame, game]);

  const playMaiaMove = useCallback(async () => {
    if (mode !== "maia" || !active || gameOverRef.current) return;

    try {
      // Dynamic import to avoid onnxruntime-web webpack error in Next.js 15
      const { initMaia, getMaiaMove } = await import("@/lib/engine/maiaEngine");
      await initMaia();
      const best = await getMaiaMove(game.fen(), maiaLevel, maiaTemperature);
      if (!best) return;

      const move = game.move({
        from: best.slice(0, 2),
        to: best.slice(2, 4),
        promotion: best.length > 4 ? best[4] : undefined,
      });

      setFen(game.fen());
      if (incSec > 0) {
        if (maiaSide === "white") setWhiteTime((t) => t + incSec);
        else setBlackTime((t) => t + incSec);
      }
      onMovesChange?.(game.history());

      if (!evaluateMaiaGameState()) {
        const moveLabel = move?.san || best;
        setStatus(moveLabel ? `Maia played ${moveLabel}. Your move!` : "Your move!");

        // Update last move highlighting
        if (move) {
          setLastMoveSquares({ from: move.from as Square, to: move.to as Square });
        }

        // Play sound for Maia's move
        if (move) {
          if (game.isCheckmate() || game.isCheck()) playCheck();
          else if (move.san.includes("x")) playCapture();
          else if (move.san.includes("O-O")) playCastle();
          else if (move.promotion) playPromote();
          else playMove();
        }
      }
    } catch (e) {
      console.error("Maia move failed", e);
    }
  }, [mode, active, game, maiaLevel, incSec, maiaSide, onMovesChange, evaluateMaiaGameState]);

  const scheduleMaiaMove = useCallback(
    (delay?: number) => {
      if (mode !== "maia" || !active || gameOverRef.current) return;

      clearMaiaTimeout();
      const sessionId = maiaSessionIdRef.current;

      // Use speed setting if no explicit delay provided
      const speedDelays = { slow: 2000, normal: 900, fast: 400 };
      const actualDelay = delay !== undefined ? delay : speedDelays[maiaSpeed];

      maiaMoveTimeoutRef.current = window.setTimeout(async () => {
        if (maiaSessionIdRef.current !== sessionId) return;
        await playMaiaMove();
      }, actualDelay);
    },
    [active, mode, playMaiaMove, clearMaiaTimeout, maiaSpeed]
  );

  const startMaiaGame = useCallback(async () => {
    if (mode !== "maia") return;

    maiaSessionIdRef.current += 1;
    clearTrainingTimeout();
    clearMaiaTimeout();
    game.reset();
    gameOverRef.current = false;
    setMaiaResult(null);
    setShowResultModal(false);
    setPendingSave(null);
    setSavingGame(false);
    setSaveError(null);
    setFen(game.fen());
    onMovesChange?.([]);
    setPracticeSide(maiaSide);
    setOrientation(maiaSide);
    setWhiteTime(baseSec);
    setBlackTime(baseSec);
    lastTickRef.current = null;
    const now = new Date();
    const dateTag = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
    maiaGameStartRef.current = now.toISOString();
    game.header(
      "Event",
      "Maia Practice",
      "Site",
      "practice",
      "Date",
      dateTag,
      "White",
      userColor === "w" ? "You" : "Maia",
      "Black",
      userColor === "b" ? "You" : "Maia",
      "TimeControl",
      maiaTimeControl,
      "Result",
      "*"
    );

    // Apply opening if specified
    let openingApplied = false;
    if (maiaOpening) {
      try {
        let openingSan: string[] | null = null;

        if (maiaOpening === "random") {
          // Fetch a random opening
          const res = await fetch(`${GATEWAY_URL}/eco/openings?max_moves=16`);
          if (res.ok) {
            const data = await res.json();
            const openings = Array.isArray(data.openings) ? data.openings : [];
            if (openings.length > 0) {
              const randomOpening = openings[Math.floor(Math.random() * openings.length)];
              openingSan = randomOpening.san || null;
              if (!openingSan) {
                // Fetch mainline if not in index
                const mainlineRes = await fetch(`${GATEWAY_URL}/eco/mainline`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ eco: randomOpening.eco, name: randomOpening.name }),
                });
                if (mainlineRes.ok) {
                  const mainlineData = await mainlineRes.json();
                  openingSan = Array.isArray(mainlineData.san) ? mainlineData.san : null;
                }
              }
              if (openingSan) {
                setToast(`Starting from ${randomOpening.name}`);
              }
            }
          }
        } else {
          openingSan = maiaOpening.san;
          setToast(`Starting from ${maiaOpening.name}`);
        }

        // Apply opening moves
        if (openingSan && openingSan.length > 0) {
          for (const san of openingSan) {
            const move = game.move(san);
            if (!move) break; // Stop if move fails
          }
          setFen(game.fen());
          onMovesChange?.(game.history());
          openingApplied = true;
        }
      } catch (err) {
        console.error("Failed to apply opening:", err);
      }
    }

    if (!openingApplied) {
      setToast("Game started with Maia");
    }
    setTimeout(() => setToast(null), 2000);

    // Show start dialog and auto-dismiss
    setShowStartDialog(true);
    setLastMoveSquares(null);
    setTimeout(() => setShowStartDialog(false), 1500);

    // Determine whose turn it is after opening
    const turn = game.turn();
    const isUserTurn = (userColor === "w" && turn === "w") || (userColor === "b" && turn === "b");

    if (isUserTurn) {
      setStatus("Your move!");
    } else {
      setStatus("Maia to move...");
      scheduleMaiaMove(600);
    }
  }, [mode, clearTrainingTimeout, clearMaiaTimeout, game, onMovesChange, maiaSide, baseSec, maiaTimeControl, userColor, scheduleMaiaMove, maiaOpening]);

  const handleNewMaiaGame = useCallback(() => {
    if (mode !== "maia") return;
    setShowResultModal(false);
    setMaiaResult(null);
    onActiveChange(true);
  }, [mode, onActiveChange]);

  // Status piping
  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  // Emit progress updates
  useEffect(() => {
    if (mode === "repertoire" || mode === "select-openings") {
      onProgressChange?.(Math.min(completedLinesCount, normalizedLines.length), normalizedLines.length);
    }
  }, [completedLinesCount, normalizedLines.length, mode, onProgressChange]);

  useEffect(() => {
    return () => {
      if (opponentTimeoutRef.current !== null) {
        clearTimeout(opponentTimeoutRef.current);
      }
      if (maiaMoveTimeoutRef.current !== null) {
        clearTimeout(maiaMoveTimeoutRef.current);
      }
    };
  }, []);

  // Board size calculation - match /analyze behavior
  useEffect(() => {
    const calculateBoardSize = () => {
      if (typeof window !== 'undefined') {
        const isMobile = window.innerWidth < 1024;

        if (isMobile) {
          // Mobile/Tablet: account for page padding
          const pagePadding = window.innerWidth < 768 ? 32 : 48; // p-4 (16*2) or md:p-6 (24*2)
          const size = Math.min(
            window.innerWidth - pagePadding,  // Full width minus padding
            (window.innerHeight * 2) / 3  // 2/3 of screen height
          );
          setBoardSize(size);
          onBoardSizeChange?.(size);
        } else {
          const baseDesktopHeight = desktopMaxHeight ?? (window.innerHeight - 200);
          const capturedPiecesAndSpacing = 56;
          const trainingDetailsHeight = active && (mode === "repertoire" || mode === "select-openings") ? 80 : 0;
          const availableHeight = Math.max(320, baseDesktopHeight - capturedPiecesAndSpacing - trainingDetailsHeight);
          const pageHorizontalPadding = 64; // lg:p-8 => left + right
          const layoutGap = 20; // gap-5
          const sidePanelRatio = 1 / 1.46; // panel width is boardSize / 1.46
          const availableWidth = (window.innerWidth - pageHorizontalPadding - layoutGap - 24) / (1 + sidePanelRatio);

          // Scale proportionally with minimum constraint
          const size = Math.max(
            320, // Minimum size to prevent breaking
            Math.min(1000, availableWidth, availableHeight) // Match /analyze max of 1000px
          );
          setBoardSize(size);
          onBoardSizeChange?.(size);
        }
      }
    };
    calculateBoardSize();

    window.addEventListener('resize', calculateBoardSize);
    return () => window.removeEventListener('resize', calculateBoardSize);
  }, [onBoardSizeChange, desktopMaxHeight, active, mode]);

  // Start/stop Maia games when the board is toggled active/inactive
  useEffect(() => {
    if (mode !== "maia") {
      lastActiveRef.current = active;
      return;
    }

    if (active && !lastActiveRef.current) {
      startMaiaGame();
    }

    if (!active) {
      clearMaiaTimeout();
    }

    lastActiveRef.current = active;
  }, [active, mode, startMaiaGame, clearMaiaTimeout]);

  // Reset board when mode changes
  useEffect(() => {
    // Clear any stale overlay data from previous pages (e.g., analyze page grid/arrows)
    useBoardStore.getState().clearOverlays();
    game.reset();
    setFen(game.fen());
    setStatus("Locked — configure the right panel to start");
    onMovesChange?.([]);
    setPracticeSide("white");
    setHintsEnabled(false);
    // reset clocks on mode switch
    setWhiteTime(baseSec);
    setBlackTime(baseSec);
    lastTickRef.current = null;
    gameOverRef.current = false;
    setMaiaResult(null);
    setShowResultModal(false);
    setPendingSave(null);
    setSavingGame(false);
    setSaveError(null);
    maiaGameStartRef.current = null;
    lastActiveRef.current = false;
    setSelectedSquare(null);
    setLegalMoves([]);
    setCaptureTargets([]);
    setHoveredLegalSquare(null);
    clearMaiaTimeout();
    clearTrainingTimeout();
    if (opponentTimeoutRef.current !== null) {
      clearTimeout(opponentTimeoutRef.current);
      opponentTimeoutRef.current = null;
    }
    setShowRetry(false);
    setCompletedLinesCount(0);
  }, [mode, clearMaiaTimeout, clearTrainingTimeout, onMovesChange, baseSec]);

  const getExpectedMoves = useCallback(
    (history: string[]): NormalizedMove[] => {
      if ((mode !== "repertoire" && mode !== "select-openings") || normalizedLines.length === 0) {
        return [];
      }

      const prefixLen = history.length;
      const prefixKey = history.join("|");
      const uniqueByKey = new Map<string, NormalizedMove>();

      // Use ref instead of state to get the CURRENT line index without waiting for re-render
      const activeLineIndex = currentLineIndexRef.current;

      // Only use current active opening if multiple openings exist
      const linesToCheck =
        normalizedLines.length > 1 ? [normalizedLines[activeLineIndex]] : normalizedLines;

      for (const line of linesToCheck) {
        if (line.length <= prefixLen) continue;
        const linePrefix = line.slice(0, prefixLen).map((m) => m.san).join("|");
        if (linePrefix !== prefixKey) continue;
        const move = line[prefixLen];
        const dedupeKey = `${move.from}-${move.to}-${move.promotion ?? ""}`;
        if (!uniqueByKey.has(dedupeKey)) {
          uniqueByKey.set(dedupeKey, move);
        }
      }

      return Array.from(uniqueByKey.values());
    },
    [mode, normalizedLines]
  );

  getExpectedMovesRef.current = getExpectedMoves;

  const scheduleOpponentMove = useCallback(
    (delay = 500) => {
      if ((mode !== "repertoire" && mode !== "select-openings") || normalizedLines.length === 0) {
        return;
      }

      if (opponentTimeoutRef.current !== null) {
        clearTimeout(opponentTimeoutRef.current);
        opponentTimeoutRef.current = null;
      }

      const execute = () => {
        opponentTimeoutRef.current = null;
        const history = game.history();
        const expected = getExpectedMoves(history);
        const activeLineIndex = currentLineIndexRef.current;

        if (expected.length === 0) {
          // Line completed - show completion modal
          setCompletedLinesCount(Math.min(activeLineIndex + 1, normalizedLines.length));
          setShowCompletionModal(true);

          if (activeLineIndex < normalizedLines.length - 1) {
            // More lines available - show status but don't auto-advance
            setStatus(`Opening ${activeLineIndex + 1} completed! Click "Next Opening" to continue.`);
          } else {
            setStatus("All openings complete! Great work!");
          }

          onMovesChange?.(history);
          return;
        }

        const opponentMove =
          expected.length === 1 ? expected[0] : expected[Math.floor(Math.random() * expected.length)];

        try {
          const moveInput: { from: string; to: string; promotion?: string } = {
            from: opponentMove.from,
            to: opponentMove.to,
          };
          if (opponentMove.promotion) {
            moveInput.promotion = opponentMove.promotion;
          }
          game.move(moveInput);
          setFen(game.fen());
          setStatus(`Opponent played ${opponentMove.san}. Your turn!`);
          onMovesChange?.(game.history());

          // Play sound for opponent move
          if (game.isCheckmate() || game.isCheck()) playCheck();
          else if (opponentMove.san.includes("x")) playCapture();
          else if (opponentMove.san.includes("O-O")) playCastle();
          else if (opponentMove.promotion) playPromote();
          else playMove();

          // After opponent moves, check if line is now complete
          const historyAfterMove = game.history();
          const expectedAfterMove = getExpectedMoves(historyAfterMove);

          if (expectedAfterMove.length === 0) {
            setCompletedLinesCount(Math.min(activeLineIndex + 1, normalizedLines.length));

            // Line completed
            if (activeLineIndex < normalizedLines.length - 1) {
              setStatus(`Opening ${activeLineIndex + 1} completed! Advancing...`);
              // Auto-advance after delay
              setTimeout(() => {
                const nextIndex = activeLineIndex + 1;
                setCurrentLineIndex(nextIndex);
                currentLineIndexRef.current = nextIndex;
                loadTrainingLine(nextIndex);
              }, 1000);
            } else {
              // Last line completed
              setShowCompletionModal(true);
              setStatus("All openings complete! 🎉 Great work!");
            }
          }
        } catch (error) {
          console.error("Failed to make opponent move:", error);
          setStatus("Error: could not follow training line");
        }
      };

      if (delay > 0) {
        opponentTimeoutRef.current = window.setTimeout(execute, delay);
      } else {
        execute();
      }
    },
    [mode, normalizedLines, game, getExpectedMoves, onMovesChange]
  );

  // Load a specific training line by index
  const loadTrainingLine = useCallback(
    (lineIndex: number) => {
      if (lineIndex < 0 || lineIndex >= normalizedLines.length) return;

      game.reset();
      setFen(game.fen());
      onMovesChange?.([]);
      setShowCompletionModal(false);

      const determinedSide = repertoireSide === "black" ? "black" : "white";
      setPracticeSide(determinedSide);
      setOrientation(determinedSide);

      if (determinedSide === "black") {
        setStatus("Opponent to move...");
        scheduleOpponentMove(400);
      } else {
        setStatus("Training started - make your move!");
      }

      setToast(`Opening ${lineIndex + 1} of ${normalizedLines.length}`);
      setTimeout(() => setToast(null), 2000);
    },
    [normalizedLines.length, game, repertoireSide, scheduleOpponentMove]
  );

  // On activation in repertoire/select mode, reset board, determine side, and schedule opponent replies
  useEffect(() => {
    if (mode !== "repertoire" && mode !== "select-openings") return;

    if (!active) {
      if (opponentTimeoutRef.current !== null) {
        clearTimeout(opponentTimeoutRef.current);
        opponentTimeoutRef.current = null;
      }
      return;
    }

    if (normalizedLines.length === 0) {
      setStatus("No training lines available");
      return;
    }

    // Reset progress and load first line
    setCurrentLineIndex(0);
    currentLineIndexRef.current = 0;
    setCompletedLinesCount(0);
    setShowCompletionModal(false);

    const determinedSide = repertoireSide === "black" ? "black" : "white";
    setPracticeSide(determinedSide);
    setOrientation(determinedSide);

    // Load first training line
    loadTrainingLine(0);
  }, [active, mode, normalizedLines, repertoireSide, loadTrainingLine]);

  const handlePieceDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square) => {
      if (!active) return false;
      if (mode === "maia" && gameOverRef.current) return false;

      let expectedMovesBefore: NormalizedMove[] = [];
      if ((mode === "repertoire" || mode === "select-openings") && normalizedLines.length > 0) {
        const historyBefore = game.history();
        expectedMovesBefore = getExpectedMoves(historyBefore);

        if (expectedMovesBefore.length === 0) {
          setStatus("Training line completed! Reset to start again.");
          return false;
        }
      }

      const move = game.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (!move) return false;

      // Training enforcement for repertoire/select-openings
      if (expectedMovesBefore.length && move.san) {
        const allowedSans = new Set(expectedMovesBefore.map((m) => m.san));
        if (!allowedSans.has(move.san)) {
          // Incorrect move: Allow it to stay, show Retry button
          setStatus(`Incorrect move. Expected ${Array.from(allowedSans).join(" or ")}`);
          setFen(game.fen());
          setShowRetry(true);
          playIllegal();

          // Show visual feedback
          setFeedbackType('miss');
          setLastMoveTarget(targetSquare);
          setTimeout(() => setFeedbackType(null), 2000);

          return true; // Return true to prevent snapback
        }

        // Correct move feedback
        setFeedbackType('correct');
        setLastMoveTarget(targetSquare);
        setTimeout(() => setFeedbackType(null), 1500);
      }

      setShowRetry(false);
      // Clear redo stack on new move
      setRedoStack([]);

      // Update last move highlighting for Maia mode
      if (mode === "maia") {
        setLastMoveSquares({ from: move.from as Square, to: move.to as Square });
      }

      setFen(game.fen());
      // emit SAN history
      try {
        const hist = game.history();
        onMovesChange?.(hist);
        onMovesChange?.(hist);
      } catch { }

      // Play sound for user move
      if (game.isCheckmate() || game.isCheck()) playCheck();
      else if (move.san.includes("x")) playCapture();
      else if (move.san.includes("O-O")) playCastle();
      else if (move.promotion) playPromote();
      else playMove();

      // Apply increment for user's side after move in Maia mode
      if (mode === "maia" && incSec > 0) {
        const userSide = maiaSide; // user plays maiaSide
        if (userSide === "white") setWhiteTime((t) => t + incSec);
        else setBlackTime((t) => t + incSec);
      }

      // If Maia mode, let Maia reply
      if (mode === "maia") {
        const ended = evaluateMaiaGameState();
        if (!ended) {
          setStatus("Maia thinking...");
          scheduleMaiaMove(900);
        }
      }

      // In repertoire/select-openings mode, make opponent's next move automatically
      if ((mode === "repertoire" || mode === "select-openings") && normalizedLines.length) {
        // Brief delay so users can clearly read the opponent's animated response.
        scheduleOpponentMove(420);
      }

      return true;
    },
    [active, game, mode, normalizedLines, incSec, maiaSide, getExpectedMoves, scheduleOpponentMove, evaluateMaiaGameState, scheduleMaiaMove]
  );

  // Refs to track timer values for parent component updates
  const whiteTimeRef = useRef<number>(baseSec);
  const blackTimeRef = useRef<number>(baseSec);
  const currentTurnRef = useRef<'w' | 'b'>('w');

  // Keep refs in sync with state
  useEffect(() => {
    whiteTimeRef.current = whiteTime;
  }, [whiteTime]);

  useEffect(() => {
    blackTimeRef.current = blackTime;
  }, [blackTime]);


  // Clock ticking: decrement side to move every 250ms when in Maia mode and active
  useEffect(() => {
    if (mode !== "maia" || !active || gameOverRef.current) {
      lastTickRef.current = null;
      return;
    }
    const id = setInterval(() => {
      const now = Date.now();
      const last = lastTickRef.current ?? now;
      const delta = (now - last) / 1000;
      if (gameOverRef.current) return;
      lastTickRef.current = now;
      const turn = game.turn(); // 'w' or 'b'
      currentTurnRef.current = turn;

      if (turn === 'w') {
        setWhiteTime((t) => {
          const newTime = Math.max(0, t - delta);
          whiteTimeRef.current = newTime;
          if (!gameOverRef.current && newTime <= 0) {
            concludeMaiaGame({ winner: "b", reason: "timeout" });
          }
          return newTime;
        });
      } else {
        setBlackTime((t) => {
          const newTime = Math.max(0, t - delta);
          blackTimeRef.current = newTime;
          if (!gameOverRef.current && newTime <= 0) {
            concludeMaiaGame({ winner: "w", reason: "timeout" });
          }
          return newTime;
        });
      }
    }, 250);
    return () => clearInterval(id);
  }, [mode, active, game, concludeMaiaGame]);

  // Notify parent component of timer updates (separate from setState to avoid render cycle violation)
  useEffect(() => {
    if (mode === "maia" && active && !gameOverRef.current) {
      onTimerUpdate?.(whiteTimeRef.current, blackTimeRef.current, currentTurnRef.current);
    }
  }, [whiteTime, blackTime, mode, active, onTimerUpdate]);

  // Persist Maia games to the imported games list
  useEffect(() => {
    if (!pendingSave) return;
    let cancelled = false;

    const persist = async () => {
      setSavingGame(true);
      setSaveError(null);
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        const sid = getSessionId();
        if (sid) headers["x-session-id"] = sid;

        const body = {
          provider: "maia",
          site: "Maia Practice",
          source_id: pendingSave.sourceId,
          rated: false,
          perf: "practice",
          time_control: pendingSave.timeControl,
          result: pendingSave.resultString,
          termination: pendingSave.reason,
          start_time: pendingSave.startTime ?? undefined,
          end_time: pendingSave.endTime,
          pgn: pendingSave.pgn,
          url: "/practice",
          opponent_username: `Maia ${maiaLevel}`,
        };

        const resp = await fetch(`${GATEWAY_URL}/games`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        if (!resp.ok) {
          throw new Error(`Failed to save game (${resp.status})`);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("Persist Maia game failed", err);
          setSaveError(err?.message || "Failed to save game");
        }
      } finally {
        if (!cancelled) {
          setSavingGame(false);
        }
      }
    };

    void persist();

    return () => {
      cancelled = true;
    };
  }, [pendingSave]);

  // Get hint squares for current position in repertoire/select-openings modes
  const getHintSquares = useCallback((): Record<string, { backgroundColor: string; boxShadow?: string }> => {
    if (!hintsEnabled) {
      return {};
    }

    const turn = game.turn();
    const isUserTurn =
      (practiceSide === "white" && turn === "w") ||
      (practiceSide === "black" && turn === "b");

    if (!isUserTurn) {
      return {};
    }

    const expectedMoves = getExpectedMoves(game.history());

    const styles: Record<string, { backgroundColor: string; boxShadow?: string }> = {};
    for (const move of expectedMoves) {
      styles[move.from] = {
        backgroundColor: "rgba(34, 197, 94, 0.35)",
        boxShadow: "inset 0 0 0 2px rgba(22, 163, 74, 0.6)",
      };
      styles[move.to] = {
        backgroundColor: "rgba(250, 204, 21, 0.45)",
        boxShadow: "inset 0 0 0 2px rgba(217, 119, 6, 0.6)",
      };
    }

    return styles;
  }, [hintsEnabled, getExpectedMoves, game, practiceSide]);

  const handleSquareClick = useCallback((square: Square) => {
    if (!active) return;
    if (mode === "maia" && gameOverRef.current) return;

    const piece = game.get(square);
    const isOwnPiece = piece && piece.color === game.turn();

    if (selectedSquare) {
      // A piece is already selected - try to move to clicked square
      if (isOwnPiece && square !== selectedSquare) {
        // Clicked a different own piece - reselect
        const moves = game.moves({ square, verbose: true });
        const legal = moves.map(m => m.to as Square);
        const captures = moves
          .filter((m) => Boolean(m.captured) || m.flags.includes("c") || m.flags.includes("e"))
          .map((m) => m.to as Square);
        setLegalMoves(legal);
        setCaptureTargets(captures);
        setSelectedSquare(square);
        return;
      }

      // Try to make the move
      if (legalMoves.includes(square)) {
        const result = handlePieceDrop(selectedSquare, square);
        if (result) {
          useBoardStore.getState().addRipple(square);
        }
      }

      // Clear selection
      setLegalMoves([]);
      setCaptureTargets([]);
      setHoveredLegalSquare(null);
      setSelectedSquare(null);
    } else if (isOwnPiece) {
      // No piece selected yet - select this one and show legal moves
      const moves = game.moves({ square, verbose: true });
      const legal = moves.map(m => m.to as Square);
      const captures = moves
        .filter((m) => Boolean(m.captured) || m.flags.includes("c") || m.flags.includes("e"))
        .map((m) => m.to as Square);
      setLegalMoves(legal);
      setCaptureTargets(captures);
      setSelectedSquare(square);
    }
  }, [active, mode, game, selectedSquare, legalMoves, handlePieceDrop]);

  // Combine hints with last move highlighting for Maia mode
  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = { ...getHintSquares() };

    // Add last move highlighting (yellow) for Maia mode
    if (mode === "maia" && lastMoveSquares) {
      const highlightColor = "rgba(255, 205, 50, 0.5)";
      styles[lastMoveSquares.from] = {
        ...styles[lastMoveSquares.from],
        backgroundColor: highlightColor,
      };
      styles[lastMoveSquares.to] = {
        ...styles[lastMoveSquares.to],
        backgroundColor: highlightColor,
      };
    }

    // Selected square highlight
    if (selectedSquare) {
      styles[selectedSquare] = {
        ...(styles[selectedSquare] || {}),
        backgroundColor: "rgba(255, 255, 0, 0.4)",
      };
    }

    // Legal Moves (Dots) - Rendered here to be UNDER pieces
    legalMoves.forEach((sq) => {
      const existing = styles[sq] || {};
      const isCaptureTarget = captureTargets.includes(sq);
      const isHovered = hoveredLegalSquare === sq;
      styles[sq] = {
        ...existing,
        ...(isCaptureTarget
          ? {
            boxShadow: "inset 0 0 0 4px rgba(34, 197, 94, 0.7)",
            borderRadius: "9999px",
          }
          : {
            backgroundImage: "radial-gradient(circle, rgba(0, 0, 0, 0.2) 28%, transparent 28%)",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            backgroundSize: isHovered ? "36% 36%" : "28% 28%",
            transition: "background-size 120ms ease-out",
            borderRadius: "50%",
          }),
      };
    });

    // Ripples - Rendered here to be UNDER pieces
    ripples.forEach((r) => {
      const existing = styles[r.square] || {};
      styles[r.square] = {
        ...existing,
        animation: "ripple-effect 0.6s ease-out"
      };
    });

    return styles;
  }, [getHintSquares, mode, lastMoveSquares, selectedSquare, legalMoves, captureTargets, hoveredLegalSquare, ripples]);

  useEffect(() => {
    if (!onTrainingControlsChange) return;

    const isTrainingMode = active && (mode === "repertoire" || mode === "select-openings");
    const expectedMoves = isTrainingMode ? getExpectedMoves(game.history()) : [];

    onTrainingControlsChange({
      isTrainingMode,
      showRetry: isTrainingMode && showRetry,
      hintsEnabled: isTrainingMode && hintsEnabled,
      canHint: isTrainingMode && expectedMoves.length > 0,
    });
  }, [onTrainingControlsChange, active, mode, showRetry, hintsEnabled, fen, getExpectedMoves, game]);

  return (
    <div>

      <div className="relative w-full mx-auto flex flex-col items-center gap-1" style={{ maxWidth: boardSize }}>
        <div
          className={`relative ${showRetry ? 'cursor-pointer' : ''}`}
          style={{ width: boardSize, height: boardSize }}
          onMouseDown={showRetry ? handleRetryClick : undefined}
        >
          <div className="absolute -top-8 left-0 w-full pointer-events-none z-20">
            <CapturedPieces fen={fen} orientation={orientation} side="top" />
          </div>
          <Chessboard
            position={fen}
            onPieceDrop={(source, target) => {
              const result = handlePieceDrop(source as Square, target as Square);
              if (result) {
                // Trigger ripple effect on successful drop
                useBoardStore.getState().addRipple(target as Square);
              }
              return result;
            }}
            onSquareClick={handleSquareClick}
            onPieceDragBegin={(piece, sourceSquare) => {
              // Clear click selection when starting drag
              setSelectedSquare(null);
              setHoveredLegalSquare(null);
              // Trigger ripple on drag start
              useBoardStore.getState().addRipple(sourceSquare as Square);
              // Calculate and set legal moves for dots
              const moves = game.moves({ square: sourceSquare as Square, verbose: true });
              const legal = moves.map(m => m.to as Square);
              const captures = moves
                .filter((m) => Boolean(m.captured) || m.flags.includes("c") || m.flags.includes("e"))
                .map((m) => m.to as Square);
              setLegalMoves(legal);
              setCaptureTargets(captures);
            }}
            onPieceDragEnd={() => {
              // Clear legal moves on drag end
              setLegalMoves([]);
              setCaptureTargets([]);
              setHoveredLegalSquare(null);
            }}
            onMouseOverSquare={(square) => {
              setHoveredLegalSquare(square as Square);
            }}
            onMouseOutSquare={() => {
              setHoveredLegalSquare(null);
            }}
            boardOrientation={orientation}
            boardWidth={boardSize}
            customSquareStyles={customSquareStyles}
            animationDuration={300}
          />
          <div className="absolute -bottom-8 left-0 w-full pointer-events-none z-20">
            <CapturedPieces fen={fen} orientation={orientation} side="bottom" />
          </div>
          {/* Canvas overlay for ripples and visual effects */}
          <OverlayCanvas className="absolute inset-0 pointer-events-none z-10" />

          <FeedbackOverlay
            type={feedbackType}
            targetSquare={lastMoveTarget}
            orientation={orientation}
            boardWidth={boardSize}
          />

          {/* Click to retry prompt */}
          {showRetry && !feedbackType && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
              <div className="bg-black/70 text-white px-4 py-2 rounded-full text-sm font-medium animate-pulse">
                Click anywhere to retry
              </div>
            </div>
          )}

          {/* Game Start Dialog */}
          {showStartDialog && mode === "maia" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 rounded-lg">
              <div className="bg-card rounded-xl shadow-2xl p-6 text-center animate-in fade-in zoom-in duration-200">
                <div className="text-2xl font-bold mb-2">⚔️ Game Started</div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>vs <span className="font-semibold">Maia {maiaLevel}</span></div>
                  <div className="text-xs">Time: {maiaTimeControl} • You play {maiaSide}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {toast && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded shadow">
            {toast}
          </div>
        )}

        {(mode === "repertoire" || mode === "select-openings") && active && (
          <div className="mt-3 flex flex-col items-center gap-2">
            {/* Current opening name */}
            {openingNames && openingNames[currentLineIndex] && (
              <div className="text-sm font-semibold text-foreground px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                {openingNames[currentLineIndex]}
              </div>
            )}
            {/* Progress indicator */}
            {normalizedLines.length > 1 && (
              <div className="text-xs text-muted-foreground font-medium">
                Opening {currentLineIndex + 1} of {normalizedLines.length}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Practicing as <span className="font-semibold capitalize">{practiceSide}</span>
            </div>
          </div>
        )}

        {/* Completion Modal */}
        {(mode === "repertoire" || mode === "select-openings") && (
          <Dialog open={showCompletionModal} onOpenChange={(open) => !open && setShowCompletionModal(false)}>
            <DialogContent className="max-w-md bg-card border-0 shadow-xl text-center [&>button]:hidden">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">
                  {currentLineIndex < normalizedLines.length - 1
                    ? `Opening ${currentLineIndex + 1} Completed!`
                    : "All Openings Complete!"}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  {currentLineIndex < normalizedLines.length - 1
                    ? "Great job! Ready for the next opening?"
                    : "Excellent work! You've completed all training lines."}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-3">
                {/* Analyze button */}
                <button
                  onClick={() => {
                    const currentFen = game.fen();
                    router.push(`/analyze?fen=${encodeURIComponent(currentFen)}`);
                  }}
                  className="w-full px-4 py-3 bg-neutral-900 dark:bg-white text-white dark:text-black rounded-lg flex items-center justify-center gap-2 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
                >
                  <Search className="w-4 h-4" />
                  Analyze Position
                </button>

                {/* Next opening button - only show if more openings available */}
                {currentLineIndex < normalizedLines.length - 1 && (
                  <button
                    onClick={() => {
                      const nextIndex = currentLineIndex + 1;

                      // Close modal and update line index
                      setShowCompletionModal(false);

                      // CRITICAL: Update BOTH state and ref FIRST before any other operations
                      setCurrentLineIndex(nextIndex);
                      currentLineIndexRef.current = nextIndex;

                      // Use the loadTrainingLine function which handles all the logic correctly
                      // Add a small delay to ensure modal closes smoothly
                      setTimeout(() => {
                        loadTrainingLine(nextIndex);
                      }, 100);
                    }}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-green-700 transition-colors"
                  >
                    Next Opening
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}

                {/* Close button */}
                <button
                  onClick={() => setShowCompletionModal(false)}
                  className="w-full px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
                >
                  Close
                </button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {maiaResult && mode === "maia" && (
          <Dialog open={showResultModal} onOpenChange={(open) => !open && setShowResultModal(false)}>
            <DialogContent className="max-w-md bg-card border-0 shadow-xl text-center [&>button]:hidden">
              {maiaResult.byCheckmate && (
                <img
                  src={`/svg/checkmate_${maiaResult.winner === "b" ? "black" : "white"}.svg`}
                  alt="Checkmate"
                  className="w-16 h-16 mx-auto mb-3"
                />
              )}
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">
                  {maiaResult.outcome === "win"
                    ? "Victory!"
                    : maiaResult.outcome === "loss"
                      ? (maiaResult.reason === "resign" ? "You Resigned" : "Loss")
                      : "Drawn"}
                </DialogTitle>
                <DialogDescription className="mb-4">
                  {maiaResult.reason === "checkmate"
                    ? (maiaResult.outcome === "win" ? "Checkmate delivered!" : "Checkmate.")
                    : maiaResult.reason === "timeout"
                      ? (maiaResult.outcome === "win" ? "Opponent ran out of time." : "You ran out of time.")
                      : maiaResult.reason === "resign"
                        ? (maiaResult.outcome === "win" ? "Opponent resigned." : "You resigned.")
                        : maiaResult.reason === "stalemate"
                          ? "Stalemate."
                          : maiaResult.reason === "threefold"
                            ? "Drawn by threefold repetition."
                            : maiaResult.reason === "insufficient"
                              ? "Drawn by insufficient material."
                              : "Game drawn."}
                </DialogDescription>
              </DialogHeader>
              {savingGame && (
                <div className="text-xs text-muted-foreground mb-2">Saving game to your profile…</div>
              )}
              {saveError && (
                <div className="text-xs text-red-600 mb-2" role="alert">{saveError}</div>
              )}
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setShowResultModal(false);
                    router.push(`/analyze?pgn=${encodeURIComponent(maiaResult.pgn)}`);
                  }}
                  className="w-full px-4 py-3 bg-neutral-900 dark:bg-white text-white dark:text-black rounded-lg flex items-center justify-center gap-2 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
                >
                  <Search className="w-4 h-4" />
                  Analyze
                </button>
                <button
                  onClick={() => {
                    setShowResultModal(false);
                    router.push(`/game-review?pgn=${encodeURIComponent(maiaResult.pgn)}`);
                  }}
                  className="w-full px-4 py-3 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-lg flex items-center justify-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  <Lightbulb className="w-4 h-4" />
                  Review
                </button>
                <button
                  onClick={handleNewMaiaGame}
                  className="w-full px-4 py-3 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-lg flex items-center justify-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  New Game
                </button>
                <button
                  onClick={() => setShowResultModal(false)}
                  className="w-full px-4 py-2 text-neutral-500 dark:text-neutral-400 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  Close
                </button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
});

PracticeBoard.displayName = "PracticeBoard";
export default PracticeBoard;

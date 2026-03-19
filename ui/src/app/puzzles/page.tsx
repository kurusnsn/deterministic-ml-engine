"use client";

// Force dynamic rendering for pages using useSearchParams
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Chess, Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, X, CheckCircle2, XCircle, Lightbulb, RotateCcw, Play, Check, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import {
  getNextPuzzle,
  getUserRating,
  submitPuzzleResult,
  getPuzzleById,
  type PuzzleMode,
  type PuzzleResponse,
  type PuzzleSubmitResponse,
  type PuzzleUserResponse,
} from "@/lib/api/puzzle";
import { usePuzzleController } from "@/hooks/usePuzzleController";
import { useSavedRepertoires } from "@/hooks/useRepertoires";
import { getSavedPuzzles, SavedPuzzle } from "@/lib/api/repertoire";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import useSound from "use-sound";
import { useChessDrawing } from "@/app/hooks/useChessDrawing";
import PuzzleProgressBar from "@/components/PuzzleProgressBar";
import FeedbackOverlay from "@/components/FeedbackOverlay";
import { CapturedPieces } from "@/components/CapturedPieces";
import confetti from "canvas-confetti";
import { useSession } from "next-auth/react";

// Canvas overlay for ripples and visual effects
import { OverlayCanvas } from "@/board/overlay/OverlayCanvas";
import { useBoardStore } from "@/board/core/useBoardStore";

type Mode = "random" | "theme" | "repertoire" | "saved";

// const ECOS_PLACEHOLDER = "B90,D37";

// Common Lichess puzzle themes organized by category
const PUZZLE_THEMES = {
  "Tactics": [
    "fork", "pin", "skewer", "discoveredAttack", "doubleCheck",
    "deflection", "decoy", "interference", "attraction", "clearance",
    "sacrifice", "xRayAttack", "zugzwang", "trappedPiece", "hangingPiece"
  ],
  "Mating Patterns": [
    "mate", "mateIn1", "mateIn2", "mateIn3", "mateIn4", "mateIn5",
    "backRankMate", "smotheredMate", "hookMate", "anastasiasMate",
    "arabianMate", "bodensMate", "doubleBishopMate", "dovetailMate"
  ],
  "Game Phase": [
    "opening", "middlegame", "endgame", "rookEndgame", "bishopEndgame",
    "pawnEndgame", "knightEndgame", "queenEndgame", "queenRookEndgame"
  ],
  "Other": [
    "advantage", "crushing", "defensiveMove", "equality", "exposedKing",
    "kingsideAttack", "queensideAttack", "quietMove", "underPromotion",
    "enPassant", "castling", "promotion", "capturingDefender"
  ]
};

/**
 * Convert camelCase theme name to human-readable Title Case.
 * e.g., "discoveredAttack" → "Discovered Attack"
 */
function formatThemeName(theme: string): string {
  return theme
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // Split on camelCase boundaries
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')  // Add space before numbers
    .replace(/^./, str => str.toUpperCase());  // Capitalize first letter
}

// function parseFilter(input: string): string[] {
//   return input
//     .split(",")
//     .map((value) => value.trim())
//     .filter(Boolean);
// }

interface RatingProps {
  rating: number | null;
  delta: number | null;
}

function PuzzleRatingDisplay({ rating, delta }: RatingProps) {
  if (rating === null) {
    return (
      <div className="text-sm text-muted-foreground">
        Puzzle Rating: <span className="font-medium">— (Unrated)</span>
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-2 text-sm text-muted-foreground">
      <span>
        Puzzle Rating: <span className="font-semibold text-foreground">{rating}</span>
      </span>
      {delta !== null && (
        <span
          key={delta}
          className={`font-semibold ${delta >= 0 ? "text-green-500" : "text-red-500"} animate-fade-slide`}
        >
          {delta >= 0 ? `+${delta}` : delta}
        </span>
      )}
    </div>
  );
}

function PuzzlesPageContent() {
  const { data: authSession } = useSession();
  const [mode, setMode] = useState<Mode>("random");
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [puzzle, setPuzzle] = useState<PuzzleResponse | null>(null);
  const [boardFen, setBoardFen] = useState("start");
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [, setMessage] = useState("Pick a mode and start training puzzles.");
  const [loading, setLoading] = useState(false);
  const [solutionIndex, setSolutionIndex] = useState(1); // Start at 1, since moves[0] is already played
  const [submitted, setSubmitted] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<PuzzleUserResponse | null>(null);
  const [attemptStart, setAttemptStart] = useState(Date.now());
  const [showHint, setShowHint] = useState(false);
  const [hintSquare, setHintSquare] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState(500);
  const [desktopLayoutHeight, setDesktopLayoutHeight] = useState(0);
  const [hintClickCount, setHintClickCount] = useState(0);
  const [pointsDeducted, setPointsDeducted] = useState(0);
  const [feedbackType, setFeedbackType] = useState<'correct' | 'miss' | 'checkmate-white' | 'checkmate-black' | null>(null);
  const [lastMoveTarget, setLastMoveTarget] = useState<string | null>(null);
  const [, setShowConfetti] = useState(false);
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [userMoveCount, setUserMoveCount] = useState(0); // Track only user's move count
  const [totalUserMoves, setTotalUserMoves] = useState(0); // Total moves user needs to make
  const layoutRef = useRef<HTMLDivElement>(null);
  const boardContainerRef = useRef<HTMLDivElement>(null); // Ref for board container to position confetti
  const [redoStack, setRedoStack] = useState<string[]>([]); // Stack for redo moves
  const [hasFailed, setHasFailed] = useState(false); // Track if user made a wrong move
  const [isOpponentAutoMoving, setIsOpponentAutoMoving] = useState(false);
  const opponentMoveTimeoutRef = useRef<number | null>(null);

  // Prefetching state for instant puzzle transitions
  const prefetchedPuzzleRef = useRef<PuzzleResponse | null>(null);
  const isPrefetchingRef = useRef(false);
  const prefetchPromiseRef = useRef<Promise<PuzzleResponse | null> | null>(null);
  const prefetchVersionRef = useRef(0);

  // Repertoire state
  const { data: repertoires } = useSavedRepertoires();
  const [selectedRepertoireIds, setSelectedRepertoireIds] = useState<string[]>([]);
  const [selectedOpenings, setSelectedOpenings] = useState<string[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showNoPuzzleDialog, setShowNoPuzzleDialog] = useState(false);

  // Saved puzzles mode state
  const [savedPuzzlesList, setSavedPuzzlesList] = useState<SavedPuzzle[]>([]);
  const [savedPuzzlesIndex, setSavedPuzzlesIndex] = useState(0);
  const [savedPuzzlesLoaded, setSavedPuzzlesLoaded] = useState(false);

  // URL search params for loading a specific puzzle
  const searchParams = useSearchParams();
  const initialPuzzleIdRef = useRef<string | null>(searchParams.get("puzzle"));
  const initialModeRef = useRef<string | null>(searchParams.get("mode"));
  const hasLoadedInitialPuzzleRef = useRef(false);

  // Derived list of all available openings based on selected repertoires
  const availableOpenings = useMemo(() => {
    if (!repertoires) return [];

    // Filter repertoires if any are selected, otherwise use all
    const activeRepertoires = selectedRepertoireIds.length > 0
      ? repertoires.filter(r => selectedRepertoireIds.includes(r.id))
      : repertoires;

    const map = new Map<string, { eco: string; name: string }>();
    activeRepertoires.forEach((rep) => {
      rep.openings.forEach((op) => {
        if (!map.has(op.eco)) {
          map.set(op.eco, { eco: op.eco, name: op.name });
        }
      });
      // Also add ECO codes from the list if not in openings (legacy support)
      rep.eco_codes.forEach((eco) => {
        if (!map.has(eco)) {
          map.set(eco, { eco, name: `${eco} Opening` });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => a.eco.localeCompare(b.eco));
  }, [repertoires, selectedRepertoireIds]);

  const game = useMemo(() => new Chess(), []);

  // Legal move highlighting (dots on available squares)
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const [captureTargets, setCaptureTargets] = useState<Square[]>([]);
  const [hoveredLegalSquare, setHoveredLegalSquare] = useState<Square | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  // Sound effects (defined early so they can be used in handlers)
  const [playMove] = useSound("/sounds/move-self.mp3", { volume: 0.5 });
  const [playCapture] = useSound("/sounds/capture.mp3", { volume: 0.5 });
  const [playCastle] = useSound("/sounds/castle.mp3", { volume: 0.5 });
  const [playCheck] = useSound("/sounds/move-check.mp3", { volume: 0.5 });
  const [playPromote] = useSound("/sounds/promote.mp3", { volume: 0.5 });
  const [playIllegal] = useSound("/sounds/illegal.mp3", { volume: 0.5 });

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

  const handleBack = useCallback(() => {
    const move = game.undo();
    if (move) {
      playMoveSound(move);
      setRedoStack(prev => [...prev, move.san]);
      setBoardFen(game.fen());
      setFeedbackType(null);
    }
  }, [game, playMoveSound]);

  const handleForward = useCallback(() => {
    const moveSan = redoStack[redoStack.length - 1];
    if (moveSan) {
      try {
        const move = game.move(moveSan);
        if (move) {
          playMoveSound(move);
          setRedoStack(prev => prev.slice(0, -1));
          setBoardFen(game.fen());
        }
      } catch (e) {
        console.error("Redo failed", e);
      }
    }
  }, [game, redoStack, playMoveSound]);

  // Sync board size and orientation with the overlay store
  useEffect(() => {
    useBoardStore.getState().setBoardSize(boardSize);
  }, [boardSize]);

  // Clear any stale overlay data from previous pages (e.g., analyze page grid/arrows)
  useEffect(() => {
    useBoardStore.getState().clearOverlays();
  }, []);

  useEffect(() => {
    useBoardStore.getState().setOrientation(orientation);
  }, [orientation]);

  // Drawing functionality
  const drawing = useChessDrawing(orientation);

  // Board size calculation - match /practice behavior
  useEffect(() => {
    const calculateBoardSize = () => {
      if (typeof window !== 'undefined') {
        const isMobile = window.innerWidth < 1024;

        if (isMobile) {
          // Mobile/Tablet: account for page padding
          const pagePadding = window.innerWidth < 768 ? 32 : 48;
          const size = Math.min(
            window.innerWidth - pagePadding,
            (window.innerHeight * 2) / 3
          );
          setBoardSize(size);
        } else {
          const baseDesktopHeight = desktopLayoutHeight > 0 ? desktopLayoutHeight : window.innerHeight - 200;
          const progressBarHeight = puzzle ? 48 : 0;
          const capturedPiecesAndSpacing = 56;
          const availableHeight = Math.max(320, baseDesktopHeight - progressBarHeight - capturedPiecesAndSpacing);
          const pageHorizontalPadding = 64; // lg:p-8 => left + right
          const layoutGap = 20; // gap-5
          const sidePanelRatio = 1 / 1.46; // panel width is boardSize / 1.46
          const availableWidth = (window.innerWidth - pageHorizontalPadding - layoutGap - 24) / (1 + sidePanelRatio);

          const size = Math.max(
            320,
            Math.min(1000, availableWidth, availableHeight)
          );
          setBoardSize(size);
        }
      }
    };
    calculateBoardSize();

    window.addEventListener('resize', calculateBoardSize);
    return () => window.removeEventListener('resize', calculateBoardSize);
  }, [desktopLayoutHeight, puzzle]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Use NextAuth session user ID if available, otherwise fall back to localStorage
    const authUserId = authSession?.user?.id || null;

    if (authUserId) {
      window.localStorage.setItem("puzzle-user-id", authUserId);
      setUserId(authUserId);
      return;
    }

    const stored = window.localStorage.getItem("puzzle-user-id");
    if (stored) {
      setUserId(stored);
      return;
    }

    const generated = crypto.randomUUID();
    window.localStorage.setItem("puzzle-user-id", generated);
    setUserId(generated);
  }, [authSession?.user?.id]);

  const resetBoardFromPuzzle = useCallback(
    (p: PuzzleResponse) => {
      console.log("Loading puzzle FEN:", p.fen);
      console.log("Puzzle moves:", p.moves);
      try {
        game.load(p.fen);

        // Play the first move (opponent's blunder) to set up the puzzle
        if (p.moves && p.moves.length > 0) {
          const firstMove = p.moves[0];
          console.log("Playing opponent's blunder (move[0]):", firstMove);

          let move;

          // Detect if move is in UCI format (e.g., "e2e4", "e7e8q") or SAN format (e.g., "Qxg5", "e4", "O-O")
          // UCI format: 4-5 characters, first 2 and chars 3-4 are valid squares (a-h)(1-8)
          const isUCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(firstMove);

          if (isUCI) {
            // UCI format: extract from/to squares
            const from = firstMove.slice(0, 2);
            const to = firstMove.slice(2, 4);
            const promotion = firstMove.length > 4 ? firstMove[4].toLowerCase() : undefined;

            const moveObj: { from: string; to: string; promotion?: string } = { from, to };
            if (promotion) moveObj.promotion = promotion;

            console.log("UCI move detected:", moveObj);
            move = game.move(moveObj);
          } else {
            // SAN format: use directly with sloppy mode for flexibility
            console.log("SAN move detected:", firstMove);
            move = game.move(firstMove, { sloppy: true } as any);
          }

          if (!move) {
            throw new Error(`Invalid move: ${JSON.stringify(firstMove)}`);
          } else {
            console.log("Opponent's move played:", move.san);
          }
        }

        const newFen = game.fen();
        console.log("Puzzle position ready. FEN:", newFen);

        // Now it's the user's turn to find the winning move
        const newOrientation = game.turn() === "w" ? "white" : "black";
        console.log("User plays as:", newOrientation);
        setOrientation(newOrientation);
        setBoardFen(newFen);

        // Calculate total user moves (user makes every other move starting from index 1)
        const userMovesTotal = Math.ceil((p.moves.length - 1) / 2);
        setTotalUserMoves(userMovesTotal);
        setUserMoveCount(0);
        setLegalMoves([]);
        setCaptureTargets([]);
        setHoveredLegalSquare(null);
        setSelectedSquare(null);
        setIsOpponentAutoMoving(false);
        setRedoStack([]); // Clear redo stack
        console.log(`User needs to make ${userMovesTotal} moves out of ${p.moves.length} total`);
      } catch (error) {
        console.error("Failed to load puzzle:", error);
        setMessage("Unable to load puzzle position.");
        setBoardFen("start");
      }
    },
    [game]
  );

  const applyPuzzleState = useCallback((next: PuzzleResponse) => {
    setPuzzle(next);
    setSolutionIndex(1);
    resetBoardFromPuzzle(next);
    setAttemptStart(Date.now());
    setMessage("Your turn. Find the best move.");
  }, [resetBoardFromPuzzle]);

  const fetchUserStats = useCallback(async (uid: string) => {
    try {
      const stats = await getUserRating(uid);
      setUserStats(stats);
    } catch (error) {
      console.warn("Failed to fetch puzzle stats", error);
    }
  }, []);

  useEffect(() => {
    if (userId) {
      fetchUserStats(userId);
    }
  }, [fetchUserStats, userId]);

  // Set mode from URL params if provided (e.g., /puzzles?mode=saved)
  useEffect(() => {
    const urlMode = initialModeRef.current;
    if (urlMode === "saved") {
      setMode("saved");
    }
  }, []);

  // Load saved puzzles when mode changes to "saved"
  useEffect(() => {
    const loadSavedPuzzlesForMode = async () => {
      if (mode !== "saved" || savedPuzzlesLoaded) return;

      try {
        console.log("[Saved Puzzles] Loading saved puzzles for training...");
        const response = await getSavedPuzzles(100, 0);
        if (response.puzzles.length > 0) {
          setSavedPuzzlesList(response.puzzles);
          setSavedPuzzlesIndex(0);
          setSavedPuzzlesLoaded(true);
          console.log(`[Saved Puzzles] Loaded ${response.puzzles.length} puzzles`);
        } else {
          setMessage("No saved puzzles found. Save some puzzles from your repertoire reports first!");
        }
      } catch (error) {
        console.error("[Saved Puzzles] Failed to load:", error);
        setMessage("Failed to load saved puzzles.");
      }
    };

    loadSavedPuzzlesForMode();
  }, [mode, savedPuzzlesLoaded]);

  // Reset saved puzzles state when mode changes away from "saved"
  useEffect(() => {
    if (mode !== "saved") {
      setSavedPuzzlesLoaded(false);
      setSavedPuzzlesList([]);
      setSavedPuzzlesIndex(0);
    }
  }, [mode]);

  // Load puzzle from URL params if provided (e.g., /puzzles?puzzle=xxx)
  useEffect(() => {
    const loadInitialPuzzle = async () => {
      const puzzleId = initialPuzzleIdRef.current;
      if (!puzzleId || hasLoadedInitialPuzzleRef.current) return;

      hasLoadedInitialPuzzleRef.current = true;
      setLoading(true);
      setMessage("Loading puzzle...");

      try {
        console.log("[Puzzle] Loading puzzle from URL param:", puzzleId);
        const puzzleData = await getPuzzleById(puzzleId);
        console.log("[Puzzle] Loaded puzzle:", puzzleData.id);
        setPuzzle(puzzleData);
        setSolutionIndex(1);
        resetBoardFromPuzzle(puzzleData);
        setAttemptStart(Date.now());
        setMessage("Your turn. Find the best move.");
      } catch (error) {
        console.error("[Puzzle] Failed to load puzzle from URL:", error);
        setMessage("Could not load puzzle. Try fetching a new one.");
      } finally {
        setLoading(false);
      }
    };

    loadInitialPuzzle();
  }, [resetBoardFromPuzzle]);

  // Build filters based on current mode settings
  const buildFilters = useCallback(() => {
    const filters: Partial<{ themes: string[]; ecos: string[]; user_id: string }> = {};

    if (userId) {
      filters.user_id = userId;
    }

    if (mode === "theme") {
      if (selectedThemes.length === 0) {
        return null; // Invalid config
      }
      filters.themes = selectedThemes;
    }

    if (mode === "repertoire") {
      let list: string[] = [];

      if (selectedOpenings.length > 0) {
        list = selectedOpenings;
      } else {
        list = availableOpenings.map(op => op.eco);
      }

      if (list.length === 0) {
        return null; // Invalid config
      }
      filters.ecos = list;
    }

    return filters;
  }, [userId, mode, selectedThemes, selectedOpenings, availableOpenings]);

  // Prefetch the next puzzle in the background
  const prefetchNextPuzzle = useCallback(async () => {
    if (mode === "saved") return;

    // Don't prefetch if already prefetching or we have one ready
    if (isPrefetchingRef.current || prefetchedPuzzleRef.current || prefetchPromiseRef.current) {
      return;
    }

    const filters = buildFilters();
    if (!filters) return;

    isPrefetchingRef.current = true;
    const requestVersion = prefetchVersionRef.current;
    let activePrefetchPromise: Promise<PuzzleResponse | null> | null = null;
    activePrefetchPromise = (async () => {
      try {
        const ratingToUse = userStats?.rating ?? 1500;
        console.log("[Prefetch] Fetching next puzzle in background...");
        const next = await getNextPuzzle(mode as PuzzleMode, ratingToUse, filters);

        // Ignore stale prefetch responses after mode/filter changes.
        if (prefetchVersionRef.current !== requestVersion) {
          return null;
        }

        prefetchedPuzzleRef.current = next;
        console.log("[Prefetch] Ready:", next.id);
        return next;
      } catch (error) {
        console.warn("[Prefetch] Failed:", error);
        if (prefetchVersionRef.current === requestVersion) {
          prefetchedPuzzleRef.current = null;
        }
        return null;
      } finally {
        isPrefetchingRef.current = false;
        if (prefetchPromiseRef.current === activePrefetchPromise) {
          prefetchPromiseRef.current = null;
        }
      }
    })();

    prefetchPromiseRef.current = activePrefetchPromise;
    await activePrefetchPromise;
  }, [buildFilters, mode, userStats?.rating]);

  const clearOpponentAutoplay = useCallback(() => {
    if (opponentMoveTimeoutRef.current !== null) {
      window.clearTimeout(opponentMoveTimeoutRef.current);
      opponentMoveTimeoutRef.current = null;
    }
    setIsOpponentAutoMoving(false);
  }, []);

  const fetchPuzzle = useCallback(async () => {
    console.log("[fetchPuzzle] Called with mode:", mode, "savedPuzzlesList length:", savedPuzzlesList.length);
    clearOpponentAutoplay();

    // Handle "saved" mode separately
    if (mode === "saved") {
      if (savedPuzzlesList.length === 0) {
        console.log("[Saved Puzzles] No saved puzzles in list");
        setMessage("No saved puzzles available. Save some puzzles from your repertoire reports first!");
        return;
      }

      // Reset UI state
      setSubmitted(false);
      setShowHint(false);
      setHintSquare(null);
      setHintClickCount(0);
      setPointsDeducted(0);
      setHasFailed(false);
      setRedoStack([]);
      drawing.clearDrawings();

      // Get the next saved puzzle (cycling through the list)
      const savedPuzzle = savedPuzzlesList[savedPuzzlesIndex];
      console.log(`[Saved Puzzles] Loading puzzle ${savedPuzzlesIndex + 1}/${savedPuzzlesList.length}:`, savedPuzzle);

      setLoading(true);
      setMessage("Loading saved puzzle...");

      try {
        let puzzleData: PuzzleResponse;

        // Check if this is a custom generated puzzle (starts with pz_) or a Lichess puzzle
        if (savedPuzzle.puzzle_id.startsWith("pz_")) {
          // Custom puzzle from repertoire report - use saved data directly
          // The saved puzzle has: fen (position after blunder), best_move (correct response), mistake_move (the blunder)
          // We construct a minimal puzzle: moves = [mistake_move, best_move]
          // The FEN is the position BEFORE the mistake, so we play mistake_move then best_move
          console.log("[Saved Puzzles] Using custom puzzle data directly");
          puzzleData = {
            id: savedPuzzle.puzzle_id,
            fen: savedPuzzle.fen,
            // For custom puzzles: mistake_move sets up the puzzle, best_move is the solution
            moves: savedPuzzle.mistake_move
              ? [savedPuzzle.mistake_move, savedPuzzle.best_move]
              : [savedPuzzle.best_move], // Single move puzzle if no mistake_move
            themes: savedPuzzle.theme || [],
            eco: savedPuzzle.eco,
          };
        } else {
          // Lichess puzzle - fetch from API
          console.log(`[Saved Puzzles] Fetching Lichess puzzle from API: ${savedPuzzle.puzzle_id}`);
          puzzleData = await getPuzzleById(savedPuzzle.puzzle_id);
        }

        console.log("[Saved Puzzles] Puzzle data:", puzzleData);
        setPuzzle(puzzleData);
        setSolutionIndex(1);
        resetBoardFromPuzzle(puzzleData);
        setAttemptStart(Date.now());
        setMessage(`Puzzle ${savedPuzzlesIndex + 1} of ${savedPuzzlesList.length}. Your turn!`);

        // Advance to next puzzle for next time
        setSavedPuzzlesIndex((prev) => (prev + 1) % savedPuzzlesList.length);
      } catch (error) {
        console.error("[Saved Puzzles] Failed to load puzzle:", error);
        setMessage(`Failed to load puzzle: ${(error as Error).message}`);
        // Skip to next puzzle
        setSavedPuzzlesIndex((prev) => (prev + 1) % savedPuzzlesList.length);
      } finally {
        setLoading(false);
      }
      return;
    }

    const filters = buildFilters();

    if (!filters) {
      if (mode === "theme") {
        setMessage("Select at least one theme to continue.");
      } else if (mode === "repertoire") {
        setMessage("No openings found in your selected repertoire(s).");
      }
      return;
    }

    // Reset UI state
    setSubmitted(false);
    setShowHint(false);
    setHintSquare(null);
    setHintClickCount(0);
    setPointsDeducted(0);
    setHasFailed(false);
    setRedoStack([]);
    drawing.clearDrawings();

    // Check if we have a prefetched puzzle ready
    let prefetched = prefetchedPuzzleRef.current;
    if (!prefetched && prefetchPromiseRef.current) {
      console.log("[Puzzle] Waiting for in-flight prefetch...");
      setLoading(true);
      setMessage("Loading puzzle...");
      await prefetchPromiseRef.current.catch(() => null);
      prefetched = prefetchedPuzzleRef.current;
    }

    if (prefetched) {
      console.log("[Puzzle] Using prefetched puzzle:", prefetched.id);
      prefetchedPuzzleRef.current = null; // Consume prefetched puzzle
      applyPuzzleState(prefetched);
      setLoading(false);

      // Start prefetching the next one immediately
      prefetchNextPuzzle();
      return;
    }

    // No prefetched puzzle available, fetch synchronously
    setLoading(true);
    setMessage("Fetching puzzle...");

    try {
      const ratingToUse = userStats?.rating ?? 1500;

      console.log("[Puzzle] Fetching new puzzle (no prefetch available)");
      const next = await getNextPuzzle(mode as PuzzleMode, ratingToUse, filters);
      console.log("[Puzzle] Received:", next.id);
      applyPuzzleState(next);

      // Start prefetching the next one
      prefetchNextPuzzle();
    } catch (error) {
      console.error(error);
      const errMsg = (error as Error).message || "Unable to fetch puzzle.";
      setMessage(errMsg);

      if (errMsg.includes("No puzzle found") || errMsg.includes("404")) {
        setShowNoPuzzleDialog(true);
      }
    } finally {
      setLoading(false);
    }
  }, [buildFilters, mode, applyPuzzleState, userStats?.rating, prefetchNextPuzzle, drawing, savedPuzzlesList, savedPuzzlesIndex, clearOpponentAutoplay]);

  const {
    state: controllerState,
    rating: displayedRating,
    delta,
    markSolved,
    applyServerResult,
    // nextPuzzle,
  } = usePuzzleController({ puzzle, userRating: userStats?.rating ?? null, onNext: fetchPuzzle });

  // Clear prefetched puzzle when mode or filter settings change
  useEffect(() => {
    console.log("[Prefetch] Mode/settings changed, clearing prefetched puzzle");
    prefetchVersionRef.current += 1;
    prefetchedPuzzleRef.current = null;
    prefetchPromiseRef.current = null;
    isPrefetchingRef.current = false;
  }, [mode, selectedThemes, selectedOpenings, selectedRepertoireIds]);

  // Start prefetching when a puzzle is loaded
  useEffect(() => {
    if (puzzle) {
      setSubmitted(false);
      setAttemptStart(Date.now());
      setElapsedTime(0);
      prefetchNextPuzzle();
    }
  }, [puzzle?.id, prefetchNextPuzzle]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (controllerState === "playing" && !submitted) {
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [controllerState, submitted]);

  const finishAttempt = useCallback(
    async (correct: boolean) => {
      if (!puzzle || !userId || submitted) return;

      setSubmitted(true);
      const payload = {
        user_id: userId,
        puzzle_id: puzzle.id,
        correct,
        time_spent: (Date.now() - attemptStart) / 1000,
        points_deducted: pointsDeducted,
      };

      try {
        const result: PuzzleSubmitResponse = await submitPuzzleResult(payload);
        applyServerResult(result.new_rating, result.delta);
        setUserStats((prev) =>
          prev
            ? {
              ...prev,
              rating: result.new_rating,
              puzzles_done: (prev.puzzles_done ?? 0) + 1,
              streak: correct ? (prev.streak ?? 0) + 1 : 0,
            }
            : prev
        );
      } catch (error) {
        console.warn("Failed to submit puzzle result", error);
      }
    },
    [applyServerResult, attemptStart, puzzle, submitted, userId, pointsDeducted]
  );

  const getCheckmateFeedback = useCallback(() => {
    if (!game.isCheckmate()) return null;

    const winner = game.turn() === "w" ? "black" : "white";
    const loser = winner === "white" ? "b" : "w";
    const board = game.board();
    let kingSquare: string | null = null;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (piece && piece.type === "k" && piece.color === loser) {
          const file = String.fromCharCode(97 + col);
          const rank = (8 - row).toString();
          kingSquare = `${file}${rank}`;
          break;
        }
      }
      if (kingSquare) break;
    }

    return {
      type: `checkmate-${winner}` as "checkmate-white" | "checkmate-black",
      kingSquare,
    };
  }, [game]);

  const showCompletionEffects = useCallback(() => {
    const fireConfetti = () => {
      if (!boardContainerRef.current) return;
      const rect = boardContainerRef.current.getBoundingClientRect();
      const x = (rect.left + rect.width / 2) / window.innerWidth;
      const y = (rect.top + rect.height / 2) / window.innerHeight;

      confetti({
        particleCount: 50,
        spread: 70,
        origin: { x, y },
        angle: 90,
        startVelocity: 45,
        gravity: 1.2,
        ticks: 200,
        colors: ["#ff6b6b", "#4ecdc4", "#ffe66d", "#95e1d3", "#f38181", "#aa96da"],
      });
    };

    fireConfetti();
    setTimeout(fireConfetti, 5);
    setTimeout(() => setShowCompletionDialog(true), 1000);
  }, []);

  const completePuzzle = useCallback(() => {
    console.log("Puzzle solved! Marking as solved and finishing attempt.");
    setMessage("Puzzle solved! Great job.");

    const checkmateFeedback = getCheckmateFeedback();
    if (checkmateFeedback) {
      setLastMoveTarget(checkmateFeedback.kingSquare);
      setFeedbackType(checkmateFeedback.type);
    }

    markSolved();
    finishAttempt(true);
    showCompletionEffects();
  }, [finishAttempt, getCheckmateFeedback, markSolved, showCompletionEffects]);

  const scheduleOpponentAutoplay = useCallback((currentIndex: number) => {
    if (!puzzle || currentIndex >= puzzle.moves.length) return;

    clearOpponentAutoplay();
    setIsOpponentAutoMoving(true);
    setMessage("Good move! Opponent is responding...");

    opponentMoveTimeoutRef.current = window.setTimeout(() => {
      opponentMoveTimeoutRef.current = null;

      const opponentMoveSan = puzzle.moves[currentIndex];
      const move = game.move(opponentMoveSan, { sloppy: true } as any);
      if (!move) {
        setIsOpponentAutoMoving(false);
        setMessage("Couldn't apply the opponent response. Try another puzzle.");
        return;
      }

      playMoveSound(move);

      const updatedIndex = currentIndex + 1;
      setSolutionIndex(updatedIndex);
      setBoardFen(game.fen());
      setIsOpponentAutoMoving(false);

      if (updatedIndex >= puzzle.moves.length) {
        completePuzzle();
      } else {
        setMessage("Good move! Keep going.");
      }
    }, 420);
  }, [clearOpponentAutoplay, completePuzzle, game, playMoveSound, puzzle]);

  useEffect(() => {
    return () => {
      if (opponentMoveTimeoutRef.current !== null) {
        window.clearTimeout(opponentMoveTimeoutRef.current);
      }
    };
  }, []);

  const handleDrop = useCallback(
    (source: string, target: string) => {
      if (!puzzle || controllerState !== "playing" || submitted || isOpponentAutoMoving) return false;

      // Clear hint and drawings when user makes a move
      setShowHint(false);
      setHintSquare(null);
      setHintClickCount(0);
      drawing.clearDrawings();
      setSelectedSquare(null);
      setHoveredLegalSquare(null);
      setLegalMoves([]);
      setCaptureTargets([]);
      setRedoStack([]); // Clear redo stack on new move

      // Try move without promotion first
      const move = game.move({ from: source, to: target });

      if (!move) {
        return false;
      }

      // Puzzle moves are in UCI format (e.g., "e2e4")
      const expected = puzzle.moves[solutionIndex];
      const actualUci = source + target + (move.promotion || "");

      if (actualUci !== expected) {
        // DON'T undo immediately - keep piece on target square during feedback
        setBoardFen(game.fen()); // Show the incorrect move
        setMessage("Incorrect move. Try again!");
        // Deduct points for wrong move
        setPointsDeducted(prev => prev + 3);
        // Mark as failed to show retry button
        setHasFailed(true);
        // Play illegal sound and show miss feedback
        playIllegal();
        setLastMoveTarget(target);
        setFeedbackType('miss');
        // Remove feedback after delay but keep piece
        setTimeout(() => {
          setFeedbackType(null);
        }, 2000);
        return true;
      }

      // Show correct feedback
      setLastMoveTarget(target);
      setFeedbackType('correct');
      setTimeout(() => setFeedbackType(null), 1500);

      // Increment user move count
      setUserMoveCount(prev => prev + 1);

      // Play appropriate sound for correct move
      playMoveSound(move);

      const nextIndex = solutionIndex + 1;
      setSolutionIndex(nextIndex);
      setBoardFen(game.fen());

      if (nextIndex >= puzzle.moves.length) {
        completePuzzle();
        return true;
      }

      // Auto-play the opponent response
      scheduleOpponentAutoplay(nextIndex);

      return true;
    },
    [
      completePuzzle,
      controllerState,
      game,
      isOpponentAutoMoving,
      puzzle,
      playIllegal,
      playMoveSound,
      solutionIndex,
      submitted,
      drawing,
      scheduleOpponentAutoplay,
    ]
  );

  const retryPuzzle = useCallback(() => {
    if (!puzzle) return;
    resetBoardFromPuzzle(puzzle);
    setSolutionIndex(1); // Reset to 1, moves[0] was opponent's move
    setUserMoveCount(0); // Reset user move count
    setSubmitted(false);
    setShowHint(false);
    setHintSquare(null);
    setHintClickCount(0);
    setPointsDeducted(0);
    setFeedbackType(null);
    setShowConfetti(false);
    setShowCompletionDialog(false);
    setHasFailed(false); // Reset failed state
    clearOpponentAutoplay();
    setRedoStack([]); // Clear redo stack
    setAttemptStart(Date.now()); // Reset timer
    setMessage("Your turn. Find the best move.");
  }, [puzzle, resetBoardFromPuzzle, clearOpponentAutoplay]);

  // Handle clicking on the board to retry after a wrong move
  const handleBoardClick = useCallback(() => {
    if (hasFailed) {
      // Undo the wrong move
      const move = game.undo();
      if (move) {
        setBoardFen(game.fen());
      }
      setHasFailed(false);
      setFeedbackType(null);
      setHintSquare(null);
      setShowHint(false);
      setMessage("Try again! Find the best move.");
    }
  }, [hasFailed, game]);

  const handleBoardMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      drawing.handleMouseDown(event);
      handleBoardClick();
    },
    [drawing, handleBoardClick]
  );

  const handleSquareClick = useCallback((square: Square) => {
    if (!puzzle || controllerState !== "playing" || submitted || hasFailed || isOpponentAutoMoving) return;

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
        const result = handleDrop(selectedSquare, square);
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
  }, [puzzle, controllerState, submitted, hasFailed, isOpponentAutoMoving, game, selectedSquare, legalMoves, handleDrop]);

  const quitPuzzle = useCallback(() => {
    clearOpponentAutoplay();
    setPuzzle(null);
    setBoardFen("start");
    setSubmitted(false);
    setShowHint(false);
    setHintSquare(null);
    setHintClickCount(0);
    setPointsDeducted(0);
    setFeedbackType(null);
    setShowConfetti(false);
    setShowCompletionDialog(false);
    setUserMoveCount(0);
    setTotalUserMoves(0);
    setHasFailed(false);
    setSelectedSquare(null);
    setLegalMoves([]);
    setCaptureTargets([]);
    setHoveredLegalSquare(null);
    setRedoStack([]);
    drawing.clearDrawings();
    setMessage("Pick a mode and start training puzzles.");
  }, [clearOpponentAutoplay, drawing]);

  // Auto-solve for testing
  const autoSolve = useCallback(() => {
    if (!puzzle || solutionIndex >= puzzle.moves.length) return;

    const moveStr = puzzle.moves[solutionIndex];
    console.log(`Auto-solving move ${solutionIndex}: ${moveStr}`);

    // Parse UCI move
    const from = moveStr.slice(0, 2);
    const to = moveStr.slice(2, 4);
    const promotion = moveStr.length > 4 ? moveStr[4] : undefined;

    const moveObj: any = { from, to };
    if (promotion) moveObj.promotion = promotion;

    const move = game.move(moveObj);
    if (!move) {
      console.error(`Failed to make move: ${moveStr}`, moveObj);
      setMessage(`Auto-solve failed at move ${moveStr}`);
      return;
    }

    // Play appropriate sound
    if (move.flags.includes('k') || move.flags.includes('q')) {
      playCastle();
    } else if (move.san.includes('+') || move.san.includes('#')) {
      playCheck();
    } else if (move.promotion) {
      playPromote();
    } else if (move.captured) {
      playCapture();
    } else {
      playMove();
    }

    console.log(`Move successful: ${move.san}`, move);
    setBoardFen(game.fen());
    setSolutionIndex(solutionIndex + 1);

    if (solutionIndex + 1 >= puzzle.moves.length) {
      setMessage("Auto-solve complete!");
      markSolved();
      finishAttempt(true);
    } else {
      setMessage(`Auto-solving... move ${solutionIndex + 1}/${puzzle.moves.length}`);
    }
  }, [puzzle, solutionIndex, game, markSolved, finishAttempt, playCastle, playCheck, playPromote, playCapture, playMove]);

  const getHintOrSolve = useCallback(() => {
    if (!puzzle || !puzzle.moves[solutionIndex]) {
      console.log("Cannot show hint: no puzzle or no move at index", solutionIndex);
      return;
    }

    if (hasFailed) {
      const reverted = game.undo();
      if (reverted) {
        setBoardFen(game.fen());
      }
      setHasFailed(false);
      setFeedbackType(null);
      setSelectedSquare(null);
      setLegalMoves([]);
      setCaptureTargets([]);
      setHoveredLegalSquare(null);
    }

    if (hintClickCount === 0) {
      // First click: Show hint (from/to squares)
      setShowHint(true);
      setHintClickCount(1);
      setPointsDeducted(prev => prev + 5);

      const moveStr = puzzle.moves[solutionIndex];
      console.log("Showing hint for move:", moveStr, "at index:", solutionIndex);

      // Check if it's UCI format (4 or 5 chars, all lowercase, starts with file+rank)
      if (moveStr.length >= 4 && moveStr.match(/^[a-h][1-8][a-h][1-8]/)) {
        // UCI format like "e2e4"
        const fromSquare = moveStr.slice(0, 2);
        const toSquare = moveStr.slice(2, 4);
        setHintSquare(fromSquare);
        setMessage(`Hint: Move the piece on ${fromSquare.toUpperCase()} to ${toSquare.toUpperCase()} (-5 points)`);
        console.log("Hint square highlighted:", fromSquare);
      } else {
        // SAN format - just show the move notation
        setMessage(`Hint: Try ${moveStr} (-5 points)`);
        setHintSquare(null);
        console.log("Hint shown as SAN:", moveStr);
      }
    } else {
      // Second click: Auto-solve one move only
      setPointsDeducted(prev => prev + 10);
      setHintClickCount(0);
      setShowHint(false);
      setHintSquare(null);
      autoSolve();
    }
  }, [puzzle, solutionIndex, hintClickCount, autoSolve, hasFailed, game]);

  // const revealSolution = useCallback(async () => {
  //   if (!puzzle) return;

  //   // Deduct points for revealing full solution
  //   setPointsDeducted(prev => prev + 20);

  //   resetBoardFromPuzzle(puzzle);
  //   setMessage("Revealing solution... (-20 points)");

  //   // Play moves one by one with delay
  //   for (let i = 1; i < puzzle.moves.length; i++) {
  //     await new Promise(resolve => setTimeout(resolve, 800)); // 800ms delay between moves
  //     const moveUci = puzzle.moves[i];

  //     // Parse and make the move
  //     const from = moveUci.slice(0, 2);
  //     const to = moveUci.slice(2, 4);
  //     const promotion = moveUci.length > 4 ? moveUci[4] : undefined;
  //     const moveObj: any = { from, to };
  //     if (promotion) moveObj.promotion = promotion;

  //     const move = game.move(moveObj);
  //     if (move) {
  //       // Play appropriate sound
  //       if (move.flags.includes('k') || move.flags.includes('q')) {
  //         playCastle();
  //       } else if (move.san.includes('+') || move.san.includes('#')) {
  //         playCheck();
  //       } else if (move.promotion) {
  //         playPromote();
  //       } else if (move.captured) {
  //         playCapture();
  //       } else {
  //         playMove();
  //       }
  //     }

  //     setBoardFen(game.fen());
  //     setSolutionIndex(i + 1);
  //   }

  //   setSolutionIndex(puzzle.moves.length);
  //   setMessage("Solution revealed.");
  //   markFailed();
  //   finishAttempt(false);
  // }, [finishAttempt, game, markFailed, puzzle, resetBoardFromPuzzle, playCastle, playCheck, playPromote, playCapture, playMove]);

  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!mounted || !isDesktop) {
      setDesktopLayoutHeight(0);
      return;
    }

    const recalculateLayoutHeight = () => {
      if (!layoutRef.current) return;
      const availableHeight = Math.max(320, Math.floor(layoutRef.current.clientHeight));
      setDesktopLayoutHeight(availableHeight);
    };

    recalculateLayoutHeight();
    window.addEventListener('resize', recalculateLayoutHeight);
    return () => window.removeEventListener('resize', recalculateLayoutHeight);
  }, [mounted, isDesktop]);

  return (
    <div className="flex flex-col min-h-screen lg:h-[calc(100dvh-3.5rem)] p-4 md:p-6 lg:p-8 bg-background overflow-y-auto lg:overflow-hidden">
      <h1 className="sr-only">Puzzles</h1>
      <div
        ref={layoutRef}
        className="w-full mx-auto flex flex-col lg:flex-row lg:items-stretch lg:justify-center gap-5 flex-1 min-h-0"
      >
        <div className="relative w-full flex flex-col items-center lg:h-full lg:justify-center" style={{ maxWidth: boardSize }}>
          {puzzle && (
            <div className="w-full mb-2">
              <PuzzleProgressBar
                currentUserMove={userMoveCount}
                totalUserMoves={totalUserMoves}
              />
            </div>
          )}
          <div
            ref={boardContainerRef}
            className={`relative ${hasFailed ? 'cursor-pointer' : ''}`}
            style={{ width: boardSize, height: boardSize }}
            onMouseDown={handleBoardMouseDown}
            onMouseUp={drawing.handleMouseUp}
            onContextMenu={drawing.handleContextMenu}
            tabIndex={0}
            aria-label="Chessboard"
          >
            <div className="absolute -top-8 left-0 w-full pointer-events-none z-20">
              <CapturedPieces fen={boardFen} orientation={orientation} side="top" />
            </div>
            <Chessboard
              position={boardFen}
              onPieceDrop={(source, target) => {
                const result = handleDrop(source, target);
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
              animationDuration={300}
              arePiecesDraggable={!submitted && controllerState === "playing" && !hasFailed && !isOpponentAutoMoving}
              customArrows={useMemo(() => drawing.getCustomArrows([]), [drawing])}
              customSquareStyles={useMemo(() => {
                const styles: Record<string, React.CSSProperties> = {};
                // Hint square highlight
                if (showHint && hintSquare) {
                  styles[hintSquare] = {
                    backgroundColor: "rgba(255, 255, 0, 0.4)",
                    boxShadow: "inset 0 0 10px rgba(255, 255, 0, 0.6)",
                  };
                }
                // Selected square highlight
                if (selectedSquare) {
                  styles[selectedSquare] = {
                    ...(styles[selectedSquare] || {}),
                    backgroundColor: "rgba(255, 255, 0, 0.4)",
                  };
                }
                // Legal move dots
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
                return { ...styles, ...drawing.getDrawingSquareStyles() };
              }, [showHint, hintSquare, selectedSquare, legalMoves, captureTargets, hoveredLegalSquare, drawing])}
            />
            <div className="absolute -bottom-8 left-0 w-full pointer-events-none z-20">
              <CapturedPieces fen={boardFen} orientation={orientation} side="bottom" />
            </div>
            <FeedbackOverlay
              type={feedbackType}
              targetSquare={lastMoveTarget}
              orientation={orientation}
              boardWidth={boardSize}
            />
            {/* Canvas overlay for ripples and visual effects */}
            <OverlayCanvas className="absolute inset-0 pointer-events-none z-10" />

            {/* Click to retry prompt */}
            {hasFailed && !feedbackType && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
                <div className="bg-black/70 text-white px-4 py-2 rounded-full text-sm font-medium animate-pulse">
                  Click anywhere to retry
                </div>
              </div>
            )}

            {/* Custom Completion Overlay - Centered on Board */}
            {showCompletionDialog && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px] rounded-lg">
                <div className="bg-card p-6 rounded-xl shadow-2xl border w-[90%] animate-in fade-in zoom-in duration-300 flex flex-col items-center text-center">
                  <h2 className="text-xl font-bold text-foreground mb-2">Puzzle Solved!</h2>
                  <p className="text-sm text-muted-foreground mb-6">
                    Great job! You've successfully completed this puzzle.
                  </p>
                  <div className="flex gap-3 w-full">
                    <Button
                      variant="outline"
                      className="flex-1 border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 h-10"
                      onClick={() => {
                        setShowCompletionDialog(false);
                        quitPuzzle();
                      }}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Quit
                    </Button>
                    <Button
                      className="flex-1 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black h-10"
                      onClick={() => {
                        setShowCompletionDialog(false);
                        fetchPuzzle();
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Next Puzzle
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:w-auto flex flex-col" style={{
          width: mounted && isDesktop ? boardSize / 1.46 : undefined,
          height: mounted && isDesktop && desktopLayoutHeight > 0 ? desktopLayoutHeight : undefined
        }}>
          <Card className="h-full overflow-hidden flex flex-col">
            <CardHeader className="relative z-10 bg-card border-b">
              <CardTitle>Puzzle Trainer</CardTitle>
            </CardHeader>
            <div className="relative overflow-hidden flex-1 min-h-0">
              {/* Start View */}
              <div
                className={`absolute inset-0 p-6 transition-transform duration-500 ease-in-out ${puzzle ? '-translate-x-full' : 'translate-x-0'
                  }`}
              >
                <div className="space-y-5">
                  <PuzzleRatingDisplay rating={displayedRating} delta={delta} />
                  <div className="space-y-1.5">
                    <Label htmlFor="puzzle-mode" id="puzzle-mode-label" className="text-xs font-medium text-muted-foreground">
                      Mode
                    </Label>
                    <Select value={mode} onValueChange={(value) => setMode(value as Mode)}>
                      <SelectTrigger id="puzzle-mode" aria-labelledby="puzzle-mode-label">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="random">Random</SelectItem>
                        <SelectItem value="theme">Theme</SelectItem>
                        <SelectItem value="repertoire">From Repertoire</SelectItem>
                        <SelectItem value="saved">Saved Puzzles</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {mode === "theme" && (
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-muted-foreground">Themes</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="w-full justify-between">
                            <span className="truncate">
                              {selectedThemes.length === 0
                                ? "Select themes..."
                                : `${selectedThemes.length} theme${selectedThemes.length === 1 ? "" : "s"} selected`}
                            </span>
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56 max-h-64 overflow-y-auto">
                          {Object.entries(PUZZLE_THEMES).map(([category, themes]) => (
                            <div key={category}>
                              <DropdownMenuLabel>{category}</DropdownMenuLabel>
                              {themes.map((theme) => (
                                <DropdownMenuCheckboxItem
                                  key={theme}
                                  checked={selectedThemes.includes(theme)}
                                  onCheckedChange={(checked) => {
                                    setSelectedThemes((prev) =>
                                      checked
                                        ? [...prev, theme]
                                        : prev.filter((t) => t !== theme)
                                    );
                                  }}
                                  onSelect={(e) => e.preventDefault()}
                                >
                                  {formatThemeName(theme)}
                                </DropdownMenuCheckboxItem>
                              ))}
                              <DropdownMenuSeparator />
                            </div>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {selectedThemes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedThemes.map((theme) => (
                            <Badge
                              key={theme}
                              variant="secondary"
                              className="cursor-pointer hover:bg-slate-200"
                              onClick={() => setSelectedThemes((prev) => prev.filter((t) => t !== theme))}
                            >
                              {formatThemeName(theme)}
                              <X className="ml-1 h-3 w-3" />
                            </Badge>
                          ))}
                          {selectedThemes.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => setSelectedThemes([])}
                            >
                              Clear all
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {mode === "saved" && (
                    <div className="space-y-3">
                      {savedPuzzlesList.length === 0 ? (
                        <div className="text-center py-6 px-4 border border-dashed rounded-lg bg-muted">
                          <div className="text-muted-foreground text-sm font-medium mb-1">No saved puzzles</div>
                          <div className="text-muted-foreground/70 text-xs">
                            Generate repertoire reports and save puzzles to train on them here.
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 border rounded-lg bg-purple-50/50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-800">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-800 dark:text-purple-200">
                              {savedPuzzlesList.length} puzzles
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Train through your saved puzzles from repertoire reports.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {mode === "repertoire" && (
                    <div className="space-y-3">
                      {/* Empty state when no repertoires exist */}
                      {(!repertoires || repertoires.length === 0) ? (
                        <div className="text-center py-6 px-4 border rounded-lg bg-muted">
                          <div className="text-muted-foreground text-sm font-medium mb-1">No repertoires imported</div>
                          <div className="text-muted-foreground/70 text-xs">
                            Import games and create repertoires from the Games page to practice puzzles from your openings.
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Repertoire Selection Dropdown */}
                          <div className="space-y-2">
                            <Label className="text-xs font-medium text-muted-foreground">Select Repertoires</Label>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="w-full justify-between">
                                  <span className="truncate">
                                    {selectedRepertoireIds.length === 0
                                      ? "All Repertoires"
                                      : `${selectedRepertoireIds.length} repertoire${selectedRepertoireIds.length === 1 ? "" : "s"} selected`}
                                  </span>
                                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="w-56 max-h-64 overflow-y-auto">
                                {repertoires?.map((rep) => (
                                  <DropdownMenuCheckboxItem
                                    key={rep.id}
                                    checked={selectedRepertoireIds.includes(rep.id)}
                                    onCheckedChange={(checked) => {
                                      setSelectedRepertoireIds((prev) =>
                                        checked
                                          ? [...prev, rep.id]
                                          : prev.filter((id) => id !== rep.id)
                                      );
                                      // Clear opening selection when repertoire selection changes to avoid invalid states
                                      setSelectedOpenings([]);
                                    }}
                                    onSelect={(e) => e.preventDefault()}
                                  >
                                    {rep.name}
                                  </DropdownMenuCheckboxItem>
                                ))}
                                {selectedRepertoireIds.length > 0 && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <div className="p-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full h-6 text-xs justify-center"
                                        onClick={() => {
                                          setSelectedRepertoireIds([]);
                                          setSelectedOpenings([]);
                                        }}
                                      >
                                        Clear Selection
                                      </Button>
                                    </div>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {/* Opening Selection Dropdown */}
                          <div className="space-y-2">
                            <Label className="text-xs font-medium text-muted-foreground">Select Openings</Label>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="w-full justify-between">
                                  <span className="truncate">
                                    {selectedOpenings.length === 0
                                      ? "All Openings"
                                      : `${selectedOpenings.length} opening${selectedOpenings.length === 1 ? "" : "s"} selected`}
                                  </span>
                                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="w-56 max-h-64 overflow-y-auto">
                                {availableOpenings.length === 0 ? (
                                  <div className="p-2 text-xs text-muted-foreground text-center">
                                    {repertoires && repertoires.length === 0
                                      ? "No repertoires available"
                                      : "No openings found in selected repertoires"}
                                  </div>
                                ) : (
                                  availableOpenings.map((op) => (
                                    <DropdownMenuCheckboxItem
                                      key={op.eco}
                                      checked={selectedOpenings.includes(op.eco)}
                                      onCheckedChange={(checked) => {
                                        setSelectedOpenings((prev) =>
                                          checked
                                            ? [...prev, op.eco]
                                            : prev.filter((eco) => eco !== op.eco)
                                        );
                                      }}
                                      onSelect={(e) => e.preventDefault()}
                                    >
                                      <span className="font-mono mr-2 text-xs text-muted-foreground">{op.eco}</span>
                                      {op.name}
                                    </DropdownMenuCheckboxItem>
                                  ))
                                )}
                                {selectedOpenings.length > 0 && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <div className="p-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full h-6 text-xs justify-center"
                                        onClick={() => setSelectedOpenings([])}
                                      >
                                        Clear Selection
                                      </Button>
                                    </div>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <Button
                    className="w-full mt-4"
                    onClick={fetchPuzzle}
                    disabled={
                      loading ||
                      (mode === "repertoire" && (!repertoires || repertoires.length === 0)) ||
                      (mode === "saved" && savedPuzzlesList.length === 0)
                    }
                  >
                    {loading ? (
                      "Loading..."
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Start Training
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Active View */}
              <div
                className={`absolute inset-0 p-6 transition-transform duration-500 ease-in-out ${puzzle ? 'translate-x-0' : 'translate-x-full'
                  }`}
              >
                <div className="h-full flex flex-col">
                  {/* Status Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${game.turn() === 'w' ? 'bg-white border border-border' : 'bg-zinc-800'}`} />
                      <span className="font-semibold text-foreground">
                        {game.turn() === "w" ? "White to move" : "Black to move"}
                      </span>
                    </div>
                    {controllerState === "solved" && (
                      <div className="flex items-center gap-2 text-green-600 animate-in fade-in slide-in-from-right-4 duration-500">
                        <span className="font-bold">SOLVED</span>
                        <div className="bg-green-100 p-1 rounded-full">
                          <Check className="w-4 h-4" strokeWidth={3} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Timer */}
                  <div className="flex justify-center mb-6">
                    <div className="px-6 py-2 bg-muted rounded-full text-foreground font-mono text-2xl font-medium tracking-wider">
                      {Math.floor(elapsedTime / 60).toString().padStart(2, '0')}:{(elapsedTime % 60).toString().padStart(2, '0')}
                    </div>
                  </div>

                  {/* Puzzle Info */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rating</span>
                      <span className="text-foreground font-semibold">{puzzle?.rating ?? "—"}</span>
                    </div>

                    <div>
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Themes</span>
                      {puzzle?.themes?.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {puzzle.themes.map((theme, i) => (
                            <span key={i} className="inline-block px-2 py-1 bg-muted rounded text-xs text-foreground">
                              {formatThemeName(theme)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </div>

                    <div>
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">Opening</span>
                      <span className="text-foreground text-sm">
                        {puzzle?.opening ? `${puzzle.opening}${puzzle.variation ? ` – ${puzzle.variation}` : ""}` : "—"}
                      </span>
                    </div>
                  </div>

                  {puzzle && (
                    <div className="mt-auto pt-4 space-y-2">
                      <div className="flex gap-2">
                        <div className="flex gap-1 mr-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={handleBack}
                            disabled={game.history().length === 0}
                            aria-label="Previous move"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={handleForward}
                            disabled={redoStack.length === 0}
                            aria-label="Next move"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                        <Button className="flex-1" onClick={fetchPuzzle} disabled={loading}>
                          {loading ? "Loading..." : (
                            <>
                              <Play className="w-4 h-4 mr-1" />
                              New Puzzle
                            </>
                          )}
                        </Button>
                        <Button variant="outline" className="flex-1" onClick={quitPuzzle}>
                          <LogOut className="w-4 h-4 mr-1" />
                          Quit
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        {hasFailed && (
                          <Button
                            variant="outline"
                            className="flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 animate-in fade-in slide-in-from-left-2"
                            onClick={retryPuzzle}
                            disabled={loading}
                          >
                            <RotateCcw className="w-4 h-4 mr-1" />
                            Retry
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={getHintOrSolve}
                          disabled={submitted || controllerState !== "playing"}
                        >
                          <Lightbulb className="w-4 h-4 mr-1" />
                          {hintClickCount === 0 ? "Hint" : "Solve"}
                        </Button>
                      </div>
                    </div>
                  )}


                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
      <Dialog open={showNoPuzzleDialog} onOpenChange={setShowNoPuzzleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No Puzzles Found</DialogTitle>
            <DialogDescription>
              We couldn't find any more puzzles matching your selected repertoire openings at your current rating level.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoPuzzleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              setShowNoPuzzleDialog(false);
              setMode("random");
            }}>
              Continue with Random Puzzles
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div >
  );
}

export default function PuzzlesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading puzzles...</div>}>
      <PuzzlesPageContent />
    </Suspense>
  );
}

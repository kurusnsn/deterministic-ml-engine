"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import confetti from "canvas-confetti";
import ChessboardPanel from "@/components/ChessboardPanel";
import LineListPanel from "@/components/LineListPanel";
import { ForcingLine } from "@/types/openings";
import { useBoardSounds, playMoveSound } from "@/board/hooks/useBoardSounds";
import { Affordance } from "@/hooks/useNonLLMCommentaryOverlay";
import { Button } from "@/components/ui/button";
import { RotateCcw, ChevronLeft, ChevronRight, Play, Lightbulb } from "lucide-react";

interface OpeningTrainerProps {
  openingId: string;
  openingName: string;
  lines: ForcingLine[];
  orientation: "white" | "black";
  startFen?: string;
  openingMoves?: string[];
}

const DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "/api/gateway";
const UCI_MOVE_REGEX = /^[a-h][1-8][a-h][1-8][qrbn]?$/i;

export default function OpeningTrainer({ openingId, openingName, lines, orientation, startFen, openingMoves }: OpeningTrainerProps) {
  const targetFen = startFen || DEFAULT_FEN;

  const [currentLine, setCurrentLine] = useState<ForcingLine | null>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [game, setGame] = useState(() => new Chess(DEFAULT_FEN));
  const [completedLines, setCompletedLines] = useState<Record<string, boolean>>({});
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [openingMovesPlayed, setOpeningMovesPlayed] = useState(false);
  const [openingMoveIndex, setOpeningMoveIndex] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [hintSquare, setHintSquare] = useState<string | null>(null);
  const [moveResult, setMoveResult] = useState<"correct" | "incorrect" | null>(null);
  const [lastMoveType, setLastMoveType] = useState<"move" | "capture" | "castle" | "check" | "promote" | "illegal" | null>(null);
  const [feedbackSquare, setFeedbackSquare] = useState<string | null>(null);
  const [hasFailed, setHasFailed] = useState(false); // Track if user made a wrong move (like puzzles)
  const [failedMoveRestoreFen, setFailedMoveRestoreFen] = useState<string | null>(null);
  const [boardWidth, setBoardWidth] = useState(400);
  const [lastMoveSan, setLastMoveSan] = useState<string | undefined>(undefined);
  const [commentaryFen, setCommentaryFen] = useState<string | null>(null);
  const [commentaryPlyCount, setCommentaryPlyCount] = useState(0);
  const [commentaryMoveSan, setCommentaryMoveSan] = useState<string | undefined>(undefined);
  const [activeAffordance, setActiveAffordance] = useState<Affordance | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [desktopLayoutHeight, setDesktopLayoutHeight] = useState(0);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const completedLinesRef = useRef<Record<string, boolean>>({});

  const { playMove, playCapture, playCastle, playCheck, playPromote, playIllegal } = useBoardSounds();
  const sounds = { playMove, playCapture, playCastle, playCheck, playPromote, playIllegal };

  useEffect(() => {
    setMounted(true);
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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
    window.addEventListener("resize", recalculateLayoutHeight);
    return () => window.removeEventListener("resize", recalculateLayoutHeight);
  }, [mounted, isDesktop]);

  const getMoveType = useCallback((move: any) => {
    if (move.san.includes('O-O')) return "castle";
    if (move.san.includes('+') || move.san.includes('#')) return "check";
    if (move.san.includes('=')) return "promote";
    if (move.san.includes('x')) return "capture";
    return "move";
  }, []);

  const handleMoveEffects = useCallback((move: any, gameInstance: Chess) => {
    if (!move) return;
    playMoveSound(sounds, move, gameInstance.inCheck());
    setLastMoveType(getMoveType(move));
    setLastMoveSan(move.san);
  }, [sounds, getMoveType]);

  const clearMoveFeedback = useCallback(() => {
    setMoveResult(null);
    setLastMoveType(null);
    setFeedbackSquare(null);
  }, []);

  const clearCommentary = useCallback(() => {
    setCommentaryFen(null);
    setCommentaryPlyCount(0);
    setCommentaryMoveSan(undefined);
    setActiveAffordance(null);
  }, []);

  const setCommentaryFromMove = useCallback((gameInstance: Chess, moveSan: string) => {
    setCommentaryFen(gameInstance.fen());
    setCommentaryPlyCount(gameInstance.history().length);
    setCommentaryMoveSan(moveSan);
  }, []);

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
          setBoardWidth(size);
        } else {
          const baseDesktopHeight = desktopLayoutHeight > 0 ? desktopLayoutHeight : window.innerHeight - 200;
          const capturedPiecesAndSpacing = 56;
          const availableHeight = Math.max(320, baseDesktopHeight - capturedPiecesAndSpacing);
          const pageHorizontalPadding = 64; // lg:p-8 => left + right
          const rightPanelWidth = 380;
          const layoutGap = 20; // gap-5
          const availableWidth = window.innerWidth - pageHorizontalPadding - rightPanelWidth - layoutGap - 24;

          // Scale proportionally with minimum constraint
          const size = Math.max(
            320,
            Math.min(1000, availableWidth, availableHeight)
          );
          setBoardWidth(size);
        }
      }
    };
    calculateBoardSize();

    window.addEventListener("resize", calculateBoardSize);
    return () => window.removeEventListener("resize", calculateBoardSize);
  }, [desktopLayoutHeight]);

  useEffect(() => {
    completedLinesRef.current = completedLines;
  }, [completedLines]);

  // Helper to apply a move string (SAN, UCI, or long algebraic)
  const applyMoveString = useCallback((gameInstance: Chess, moveStr: string) => {
    try {
      let result = gameInstance.move(moveStr);
      if (!result && moveStr.length >= 4) {
        result = gameInstance.move({
          from: moveStr.slice(0, 2),
          to: moveStr.slice(2, 4),
          promotion: moveStr.slice(4) as "q" | "r" | "b" | "n" | undefined,
        });
      }
      return result;
    } catch {
      return null;
    }
  }, []);

  const normalizeMoveText = useCallback((moveText: string) => {
    return moveText
      .trim()
      .replace(/^\d+\.(\.\.)?/, "")
      .replace(/[+#?!]/g, "")
      .replace(/\s+/g, "");
  }, []);

  const resolveHintSquare = useCallback((fen: string, expectedMove: string): string | null => {
    const moveText = expectedMove.trim();
    if (!moveText) return null;

    if (UCI_MOVE_REGEX.test(moveText)) {
      return moveText.slice(0, 2).toLowerCase();
    }

    try {
      const probe = new Chess(fen);
      const move = applyMoveString(probe, moveText);
      if (move) {
        return move.from;
      }
    } catch {
      // no-op
    }

    try {
      const probe = new Chess(fen);
      const normalizedExpected = normalizeMoveText(moveText).toLowerCase();
      const legalMoves = probe.moves({ verbose: true });

      for (const legalMove of legalMoves) {
        const legalSan = normalizeMoveText(legalMove.san).toLowerCase();
        const legalUci = `${legalMove.from}${legalMove.to}${legalMove.promotion ?? ""}`.toLowerCase();
        if (normalizedExpected === legalSan || normalizedExpected === legalUci) {
          return legalMove.from;
        }
      }
    } catch {
      // no-op
    }

    return null;
  }, [applyMoveString, normalizeMoveText]);

  // Initialize with first non-mastered line (after opening moves are played)
  useEffect(() => {
    if (lines.length > 0 && !currentLine && openingMovesPlayed) {
      // Ensure game is at target position first
      const currentFen = game.fen();
      if (currentFen !== targetFen) {
        setGame(new Chess(targetFen));
        // Wait for next render to set currentLine
        return;
      }

      const firstNonMastered = lines.find(line => !completedLines[line.id]) || lines[0];
      setCurrentLine(firstNonMastered);
      setCurrentMoveIndex(0);
    }
  }, [lines, currentLine, completedLines, openingMovesPlayed, game, targetFen]);

  // Autoplay opponent's opening moves (when it's not the user's turn)
  useEffect(() => {
    if (!openingMoves || openingMoves.length === 0) {
      setOpeningMovesPlayed(true);
      return;
    }

    if (openingMoveIndex >= openingMoves.length) {
      setOpeningMovesPlayed(true);
      return;
    }

    // Don't auto-play while the wrong move is sitting on the board
    if (hasFailed) return;

    const userColor = orientation === "white" ? "w" : "b";
    const isUserTurn = game.turn() === userColor;
    const expectedMove = openingMoves[openingMoveIndex];

    // If it's the user's turn, wait for them to play the correct move
    if (isUserTurn) {
      return;
    }

    // If it's opponent's turn, autoplay their move
    const timer = setTimeout(() => {
      if (!expectedMove) {
        setOpeningMovesPlayed(true);
        return;
      }

      const newGame = new Chess(game.fen());
      const move = applyMoveString(newGame, expectedMove);
      if (move) {
        clearMoveFeedback();
        clearCommentary();
        setGame(newGame);
        setOpeningMoveIndex(prev => prev + 1);
        handleMoveEffects(move, newGame);
      } else {
        // If move fails, mark as played
        setOpeningMovesPlayed(true);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [openingMoves, openingMoveIndex, hasFailed, game, orientation, applyMoveString, handleMoveEffects, clearMoveFeedback, clearCommentary]);

  // Auto-play opponent's first move if it's not the user's turn (after opening moves are done)
  useEffect(() => {
    if (!openingMovesPlayed || !currentLine || currentMoveIndex !== 0 || !currentLine.moves.length) return;

    // Don't reset/auto-play while the wrong move is sitting on the board
    if (hasFailed) return;

    // Ensure game is at target position
    const currentFen = game.fen();
    if (currentFen !== targetFen) {
      setGame(new Chess(targetFen));
      return;
    }

    const userColor = orientation === "white" ? "w" : "b";
    const isUserTurn = game.turn() === userColor;

    if (!isUserTurn) {
      const timer = setTimeout(() => {
        // Double-check we still have a line and it's still the first move
        if (!currentLine || currentMoveIndex !== 0) return;

        const nextMoveSan = currentLine.moves[0];
        if (!nextMoveSan) return;

        const newGame = new Chess(game.fen());
        const move = applyMoveString(newGame, nextMoveSan);
        if (!move) {
          console.warn("Failed to apply first forcing line move:", nextMoveSan);
          return;
        }
        if (move) {
          clearMoveFeedback();
          clearCommentary();
          setGame(newGame);
          setCurrentMoveIndex(1);
          handleMoveEffects(move, newGame);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [openingMovesPlayed, currentLine, currentMoveIndex, hasFailed, orientation, game, targetFen, applyMoveString, handleMoveEffects, clearMoveFeedback, clearCommentary]);

  // Clear move feedback after a delay (only for correct moves)
  // Incorrect moves persist until user dismisses them
  useEffect(() => {
    if (moveResult === "correct") {
      const timer = setTimeout(() => {
        clearMoveFeedback();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [moveResult, clearMoveFeedback]);

  // Dismiss incorrect move feedback when user clicks on board and undo the wrong move (like puzzles)
  const dismissFeedback = useCallback(() => {
    if (hasFailed && failedMoveRestoreFen) {
      setGame(new Chess(failedMoveRestoreFen));
    }
    setHasFailed(false);
    setFailedMoveRestoreFen(null);
    clearMoveFeedback();
  }, [hasFailed, failedMoveRestoreFen, clearMoveFeedback]);

  const resetBoard = useCallback(() => {
    const freshGame = new Chess(DEFAULT_FEN);
    setGame(freshGame);
    setCurrentMoveIndex(0);
    setOpeningMoveIndex(0);
    setOpeningMovesPlayed(false);
    setIsAutoPlaying(false);
    setShowHint(false);
    setHintSquare(null);
    setHasFailed(false);
    setFailedMoveRestoreFen(null);
    clearMoveFeedback();
    clearCommentary();
  }, [clearMoveFeedback, clearCommentary]);

  const fireLineCompletionConfetti = useCallback(() => {
    if (!boardContainerRef.current) return;

    const rect = boardContainerRef.current.getBoundingClientRect();
    const x = (rect.left + rect.width / 2) / window.innerWidth;
    const y = (rect.top + rect.height / 2) / window.innerHeight;

    const fireConfetti = () => {
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { x, y },
        angle: 90,
        startVelocity: 45,
        gravity: 1.2,
        ticks: 200,
        colors: ['#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181', '#aa96da'],
      });
    };

    fireConfetti();
    setTimeout(fireConfetti, 5);
  }, []);

  const completeLine = useCallback(async (lineId: string) => {
    if (completedLinesRef.current[lineId]) return;
    completedLinesRef.current = { ...completedLinesRef.current, [lineId]: true };
    setCompletedLines((prev) => (prev[lineId] ? prev : { ...prev, [lineId]: true }));
    fireLineCompletionConfetti();

    // Sync to backend
    try {
      await fetch(`${GATEWAY_URL}/api/openings/master/line`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opening_id: openingId, line_id: lineId }),
      });
    } catch (error) {
      console.error("Failed to sync mastery:", error);
    }
  }, [openingId, fireLineCompletionConfetti]);

  const handleSelectLine = useCallback((line: ForcingLine) => {
    setCurrentLine(line);
    setCurrentMoveIndex(0);
    // Reset to beginning and replay opening moves
    setGame(new Chess(DEFAULT_FEN));
    setOpeningMoveIndex(0);
    setOpeningMovesPlayed(false);
    setIsAutoPlaying(false);
    setShowHint(false);
    setHintSquare(null);
    setHasFailed(false);
    setFailedMoveRestoreFen(null);
    clearMoveFeedback();
    clearCommentary();
  }, [clearMoveFeedback, clearCommentary]);

  const advanceToNextLine = useCallback(() => {
    if (!currentLine) return;
    const currentIndex = lines.findIndex(l => l.id === currentLine.id);
    if (currentIndex === -1) return;
    const nextLine = lines[currentIndex + 1];
    if (nextLine) {
      setTimeout(() => {
        handleSelectLine(nextLine);
      }, 2000);
    }
  }, [currentLine, lines, handleSelectLine]);

  const playNextMove = useCallback((currentGame: Chess, index: number) => {
    if (!currentLine) return;
    const nextMoveSan = currentLine.moves[index];
    if (!nextMoveSan) return;
    const newGame = new Chess(currentGame.fen());
    const move = applyMoveString(newGame, nextMoveSan);
    if (!move) return;
    clearMoveFeedback();
    clearCommentary();
    setGame(newGame);
    const nextIndex = index + 1;
    setCurrentMoveIndex(nextIndex);
    handleMoveEffects(move, newGame);
    if (nextIndex >= currentLine.moves.length) {
      completeLine(currentLine.id);
      setIsAutoPlaying(false);
      advanceToNextLine();
    }
  }, [applyMoveString, completeLine, currentLine, advanceToNextLine, handleMoveEffects, clearMoveFeedback, clearCommentary]);

  const handleMove = (sourceSquare: string, targetSquare: string) => {
    // If we're still in opening moves phase, check against opening moves
    if (!openingMovesPlayed && openingMoves && openingMoveIndex < openingMoves.length) {
      const userColor = orientation === "white" ? "w" : "b";
      const isUserTurn = game.turn() === userColor;

      // First check if the move is legal
      try {
        const tempGame = new Chess(game.fen());
        const move = tempGame.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
        if (!move) {
          clearMoveFeedback();
          clearCommentary();
          setLastMoveType("illegal");
          playIllegal();
          return false;
        }

        // Check if it's the user's turn
        if (!isUserTurn) {
          tempGame.undo();
          clearMoveFeedback();
          clearCommentary();
          setLastMoveType("illegal");
          playIllegal();
          return false;
        }

        const expectedMove = openingMoves[openingMoveIndex];
        if (!expectedMove) return false;

        const attemptedUci = `${sourceSquare}${targetSquare}${move.promotion ?? ""}`;
        const matches = move.san === expectedMove || attemptedUci === expectedMove || move.lan === expectedMove;

        if (matches) {
          setGame(tempGame);
          const nextIndex = openingMoveIndex + 1;
          setOpeningMoveIndex(nextIndex);
          setHasFailed(false);
          setFailedMoveRestoreFen(null);

          // Clear hint when move is made
          setShowHint(false);
          setHintSquare(null);

          // Set move result and type for sound/visual feedback
          setMoveResult("correct");
          setFeedbackSquare(targetSquare);
          handleMoveEffects(move, tempGame);
          setCommentaryFromMove(tempGame, move.san);

          // If all opening moves are done, mark as played and verify position
          if (nextIndex >= openingMoves.length) {
            // Ensure we're at the target position
            if (tempGame.fen() !== targetFen) {
              setGame(new Chess(targetFen));
            }
            setOpeningMovesPlayed(true);
          }
          return true;
        }
        // Keep the wrong move on the board (like puzzles) - don't undo
        setFailedMoveRestoreFen(game.fen());
        setGame(tempGame); // Apply the wrong move to show piece at target
        setHasFailed(true);
        setMoveResult("incorrect");
        setLastMoveType("illegal");
        playIllegal();
        setFeedbackSquare(targetSquare);
        clearCommentary();
        return true; // Return true so the board shows the move
      } catch {
        clearMoveFeedback();
        clearCommentary();
        setLastMoveType("illegal");
        playIllegal();
        return false;
      }
    }

    // Otherwise, we're in forcing line phase
    if (!currentLine) return false;
    const expectedMove = currentLine.moves[currentMoveIndex];
    if (!expectedMove) return false;

    const userColor = orientation === "white" ? "w" : "b";
    const isUserTurn = game.turn() === userColor;

    try {
      const tempGame = new Chess(game.fen());
      const move = tempGame.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (!move) {
        clearMoveFeedback();
        clearCommentary();
        setLastMoveType("illegal");
        playIllegal();
        return false;
      }

      // Check if it's the user's turn
      if (!isUserTurn) {
        tempGame.undo();
        clearMoveFeedback();
        clearCommentary();
        setLastMoveType("illegal");
        playIllegal();
        return false;
      }

      const attemptedUci = `${sourceSquare}${targetSquare}${move.promotion ?? ""}`;
      const matches = move.san === expectedMove || attemptedUci === expectedMove || move.lan === expectedMove;
      if (matches) {
        setGame(tempGame);
        const nextIndex = currentMoveIndex + 1;
        setCurrentMoveIndex(nextIndex);
        setHasFailed(false);
        setFailedMoveRestoreFen(null);

        // Clear hint when move is made
        setShowHint(false);
        setHintSquare(null);

        // Set move result and type for sound/visual feedback
        setMoveResult("correct");
        setFeedbackSquare(targetSquare);
        handleMoveEffects(move, tempGame);
        setCommentaryFromMove(tempGame, move.san);

        if (nextIndex >= currentLine.moves.length) {
          completeLine(currentLine.id);
          setIsAutoPlaying(false);
          advanceToNextLine();
        } else {
          const isUserTurnAfter = tempGame.turn() === userColor;
          if (!isUserTurnAfter) {
            setTimeout(() => playNextMove(tempGame, nextIndex), 500);
          }
        }
        return true;
      }
      // Keep the wrong move on the board (like puzzles) - don't undo
      setFailedMoveRestoreFen(game.fen());
      setGame(tempGame); // Apply the wrong move to show piece at target
      setHasFailed(true);
      setMoveResult("incorrect");
      setLastMoveType("illegal");
      playIllegal();
      setFeedbackSquare(targetSquare);
      clearCommentary();
      return true; // Return true so the board shows the move
    } catch {
      clearMoveFeedback();
      clearCommentary();
      setLastMoveType("illegal");
      playIllegal();
      return false;
    }
  };

  const handleRestart = useCallback(() => {
    resetBoard();
  }, [resetBoard]);

  const handlePrevious = () => {
    if (!openingMovesPlayed && openingMoves && openingMoveIndex > 0) {
      // Go back in opening moves
      const newGame = new Chess(DEFAULT_FEN);
      for (let i = 0; i < openingMoveIndex - 1; i++) {
        applyMoveString(newGame, openingMoves[i]);
      }
      setGame(newGame);
      setOpeningMoveIndex(prev => prev - 1);
      setIsAutoPlaying(false);
      clearCommentary();
    } else if (currentLine && currentMoveIndex > 0) {
      // Go back one move in the forcing line
      const newGame = new Chess(targetFen);
      for (let i = 0; i < currentMoveIndex - 1; i++) {
        applyMoveString(newGame, currentLine.moves[i]);
      }
      setGame(newGame);
      setCurrentMoveIndex(currentMoveIndex - 1);
      setIsAutoPlaying(false);
      clearCommentary();
    }
  };

  const handleNext = () => {
    if (!currentLine || currentMoveIndex >= currentLine.moves.length) return;
    playNextMove(game, currentMoveIndex);
  };

  const handleAutoPlay = () => {
    if (!currentLine) return;
    if (isAutoPlaying) {
      setIsAutoPlaying(false);
      return;
    }
    setIsAutoPlaying(true);
  };

  const handleHint = useCallback(() => {
    // Clear hint when user makes a move
    setShowHint(false);
    setHintSquare(null);
    clearCommentary();
    const baseFen = hasFailed && failedMoveRestoreFen ? failedMoveRestoreFen : game.fen();

    if (hasFailed) {
      setGame(new Chess(baseFen));
      setHasFailed(false);
      setFailedMoveRestoreFen(null);
      clearMoveFeedback();
    }

    // If we're in opening moves phase
    if (!openingMovesPlayed && openingMoves && openingMoveIndex < openingMoves.length) {
      const userColor = orientation === "white" ? "w" : "b";
      const probeGame = new Chess(baseFen);
      const isUserTurn = probeGame.turn() === userColor;

      if (isUserTurn) {
        const expectedMove = openingMoves[openingMoveIndex];
        if (expectedMove) {
          const fromSquare = resolveHintSquare(baseFen, expectedMove);
          setHintSquare(fromSquare);
          setShowHint(true);
        }
      }
      return;
    }

    // If we're in forcing line phase
    if (!currentLine || currentMoveIndex >= currentLine.moves.length) return;

    const expectedMove = currentLine.moves[currentMoveIndex];
    if (!expectedMove) return;

    const fromSquare = resolveHintSquare(baseFen, expectedMove);
    setHintSquare(fromSquare);
    setShowHint(true);
  }, [openingMovesPlayed, openingMoves, openingMoveIndex, currentLine, currentMoveIndex, game, orientation, resolveHintSquare, hasFailed, failedMoveRestoreFen, clearMoveFeedback, clearCommentary]);

  const handleSolution = useCallback(() => {
    // Clear hint
    setShowHint(false);
    setHintSquare(null);
    clearMoveFeedback();
    clearCommentary();
    const baseFen = hasFailed && failedMoveRestoreFen ? failedMoveRestoreFen : game.fen();

    if (hasFailed) {
      setGame(new Chess(baseFen));
      setHasFailed(false);
      setFailedMoveRestoreFen(null);
    }

    // If we're in opening moves phase
    if (!openingMovesPlayed && openingMoves && openingMoveIndex < openingMoves.length) {
      const userColor = orientation === "white" ? "w" : "b";
      const probeGame = new Chess(baseFen);
      const isUserTurn = probeGame.turn() === userColor;

      if (isUserTurn) {
        const expectedMove = openingMoves[openingMoveIndex];
        if (expectedMove) {
          const newGame = new Chess(baseFen);
          const move = applyMoveString(newGame, expectedMove);
          if (move) {
            setGame(newGame);
            const nextIndex = openingMoveIndex + 1;
            setOpeningMoveIndex(nextIndex);
            if (nextIndex >= openingMoves.length) {
              setOpeningMovesPlayed(true);
            }
            handleMoveEffects(move, newGame);
          }
        }
      }
      return;
    }

    // If we're in forcing line phase
    if (!currentLine || currentMoveIndex >= currentLine.moves.length) return;

    const expectedMove = currentLine.moves[currentMoveIndex];
    if (!expectedMove) return;

    const newGame = new Chess(baseFen);
    const move = applyMoveString(newGame, expectedMove);
    if (move) {
      setGame(newGame);
      const nextIndex = currentMoveIndex + 1;
      setCurrentMoveIndex(nextIndex);

      if (nextIndex >= currentLine.moves.length) {
        completeLine(currentLine.id);
        setIsAutoPlaying(false);
        advanceToNextLine();
      } else {
        const userColor = orientation === "white" ? "w" : "b";
        const isUserTurn = newGame.turn() === userColor;
        if (!isUserTurn) {
          setTimeout(() => playNextMove(newGame, nextIndex), 500);
        }
      }
      handleMoveEffects(move, newGame);
    }
  }, [openingMovesPlayed, openingMoves, openingMoveIndex, currentLine, currentMoveIndex, game, orientation, applyMoveString, completeLine, advanceToNextLine, playNextMove, handleMoveEffects, hasFailed, failedMoveRestoreFen, clearMoveFeedback, clearCommentary]);

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined;
    if (isAutoPlaying && currentLine && currentMoveIndex < currentLine.moves.length) {
      timeout = setTimeout(() => {
        playNextMove(game, currentMoveIndex);
      }, 700);
    } else if (isAutoPlaying) {
      setIsAutoPlaying(false);
    }
    return () => { if (timeout) clearTimeout(timeout); };
  }, [game, isAutoPlaying, currentLine, currentMoveIndex, playNextMove]);

  // Show "No lines available" only if there are actually no lines
  if (lines.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">No lines available for this opening.</p>
      </div>
    );
  }

  // Show board even during opening moves phase (when currentLine is null)
  const title = currentLine ? `${openingName}: ${currentLine.name}` : openingName;

  return (
    <div className="flex flex-col min-h-screen lg:h-[calc(100dvh-3.5rem)] p-4 md:p-6 lg:p-8 bg-background overflow-y-auto lg:overflow-hidden">
      <div
        ref={layoutRef}
        className="w-full mx-auto flex flex-col lg:flex-row lg:items-stretch lg:justify-center gap-5 flex-1 min-h-0"
      >
        {/* Board column */}
        <div ref={boardContainerRef} className="flex flex-col lg:h-full lg:justify-center" style={{ width: boardWidth }}>
          <ChessboardPanel
            fen={game.fen()}
            onMove={handleMove}
            onRestart={handleRestart}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onAutoPlay={handleAutoPlay}
            orientation={orientation}
            title={title}
            isAutoPlaying={isAutoPlaying}
            currentLine={currentLine || undefined}
            showHint={showHint}
            hintSquare={hintSquare}
            moveResult={moveResult}
            lastMoveType={lastMoveType}
            feedbackSquare={feedbackSquare}
            width={boardWidth}
            affordance={activeAffordance}
            onDismissFeedback={dismissFeedback}
          />
        </div>

        {/* Right panel column - height matches board */}
        <div
          className="w-full lg:w-[380px] flex-shrink-0 flex flex-col gap-2"
          style={{ height: mounted && isDesktop && desktopLayoutHeight > 0 ? desktopLayoutHeight : boardWidth }}
        >
          {/* LineListPanel takes remaining space */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <LineListPanel
              lines={lines}
              currentLineId={currentLine?.id || null}
              completedLines={completedLines}
              onSelectLine={handleSelectLine}
              isPlaying={openingMovesPlayed && currentLine !== null}
              openingName={openingName}
              currentLineTitle={title}
              fen={commentaryFen ?? undefined}
              plyCount={commentaryPlyCount}
              moveSan={commentaryMoveSan}
              orientation={orientation}
              onDrawAffordance={setActiveAffordance}
            />
          </div>

          {/* Navigation buttons - same style as /analyze */}
          <div className="flex gap-2 p-2 bg-card rounded border">
            <Button
              onClick={handleRestart}
              size="icon"
              variant="outline"
              className="flex-1"
              aria-label="Restart"
              title="Restart"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              onClick={handlePrevious}
              size="icon"
              variant="outline"
              className="flex-1"
              aria-label="Previous move"
              title="Previous move"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleAutoPlay}
              size="icon"
              variant={isAutoPlaying ? "default" : "outline"}
              className={`flex-1 ${isAutoPlaying ? "animate-pulse" : ""}`}
              aria-label="Auto-play"
              title="Auto-play"
            >
              <Play className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleNext}
              size="icon"
              variant="outline"
              className="flex-1"
              aria-label="Next move"
              title="Next move"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              onClick={showHint ? handleSolution : handleHint}
              variant="outline"
              className="flex-1"
            >
              <Lightbulb className="w-4 h-4 mr-1" />
              {showHint ? "Solve" : "Hint"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

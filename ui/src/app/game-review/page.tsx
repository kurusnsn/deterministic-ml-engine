"use client";

// Force dynamic rendering for pages using useSearchParams
export const dynamic = 'force-dynamic';

import Image from "next/image";
import Link from "next/link";
import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
    Sparkles,
    AlertTriangle,
    ChevronsLeft,
    SkipBack,
    SkipForward,
    ChevronsRight,
    BarChart2,
    Share2,
    Clock,
    Swords,
    Target,
    RotateCw,
    Loader2,
    TrendingUp,
    Info,
    ArrowLeft
} from "lucide-react";
import { Chessboard } from "react-chessboard";
import MoveReviewBar from "@/components/MoveReviewBar";
import EvaluationBar from "@/components/EvaluationBar";
import EvaluationGraph from "@/components/EvaluationGraph";
import { Chess, Move, Square } from "chess.js";
import { evaluate } from "@/lib/eval/evalService";
import { useSearchParams, useRouter } from 'next/navigation';
import { useChessDrawing } from "@/app/hooks/useChessDrawing";
import { getClientAuthHeaders } from "@/lib/auth";
import useSound from "use-sound";
import { AccuracyMetrics, EloEstimates, MoveEngineAnnotation } from "@/types/repertoire";
import { analyzeGame } from "@/lib/api/repertoire";
import MoveEngineComment from "@/components/game-review/MoveEngineComment";
import GameReviewShareModal from "@/components/game-review/GameReviewShareModal";
import GameReviewLLMPanel from "@/components/game-review/GameReviewLLMPanel";
import { CapturedPieces } from "@/components/CapturedPieces";
import { UserGamesSearchPanel } from "@/components/game-review/UserGamesSearchPanel";
import { PositionEvaluationBubble } from "@/components/PositionEvaluationBubble";
import { NonLLMCommentaryOverlay } from "@/components/NonLLMCommentaryOverlay";
import MoveHistoryBox from "@/components/MoveHistoryBox";
import type { Affordance } from "@/hooks/useNonLLMCommentaryOverlay";
import { useAnimatedLine } from "@/hooks/useAnimatedLine";

// Canvas overlay for ripples and visual effects
import { OverlayCanvas } from "@/board/overlay/OverlayCanvas";
import { useBoardStore } from "@/board/core/useBoardStore";

import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Mock Data
const MOCK_MOVES = [
    { num: 1, white: "e4", black: "e5", wEval: "0.2", bEval: "0.1" },
    { num: 2, white: "Nf3", black: "Nc6", wEval: "0.3", bEval: "0.2" },
    { num: 3, white: "Bb5", black: "a6", wEval: "0.2", bEval: "0.2" },
    { num: 4, white: "Ba4", black: "Nf6", wEval: "0.4", bEval: "0.3" },
    { num: 5, white: "O-O", black: "Be7", wEval: "0.4", bEval: "0.3" },
    { num: 6, white: "Re1", black: "b5", wEval: "0.5", bEval: "0.4" },
    { num: 7, white: "Bb3", black: "d6", wEval: "0.5", bEval: "0.4" },
    { num: 8, white: "c3", black: "O-O", wEval: "0.4", bEval: "0.4" },
    { num: 9, white: "h3", black: "Nb8", wEval: "0.3", bEval: "0.3" },
    { num: 10, white: "d4", black: "Nbd7", wEval: "0.4", bEval: "0.3" },
    { num: 11, white: "Nbd2", black: "Bb7", wEval: "0.4", bEval: "0.3" },
    { num: 12, white: "Bc2", black: "Re8", wEval: "0.3", bEval: "0.3" },
    { num: 13, white: "Nf1", black: "Bf8", wEval: "0.4", bEval: "0.4" },
    { num: 14, white: "Ng3", black: "g6", wEval: "0.3", bEval: "0.3" },
    { num: 15, white: "a4", black: "c5", wEval: "0.4", bEval: "0.3" },
];

type ClassificationId =
    | "brilliant"
    | "great"
    | "best"
    | "excellent"
    | "good"
    | "inaccuracy"
    | "mistake"
    | "blunder"
    | "book"
    | "forced"
    | "critical"
    | "sharp"
    | "threat"
    | "alternative"
    | "correct"
    | "incorrect"
    | "great_find"
    | "missed_win"
    | "fast_win"
    | "mate"
    | "checkmate"
    | "resign"
    | "draw"
    | "winner"
    | "free_piece"
    | "miss"
    | "take_back";

const CLASSIFICATION_ICONS: Record<ClassificationId, { label: string; icon: string }> = {
    brilliant: { label: "Brilliant", icon: "/svg/brilliant.svg" },
    great: { label: "Great", icon: "/svg/great_find.svg" },
    best: { label: "Best", icon: "/svg/best.svg" },
    excellent: { label: "Excellent", icon: "/svg/excellent.svg" },
    good: { label: "Good", icon: "/svg/good.svg" },
    inaccuracy: { label: "Inaccuracy", icon: "/svg/inaccuracy.svg" },
    mistake: { label: "Mistake", icon: "/svg/mistake.svg" },
    blunder: { label: "Blunder", icon: "/svg/blunder.svg" },
    book: { label: "Book", icon: "/svg/book.svg" },
    forced: { label: "Forced", icon: "/svg/forced.svg" },
    critical: { label: "Critical", icon: "/svg/critical.svg" },
    sharp: { label: "Sharp", icon: "/svg/sharp.svg" },
    threat: { label: "Threat", icon: "/svg/threat.svg" },
    alternative: { label: "Alternative", icon: "/svg/alternative.svg" },
    correct: { label: "Correct", icon: "/svg/correct.svg" },
    incorrect: { label: "Incorrect", icon: "/svg/incorrect.svg" },
    great_find: { label: "Great Find", icon: "/svg/great_find.svg" },
    missed_win: { label: "Missed Win", icon: "/svg/missed_win.svg" },
    fast_win: { label: "Fast Win", icon: "/svg/fast_win.svg" },
    mate: { label: "Mate", icon: "/svg/mate.svg" },
    checkmate: { label: "Checkmate", icon: "/svg/checkmate_white.svg" },
    resign: { label: "Resign", icon: "/svg/resign_white.svg" },
    draw: { label: "Draw", icon: "/svg/draw_white.svg" },
    winner: { label: "Winner", icon: "/svg/winner.svg" },
    free_piece: { label: "Free Piece", icon: "/svg/free_piece.svg" },
    miss: { label: "Miss", icon: "/svg/miss.svg" },
    take_back: { label: "Take Back", icon: "/svg/take_back.svg" }
};

const CLASSIFICATION_SUMMARY: { id: ClassificationId; white: number; black: number }[] = [
    { id: "brilliant", white: 0, black: 0 },
    { id: "great", white: 1, black: 2 },
    { id: "best", white: 11, black: 5 },
    { id: "excellent", white: 6, black: 6 },
    { id: "good", white: 1, black: 3 },
    { id: "book", white: 4, black: 3 },
    { id: "inaccuracy", white: 0, black: 4 },
    { id: "mistake", white: 3, black: 2 },
    { id: "miss", white: 7, black: 6 },
    { id: "blunder", white: 1, black: 2 }
];

const CLASSIFICATION_BADGE_STYLES: Record<ClassificationId, { style: { backgroundColor: string; color: string; borderColor?: string }; variant: "default" | "secondary" | "outline" }> = {
    brilliant: { style: { backgroundColor: '#1bada6', color: '#ffffff', borderColor: '#1bada6' }, variant: "default" },
    great: { style: { backgroundColor: '#2596be', color: '#ffffff', borderColor: '#2596be' }, variant: "default" },
    best: { style: { backgroundColor: '#96bc4b', color: '#ffffff' }, variant: "default" },
    excellent: { style: { backgroundColor: '#96bc4b', color: '#ffffff', borderColor: '#96bc4b' }, variant: "default" },
    good: { style: { backgroundColor: '#96af8b', color: '#ffffff', borderColor: '#96af8b' }, variant: "default" },
    book: { style: { backgroundColor: '#a88865', color: '#ffffff', borderColor: '#a88865' }, variant: "default" },
    inaccuracy: { style: { backgroundColor: '#f7c045', color: '#ffffff', borderColor: '#f7c045' }, variant: "default" },
    mistake: { style: { backgroundColor: '#e58f2a', color: '#ffffff', borderColor: '#e58f2a' }, variant: "default" },
    miss: { style: { backgroundColor: '#ca3431', color: '#ffffff', borderColor: '#ca3431' }, variant: "default" },
    blunder: { style: { backgroundColor: '#ca3431', color: '#ffffff', borderColor: '#ca3431' }, variant: "default" },
    forced: { style: { backgroundColor: '#22d3ee', color: '#ffffff', borderColor: '#22d3ee' }, variant: "default" },
    critical: { style: { backgroundColor: '#fb7185', color: '#ffffff', borderColor: '#fb7185' }, variant: "default" },
    sharp: { style: { backgroundColor: '#fcd34d', color: '#ffffff', borderColor: '#fcd34d' }, variant: "default" },
    threat: { style: { backgroundColor: '#f87171', color: '#ffffff', borderColor: '#f87171' }, variant: "default" },
    alternative: { style: { backgroundColor: '#94a3b8', color: '#ffffff', borderColor: '#94a3b8' }, variant: "default" },
    correct: { style: { backgroundColor: '#4ade80', color: '#ffffff', borderColor: '#4ade80' }, variant: "default" },
    incorrect: { style: { backgroundColor: '#f87171', color: '#ffffff', borderColor: '#f87171' }, variant: "default" },
    great_find: { style: { backgroundColor: '#a78bfa', color: '#ffffff', borderColor: '#a78bfa' }, variant: "default" },
    missed_win: { style: { backgroundColor: '#fb923c', color: '#ffffff', borderColor: '#fb923c' }, variant: "default" },
    fast_win: { style: { backgroundColor: '#2dd4bf', color: '#ffffff', borderColor: '#2dd4bf' }, variant: "default" },
    mate: { style: { backgroundColor: '#f472b6', color: '#ffffff', borderColor: '#f472b6' }, variant: "default" },
    checkmate: { style: { backgroundColor: '#111827', color: '#ffffff' }, variant: "default" },
    resign: { style: { backgroundColor: '#e5e7eb', color: '#1f2937' }, variant: "secondary" }, // Keep resign light
    draw: { style: { backgroundColor: '#f3f4f6', color: '#4b5563', borderColor: '#e5e7eb' }, variant: "outline" }, // Keep draw light
    winner: { style: { backgroundColor: '#facc15', color: '#713f12' }, variant: "default" }, // Keep winner yellow
    free_piece: { style: { backgroundColor: '#a3e635', color: '#ffffff', borderColor: '#a3e635' }, variant: "default" },
    take_back: { style: { backgroundColor: '#f5f5f5', color: '#404040', borderColor: '#e5e5e5' }, variant: "outline" }
};

const ANALYSIS_MOVES: Array<{
    num: number;
    move: string;
    color: "w" | "b";
    badge: ClassificationId;
    eval: string;
    line: string;
    desc: string;
}> = [
        {
            num: 12,
            move: "Bg5",
            color: "w",
            badge: "best",
            eval: "+0.45",
            line: "12... h6 13. Bh4 g5 14. Bg3",
            desc: "Develops the bishop to an active square, pinning the knight."
        },
        {
            num: 12,
            move: "h6",
            color: "b",
            badge: "inaccuracy",
            eval: "+0.90",
            line: "13. Bxf6 Bxf6 14. Nbd2",
            desc: "Weakens the kingside structure unnecessarily."
        },
        {
            num: 13,
            move: "Bh4",
            color: "w",
            badge: "excellent",
            eval: "+0.95",
            line: "13... g5 14. Bg3 Nh5",
            desc: "Maintains the pin and prepares to retreat to g3."
        }
    ];

/**
 * Formats time control from seconds to minutes and adds a category symbol.
 * Input: "180+0" (seconds) → Output: "⚡ 3+0" (minutes with blitz symbol)
 * Categories (based on initial time + increment * 40):
 * - Bullet (●): < 3 minutes
 * - Blitz (⚡): 3-10 minutes
 * - Rapid (◷): 10-30 minutes
 * - Classical (♔): > 30 minutes
 */
function formatTimeControl(timeControl: string | undefined): string {
    if (!timeControl) return 'Unknown';

    // Try to parse "seconds+increment" format
    const match = timeControl.match(/^(\d+)\+(\d+)$/);
    if (!match) {
        // If it's already a category name, return with symbol
        const lower = timeControl.toLowerCase();
        if (lower === 'bullet') return '● Bullet';
        if (lower === 'blitz') return '⚡ Blitz';
        if (lower === 'rapid') return '◷ Rapid';
        if (lower === 'classical' || lower === 'classic') return '♔ Classical';
        return timeControl;
    }

    const initialSeconds = parseInt(match[1]);
    const incrementSeconds = parseInt(match[2]);

    // Convert to minutes
    const initialMinutes = Math.floor(initialSeconds / 60);
    const incrementMinutes = Math.floor(incrementSeconds / 60);

    // For display: show increment in seconds if < 60, minutes otherwise
    const incrementDisplay = incrementSeconds < 60
        ? `${incrementSeconds}`
        : `${incrementMinutes}`;

    // Calculate estimated game time (initial + increment * 40 assumed moves)
    const estimatedTotalSeconds = initialSeconds + (incrementSeconds * 40);
    const estimatedTotalMinutes = estimatedTotalSeconds / 60;

    // Determine category and symbol
    let symbol: string;
    if (estimatedTotalMinutes < 3) {
        symbol = '●';  // Bullet
    } else if (estimatedTotalMinutes < 10) {
        symbol = '⚡'; // Blitz
    } else if (estimatedTotalMinutes < 30) {
        symbol = '◷';  // Rapid
    } else {
        symbol = '♔';  // Classical
    }

    return `${symbol} ${initialMinutes}+${incrementDisplay}`;
}

function GameReviewContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const importUrl = searchParams.get('url');
    const importPgn = searchParams.get('pgn');
    const importGameId = searchParams.get('game'); // Game ID from database (e.g., from Recent Activity)
    const GATEWAY_URL = (process.env.NEXT_PUBLIC_GATEWAY_URL as string) ?? '/api/gateway';

    const [boardSize, setBoardSize] = useState(500);
    const [mounted, setMounted] = useState(false);
    const [orientation, setOrientation] = useState<"white" | "black">("white");
    const drawing = useChessDrawing(orientation);
    const boardRef = useRef<HTMLDivElement>(null);
    const [isLoadingGame, setIsLoadingGame] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Non-LLM Commentary overlay state
    const [activeAffordance, setActiveAffordance] = useState<Affordance | null>(null);

    // Game state management
    const gameRef = useRef(new Chess());
    const [position, setPosition] = useState(gameRef.current.fen());
    const [currentMoveIndex, setCurrentMoveIndex] = useState(-1); // -1 = starting position
    const [evalScore, setEvalScore] = useState<string | null>(null);
    const [lastMoveSquares, setLastMoveSquares] = useState<{ from: Square; to: Square } | null>(null);

    // Evaluation history for graph
    const [evaluationHistory, setEvaluationHistory] = useState<Array<{ moveNumber: number; evaluation: number; classification?: string }>>([]);

    // Game ID input
    const [gameIdInput, setGameIdInput] = useState("");
    const [isGameIdDialogOpen, setIsGameIdDialogOpen] = useState(false);

    // Clock state
    const [clocks, setClocks] = useState<{ white: string; black: string }>({ white: "--:--", black: "--:--" });

    const [playMoveSound] = useSound("/sounds/move-self.mp3", { volume: 0.5 });
    const [playCaptureSound] = useSound("/sounds/capture.mp3", { volume: 0.5 });
    const [playCastleSound] = useSound("/sounds/castle.mp3", { volume: 0.5 });
    const [playCheckSound] = useSound("/sounds/move-check.mp3", { volume: 0.5 });

    // Game metadata
    const [gameMetadata, setGameMetadata] = useState<{
        white: string;
        black: string;
        whiteElo?: string;
        blackElo?: string;
        result: string;
        date?: string;
        timeControl?: string;
    } | null>(null);

    // Display moves for the move list
    const [displayMoves, setDisplayMoves] = useState<Array<{ num: number; white: string; black?: string }>>([]);

    // Game history
    const [gameHistory, setGameHistory] = useState<any[]>([]);

    // Game queue for "Analyze Next Game" feature
    const [gameQueue, setGameQueue] = useState<Array<{ url: string; white: string; black: string; date: string; username: string }>>([]);
    const [currentGameIndex, setCurrentGameIndex] = useState(0);
    const remainingQueuedGames = Math.max(gameQueue.length - currentGameIndex, 0);
    const nextQueuedGame = remainingQueuedGames > 0 ? gameQueue[currentGameIndex] : null;

    // Arrow settings state
    const [showBestMoveArrow, setShowBestMoveArrow] = useState(false);
    const [showThreatArrows, setShowThreatArrows] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [showEngineDetails, setShowEngineDetails] = useState(true);

    // Accuracy and Elo estimation state
    const [accuracyMetrics, setAccuracyMetrics] = useState<AccuracyMetrics | null>(null);
    const [eloEstimates, setEloEstimates] = useState<EloEstimates | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [currentPgn, setCurrentPgn] = useState<string | null>(null);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [engineAnnotations, setEngineAnnotations] = useState<MoveEngineAnnotation[]>([]);

    // Share modal state
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);

    // Move history panel state - shows highlights initially, switches to move history when navigating
    const [showMoveHistory, setShowMoveHistory] = useState(false);

    // Animated line playback state
    const [savedAnimatedLine, setSavedAnimatedLine] = useState<string[] | null>(null);
    const [animatedLineBaseFen, setAnimatedLineBaseFen] = useState<string | null>(null);

    // Animated line hook for Show Follow-Up / Show Tactic buttons
    const animatedLine = useAnimatedLine({
        baseFen: animatedLineBaseFen || position,
        delayMs: 600,
        onMove: (fen, moveIndex, moveSan) => {
            // Update board position during animation
            setPosition(fen);
            // Play move sound (if enabled)
            if (soundEnabled) {
                if (moveSan.includes('x')) {
                    playCaptureSound();
                } else if (moveSan.includes('O-O')) {
                    playCastleSound();
                } else if (moveSan.includes('+') || moveSan.includes('#')) {
                    playCheckSound();
                } else {
                    playMoveSound();
                }
            }
        },
        onComplete: (line) => {
            // Save the line for potential variation insertion
            setSavedAnimatedLine(line);
        },
        onCancel: () => {
            // Reset to original position
            if (currentMoveIndex >= 0 && gameHistory[currentMoveIndex]) {
                setPosition(gameHistory[currentMoveIndex].after || gameRef.current.fen());
            } else {
                setPosition(gameRef.current.fen());
            }
        },
    });

    // Handler for Show Follow-Up / Show Tactic buttons
    const handleShowFollowUp = useCallback((line: string[]) => {
        if (line.length === 0) return;

        // Save the base FEN before playing the line
        const baseFen = position;
        setAnimatedLineBaseFen(baseFen);

        // Start the animation
        animatedLine.play(line);
    }, [position, animatedLine]);

    // Key moments: notable moves worth jumping to from the highlights panel
    const keyMoments = useMemo(() => {
        const KEY_TYPES = ['blunder', 'mistake', 'miss', 'missed_win', 'inaccuracy', 'brilliant', 'great', 'great_find'];
        return engineAnnotations
            .filter(a => a.mistakeType && KEY_TYPES.includes(a.mistakeType.toLowerCase()))
            .sort((a, b) => a.plyIndex - b.plyIndex);
    }, [engineAnnotations]);

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

    // Set best move arrow from engine annotations when move changes
    useEffect(() => {
        // Only show arrows if the setting is enabled
        if (!showBestMoveArrow) {
            useBoardStore.getState().setArrows([]);
            return;
        }

        // Get annotation for current move (ply is 1-indexed, currentMoveIndex is 0-indexed)
        const annotation = currentMoveIndex >= 0 ? engineAnnotations.find(a => a.plyIndex === currentMoveIndex + 1) : null;

        if (annotation?.bestMoveUci && annotation.bestMoveUci.length >= 4) {
            const from = annotation.bestMoveUci.slice(0, 2) as Square;
            const to = annotation.bestMoveUci.slice(2, 4) as Square;

            // Green arrow for best move (same green as /analyze)
            useBoardStore.getState().setArrows([{
                from,
                to,
                color: 'rgba(82, 205, 114, 0.95)', // Green, high opacity
            }]);
        } else {
            // Clear arrows if no best move available
            useBoardStore.getState().setArrows([]);
        }
    }, [currentMoveIndex, engineAnnotations, showBestMoveArrow]);

    // State for clock times
    const [whiteTime, setWhiteTime] = useState<number | null>(null);
    const [blackTime, setBlackTime] = useState<number | null>(null);
    const [moveTimes, setMoveTimes] = useState<{ white: number[], black: number[] }>({ white: [], black: [] });

    // Parse clock times from PGN
    const parseClockTimes = (pgn: string) => {
        const wTimes: number[] = [];
        const bTimes: number[] = [];

        // Let's rely on looking for [%clk] tags using a scanner that tracks generic order
        const matches = [...pgn.matchAll(/\[%clk\s+(?:(\d+):)?(\d+):(\d+)\]/g)];

        const times = matches.map(m => {
            const h = m[1] ? parseInt(m[1]) : 0;
            const min = parseInt(m[2]);
            const s = parseInt(m[3]);
            return h * 3600 + min * 60 + s;
        });

        const w: number[] = [];
        const b: number[] = [];

        times.forEach((t, i) => {
            if (i % 2 === 0) w.push(t); // White moves
            else b.push(t);             // Black moves
        });

        return { white: w, black: b };
    };

    // Update times when game/pgn loads
    useEffect(() => {
        if (currentPgn) {
            const times = parseClockTimes(currentPgn);
            setMoveTimes(times);

            // Set initial times
            // If we have time control, use that as initial
            if (gameMetadata?.timeControl) {
                const match = gameMetadata.timeControl.match(/^(\d+)/);
                if (match) {
                    const initial = parseInt(match[1]);
                    setWhiteTime(initial);
                    setBlackTime(initial);
                } else if (times.white.length > 0) {
                    setWhiteTime(times.white[0]);
                    setBlackTime(times.white[0]);
                }
            } else {
                // Fallback to first move times
                if (times.white.length > 0) setWhiteTime(times.white[0]);
                if (times.black.length > 0) setBlackTime(times.black[0]);
            }
        }
    }, [currentPgn, gameMetadata]);

    // Update displayed time on move change
    useEffect(() => {
        if (currentMoveIndex < 0) {
            if (gameMetadata?.timeControl) {
                const match = gameMetadata.timeControl.match(/^(\d+)/);
                if (match) {
                    const t = parseInt(match[1]);
                    setWhiteTime(t);
                    setBlackTime(t);
                    return;
                }
            }
            setWhiteTime(moveTimes.white[0] || null);
            setBlackTime(moveTimes.black[0] || null);
            return;
        }

        const moveNum = Math.floor(currentMoveIndex / 2);
        const isWhite = currentMoveIndex % 2 === 0;

        if (isWhite) {
            setWhiteTime(moveTimes.white[moveNum] || whiteTime);
            if (moveNum > 0) {
                setBlackTime(moveTimes.black[moveNum - 1] || blackTime);
            } else {
                if (gameMetadata?.timeControl) {
                    const match = gameMetadata.timeControl.match(/^(\d+)/);
                    if (match) setBlackTime(parseInt(match[1]));
                } else {
                    setBlackTime(moveTimes.black[0] || blackTime);
                }
            }
        } else {
            setWhiteTime(moveTimes.white[moveNum] || whiteTime);
            setBlackTime(moveTimes.black[moveNum] || blackTime);
        }

    }, [currentMoveIndex, moveTimes, gameMetadata]);

    // Helper format
    const formatClock = (seconds: number | null) => {
        if (seconds === null) return "--:--";
        const m = Math.floor(Math.max(0, seconds) / 60);
        const s = Math.floor(Math.max(0, seconds) % 60);
        const h = Math.floor(m / 60);

        if (h > 0) {
            return `${h}:${(m % 60).toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // Create flat move list for MoveHistoryBox
    const flatMoveList = useMemo(() => {
        return displayMoves.flatMap(m => [m.white, m.black].filter(Boolean) as string[]);
    }, [displayMoves]);

    // Opening Book Explorer state
    const [bookMoves, setBookMoves] = useState<Array<{
        san: string;
        uci: string;
        white: number;
        black: number;
        draws: number;
        averageRating?: number;
    }>>([]);
    const [bookLoading, setBookLoading] = useState(false);
    const [bookError, setBookError] = useState<string | null>(null);

    // Fetch opening book data when position changes
    useEffect(() => {
        const fetchBookData = async () => {
            if (!position) return;

            try {
                setBookLoading(true);
                setBookError(null);

                // Use internal opening book (our own game DB) — avoids DNS issues in Docker
                const resp = await fetch(`${GATEWAY_URL}/opening/book/internal?fen=${encodeURIComponent(position)}`);
                if (!resp.ok) {
                    const t = await resp.text().catch(() => '');
                    throw new Error(t || `HTTP ${resp.status}`);
                }

                const data = await resp.json();
                const moves = Array.isArray(data?.moves) ? data.moves : [];
                moves.sort((a: any, b: any) => (b.white + b.black + b.draws) - (a.white + a.black + a.draws));
                setBookMoves(moves);
            } catch (e: any) {
                // Silently clear — empty book is fine, no need to surface this error
                setBookMoves([]);
            } finally {
                setBookLoading(false);
            }
        };

        fetchBookData();
    }, [position, GATEWAY_URL]);

    // Compute current annotation based on selected move
    const currentAnnotation = useMemo(() => {
        if (currentMoveIndex < 0 || engineAnnotations.length === 0) return null;
        // ply is 1-indexed (ply 1 = first move), currentMoveIndex is 0-indexed
        const plyIndex = currentMoveIndex + 1;
        return engineAnnotations.find(a => a.plyIndex === plyIndex) || null;
    }, [currentMoveIndex, engineAnnotations]);

    // Compute classification summary dynamically from engine annotations
    const dynamicClassificationSummary = useMemo(() => {
        const counts: Record<string, { white: number; black: number }> = {
            brilliant: { white: 0, black: 0 },
            great: { white: 0, black: 0 },
            best: { white: 0, black: 0 },
            excellent: { white: 0, black: 0 },
            good: { white: 0, black: 0 },
            book: { white: 0, black: 0 },
            inaccuracy: { white: 0, black: 0 },
            mistake: { white: 0, black: 0 },
            miss: { white: 0, black: 0 },
            blunder: { white: 0, black: 0 },
        };

        // Debug: log if we have annotations
        if (engineAnnotations.length > 0) {
            console.log('[GameReview] Processing', engineAnnotations.length, 'annotations for classification summary');
            // Sample first annotation for debugging
            console.log('[GameReview] Sample annotation:', engineAnnotations[0]);
        }

        // DIAGNOSTIC: Track unique mistakeTypes seen
        const uniqueTypes = new Set<string>();

        engineAnnotations.forEach(a => {
            const rawType = a.mistakeType?.toLowerCase();
            uniqueTypes.add(rawType || 'undefined');

            // Handle special cases and map to known keys
            let type = rawType;
            if (rawType === 'great_find') {
                type = 'great';
            } else if (rawType === 'missed_win') {
                type = 'miss';
            }

            // Default to 'good' if no valid classification
            const effectiveType = (type && counts[type] !== undefined) ? type : 'good';

            if (a.sideToMove === 'white') {
                counts[effectiveType].white++;
            } else {
                counts[effectiveType].black++;
            }
        });

        // DIAGNOSTIC: Log unique types found
        console.log('[GameReview] Unique mistakeTypes found:', Array.from(uniqueTypes));

        // Use the ordered list of IDs to ensure consistent UI display
        const orderedIds: ClassificationId[] = [
            'brilliant', 'great', 'best', 'excellent', 'good',
            'book', 'inaccuracy', 'mistake', 'miss', 'blunder'
        ];

        // DIAGNOSTIC: Log final computed counts
        console.log('[GameReview] Computed classification counts:', counts);

        return orderedIds.map(id => ({
            id,
            white: counts[id].white,
            black: counts[id].black
        }));
    }, [engineAnnotations]);

    // Handle game ID import (from Recent Activity, etc.)
    // This fetches the PGN by game ID from the database
    const handleGameIdImport = async (gameId: string) => {
        setIsLoadingGame(true);
        setLoadError(null);

        try {
            // Build auth headers
            const headers = await getClientAuthHeaders();

            // Fetch PGN by game ID
            const response = await fetch(`${GATEWAY_URL}/games/${gameId}/pgn`, { headers });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Game not found. It may have been deleted.');
                }
                throw new Error('Failed to load game. Please try again.');
            }

            const data = await response.json();
            const pgn = data?.pgn;

            if (!pgn) {
                throw new Error('Game data not available.');
            }

            // Use the existing PGN import handler
            await handlePgnImport(pgn);
        } catch (e: any) {
            console.error('Failed to load game by ID:', e);
            setLoadError(e?.message || 'Failed to load game.');
            setIsLoadingGame(false);
        }
    };

    // Handle URL import from extension, PGN from profile, or game ID from Recent Activity
    useEffect(() => {
        if (importGameId && !isLoadingGame) {
            handleGameIdImport(importGameId);
        } else if (importUrl && !isLoadingGame) {
            handleGameImport(importUrl);
        } else if (importPgn && !isLoadingGame) {
            handlePgnImport(importPgn);
        }
    }, [importGameId, importUrl, importPgn]);

    const handleGameImport = async (url: string, queueUsername?: string) => {
        setIsLoadingGame(true);
        setLoadError(null);

        try {
            // Validate URL format
            if (!url.includes('lichess.org') && !url.includes('chess.com')) {
                throw new Error('Invalid URL. Please use a Lichess or Chess.com game URL.');
            }

            let pgn: string | null = null;
            let data: any = {};

            // Check sessionStorage cache first (1-hour TTL)
            const CACHE_TTL = 60 * 60 * 1000;
            const cacheKey = `game-import:${url.trim().toLowerCase()}`;
            try {
                const cached = sessionStorage.getItem(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (parsed.ts && Date.now() - parsed.ts < CACHE_TTL && parsed.pgn) {
                        pgn = parsed.pgn;
                        data = parsed.data || {};
                    }
                }
            } catch { /* ignore parse errors */ }

            // Fetch from server if not cached
            if (!pgn) {
                const response = await fetch(`${GATEWAY_URL}/import/games/fetch-by-url`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, source: url.includes('lichess') ? 'lichess.org' : 'chess.com' })
                });

                if (!response.ok) {
                    const errorText = await response.text().catch(() => '');
                    if (response.status === 404) {
                        throw new Error('Game not found. Please check the URL and try again.');
                    } else if (response.status === 400) {
                        throw new Error('Invalid game URL format.');
                    }
                    throw new Error(errorText || 'Failed to fetch game from server.');
                }

                data = await response.json();
                pgn = data.pgn;

                // Cache the result
                if (pgn) {
                    try {
                        sessionStorage.setItem(cacheKey, JSON.stringify({ pgn, data, ts: Date.now() }));
                    } catch { /* storage full — ignore */ }
                }
            }

            if (!pgn) {
                throw new Error('No game data received. The game may be private or unavailable.');
            }

            // Parse PGN to extract metadata
            const parsePGNMetadata = (pgnText: string) => {
                const lines = pgnText.split('\n');
                const metadata: any = {};

                for (const line of lines) {
                    const match = line.match(/\[(\w+)\s+"([^"]+)"\]/);
                    if (match) {
                        metadata[match[1]] = match[2];
                    }
                }

                return {
                    white: metadata.White || 'Unknown',
                    black: metadata.Black || 'Unknown',
                    whiteElo: metadata.WhiteElo,
                    blackElo: metadata.BlackElo,
                    result: metadata.Result || '*',
                    date: metadata.UTCDate || metadata.Date,
                    timeControl: metadata.TimeControl
                };
            };

            const metadata = parsePGNMetadata(pgn);
            setGameMetadata(metadata);
            setCurrentPgn(pgn); // Store PGN for analysis

            // Store the game in the database
            const storeResponse = await fetch(`${GATEWAY_URL}/games`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pgn,
                    provider: data.source,
                    url
                })
            });

            if (!storeResponse.ok) {
                console.error('Failed to store game, but continuing with display');
            }

            // Parse and load the PGN moves
            try {
                const tempGame = new Chess();
                tempGame.loadPgn(pgn);

                // Get the move history
                const history = tempGame.history({ verbose: true });

                // Reset and replay to get all positions
                gameRef.current.reset();
                setPosition(gameRef.current.fen());
                setCurrentMoveIndex(-1);

                // Store the PGN for later use
                setGameHistory(history);

                // Format moves for display
                const formattedMoves: Array<{ num: number; white: string; black?: string }> = [];
                for (let i = 0; i < history.length; i += 2) {
                    formattedMoves.push({
                        num: Math.floor(i / 2) + 1,
                        white: history[i].san,
                        black: history[i + 1]?.san
                    });
                }
                setDisplayMoves(formattedMoves);

                // Initialize evaluation history
                setEvaluationHistory([{ moveNumber: 0, evaluation: 0 }]);

                // Extract clock data if available
                const clockMatch = pgn.match(/\[TimeControl "(\d+)\+(\d+)"\]/);
                if (clockMatch) {
                    const initialTime = parseInt(clockMatch[1]);
                    const minutes = Math.floor(initialTime / 60);
                    const seconds = initialTime % 60;
                    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                    setClocks({ white: timeStr, black: timeStr });
                }

                console.log('Game loaded successfully:', {
                    white: metadata.white,
                    black: metadata.black,
                    moves: history.length
                });

                // Fetch user's recent games in background for "Analyze Next Game" feature
                const usernameForQueue = (queueUsername || metadata.white || "").trim();
                if (usernameForQueue) {
                    fetchRecentGames(url, usernameForQueue);
                } else {
                    setGameQueue([]);
                    setCurrentGameIndex(0);
                }

                // Auto-trigger game analysis immediately
                // We call it without awaiting so the UI can update isLoadingGame to false
                // while isAnalyzing becomes true inside the function
                triggerGameAnalysis(pgn, metadata);

            } catch (pgnError) {
                console.error('Error parsing PGN:', pgnError);
                throw new Error('Failed to parse game moves. The PGN may be invalid.');
            }

            // Clear the URL parameter
            router.replace('/game-review');

        } catch (error: any) {
            console.error('Error importing game:', error);
            const errorMessage = error.message || 'Failed to import game. Please try again.';
            setLoadError(errorMessage);

            // Show error for 5 seconds, then clear URL parameter
            setTimeout(() => {
                router.replace('/game-review');
            }, 5000);
        } finally {
            setIsLoadingGame(false);
        }
    };

    const handlePgnImport = async (pgn: string) => {
        setIsLoadingGame(true);
        setLoadError(null);
        setGameQueue([]);
        setCurrentGameIndex(0);

        try {
            // Parse PGN to extract metadata
            const parsePGNMetadata = (pgnText: string) => {
                const lines = pgnText.split('\n');
                const metadata: any = {};

                for (const line of lines) {
                    const match = line.match(/\[(\w+)\s+"([^"]+)"\]/);
                    if (match) {
                        metadata[match[1]] = match[2];
                    }
                }

                return {
                    white: metadata.White || 'Unknown',
                    black: metadata.Black || 'Unknown',
                    whiteElo: metadata.WhiteElo,
                    blackElo: metadata.BlackElo,
                    result: metadata.Result || '*',
                    date: metadata.UTCDate || metadata.Date,
                    timeControl: metadata.TimeControl
                };
            };

            const metadata = parsePGNMetadata(pgn);
            setGameMetadata(metadata);
            setCurrentPgn(pgn); // Store PGN for analysis

            // Parse and load the PGN moves
            try {
                const tempGame = new Chess();
                tempGame.loadPgn(pgn);

                // Get the move history
                const history = tempGame.history({ verbose: true });

                // Reset and replay to get all positions
                gameRef.current.reset();
                setPosition(gameRef.current.fen());
                setCurrentMoveIndex(-1);

                // Store the PGN for later use
                setGameHistory(history);

                // Format moves for display
                const formattedMoves: Array<{ num: number; white: string; black?: string }> = [];
                for (let i = 0; i < history.length; i += 2) {
                    formattedMoves.push({
                        num: Math.floor(i / 2) + 1,
                        white: history[i].san,
                        black: history[i + 1]?.san
                    });
                }
                setDisplayMoves(formattedMoves);

                // Initialize evaluation history
                setEvaluationHistory([{ moveNumber: 0, evaluation: 0 }]);

                // Extract clock data if available
                const clockMatch = pgn.match(/\[TimeControl "(\d+)\+(\d+)"\]/);
                if (clockMatch) {
                    const initialTime = parseInt(clockMatch[1]);
                    const minutes = Math.floor(initialTime / 60);
                    const seconds = initialTime % 60;
                    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                    setClocks({ white: timeStr, black: timeStr });
                }

                console.log('Game loaded successfully from PGN:', {
                    white: metadata.white,
                    black: metadata.black,
                    moves: history.length
                });

                // Auto-trigger game analysis immediately
                triggerGameAnalysis(pgn, metadata);

            } catch (pgnError) {
                console.error('Error parsing PGN:', pgnError);
                throw new Error('Failed to parse game moves. The PGN may be invalid.');
            }

            // Clear the URL parameter
            router.replace('/game-review');

        } catch (error: any) {
            console.error('Error importing game:', error);
            const errorMessage = error.message || 'Failed to import game. Please try again.';
            setLoadError(errorMessage);

            // Show error for 5 seconds, then clear URL parameter
            setTimeout(() => {
                router.replace('/game-review');
            }, 5000);
        } finally {
            setIsLoadingGame(false);
        }
    };

    // Fetch user's recent 5 games in background
    const fetchRecentGames = async (currentGameUrl: string, username: string) => {
        if (!username) {
            setGameQueue([]);
            setCurrentGameIndex(0);
            return;
        }

        try {
            const source = currentGameUrl.includes('lichess') ? 'lichess.org' : 'chess.com';

            const response = await fetch(`${GATEWAY_URL}/import/games/fetch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source,
                    username,
                    filters: { max: 6, rated: true },
                    normalize: false
                })
            });

            if (response.ok) {
                const data = await response.json();
                const games = data.games || [];

                const queue = games
                    .filter((game: any) => {
                        const gameUrl = game.url || game.site;
                        return gameUrl !== currentGameUrl;
                    })
                    .slice(0, 5)
                    .map((game: any) => ({
                        url: game.url || game.site || '',
                        white: game.white?.name || game.White || 'Unknown',
                        black: game.black?.name || game.Black || 'Unknown',
                        date: game.date || game.Date || 'Unknown',
                        username
                    }));

                setGameQueue(queue);
                setCurrentGameIndex(0);
                console.log('Fetched game queue:', queue.length, 'games');
            } else {
                setGameQueue([]);
                setCurrentGameIndex(0);
            }
        } catch (error) {
            console.error('Failed to fetch recent games:', error);
            setGameQueue([]);
            setCurrentGameIndex(0);
        }
    };

    // Load next game from queue
    const loadNextGame = () => {
        if (isLoadingGame || isAnalyzing || currentGameIndex >= gameQueue.length) return;

        const nextGame = gameQueue[currentGameIndex];
        setCurrentGameIndex(prev => prev + 1);
        if (nextGame?.url) {
            handleGameImport(nextGame.url, nextGame.username);
        }
    };

    // Trigger game analysis for accuracy and Elo estimation
    const triggerGameAnalysis = async (pgnOverride?: string, metadataOverride?: any) => {
        const pgnToAnalyze = pgnOverride || currentPgn;
        const metadataToUse = metadataOverride || gameMetadata;

        if (!pgnToAnalyze) {
            console.warn('No PGN available for analysis');
            return;
        }

        setIsAnalyzing(true);
        setAnalysisError(null);
        try {
            const result = await analyzeGame({
                pgn: pgnToAnalyze,
                white_elo: metadataToUse?.whiteElo ? parseInt(metadataToUse.whiteElo) : undefined,
                black_elo: metadataToUse?.blackElo ? parseInt(metadataToUse.blackElo) : undefined,
                depth: 12,
            });

            // Update metrics state
            if (result.accuracy_metrics) {
                setAccuracyMetrics(result.accuracy_metrics);
            }
            if (result.elo_estimates) {
                setEloEstimates(result.elo_estimates);
            }

            // Update evaluation history from analysis - include classification from engine annotations
            if (result.move_analyses?.length > 0) {
                const annotations = result.engine_annotations || [];
                const evalHistory = result.move_analyses.map((move: any, index: number) => {
                    // Find matching annotation to get classification
                    const annotation = (annotations as any[]).find((a: any) => (a.plyIndex || a.ply_index) === index + 1);
                    const classification = (annotation?.mistakeType || annotation?.mistake_type) || undefined;

                    return {
                        moveNumber: index,
                        evaluation: move.eval.mate !== null
                            ? (move.eval.mate > 0 ? 100 : -100)
                            : move.eval.cp / 100,
                        classification
                    };
                });
                // Prepend start position
                setEvaluationHistory([{ moveNumber: -1, evaluation: 0.2, classification: 'book' }, ...evalHistory]);
            }

            // Update engine annotations
            if (result.engine_annotations) {
                const annotations = result.engine_annotations.map((a: any) => ({
                    plyIndex: a.ply_index,
                    moveSan: a.move_san,
                    sideToMove: a.side_to_move,
                    evalCp: a.eval_cp,
                    evalDelta: a.eval_delta,
                    mistakeType: a.mistake_type,
                    bestMoveSan: a.best_move_san,
                    bestMoveUci: a.best_move_uci,
                    betterMoveExists: a.better_move_exists,
                    pvSan: a.pv_san,
                    pvUci: a.pv_uci,
                    heuristicSummary: a.heuristic_summary ? {
                        advantage: a.heuristic_summary.advantage,
                        commentary: a.heuristic_summary.commentary,
                        whiteScore: a.heuristic_summary.white_score,
                        blackScore: a.heuristic_summary.black_score,
                        eval: a.heuristic_summary.eval
                    } : undefined
                }));
                setEngineAnnotations(annotations);
            }

            console.log('Game analysis complete:', {
                accuracy: result.accuracy_metrics,
                elo: result.elo_estimates
            });
        } catch (error: any) {
            console.error('Analysis error:', error);
            setAnalysisError(error?.message || 'Analysis failed — check gateway/Stockfish logs');
        } finally {
            setIsAnalyzing(false);
        }
    };


    const fetchEvaluation = async (fen: string, moveIndex: number = currentMoveIndex) => {
        setIsEvaluating(true);
        try {
            const result = await evaluate(fen);
            // Check if we're still on the same move
            if (moveIndex === currentMoveIndex) {
                setEvalScore(result.score > 0 ? `+${result.score.toFixed(2)}` : result.score.toFixed(2));
                // Update history
                setEvaluationHistory(prev => {
                    const newHistory = [...prev];
                    const existingIndex = newHistory.findIndex(h => h.moveNumber === moveIndex);
                    if (existingIndex >= 0) {
                        newHistory[existingIndex] = { ...newHistory[existingIndex], evaluation: result.score };
                    } else {
                        newHistory.push({ moveNumber: moveIndex, evaluation: result.score });
                    }
                    return newHistory.sort((a, b) => a.moveNumber - b.moveNumber);
                });
            }
        } catch (error) {
            console.error("Eval error:", error);
            setEvalScore("0.00");
        } finally {
            if (moveIndex === currentMoveIndex) {
                setIsEvaluating(false);
            }
        }
    };

    const playSoundForMove = (moveResult: Move | null) => {
        if (!moveResult) return;

        const flags = moveResult.flags || "";

        // Priority: castle > check > capture > regular move
        // Check takes priority over capture because a checking capture (e.g. Bxf7+)
        // is more urgent to signal than a regular capture
        if (flags.includes("k") || flags.includes("q")) {
            playCastleSound();
            return;
        }
        if (gameRef.current.isCheck()) {
            playCheckSound();
            return;
        }
        if (flags.includes("c")) {
            playCaptureSound();
            return;
        }

        playMoveSound();
    };

    // Navigation handlers
    const goToStart = () => {
        gameRef.current.reset();
        setPosition(gameRef.current.fen());
        setCurrentMoveIndex(-1);
        setLastMoveSquares(null);
        fetchEvaluation(gameRef.current.fen(), -1);
    };

    const goToPrevious = () => {
        if (currentMoveIndex < 0) return;

        const history = gameHistory;
        if (history.length === 0) return;

        // Rebuild position from start
        gameRef.current.reset();
        const newIndex = currentMoveIndex - 1;

        for (let i = 0; i <= newIndex; i++) {
            const move = history[i];
            if (move) {
                try {
                    gameRef.current.move(move);
                } catch (e) {
                    console.error("Invalid move:", move, e);
                    break;
                }
            }
        }

        const lastMove = newIndex >= 0 ? history[newIndex] : null;
        setLastMoveSquares(lastMove ? { from: lastMove.from as Square, to: lastMove.to as Square } : null);
        setPosition(gameRef.current.fen());
        setCurrentMoveIndex(newIndex);
        fetchEvaluation(gameRef.current.fen(), newIndex);
        if (lastMove) playSoundForMove(lastMove as Move);
    };

    const goToNext = () => {
        const history = gameHistory;
        if (history.length === 0) return;
        if (currentMoveIndex >= history.length - 1) return;

        const newIndex = currentMoveIndex + 1;
        const move = history[newIndex];

        if (!move) return;

        try {
            const moveResult = gameRef.current.move(move);
            setPosition(gameRef.current.fen());
            setCurrentMoveIndex(newIndex);
            setLastMoveSquares(moveResult ? { from: moveResult.from as Square, to: moveResult.to as Square } : null);
            fetchEvaluation(gameRef.current.fen(), newIndex);
            playSoundForMove(moveResult as Move | null);
        } catch (e) {
            console.error("Invalid move:", move, e);
        }
    };

    const goToEnd = () => {
        const history = gameHistory;
        if (history.length === 0) return;

        gameRef.current.reset();
        let finalMove: Move | null = null;

        // Play all moves
        for (const move of history) {
            try {
                const result = gameRef.current.move(move);
                if (result) finalMove = result as Move;
            } catch (e) {
                console.error("Invalid move:", e);
                break;
            }
        }

        setPosition(gameRef.current.fen());
        setCurrentMoveIndex(history.length - 1);
        setLastMoveSquares(finalMove ? { from: finalMove.from as Square, to: finalMove.to as Square } : null);
        playSoundForMove(finalMove);
        fetchEvaluation(gameRef.current.fen(), history.length - 1);
    };

    // Navigate to specific move index
    const goToMoveIndex = (moveIdx: number) => {
        if (moveIdx < 0) {
            goToStart();
            return;
        }
        const history = gameHistory;
        if (moveIdx < history.length) {
            gameRef.current.reset();
            let lastValidIndex = -1;
            for (let i = 0; i <= moveIdx; i++) {
                try {
                    gameRef.current.move(history[i]);
                    lastValidIndex = i;
                } catch {
                    console.warn(`Invalid move at index ${i}, stopping at last valid position`);
                    break;
                }
            }
            setPosition(gameRef.current.fen());
            const actualIndex = lastValidIndex;
            setCurrentMoveIndex(actualIndex);
            const move = actualIndex >= 0 ? history[actualIndex] : null;
            setLastMoveSquares(move ? { from: move.from as Square, to: move.to as Square } : null);
            fetchEvaluation(gameRef.current.fen(), actualIndex);
            playSoundForMove(move as Move | null);
        }
    };

    // Fetch initial evaluation on mount
    useEffect(() => {
        fetchEvaluation(gameRef.current.fen());
    }, []);

    useEffect(() => {
        setMounted(true);
        const calculateBoardSize = () => {
            if (typeof window !== 'undefined') {
                const isDesktop = window.innerWidth >= 1280; // xl breakpoint
                if (isDesktop) {
                    // Use the remaining viewport space under navbar/padding.
                    const navbarHeight = 56; // h-14
                    const verticalPadding = 32; // p-4 top + bottom
                    const extraVerticalBuffer = 24; // captured pieces / gap safety
                    const availableHeight = window.innerHeight - navbarHeight - verticalPadding - extraVerticalBuffer;

                    // Reserve fixed sidebar + board eval bar + layout spacing on desktop.
                    const sidebarWidth = 450;
                    const evalBarWidth = 32;
                    const layoutGap = 20; // gap-5
                    const horizontalPadding = 32; // p-4 left + right
                    const extraHorizontalBuffer = 24;
                    const availableWidth =
                        window.innerWidth -
                        sidebarWidth -
                        evalBarWidth -
                        layoutGap -
                        horizontalPadding -
                        extraHorizontalBuffer;

                    const size = Math.max(320, Math.min(availableWidth, availableHeight));
                    setBoardSize(size);
                } else {
                    // Smaller screens: size by width, cap at 2/3 viewport height
                    const size = Math.min(window.innerWidth * 0.85, (window.innerHeight * 2) / 3);
                    setBoardSize(size);
                }
            }
        };
        calculateBoardSize();
        window.addEventListener('resize', calculateBoardSize);
        return () => window.removeEventListener('resize', calculateBoardSize);
    }, []);

    // Keyboard navigation
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            // Ignore if typing in an input
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
                return;
            }

            // Block navigation while analysis is in progress
            if (isAnalyzing) return;

            if (event.key === "ArrowLeft") {
                event.preventDefault();
                goToPrevious();
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                goToNext();
            } else if (event.key === "f" || event.key === "F") {
                event.preventDefault();
                setOrientation((o) => (o === "white" ? "black" : "white"));
            }
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentMoveIndex, gameHistory, isAnalyzing]);

    // Helper to convert hex to rgba
    const hexToRgba = (hex: string, alpha: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    // Get current move classification color
    const getCurrentMoveColor = () => {
        if (currentMoveIndex < 0) return null;

        // Try to find in engineAnnotations
        // Annotations usually have plyIndex matching the move ply (1-based)
        // currentMoveIndex 0 -> Ply 1
        const ply = currentMoveIndex + 1;
        const annotation = engineAnnotations.find(a => a.plyIndex === ply);

        if (annotation && annotation.mistakeType) {
            let badgeKey = annotation.mistakeType;
            // Map 'great' to 'great_find' to match badge styles keys if needed
            if (badgeKey === 'great') badgeKey = 'great_find';

            // Cast to key type to check existence
            if (badgeKey in CLASSIFICATION_BADGE_STYLES) {
                return CLASSIFICATION_BADGE_STYLES[badgeKey as keyof typeof CLASSIFICATION_BADGE_STYLES].style.backgroundColor;
            }
        }

        // Fallback: Check hardcoded analysis moves (legacy/demo support)
        const moveNum = Math.floor(currentMoveIndex / 2) + 1;
        const color = currentMoveIndex % 2 === 0 ? 'w' : 'b';

        const analysisMove = ANALYSIS_MOVES.find(m => m.num === moveNum && m.color === color);
        if (analysisMove && CLASSIFICATION_BADGE_STYLES[analysisMove.badge]) {
            return CLASSIFICATION_BADGE_STYLES[analysisMove.badge].style.backgroundColor;
        }

        return null;
    };

    const moveColor = getCurrentMoveColor();

    // Generate arrows
    const getArrows = () => {
        const arrows: any[] = [];

        // Drawing arrows
        const drawingArrows = drawing.getCustomArrows();
        if (drawingArrows) {
            arrows.push(...drawingArrows);
        }

        // Threat Arrows (Red)
        if (showThreatArrows) {
            // Simple threat logic: show attacks on higher value pieces or undefended pieces by the side to move
            // For now, let's show attacks by the last moved piece if it attacks something
            if (lastMoveSquares) {
                const game = new Chess(gameRef.current.fen());
                // This is tricky without full engine analysis. 
                // Let's visualize attacks from the last moved piece to any opponent piece
                // Actually, the user said "from piece square to attack square if it is threatening"
                // Maybe we can iterate over all moves for the current side and see if they capture something valuable?
                // Or better: check if the last move (opponent's move) created a threat?
                // Let's stick to: If it's White's turn, show Black's threats? No, show White's threats?
                // "User can select to show red arrows... if it is threatening"
                // Let's try to show attacks by the *current* side to move that capture a piece.

                const moves = game.moves({ verbose: true });
                moves.forEach(move => {
                    if (move.flags.includes('c') || move.flags.includes('e')) {
                        // It's a capture. Is it a "threat"? Maybe.
                        // Let's just show all captures for now as "threats" to demonstrate functionality
                        // A real threat is more complex.
                        // But "red arrows from piece square to attack square" implies showing attacks.
                        // Let's show attacks on pieces.
                        arrows.push([move.from as Square, move.to as Square, "rgba(239, 68, 68, 0.8)"]); // Red-500
                    }
                });
            }
        }

        return arrows;
    };

    const customSquareStyles = {
        ...(lastMoveSquares && {
            [lastMoveSquares.from]: {
                backgroundColor: moveColor ? hexToRgba(moveColor, 0.4) : "rgba(250, 204, 21, 0.35)",
                boxShadow: moveColor ? `inset 0 0 0 3px ${hexToRgba(moveColor, 0.5)}` : "inset 0 0 0 3px rgba(0, 0, 0, 0.2)",
            },
            [lastMoveSquares.to]: {
                backgroundColor: moveColor ? hexToRgba(moveColor, 0.4) : "#fde68a",
                boxShadow: moveColor ? `inset 0 0 0 3px ${hexToRgba(moveColor, 0.5)}` : "inset 0 0 0 3px rgba(0, 0, 0, 0.25)",
            },
        }),
        ...drawing.getDrawingSquareStyles(),
    };

    return (
        <div className="flex flex-col min-h-screen xl:h-[calc(100dvh-3.5rem)] bg-background p-2 lg:p-4 overflow-y-auto xl:overflow-hidden">
            <h1 className="sr-only">Game Review</h1>
            {/* Error Banner */}
            {loadError && (
                <div className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                        <span className="text-red-900 dark:text-red-100 font-medium">{loadError}</span>
                    </div>
                </div>
            )}

            <div className="flex flex-col xl:flex-row gap-5 w-full mx-auto items-stretch justify-center flex-1 min-h-0">

                {/* LEFT COLUMN: Board & Controls (Center in old layout) */}
                <div className="flex flex-col items-center gap-2 order-1 xl:h-full xl:justify-center">
                    <div className="flex items-center gap-0 mb-2">
                        <div className="w-8" style={{ height: boardSize }}>
                            <EvaluationBar
                                evalScore={evalScore || "0.00"}
                                orientation={orientation}
                            />
                        </div>
                        <div
                            ref={boardRef}
                            className="relative bg-card shadow-sm rounded-sm"
                            style={{
                                width: boardSize,
                                height: boardSize,
                                maxWidth: '90vw',
                                maxHeight: '90vw'
                            }}
                        >
                            {/* Captured pieces above board */}
                            <div className="absolute -top-8 left-0 right-0 flex justify-end pr-1 pointer-events-none">
                                <CapturedPieces fen={position} orientation={orientation} side="top" />
                            </div>
                            {/* Captured pieces below board */}
                            <div className="absolute -bottom-8 left-0 right-0 flex justify-end pr-1 pointer-events-none">
                                <CapturedPieces fen={position} orientation={orientation} side="bottom" />
                            </div>
                            <div
                                onMouseDown={drawing.handleMouseDown}
                                onMouseUp={drawing.handleMouseUp}
                                onContextMenu={drawing.handleContextMenu}
                                className="relative"
                                style={{ width: "100%", height: "100%" }}
                            >
                                <Chessboard
                                    position={position}
                                    boardWidth={boardSize}
                                    boardOrientation={orientation}
                                    customDarkSquareStyle={{ backgroundColor: '#B58863' }}
                                    customLightSquareStyle={{ backgroundColor: '#F0D9B5' }}
                                    arePiecesDraggable={false}
                                    animationDuration={300}
                                    customSquareStyles={customSquareStyles}
                                    customArrows={getArrows()}
                                />

                                {/* Non-LLM Commentary Overlay - Canvas for tactical visualizations */}
                                <NonLLMCommentaryOverlay
                                    enabled={!!activeAffordance}
                                    boardSize={boardSize}
                                    orientation={orientation}
                                    affordance={activeAffordance}
                                />
                                {/* Canvas overlay for ripples and visual effects */}
                                <OverlayCanvas className="absolute inset-0 pointer-events-none z-10" />

                                {/* Analysis loading overlay — blocks interaction until analysis is complete */}
                                {isAnalyzing && (
                                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-sm"
                                        style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}>
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="relative">
                                                <Image
                                                    src="/logo.svg"
                                                    alt="Analyzing…"
                                                    width={64}
                                                    height={64}
                                                    className="opacity-90"
                                                />
                                                <span className="absolute -inset-3 rounded-full border-2 border-white/30 border-t-white animate-spin" style={{ animationDuration: '1.2s' }} />
                                            </div>
                                            <p className="text-white text-sm font-medium tracking-wide opacity-90">Analyzing game…</p>
                                        </div>
                                    </div>
                                )}

                                {/* Move classification SVG icon at top-right of target square */}
                                {lastMoveSquares && currentAnnotation?.mistakeType && (() => {
                                    const squareSize = boardSize / 8;
                                    const file = lastMoveSquares.to.charCodeAt(0) - 97; // 0-7
                                    const rank = parseInt(lastMoveSquares.to[1]) - 1; // 0-7

                                    // Calculate position based on orientation
                                    const x = orientation === 'white' ? file * squareSize : (7 - file) * squareSize;
                                    const y = orientation === 'white' ? (7 - rank) * squareSize : rank * squareSize;

                                    // Map classification to icon path
                                    const iconMap: Record<string, string> = {
                                        brilliant: '/svg/brilliant.svg',
                                        great: '/svg/great_find.svg',
                                        best: '/svg/best.svg',
                                        excellent: '/svg/excellent.svg',
                                        good: '/svg/good.svg',
                                        inaccuracy: '/svg/inaccuracy.svg',
                                        mistake: '/svg/mistake.svg',
                                        blunder: '/svg/blunder.svg',
                                        miss: '/svg/miss.svg',
                                        missed_win: '/svg/missed_win.svg',
                                        book: '/svg/book.svg',
                                    };

                                    const iconPath = iconMap[currentAnnotation.mistakeType.toLowerCase()];
                                    if (!iconPath) return null;

                                    const iconSize = squareSize * 0.4;

                                    return (
                                        <div
                                            className="absolute pointer-events-none z-20"
                                            style={{
                                                left: x + squareSize - iconSize * 0.85,
                                                top: y - iconSize * 0.15,
                                                width: iconSize,
                                                height: iconSize,
                                            }}
                                        >
                                            <Image
                                                src={iconPath}
                                                alt={currentAnnotation.mistakeType}
                                                width={iconSize}
                                                height={iconSize}
                                                className="w-full h-full"
                                            />
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Analysis status pill below the board */}
                    {isAnalyzing && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Analyzing game — move icons will appear when done</span>
                        </div>
                    )}
                    {analysisError && !isAnalyzing && (
                        <div className="flex items-center gap-2 text-xs text-red-500 dark:text-red-400 px-2">
                            <AlertTriangle className="w-3 h-3" />
                            <span>{analysisError}</span>
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: Sidebar (Unified) */}
                <div
                    className="flex flex-col gap-2 w-full xl:w-[450px] order-2 min-h-0 xl:h-full"
                    style={{
                        minWidth: mounted && window.innerWidth >= 1280 ? 320 : undefined,
                        height: mounted && window.innerWidth >= 1280 ? "100%" : undefined
                    }}
                >
                    <Card className="flex-1 flex flex-col overflow-hidden bg-card shadow-sm border rounded-lg">
                        {/* 1. Header (Players/Clocks) */}
                        <CardHeader className="p-3 bg-muted border-b shrink-0">
                            {gameMetadata ? (
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center text-xs font-bold">W</div>
                                            <div>
                                                <div className="text-sm font-bold">{gameMetadata.white}</div>
                                                <div className="flex items-center gap-1.5">
                                                    {gameMetadata.whiteElo && <div className="text-xs text-gray-500 dark:text-gray-400">{gameMetadata.whiteElo}</div>}
                                                    {(whiteTime !== null) && (
                                                        <div className="flex items-center gap-1 bg-gray-200/50 dark:bg-gray-800/50 px-1.5 py-0.5 rounded text-xs font-mono font-medium text-gray-700 dark:text-gray-200">
                                                            <Clock className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                                                            {formatClock(whiteTime)}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-sm font-bold text-gray-400 dark:text-gray-500">vs</div>
                                        <div className="flex items-center gap-2 text-right">
                                            <div className="flex flex-col items-end">
                                                <div className="text-sm font-bold">{gameMetadata.black}</div>
                                                <div className="flex items-center gap-1.5 justify-end">
                                                    {(blackTime !== null) && (
                                                        <div className="flex items-center gap-1 bg-gray-200/50 dark:bg-gray-800/50 px-1.5 py-0.5 rounded text-xs font-mono font-medium text-gray-700 dark:text-gray-200">
                                                            {formatClock(blackTime)}
                                                            <Clock className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                                                        </div>
                                                    )}
                                                    {gameMetadata.blackElo && <div className="text-xs text-gray-500 dark:text-gray-400">{gameMetadata.blackElo}</div>}
                                                </div>
                                            </div>
                                            <div className="w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-xs font-bold">B</div>
                                        </div>
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                                        <span>{gameMetadata.date || 'Unknown date'}</span>
                                        <span>{formatTimeControl(gameMetadata.timeControl)}</span>
                                    </div>
                                    <div className="text-center">
                                        <Badge variant={
                                            gameMetadata.result === '1-0' ? 'default' :
                                                gameMetadata.result === '0-1' ? 'secondary' :
                                                    'outline'
                                        }>
                                            {gameMetadata.result === '1-0' ? `${gameMetadata.white} won` :
                                                gameMetadata.result === '0-1' ? `${gameMetadata.black} won` :
                                                    gameMetadata.result === '1/2-1/2' ? 'Draw' :
                                                        'In progress'}
                                        </Badge>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center text-xs font-bold">W</div>
                                        <div>
                                            <div className="text-sm font-bold">Player 1</div>
                                            <div className="text-xs text-gray-500">1500</div>
                                        </div>
                                    </div>
                                    <div className="text-sm font-bold text-gray-400">vs</div>
                                    <div className="flex items-center gap-2 text-right">
                                        <div>
                                            <div className="text-sm font-bold">Player 2</div>
                                            <div className="text-xs text-gray-500">1500</div>
                                        </div>
                                        <div className="w-8 h-8 bg-gray-800 text-white rounded flex items-center justify-center text-xs font-bold">B</div>
                                    </div>
                                </div>
                            )}
                        </CardHeader>

                        {/* 2. Evaluation Graph (Reduced height) */}
                        <div className="h-32 w-full bg-card border-b shrink-0 p-0 relative group">
                            <EvaluationGraph
                                evaluations={evaluationHistory.length > 0 ? evaluationHistory : [{ moveNumber: -1, evaluation: 0, classification: 'book' }]}
                                currentMoveIndex={currentMoveIndex}
                                onMoveClick={(index) => {
                                    const point = evaluationHistory[index];
                                    if (point && point.moveNumber !== undefined) {
                                        const moveIdx = point.moveNumber;
                                        if (moveIdx < 0) {
                                            goToStart();
                                        } else {
                                            const history = gameHistory;
                                            if (moveIdx < history.length) {
                                                gameRef.current.reset();
                                                for (let i = 0; i <= moveIdx; i++) {
                                                    gameRef.current.move(history[i]);
                                                }
                                                setPosition(gameRef.current.fen());
                                                setCurrentMoveIndex(moveIdx);
                                                const move = history[moveIdx];
                                                setLastMoveSquares(move ? { from: move.from as Square, to: move.to as Square } : null);
                                                fetchEvaluation(gameRef.current.fen(), moveIdx);
                                            }
                                        }
                                    }
                                }}
                                className="w-full h-full"
                            />
                        </div>

                        {/* 3. Position Evaluation with Non-LLM Commentary */}
                        <div className="w-full relative shrink-0 border-b">
                            {/* Animation Playing Indicator */}
                            {animatedLine.isPlaying && (
                                <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 z-10">
                                    <Badge
                                        variant="secondary"
                                        className="bg-blue-500 text-white shadow-lg animate-pulse flex items-center gap-1.5"
                                    >
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Playing line... ({animatedLine.currentMoveIndex + 1}/{animatedLine.currentLine.length})
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-4 px-1 ml-1 text-white hover:bg-blue-600"
                                            onClick={() => animatedLine.stop()}
                                        >
                                            ✕
                                        </Button>
                                    </Badge>
                                </div>
                            )}
                            <PositionEvaluationBubble
                                fen={position}
                                plyCount={currentMoveIndex + 1}
                                onDrawAffordance={setActiveAffordance}
                                onShowFollowUp={handleShowFollowUp}
                                moveSan={currentMoveIndex >= 0 ? gameHistory[currentMoveIndex]?.san : undefined}
                                evalScore={evalScore ? parseFloat(evalScore) : undefined}
                                preMoveFen={currentMoveIndex >= 0 ? (gameHistory[currentMoveIndex]?.before || undefined) : undefined}
                                moveClassification={currentMoveIndex >= 0 ? (engineAnnotations[currentMoveIndex]?.mistakeType || undefined) : undefined}
                            />

                        </div>

                        {/* 4. Action Buttons */}
                        <div className="flex gap-2 p-2 shrink-0 bg-gray-50/50 dark:bg-gray-900/50 border-b">
                            <Dialog open={isGameIdDialogOpen} onOpenChange={setIsGameIdDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button className="flex-1" size="sm" variant="outline">
                                        Analyze New
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl">
                                    <DialogHeader>
                                        <DialogTitle>Import Game</DialogTitle>
                                    </DialogHeader>
                                    <Tabs defaultValue="url" className="w-full">
                                        <TabsList className="grid w-full grid-cols-2">
                                            <TabsTrigger value="url">Import URL</TabsTrigger>
                                            <TabsTrigger value="search">Search User</TabsTrigger>
                                        </TabsList>
                                        <TabsContent value="url">
                                            <div className="space-y-4 pt-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="game-url" id="game-url-label" className="text-sm font-medium">
                                                        Game URL or ID
                                                    </Label>
                                                    <Input
                                                        id="game-url"
                                                        aria-labelledby="game-url-label"
                                                        placeholder="https://lichess.org/... or chess.com/..."
                                                        value={gameIdInput}
                                                        onChange={(e) => setGameIdInput(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' && gameIdInput.trim()) {
                                                                handleGameImport(gameIdInput.trim());
                                                                setIsGameIdDialogOpen(false);
                                                                setGameIdInput("");
                                                            }
                                                        }}
                                                    />
                                                </div>
                                                <Button
                                                    className="w-full"
                                                    onClick={() => {
                                                        if (gameIdInput.trim()) {
                                                            handleGameImport(gameIdInput.trim());
                                                            setIsGameIdDialogOpen(false);
                                                            setGameIdInput("");
                                                        }
                                                    }}
                                                    disabled={!gameIdInput.trim()}
                                                >
                                                    Import Game
                                                </Button>
                                            </div>
                                        </TabsContent>
                                        <TabsContent value="search">
                                            <UserGamesSearchPanel
                                                onSelectGame={(pgn, url, selectedUser) => {
                                                    if (url) {
                                                        handleGameImport(url, selectedUser?.username);
                                                    } else {
                                                        handlePgnImport(pgn);
                                                    }
                                                    setIsGameIdDialogOpen(false);
                                                }}
                                            />
                                        </TabsContent>
                                    </Tabs>
                                </DialogContent>
                            </Dialog>
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                disabled={remainingQueuedGames === 0 || isLoadingGame || isAnalyzing}
                                onClick={loadNextGame}
                                title={nextQueuedGame ? `Next: ${nextQueuedGame.white} vs ${nextQueuedGame.black} (${nextQueuedGame.date})` : undefined}
                            >
                                <SkipForward className="w-4 h-4 mr-1" />
                                {remainingQueuedGames > 0 ? `Analyze Next (${remainingQueuedGames})` : 'Analyze Next'}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                disabled={!currentPgn}
                                onClick={() => {
                                    if (currentPgn) {
                                        const encodedPgn = encodeURIComponent(currentPgn);
                                        window.location.href = `/analyze?pgn=${encodedPgn}`;
                                    }
                                }}
                            >
                                Open Analysis
                            </Button>
                        </div>

                        {/* 5. Tabs (Report, Analysis, etc.) */}
                        <div className="flex-1 min-h-0 flex flex-col">
                            <Tabs defaultValue="report" className="w-full h-full flex flex-col">
                                <div className="p-1 bg-muted m-2 rounded-lg shrink-0">
                                    <TabsList className="w-full justify-start bg-transparent p-0 h-auto flex-wrap">
                                        <TabsTrigger value="report" className="flex-1 min-w-[60px]">Report</TabsTrigger>
                                        <TabsTrigger value="analysis" className="flex-1 min-w-[60px]">Analysis</TabsTrigger>
                                        <TabsTrigger value="explorer" className="flex-1 min-w-[60px]">Explorer</TabsTrigger>
                                        <TabsTrigger value="settings" className="flex-1 min-w-[60px]">Settings</TabsTrigger>
                                    </TabsList>
                                </div>

                                <div className="flex-1 overflow-hidden flex flex-col">
                                    {/* TAB: REPORT */}
                                    <TabsContent value="report" className="mt-0 flex-1 flex flex-col h-full">
                                        {showMoveHistory ? (
                                            /* Move History Panel */
                                            <div className="flex flex-col h-full">
                                                <div className="p-3 border-b bg-muted flex items-center justify-between">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setShowMoveHistory(false)}
                                                        className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                                                    >
                                                        <ArrowLeft className="w-4 h-4 mr-1" />
                                                        Back to Report
                                                    </Button>
                                                </div>
                                                <ScrollArea className="flex-1">
                                                    <div className="p-4">
                                                        <MoveHistoryBox
                                                            moves={flatMoveList}
                                                            currentMoveIndex={currentMoveIndex}
                                                            onMoveClick={(index) => goToMoveIndex(index)}
                                                        />
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                        ) : (
                                            /* Highlights Panel */
                                            <ScrollArea className="flex-1">
                                                {/* Move List toggle */}
                                                <div className="px-4 pt-3 pb-2 border-b flex justify-end">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setShowMoveHistory(true)}
                                                        className="text-xs"
                                                    >
                                                        Move List
                                                    </Button>
                                                </div>

                                                {/* Key Moments Section */}
                                                {keyMoments.length > 0 && (
                                                    <div className="p-4 border-b">
                                                        <div className="flex items-center gap-2 font-medium mb-3 text-sm text-gray-900 dark:text-gray-100">
                                                            <Swords className="w-4 h-4" /> Key Moments
                                                        </div>
                                                        <div className="space-y-1">
                                                            {keyMoments.map((annotation) => {
                                                                const moveNum = Math.ceil(annotation.plyIndex / 2);
                                                                const isBlack = annotation.plyIndex % 2 === 0;
                                                                const moveLabel = isBlack
                                                                    ? `${moveNum}...${annotation.moveSan}`
                                                                    : `${moveNum}.${annotation.moveSan}`;
                                                                const rawType = annotation.mistakeType?.toLowerCase() ?? 'good';
                                                                const iconKey = (rawType === 'great_find' ? 'great' : rawType === 'missed_win' ? 'miss' : rawType) as ClassificationId;
                                                                const icon = CLASSIFICATION_ICONS[iconKey] ?? CLASSIFICATION_ICONS['good'];
                                                                const badgeStyle = CLASSIFICATION_BADGE_STYLES[iconKey] ?? CLASSIFICATION_BADGE_STYLES['good'];
                                                                const isActive = currentMoveIndex === annotation.plyIndex - 1;
                                                                return (
                                                                    <button
                                                                        key={annotation.plyIndex}
                                                                        type="button"
                                                                        onClick={() => goToMoveIndex(annotation.plyIndex - 1)}
                                                                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left ${isActive ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                                                                    >
                                                                        <Image src={icon.icon} alt={icon.label} width={18} height={18} className="shrink-0" />
                                                                        <span className="font-mono flex-1 text-gray-800 dark:text-gray-200">{moveLabel}</span>
                                                                        <Badge
                                                                            variant={badgeStyle.variant}
                                                                            style={badgeStyle.style}
                                                                            className="text-xs border-0 shrink-0"
                                                                        >
                                                                            {icon.label}
                                                                        </Badge>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Accuracy Section */}
                                                <div className="p-4 border-b">
                                                    <div className="flex items-center gap-2 font-medium mb-4 text-sm text-gray-900 dark:text-gray-100">
                                                        <Target className="w-4 h-4" /> Accuracy
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger><Info className="w-3 h-3 text-gray-400" /></TooltipTrigger>
                                                                <TooltipContent className="max-w-xs">
                                                                    <p>Calculated using the Lichess algorithm based on win probability changes per move.</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    </div>

                                                    {isAnalyzing ? (
                                                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                            <span>Analyzing game...</span>
                                                        </div>
                                                    ) : analysisError ? (
                                                        <div className="space-y-2">
                                                            <p className="text-sm text-red-500 dark:text-red-400">{analysisError}</p>
                                                            {currentPgn && (
                                                                <Button onClick={() => triggerGameAnalysis()} size="sm" variant="outline" className="w-full">
                                                                    Retry Analysis
                                                                </Button>
                                                            )}
                                                        </div>
                                                    ) : accuracyMetrics ? (
                                                        <div className="space-y-4">
                                                            {(() => {
                                                                const getAccuracyColor = (accuracy: number) => {
                                                                    if (accuracy >= 98) return "bg-[#1bada6]";
                                                                    if (accuracy >= 90) return "bg-[#96bc4b]";
                                                                    if (accuracy >= 80) return "bg-[#96af8b]";
                                                                    if (accuracy >= 70) return "bg-[#f7c045]";
                                                                    return "bg-[#ca3431]";
                                                                };

                                                                return (
                                                                    <>
                                                                        <div className="space-y-1">
                                                                            <div className="flex justify-between text-sm">
                                                                                <span className="font-medium">{gameMetadata?.white || 'White'}</span>
                                                                                <span className="font-bold">{accuracyMetrics.white.toFixed(1)}%</span>
                                                                            </div>
                                                                            <Progress
                                                                                value={accuracyMetrics.white}
                                                                                className="h-2"
                                                                                indicatorClassName={getAccuracyColor(accuracyMetrics.white)}
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            <div className="flex justify-between text-sm">
                                                                                <span className="font-medium">{gameMetadata?.black || 'Black'}</span>
                                                                                <span className="font-bold">{accuracyMetrics.black.toFixed(1)}%</span>
                                                                            </div>
                                                                            <Progress
                                                                                value={accuracyMetrics.black}
                                                                                className="h-2"
                                                                                indicatorClassName={getAccuracyColor(accuracyMetrics.black)}
                                                                            />
                                                                        </div>
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-3">
                                                            <p className="text-sm text-gray-500 dark:text-gray-400">No accuracy data available.</p>
                                                            {currentPgn && (
                                                                <Button
                                                                    onClick={() => triggerGameAnalysis()}
                                                                    disabled={isAnalyzing}
                                                                    size="sm"
                                                                    className="w-full"
                                                                >
                                                                    <Sparkles className="w-4 h-4 mr-2" />
                                                                    Analyze Game
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Performance Rating Section */}
                                                {eloEstimates && (
                                                    <div className="p-4 border-b">
                                                        <div className="flex items-center gap-2 font-medium mb-4 text-sm text-gray-900 dark:text-gray-100">
                                                            <TrendingUp className="w-4 h-4" /> Performance Rating
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger><Info className="w-3 h-3 text-gray-400" /></TooltipTrigger>
                                                                    <TooltipContent className="max-w-xs">
                                                                        <p>Estimated Elo based on average centipawn loss. Adjusted using known ratings when available.</p>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                        </div>

                                                        <div className="space-y-3">
                                                            {/* White Player */}
                                                            <div className="flex justify-between items-center">
                                                                <div>
                                                                    <span className="text-sm font-medium">{gameMetadata?.white || 'White'}</span>
                                                                    {eloEstimates.white.known_rating && (
                                                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                                                            Actual: {eloEstimates.white.known_rating}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <span className="text-lg font-bold">
                                                                    {Math.round(eloEstimates.white.adjusted ?? eloEstimates.white.estimated)}
                                                                </span>
                                                            </div>

                                                            {/* Black Player */}
                                                            <div className="flex justify-between items-center">
                                                                <div>
                                                                    <span className="text-sm font-medium">{gameMetadata?.black || 'Black'}</span>
                                                                    {eloEstimates.black.known_rating && (
                                                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                                                            Actual: {eloEstimates.black.known_rating}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <span className="text-lg font-bold">
                                                                    {Math.round(eloEstimates.black.adjusted ?? eloEstimates.black.estimated)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Classifications Section */}
                                                <div className="p-4">
                                                    <div className="flex items-center gap-2 font-medium mb-4 text-sm text-gray-900 dark:text-gray-100">
                                                        <Swords className="w-4 h-4" /> Classifications
                                                    </div>
                                                    <div className="space-y-3 text-sm">
                                                        {dynamicClassificationSummary.map(({ id, white, black }) => {
                                                            const icon = CLASSIFICATION_ICONS[id];
                                                            const getCountColor = (id: string) => {
                                                                switch (id) {
                                                                    case 'brilliant': return '#1bada6';
                                                                    case 'great': return '#2596be';
                                                                    case 'best': return '#96bc4b';
                                                                    case 'excellent': return '#96bc4b';
                                                                    case 'good': return '#96af8b';
                                                                    case 'book': return '#a88865';
                                                                    case 'inaccuracy': return '#f7c045';
                                                                    case 'mistake': return '#e58f2a';
                                                                    case 'miss': return '#ca3431';
                                                                    case 'blunder': return '#ca3431';
                                                                    default: return '#374151';
                                                                }
                                                            };
                                                            const countColor = getCountColor(id);

                                                            return (
                                                                <div key={id} className="flex items-center justify-between">
                                                                    <span className="font-medium text-gray-700 dark:text-gray-200 w-24">{icon.label}</span>
                                                                    <div className="flex items-center gap-8">
                                                                        <span className="font-bold w-6 text-center" style={{ color: countColor }}>{white}</span>
                                                                        <div className="flex items-center justify-center w-8">
                                                                            <Image
                                                                                src={icon.icon}
                                                                                alt={`${icon.label} icon`}
                                                                                width={24}
                                                                                height={24}
                                                                            />
                                                                        </div>
                                                                        <span className="font-bold w-6 text-center" style={{ color: countColor }}>{black}</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </ScrollArea>
                                        )}
                                    </TabsContent>

                                    {/* TAB: ANALYSIS */}
                                    <TabsContent value="analysis" className="mt-0 flex-1 flex flex-col h-full">
                                        <div className="p-3 border-b bg-gray-50 dark:bg-gray-900/50 flex flex-row items-center justify-between shrink-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-sm">Engine</span>
                                                <Switch
                                                    id="engine-mode"
                                                    checked={showEngineDetails}
                                                    onCheckedChange={setShowEngineDetails}
                                                />
                                            </div>
                                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                                        </div>
                                        <ScrollArea className="flex-1 p-2">
                                            <div className="space-y-2 pb-2">
                                                {showEngineDetails ? (
                                                    <MoveEngineComment
                                                        annotation={currentAnnotation}
                                                        isLoading={isAnalyzing}
                                                        onPlayFollowUp={(pvSan) => {
                                                            console.log('Play follow-up:', pvSan);
                                                        }}
                                                    />
                                                ) : (
                                                    <Card className="border shadow-sm">
                                                        <CardContent className="p-3">
                                                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                                                Engine details are hidden. Move-by-move classifications remain visible.
                                                            </p>
                                                        </CardContent>
                                                    </Card>
                                                )}
                                                {ANALYSIS_MOVES.map((item, idx) => {
                                                    const icon = CLASSIFICATION_ICONS[item.badge];
                                                    const badgeStyle = CLASSIFICATION_BADGE_STYLES[item.badge];
                                                    return (
                                                        <Card key={idx} className="border shadow-sm">
                                                            <CardContent className="p-3">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <div className="flex items-start gap-3">
                                                                        <Image
                                                                            src={icon.icon}
                                                                            alt={`${icon.label} icon`}
                                                                            width={32}
                                                                            height={32}
                                                                            className=""
                                                                        />
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="font-mono text-gray-500 dark:text-gray-400">{item.num}.</span>
                                                                                <span className="font-bold text-lg">{item.move}</span>
                                                                                <Badge
                                                                                    variant={badgeStyle?.variant ?? "outline"}
                                                                                    style={badgeStyle?.style}
                                                                                    className="border-0"
                                                                                >
                                                                                    {icon.label}
                                                                                </Badge>
                                                                            </div>
                                                                            <span className="text-xs text-gray-500 dark:text-gray-400">{item.color === "w" ? "White" : "Black"} move</span>
                                                                        </div>
                                                                    </div>
                                                                    {showEngineDetails && (
                                                                        <span className="font-mono text-sm text-gray-600 dark:text-gray-400">{item.eval}</span>
                                                                    )}
                                                                </div>
                                                                {showEngineDetails && (
                                                                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-mono bg-gray-50 dark:bg-gray-900 p-1 rounded">
                                                                        {item.line}
                                                                    </div>
                                                                )}
                                                                <p className="text-sm text-gray-700 dark:text-gray-200">
                                                                    {item.desc}
                                                                </p>
                                                            </CardContent>
                                                        </Card>
                                                    );
                                                })}
                                            </div>
                                        </ScrollArea>
                                    </TabsContent>

                                    {/* TAB: EXPLORER */}
                                    <TabsContent value="explorer" className="mt-0 flex-1 flex flex-col h-full">
                                        <ScrollArea className="flex-1">
                                            <div className="p-4">
                                                <h2 className="text-sm font-bold mb-3 text-gray-800 dark:text-gray-100">Opening Book</h2>
                                                {bookLoading && (
                                                    <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                                                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                                        <span className="text-sm">Loading opening book...</span>
                                                    </div>
                                                )}
                                                {bookError && (
                                                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                                                        <p className="text-red-700 text-sm">{bookError}</p>
                                                    </div>
                                                )}
                                                {!bookLoading && !bookError && (
                                                    <div className="overflow-x-auto">
                                                        <table className="min-w-full text-sm border-collapse">
                                                            <thead>
                                                                <tr className="text-left border-b border-gray-300 dark:border-gray-700">
                                                                    <th className="px-2 py-2 font-semibold text-gray-700 dark:text-gray-200 text-xs">Move</th>
                                                                    <th className="px-2 py-2 font-semibold text-gray-700 dark:text-gray-200 text-xs">Games</th>
                                                                    <th className="px-2 py-2 font-semibold text-gray-700 dark:text-gray-200 text-xs">Results</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {bookMoves.map((m, idx) => {
                                                                    const total = (m.white || 0) + (m.black || 0) + (m.draws || 0);
                                                                    const wPct = total ? (m.white * 100) / total : 0;
                                                                    const bPct = total ? (m.black * 100) / total : 0;
                                                                    const dPct = total ? (m.draws * 100) / total : 0;
                                                                    const fmtTotal = (n: number) => {
                                                                        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
                                                                        if (n >= 10_000) return `${Math.round(n / 1000)}k`;
                                                                        return `${n}`;
                                                                    };
                                                                    const handleBookMoveSelect = () => {
                                                                        try {
                                                                            const moveResult = gameRef.current.move(m.san);
                                                                            if (moveResult) {
                                                                                setPosition(gameRef.current.fen());
                                                                                setCurrentMoveIndex(prev => prev + 1);
                                                                                setLastMoveSquares({ from: moveResult.from as Square, to: moveResult.to as Square });
                                                                            }
                                                                        } catch (e) {
                                                                            console.error('Invalid book move:', m.san, e);
                                                                        }
                                                                    };
                                                                    return (
                                                                        <tr
                                                                            key={`${m.san}-${idx}`}
                                                                            className="cursor-pointer hover:bg-gray-50 border-b border-gray-100"
                                                                            onClick={handleBookMoveSelect}
                                                                            onKeyDown={(event) => {
                                                                                if (event.key === "Enter" || event.key === " ") {
                                                                                    event.preventDefault();
                                                                                    handleBookMoveSelect();
                                                                                }
                                                                            }}
                                                                            role="button"
                                                                            tabIndex={0}
                                                                            aria-label="Jump to book move"
                                                                        >
                                                                            <td className="px-2 py-1.5 font-mono align-middle text-sm font-medium">{m.san}</td>
                                                                            <td className="px-2 py-1.5 align-middle text-xs">{fmtTotal(total)}</td>
                                                                            <td className="px-2 py-1.5 w-full">
                                                                                <div className="flex h-4 rounded overflow-hidden border border-gray-200">
                                                                                    <div
                                                                                        className="bg-white text-[10px] flex items-center justify-center text-gray-700"
                                                                                        style={{ width: `${wPct}%` }}
                                                                                        title={`White wins: ${m.white || 0}`}
                                                                                    >
                                                                                        {wPct >= 15 ? `${Math.round(wPct)}%` : ''}
                                                                                    </div>
                                                                                    <div
                                                                                        className="bg-gray-400 text-[10px] flex items-center justify-center text-white"
                                                                                        style={{ width: `${dPct}%` }}
                                                                                        title={`Draws: ${m.draws || 0}`}
                                                                                    >
                                                                                        {dPct >= 15 ? `${Math.round(dPct)}%` : ''}
                                                                                    </div>
                                                                                    <div
                                                                                        className="bg-gray-800 text-[10px] flex items-center justify-center text-white"
                                                                                        style={{ width: `${bPct}%` }}
                                                                                        title={`Black wins: ${m.black || 0}`}
                                                                                    >
                                                                                        {bPct >= 15 ? `${Math.round(bPct)}%` : ''}
                                                                                    </div>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                        {bookMoves.length === 0 && (
                                                            <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No book moves for this position.</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </ScrollArea>
                                    </TabsContent>

                                    {/* TAB: SETTINGS */}
                                    <TabsContent value="settings" className="mt-0 flex-1 flex flex-col h-full">
                                        <ScrollArea className="flex-1">
                                            <div className="p-4 space-y-6">
                                                <h2 className="text-sm font-bold mb-3 text-gray-800 dark:text-gray-100">Settings</h2>

                                                {/* Sound Toggle */}
                                                <div className="flex items-center justify-between">
                                                    <div className="space-y-0.5">
                                                        <label htmlFor="sound-toggle" className="text-sm font-medium cursor-pointer">
                                                            Sound Effects
                                                        </label>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">Play sounds when moves are made</p>
                                                    </div>
                                                    <Switch
                                                        id="sound-toggle"
                                                        checked={soundEnabled}
                                                        onCheckedChange={setSoundEnabled}
                                                    />
                                                </div>

                                                {/* Best Move Arrow Toggle */}
                                                <div className="flex items-center justify-between">
                                                    <div className="space-y-0.5">
                                                        <label htmlFor="best-move-toggle" className="text-sm font-medium cursor-pointer">
                                                            Best Move Arrow
                                                        </label>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">Show arrow for the engine's best move</p>
                                                    </div>
                                                    <Switch
                                                        id="best-move-toggle"
                                                        checked={showBestMoveArrow}
                                                        onCheckedChange={setShowBestMoveArrow}
                                                    />
                                                </div>

                                                {/* Threat Arrow Toggle */}
                                                <div className="flex items-center justify-between">
                                                    <div className="space-y-0.5">
                                                        <label htmlFor="threat-toggle" className="text-sm font-medium cursor-pointer">
                                                            Threat Arrows
                                                        </label>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">Show arrows for opponent's threats</p>
                                                    </div>
                                                    <Switch
                                                        id="threat-toggle"
                                                        checked={showThreatArrows}
                                                        onCheckedChange={setShowThreatArrows}
                                                    />
                                                </div>
                                            </div>
                                        </ScrollArea>
                                    </TabsContent>
                                </div>
                            </Tabs>
                        </div>
                    </Card>

                    {/* 6. Navigation Controls */}
                    <div className="p-2 bg-muted border-t shrink-0 rounded-b-lg">
                        <TooltipProvider>
                            <div className="flex gap-2">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={goToStart}
                                            disabled={currentMoveIndex < 0 || isAnalyzing}
                                            className="flex-1"
                                            aria-label="First move"
                                        >
                                            <ChevronsLeft className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>First Move</p></TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={goToPrevious}
                                            disabled={currentMoveIndex < 0 || isAnalyzing}
                                            className="flex-1"
                                            aria-label="Previous move"
                                        >
                                            <SkipBack className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Previous Move</p></TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={goToNext}
                                            disabled={currentMoveIndex >= (gameHistory.length - 1) || isAnalyzing}
                                            className="flex-1"
                                            aria-label="Next move"
                                        >
                                            <SkipForward className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Next Move</p></TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={goToEnd}
                                            disabled={currentMoveIndex >= (gameHistory.length - 1) || isAnalyzing}
                                            className="flex-1"
                                            aria-label="Last move"
                                        >
                                            <ChevronsRight className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Last Move</p></TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
                                            className="flex-1"
                                            aria-label="Flip board"
                                        >
                                            <RotateCw className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Flip Board (F)</p></TooltipContent>
                                </Tooltip>
                            </div>
                        </TooltipProvider>
                    </div>
                </div>
            </div>

            {/* Share Modal */}
            <GameReviewShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                analysisId={currentPgn ? currentPgn.slice(0, 36) : "temp-analysis"}
                currentMoveIndex={currentMoveIndex >= 0 ? currentMoveIndex : 0}
                moves={displayMoves}
                gameMetadata={gameMetadata || undefined}
            />
        </div>
    );
}

// Export wrapper with Suspense boundary for static generation
export default function GameReviewPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
            <GameReviewContent />
        </Suspense>
    );
}

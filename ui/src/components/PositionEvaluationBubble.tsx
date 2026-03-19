"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { AlertCircle, Sparkles } from "lucide-react";
import { LogoSpinner } from "@/components/ui/LogoSpinner";
import { MoveClassificationBadge, MoveClassification } from "./MoveClassificationBadge";
import type { Affordance } from "@/hooks/useNonLLMCommentaryOverlay";

/**
 * Types for the position evaluation API response
 */
interface PositionEvalMeta {
    game_phase: "opening" | "middlegame" | "endgame";
    castling_info: {
        white_castled?: boolean;
        black_castled?: boolean;
        white_can_castle_kingside?: boolean;
        white_can_castle_queenside?: boolean;
        black_can_castle_kingside?: boolean;
        black_can_castle_queenside?: boolean;
        white_lost_castling?: boolean;
        black_lost_castling?: boolean;
    };
    attacks_and_threats: {
        is_check?: boolean;
        is_checkmate?: boolean;
        is_stalemate?: boolean;
        white_attacking_king?: boolean;
        black_attacking_king?: boolean;
        threat_squares?: string[];
    };
    eco?: {
        code?: string;
        name?: string;
    } | null;
    tension?: {
        targets: Array<{
            square: string;
            piece: string;
            color: string;
            attackers_count: number;
            defenders_count: number;
            see_gain_cp: number;
            status: "hanging" | "tension" | "winning_capture" | "losing_capture" | "equal_trade";
            recommended_label: "trade" | "threat" | "hangs";
        }>;
        has_trade_available: boolean;
        has_winning_capture: boolean;
        has_true_hanging_piece: boolean;
        best_see_target?: string | null;
    };
}

interface ConceptTag {
    key: string;
    label: string;
    tone: "neutral" | "good_for_white" | "good_for_black" | "warning";
}

interface PositionEvalResponse {
    advantage: string;
    headline?: string;
    commentary: string;
    white_score: number;
    black_score: number;
    eval: number;
    verdict?: string;
    summary?: string;
    meta?: PositionEvalMeta;
    disabled?: boolean;
    equity?: {
        white: number;
        black: number;
        source?: string;
    };
    tags?: ConceptTag[];
    evidence?: Record<string, unknown>;
}

/** LLM message with optional loading state */
interface LLMMessageWithState {
    text: string;
    sender: string;
    heuristicCommentary?: { headline?: string };
    _loading?: boolean;
    _streamingText?: string;
}

interface PositionEvaluationBubbleProps {
    fen: string;
    plyCount?: number;
    onDrawAffordance?: (affordance: Affordance | null) => void;
    onShowFollowUp?: (line: string[]) => void;
    moveSan?: string;
    evalScore?: number;
    preMoveFen?: string;
    moveClassification?: string;
    llmMessage?: LLMMessageWithState | null;
    isPremium?: boolean;
    plan?: 'basic' | 'plus' | null;
}

/**
 * Chess.com-style position evaluation bubble component.
 * Displays heuristic-based positional assessment with commentary.
 * Backend auto-calculates heuristics from FEN.
 */
export const PositionEvaluationBubble: React.FC<PositionEvaluationBubbleProps> = ({
    fen,
    plyCount = 0,
    onDrawAffordance,
    onShowFollowUp,
    moveSan,
    evalScore: propEvalScore,
    preMoveFen,
    moveClassification,
    llmMessage,
    isPremium = false,
    plan = null,
}) => {
    const [evaluation, setEvaluation] = useState<PositionEvalResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sticky AI preference — persisted in localStorage, only for Plus users
    const isPlus = plan === 'plus';
    const [aiPreferred, setAiPreferred] = useState(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('ai-commentary-preferred') === 'true';
    });
    const toggleAiPreferred = () => {
        const next = !aiPreferred;
        setAiPreferred(next);
        localStorage.setItem('ai-commentary-preferred', String(next));
    };
    // Show AI content when preference is on AND user is Plus
    const showAiMessage = isPlus && aiPreferred;

    // Refs for request management during rapid navigation
    const abortControllerRef = useRef<AbortController | null>(null);
    const evaluationCacheRef = useRef<Map<string, PositionEvalResponse>>(new Map());

    useEffect(() => {
        if (!fen) {
            setEvaluation(null);
            return;
        }

        if (plyCount === 0) {
            setEvaluation(null);
            setLoading(false);
            return;
        }

        const cacheKey = fen;
        if (evaluationCacheRef.current.has(cacheKey)) {
            setEvaluation(evaluationCacheRef.current.get(cacheKey)!);
            setLoading(false);
            setError(null);
            return;
        }

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        const fetchEvaluation = async () => {
            setLoading(true);
            setError(null);

            try {
                const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "/api/gateway";
                const response = await fetch(`${gatewayUrl}/api/analysis/position-eval`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        fen,
                        ply_count: plyCount,
                        pre_move_fen: preMoveFen,
                        move_san: moveSan
                    }),
                    signal,
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data: PositionEvalResponse = await response.json();
                evaluationCacheRef.current.set(cacheKey, data);
                setEvaluation(data);
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') return;
                setError(err instanceof Error ? err.message : "Failed to evaluate");
                setEvaluation(null);
            } finally {
                setLoading(false);
            }
        };

        fetchEvaluation();

        return () => {
            abortControllerRef.current?.abort();
        };
    }, [fen, plyCount, preMoveFen, moveSan]);

    // UI Helpers
    const getTierStyles = () => ({
        bg: "bg-white dark:bg-black",
        border: "border-border",
    });

    const getTextColor = () => "text-gray-900 dark:text-gray-100";

    // 1. Placeholder state (plyCount 0)
    if (plyCount === 0) {
        return (
            <div className="rounded-xl bg-card dark:bg-black border border-border p-3 h-[180px] flex items-center justify-center">
                <span className="text-sm text-muted-foreground">
                    Game start — No moves played yet.
                </span>
            </div>
        );
    }

    // 2. Loading state
    if (loading) {
        return (
            <div className="rounded-xl bg-white dark:bg-black border border-border p-3 h-[180px] flex flex-col items-center justify-center gap-3">
                <LogoSpinner size="lg" />
                <span className="text-sm font-medium text-muted-foreground animate-pulse">
                    Thinking...
                </span>
            </div>
        );
    }

    // 3. Error state
    if (error) {
        return (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-3 h-[180px] flex flex-col items-center justify-center gap-2">
                <AlertCircle className="h-6 w-6 text-red-500" />
                <span className="text-sm font-medium text-red-600 dark:text-red-400">Evaluation unavailable</span>
            </div>
        );
    }

    // 4. No data state
    if (!evaluation || evaluation.disabled) {
        return (
            <div className="rounded-xl bg-white dark:bg-black border border-border p-3 h-[180px] flex items-center justify-center">
                <span className="text-sm text-muted-foreground text-center px-4">
                    {evaluation?.commentary || "Start the game to see commentary"}
                </span>
            </div>
        );
    }

    const { bg, border } = getTierStyles();
    const textColor = getTextColor();

    return (
        <div className="h-[180px] overflow-y-auto">
            <div className={`rounded-xl ${bg} border ${border} p-3 transition-colors duration-300 min-h-full`}>
                {/* Header row: Badge, AI Toggle and Score */}
                {(moveClassification || propEvalScore !== undefined || isPlus) && (
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            {moveClassification && (
                                <MoveClassificationBadge
                                    classification={moveClassification as MoveClassification}
                                    inline={false}
                                />
                            )}

                            {isPlus && (
                                <button
                                    onClick={toggleAiPreferred}
                                    className={`
                                        text-[10px] font-bold px-1.5 py-0.5 rounded transition-all duration-200
                                        ${showAiMessage
                                            ? "bg-purple-600 text-white shadow-sm scale-105"
                                            : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground border border-border"}
                                    `}
                                    title={showAiMessage ? "Switch to heuristic analysis" : "Switch to AI analysis"}
                                >
                                    <Sparkles className="w-3 h-3 inline mr-0.5" />
                                    AI
                                </button>
                            )}
                        </div>

                        {propEvalScore !== undefined && (
                            <span className={`text-sm font-bold ${textColor}`}>
                                {propEvalScore > 0 ? '+' : ''}{propEvalScore.toFixed(2)}
                            </span>
                        )}
                    </div>
                )}

                {/* Content Area */}
                <div className="flex-1 min-w-0">
                    {showAiMessage && llmMessage ? (
                        <>
                            <p className={`font-semibold text-sm leading-snug ${textColor}`}>
                                {llmMessage.heuristicCommentary?.headline || "AI Analysis"}
                            </p>
                            <p className="text-xs mt-1.5 text-gray-700 dark:text-gray-300 leading-relaxed italic">
                                {llmMessage.text}
                            </p>
                        </>
                    ) : showAiMessage && !llmMessage ? (
                        <div className="flex items-center gap-2 py-2">
                            <LogoSpinner size="sm" />
                            <span className="text-xs text-muted-foreground animate-pulse">AI analyzing...</span>
                        </div>
                    ) : (
                        <>
                            <p className={`font-semibold text-sm leading-snug ${textColor}`}>
                                {evaluation.headline || evaluation.summary || evaluation.commentary}
                            </p>
                            {evaluation.summary && evaluation.commentary && evaluation.summary !== evaluation.commentary && (
                                <p className="text-xs mt-1.5 text-gray-700 dark:text-gray-300 leading-relaxed">
                                    {evaluation.commentary}
                                </p>
                            )}
                        </>
                    )}

                    {/* Tags / Meta information */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                        {evaluation.tags?.map((tag) => (
                            <span
                                key={tag.key}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                            >
                                {tag.label}
                            </span>
                        ))}

                        {!evaluation.tags?.length && evaluation.meta?.game_phase && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700 uppercase tracking-wider font-medium">
                                {evaluation.meta.game_phase}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PositionEvaluationBubble;

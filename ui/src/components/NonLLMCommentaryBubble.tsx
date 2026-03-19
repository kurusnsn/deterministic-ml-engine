/**
 * NonLLMCommentaryBubble Component
 *
 * Chess.com-style commentary bubble with:
 * - Bordered hoverable keywords (e.g. "passed")
 * - Move quality labels (excellent, best, etc.)
 * - Show Follow-Up / Show Checkmate / Show Idea buttons
 *
 * This component integrates with the canvas overlay system for visualizations.
 */

'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { Star, TrendingUp, Zap, ChevronRight, Lightbulb, Play, Crown, RotateCcw, AlertCircle, Info } from 'lucide-react';
import { IdeaTokenParser } from './IdeaTokenParser';
import type { Affordance, NonLLMCommentary } from '@/hooks/useNonLLMCommentaryOverlay';

// ============================================================================
// TYPES
// ============================================================================

interface NonLLMCommentaryBubbleProps {
    /** Commentary data from backend */
    commentary: NonLLMCommentary | null | undefined;
    /** Move SAN (e.g., "f3", "d8") */
    moveSan?: string;
    /** Evaluation score (e.g., -7.18) */
    evalScore?: number;
    /** Move quality line from backend (e.g., "Nf3 is best +0.25") */
    moveQualityLine?: string;
    /** Callback to draw affordance on canvas */
    onDrawOverlay?: (affordance: Affordance | null) => void;
    /** Callback when Show Follow-Up is clicked */
    onShowFollowUp?: (line: string[]) => void;
    /** Callback when Show Checkmate is clicked */
    onShowCheckmate?: (line: string[]) => void;
    /** Callback when Show Idea is clicked */
    onShowIdea?: (idea: string, line: string[]) => void;
    /** Callback when Retry is clicked */
    onRetry?: () => void;
    /** Whether the feature is enabled */
    enabled?: boolean;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// LABEL STYLING
// ============================================================================

const LABEL_CONFIG: Record<string, {
    icon: React.ReactNode;
    bgClass: string;
    textClass: string;
}> = {
    brilliant: {
        icon: <Star className="w-3 h-3 fill-current" />,
        bgClass: 'bg-cyan-500',
        textClass: 'text-white',
    },
    best: {
        icon: <Star className="w-3 h-3 fill-current" />,
        bgClass: 'bg-green-500',
        textClass: 'text-white',
    },
    excellent: {
        icon: <TrendingUp className="w-3 h-3" />,
        bgClass: 'bg-green-600',
        textClass: 'text-white',
    },
    great: {
        icon: <TrendingUp className="w-3 h-3" />,
        bgClass: 'bg-blue-500',
        textClass: 'text-white',
    },
    good: {
        icon: <ChevronRight className="w-3 h-3" />,
        bgClass: 'bg-lime-500',
        textClass: 'text-gray-900',
    },
    book: {
        icon: <Lightbulb className="w-3 h-3" />,
        bgClass: 'bg-amber-400',
        textClass: 'text-gray-900',
    },
    inaccuracy: {
        icon: <ChevronRight className="w-3 h-3" />,
        bgClass: 'bg-yellow-500',
        textClass: 'text-gray-900',
    },
    mistake: {
        icon: <Zap className="w-3 h-3" />,
        bgClass: 'bg-orange-500',
        textClass: 'text-white',
    },
    blunder: {
        icon: <Zap className="w-3 h-3" />,
        bgClass: 'bg-red-500',
        textClass: 'text-white',
    },
    miss: {
        icon: <AlertCircle className="w-3 h-3" />,
        bgClass: 'bg-red-400',
        textClass: 'text-white',
    },
    forced: {
        icon: <ChevronRight className="w-3 h-3" />,
        bgClass: 'bg-gray-500',
        textClass: 'text-white',
    },
};

// ============================================================================
// COMPONENT
// ============================================================================

export const NonLLMCommentaryBubble: React.FC<NonLLMCommentaryBubbleProps> = ({
    commentary,
    moveSan,
    evalScore,
    moveQualityLine,
    onDrawOverlay,
    onShowFollowUp,
    onShowCheckmate,
    onShowIdea,
    onRetry,
    enabled = true,
    className = '',
}) => {
    // Don't render if disabled or no commentary
    if (!enabled || !commentary) {
        return null;
    }

    const label = commentary.label || 'good';
    const labelConfig = LABEL_CONFIG[label] || LABEL_CONFIG.good;

    // Extract interactive affordances
    const showFollowUp = commentary.affordances?.find(a => a.type === 'SHOW_FOLLOW_UP');
    const showCheckmate = commentary.affordances?.find(a => a.type === 'SHOW_CHECKMATE');
    const showTactic = commentary.affordances?.find(a => a.type === 'SHOW_TACTIC');
    const showIdeas = commentary.affordances?.filter(a => a.type === 'SHOW_IDEA') || [];
    const showMissedTactic = commentary.affordances?.find(a => a.type === 'SHOW_MISSED_TACTIC');
    const showFreePiece = commentary.affordances?.find(a => a.type === 'SHOW_FREE_PIECE');

    const hasInteractiveButtons = showFollowUp || showCheckmate || showTactic ||
        showIdeas.length > 0 || showMissedTactic || showFreePiece;

    // Visual affordances for hover
    const visualAffordances = commentary.affordances?.filter(
        a => !['SHOW_FOLLOW_UP', 'SHOW_CHECKMATE', 'SHOW_TACTIC', 'SHOW_IDEA',
            'SHOW_MISSED_TACTIC', 'SHOW_FREE_PIECE'].includes(a.type)
    ) || [];

    // Handle keyword hover
    const handleHover = useCallback((affordance: Affordance | null) => {
        onDrawOverlay?.(affordance);
    }, [onDrawOverlay]);

    // Format eval score
    const formatEval = (score: number) => {
        const sign = score > 0 ? '+' : '';
        return `${sign}${score.toFixed(2)}`;
    };

    return (
        <div className={`non-llm-commentary-bubble ${className}`}>
            {/* Header row: move quality line OR label + move + eval */}
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                    {/* Label badge */}
                    <span className={`
                        inline-flex items-center gap-1 
                        px-1.5 py-0.5 
                        rounded text-xs font-semibold
                        ${labelConfig.bgClass} ${labelConfig.textClass}
                    `}>
                        {labelConfig.icon}
                        {moveSan && <span>{moveSan}</span>}
                        <span>is {label}</span>
                    </span>
                </div>

                {/* Eval score */}
                {evalScore !== undefined && (
                    <span className="text-sm font-mono font-bold text-foreground">
                        {formatEval(evalScore)}
                    </span>
                )}
            </div>

            {/* Commentary text with hoverable keywords */}
            <p className="text-sm leading-relaxed mb-2">
                <IdeaTokenParser
                    text={commentary.text}
                    affordances={visualAffordances}
                    onHover={handleHover}
                    textColorClass="text-foreground"
                    enabled={enabled}
                />
            </p>

            {/* Interactive buttons */}
            {hasInteractiveButtons && (
                <div className="flex flex-wrap gap-2 mt-2">
                    {showFollowUp && (
                        <button
                            className="commentary-action-btn"
                            onClick={() => onShowFollowUp?.(showFollowUp.line || [])}
                        >
                            <Play className="w-3.5 h-3.5" />
                            <span>Show Follow-Up</span>
                        </button>
                    )}

                    {showTactic && (
                        <button
                            className="commentary-action-btn"
                            onClick={() => onShowFollowUp?.(showTactic.line || [])}
                        >
                            <Zap className="w-3.5 h-3.5" />
                            <span>Show Tactic</span>
                        </button>
                    )}

                    {showCheckmate && (
                        <button
                            className="commentary-action-btn commentary-action-btn--checkmate"
                            onClick={() => onShowCheckmate?.(showCheckmate.line || [])}
                        >
                            <Crown className="w-3.5 h-3.5" />
                            <span>Show Checkmate</span>
                        </button>
                    )}

                    {/* Chess.com-style Show Idea buttons */}
                    {showIdeas.map((ideaAffordance, idx) => (
                        <button
                            key={`idea-${idx}`}
                            className="commentary-action-btn commentary-action-btn--idea"
                            onClick={() => onShowIdea?.(ideaAffordance.idea || '', ideaAffordance.line || [])}
                        >
                            <Info className="w-3.5 h-3.5" />
                            <span>Show Idea: {ideaAffordance.idea}</span>
                        </button>
                    ))}

                    {showMissedTactic && (
                        <button
                            className="commentary-action-btn commentary-action-btn--missed"
                            onClick={() => onShowFollowUp?.(showMissedTactic.line || [])}
                        >
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Show Missed Tactic</span>
                        </button>
                    )}

                    {showFreePiece && (
                        <button
                            className="commentary-action-btn"
                            onClick={() => onShowFollowUp?.(showFreePiece.line || [])}
                        >
                            <Zap className="w-3.5 h-3.5" />
                            <span>Show Free Piece</span>
                        </button>
                    )}
                </div>
            )}

            {/* Retry button (optional) */}
            {onRetry && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                    <button
                        className="flex items-center gap-1.5 px-3 py-1.5 
                            text-xs text-foreground 
                            bg-secondary hover:bg-muted 
                            border border-border rounded-md"
                        onClick={onRetry}
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Retry</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default NonLLMCommentaryBubble;

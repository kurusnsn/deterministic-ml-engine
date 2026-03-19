/**
 * Non-LLM Commentary Panel Component
 *
 * Displays Chess.com-style deterministic commentary from the non_llm_commentary
 * field in analysis output. Only rendered when chess_com_style mode is enabled.
 */

'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    Zap,
    Target,
    TrendingUp,
    ChevronRight,
    Lightbulb,
    Shield,
    Swords
} from 'lucide-react';
import { useCommentarySettingsStore } from '@/stores/commentarySettingsStore';

// Types matching backend output schema
interface Affordance {
    type: 'HIGHLIGHT' | 'ARROW' | 'LINE' | 'SHADED_FILE' | 'SHADED_RANK' | 'PAWN_PATH' | 'SHOW_TACTIC' | 'SHOW_FOLLOW_UP' | 'SHOW_CHECKMATE';
    squares?: string[];
    from?: string;
    to?: string | string[];
    file?: string;
    rank?: number;
    line?: string[];
    color?: string;
    multiple?: boolean;
}

interface NonLLMCommentary {
    label: string;
    text: string;
    confidence: number;
    idea: string;
    category?: string;
    priority?: number;
    affordances: Affordance[];
}

interface NonLLMCommentaryPanelProps {
    /** Commentary data from analysis response */
    commentary: NonLLMCommentary | null | undefined;
    /** Callback when an affordance is hovered */
    onAffordanceHover?: (affordance: Affordance | null) => void;
    /** Callback when "Show Follow-Up" is clicked */
    onShowFollowUp?: (line: string[]) => void;
    /** Callback when "Show Tactic" is clicked */
    onShowTactic?: (line: string[]) => void;
    /** Callback when "Show Checkmate" is clicked */
    onShowCheckmate?: (line: string[]) => void;
    /** Additional CSS classes */
    className?: string;
}

// Move quality label colors
const LABEL_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    brilliant: {
        bg: 'bg-cyan-500',
        text: 'text-white',
        icon: <Zap className="w-3 h-3" />
    },
    great: {
        bg: 'bg-blue-500',
        text: 'text-white',
        icon: <TrendingUp className="w-3 h-3" />
    },
    best: {
        bg: 'bg-green-500',
        text: 'text-white',
        icon: <Target className="w-3 h-3" />
    },
    excellent: {
        bg: 'bg-green-400',
        text: 'text-white',
        icon: <ChevronRight className="w-3 h-3" />
    },
    good: {
        bg: 'bg-lime-400',
        text: 'text-gray-900',
        icon: <ChevronRight className="w-3 h-3" />
    },
    book: {
        bg: 'bg-amber-400',
        text: 'text-gray-900',
        icon: <Lightbulb className="w-3 h-3" />
    },
    inaccuracy: {
        bg: 'bg-yellow-400',
        text: 'text-gray-900',
        icon: <Shield className="w-3 h-3" />
    },
    mistake: {
        bg: 'bg-orange-500',
        text: 'text-white',
        icon: <Swords className="w-3 h-3" />
    },
    blunder: {
        bg: 'bg-red-500',
        text: 'text-white',
        icon: <Swords className="w-3 h-3" />
    },
};

// Category icons
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    forced_outcome: <Zap className="w-4 h-4 text-red-500" />,
    tactical_motif: <Swords className="w-4 h-4 text-orange-500" />,
    positional_idea: <Lightbulb className="w-4 h-4 text-blue-500" />,
    pawn_structure: <Shield className="w-4 h-4 text-green-500" />,
    filler: <ChevronRight className="w-4 h-4 text-gray-500" />,
};

/**
 * Non-LLM Commentary Panel
 *
 * Displays deterministic, YAML-driven commentary with Chess.com-style labels.
 * Only shown when commentary mode is 'chess_com_style'.
 */
export const NonLLMCommentaryPanel: React.FC<NonLLMCommentaryPanelProps> = ({
    commentary,
    onAffordanceHover,
    onShowFollowUp,
    onShowTactic,
    onShowCheckmate,
    className = '',
}) => {
    const mode = useCommentarySettingsStore((s) => s.mode);

    // Only render in chess_com_style mode
    if (mode !== 'chess_com_style') {
        return null;
    }

    // No commentary available
    if (!commentary) {
        return null;
    }

    const labelStyle = LABEL_STYLES[commentary.label] || LABEL_STYLES.good;
    const categoryIcon = CATEGORY_ICONS[commentary.category || 'filler'];

    // Filter affordances for interactive buttons
    const showFollowUp = commentary.affordances.find(a => a.type === 'SHOW_FOLLOW_UP');
    const showTactic = commentary.affordances.find(a => a.type === 'SHOW_TACTIC');
    const showCheckmate = commentary.affordances.find(a => a.type === 'SHOW_CHECKMATE');

    // Visual affordances (for hover)
    const visualAffordances = commentary.affordances.filter(
        a => !['SHOW_FOLLOW_UP', 'SHOW_TACTIC', 'SHOW_CHECKMATE'].includes(a.type)
    );

    return (
        <div
            className={`
                bg-white dark:bg-black
                rounded-lg border border-gray-200 dark:border-gray-700
                p-3 shadow-sm
                ${className}
            `}
        >
            {/* Header with label badge */}
            <div className="flex items-center gap-2 mb-2">
                {categoryIcon}

                <Badge
                    className={`
                        ${labelStyle.bg} ${labelStyle.text}
                        flex items-center gap-1
                        text-xs font-semibold uppercase
                    `}
                >
                    {labelStyle.icon}
                    {commentary.label}
                </Badge>

                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="text-xs text-gray-400 ml-auto">
                                {Math.round(commentary.confidence * 100)}%
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                            <p className="text-xs">Confidence: {(commentary.confidence * 100).toFixed(0)}%</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>

            {/* Commentary text */}
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {commentary.text}
            </p>

            {/* Interactive buttons */}
            {(showFollowUp || showTactic || showCheckmate) && (
                <div className="flex gap-2 mt-3">
                    {showFollowUp && (
                        <button
                            onClick={() => onShowFollowUp?.(showFollowUp.line || [])}
                            className="
                                flex items-center gap-1 px-2 py-1
                                text-xs font-medium
                                bg-blue-100 text-blue-700
                                dark:bg-blue-900 dark:text-blue-300
                                rounded hover:bg-blue-200 dark:hover:bg-blue-800
                                transition-colors
                            "
                        >
                            <TrendingUp className="w-3 h-3" />
                            Show Follow-Up
                        </button>
                    )}

                    {showTactic && (
                        <button
                            onClick={() => onShowTactic?.(showTactic.line || [])}
                            className="
                                flex items-center gap-1 px-2 py-1
                                text-xs font-medium
                                bg-orange-100 text-orange-700
                                dark:bg-orange-900 dark:text-orange-300
                                rounded hover:bg-orange-200 dark:hover:bg-orange-800
                                transition-colors
                            "
                        >
                            <Swords className="w-3 h-3" />
                            Show Tactic
                        </button>
                    )}

                    {showCheckmate && (
                        <button
                            onClick={() => onShowCheckmate?.(showCheckmate.line || [])}
                            className="
                                flex items-center gap-1 px-2 py-1
                                text-xs font-medium
                                bg-red-100 text-red-700
                                dark:bg-red-900 dark:text-red-300
                                rounded hover:bg-red-200 dark:hover:bg-red-800
                                transition-colors
                            "
                        >
                            <Zap className="w-3 h-3" />
                            Show Checkmate
                        </button>
                    )}
                </div>
            )}

            {/* Visual affordances hint (for hover functionality) */}
            {visualAffordances.length > 0 && (
                <div
                    className="mt-2 text-xs text-gray-400 italic cursor-help"
                    onMouseEnter={() => onAffordanceHover?.(visualAffordances[0])}
                    onMouseLeave={() => onAffordanceHover?.(null)}
                >
                    Hover to see visualization
                </div>
            )}
        </div>
    );
};

export default NonLLMCommentaryPanel;

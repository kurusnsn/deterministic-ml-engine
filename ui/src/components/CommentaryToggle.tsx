/**
 * Commentary Toggle Component
 *
 * Allows users to switch between LLM (AI) and Heuristic (rule-based) commentary modes.
 * Includes an optional debug mode toggle for viewing evidence in heuristic mode.
 */

'use client';

import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { Sparkles, Cpu, Bug } from 'lucide-react';
import { useCommentarySettingsStore } from '@/stores/commentarySettingsStore';

interface CommentaryToggleProps {
    /** Additional CSS classes */
    className?: string;
    /** Compact mode - hide labels */
    compact?: boolean;
    /** Show debug mode toggle */
    showDebugToggle?: boolean;
}

/**
 * Commentary Toggle Component
 *
 * Displays a switch to toggle between LLM and Heuristic commentary modes.
 * LLM mode uses AI-generated commentary (slower but more contextual).
 * Heuristic mode uses rule-based commentary (faster and deterministic).
 */
export const CommentaryToggle: React.FC<CommentaryToggleProps> = ({
    className = '',
    compact = false,
    showDebugToggle = false,
}) => {
    const mode = useCommentarySettingsStore((s) => s.mode);
    const debugMode = useCommentarySettingsStore((s) => s.debugMode);
    const setMode = useCommentarySettingsStore((s) => s.setMode);
    const setDebugMode = useCommentarySettingsStore((s) => s.setDebugMode);
    const toggleMode = useCommentarySettingsStore((s) => s.toggleMode);

    const isHeuristic = mode === 'heuristic';

    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            <div className="flex items-center gap-3">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-2">
                                {/* LLM Icon */}
                                <Sparkles
                                    className={`w-4 h-4 transition-colors ${!isHeuristic
                                            ? 'text-purple-500'
                                            : 'text-gray-400'
                                        }`}
                                />

                                <Switch
                                    id="commentary-mode"
                                    checked={isHeuristic}
                                    onCheckedChange={(checked) =>
                                        setMode(checked ? 'heuristic' : 'llm')
                                    }
                                    className="data-[state=checked]:bg-blue-600"
                                />

                                {/* Heuristic Icon */}
                                <Cpu
                                    className={`w-4 h-4 transition-colors ${isHeuristic
                                            ? 'text-blue-500'
                                            : 'text-gray-400'
                                        }`}
                                />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            <p className="text-sm">
                                {isHeuristic
                                    ? 'Heuristic mode: Fast, rule-based commentary'
                                    : 'LLM mode: AI-generated commentary'}
                            </p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                {!compact && (
                    <Label
                        htmlFor="commentary-mode"
                        className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer"
                    >
                        {isHeuristic ? 'Heuristic' : 'LLM'}
                    </Label>
                )}

                {/* Mode badge */}
                <Badge
                    variant={isHeuristic ? 'secondary' : 'default'}
                    className={`text-xs ${isHeuristic
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                            : 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                        }`}
                >
                    {isHeuristic ? 'Fast' : 'AI'}
                </Badge>
            </div>

            {/* Debug mode toggle (only in heuristic mode) */}
            {showDebugToggle && isHeuristic && (
                <div className="flex items-center gap-2 ml-6">
                    <Switch
                        id="debug-mode"
                        checked={debugMode}
                        onCheckedChange={setDebugMode}
                        className="data-[state=checked]:bg-amber-600 scale-75"
                    />
                    <Label
                        htmlFor="debug-mode"
                        className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer flex items-center gap-1"
                    >
                        <Bug className="w-3 h-3" />
                        Show evidence
                    </Label>
                </div>
            )}
        </div>
    );
};

export default CommentaryToggle;

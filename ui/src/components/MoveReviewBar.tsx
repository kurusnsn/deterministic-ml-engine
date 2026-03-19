"use client";

import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MovePoint {
    moveNumber: number;
    evaluation: number;
    classification?: string;
}

interface MoveReviewBarProps {
    evaluations: MovePoint[];
    currentMoveIndex: number;
    onMoveClick?: (index: number) => void;
    accuracy?: number;
    className?: string;
}

const CLASSIFICATION_COLORS: Record<string, string> = {
    brilliant: '#1bada6',
    great: '#2596be',
    best: '#96bc4b',
    excellent: '#96bc4b',
    good: '#96af8b',
    book: '#a88865',
    inaccuracy: '#f7c045',
    mistake: '#e58f2a',
    miss: '#ca3431',
    blunder: '#ca3431',
    mate: '#f472b6',
};

const CLASSIFICATION_LABELS: Record<string, string> = {
    brilliant: 'Brilliant',
    great: 'Great Find',
    best: 'Best',
    excellent: 'Excellent',
    good: 'Good',
    book: 'Book',
    inaccuracy: 'Inaccuracy',
    mistake: 'Mistake',
    miss: 'Miss',
    blunder: 'Blunder',
    mate: 'Mate',
};

export default function MoveReviewBar({
    evaluations,
    currentMoveIndex,
    onMoveClick,
    accuracy,
    className = ''
}: MoveReviewBarProps) {
    if (evaluations.length === 0) {
        return <div className="h-12 w-full bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400">Loading analysis...</div>;
    }

    return (
        <div className={`flex flex-col gap-1 w-full p-2 bg-white rounded-lg shadow-sm border ${className}`}>
            {/* Markers Container */}
            <div className="relative h-6 flex items-end px-1 mb-1">
                <div className="absolute inset-0 flex items-center justify-between pointer-events-none">
                    {/* Markers */}
                    {evaluations.map((point, index) => {
                        const color = point.classification ? CLASSIFICATION_COLORS[point.classification] || '#94a3b8' : '#94a3b8';
                        const isCurrent = index === currentMoveIndex;

                        return (
                            <TooltipProvider key={index}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            onClick={() => onMoveClick?.(index)}
                                            className={`h-4 w-1.5 rounded-full transition-all duration-200 pointer-events-auto
                         ${isCurrent ? 'h-6 scale-x-150 z-10' : 'hover:h-5 opacity-80 hover:opacity-100'}
                       `}
                                            style={{ backgroundColor: color }}
                                        >
                                            <span className="sr-only">Move {point.moveNumber}</span>
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <div className="text-xs">
                                            <span className="font-bold">Move {point.moveNumber}</span>
                                            {point.classification && (
                                                <div style={{ color: CLASSIFICATION_COLORS[point.classification] }}>
                                                    {CLASSIFICATION_LABELS[point.classification]}
                                                </div>
                                            )}
                                            <div className="text-gray-400">
                                                {point.evaluation >= 0 ? `+${point.evaluation.toFixed(2)}` : point.evaluation.toFixed(2)}
                                            </div>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        );
                    })}
                </div>
            </div>

            {/* Gradient Bar */}
            <div className="relative h-4 w-full rounded-full overflow-hidden bg-gray-100 border border-gray-200 group">
                <div
                    className="absolute inset-0 bg-gradient-to-r from-gray-300 via-gray-100 to-gray-400 opacity-50"
                />

                {/* Progress indicator for accuracy if provided */}
                {accuracy !== undefined && (
                    <div
                        className="absolute left-0 top-0 bottom-0 bg-blue-500/20 transition-all duration-1000"
                        style={{ width: `${accuracy}%` }}
                    />
                )}

                {/* Current move marker on the bar */}
                {currentMoveIndex >= 0 && (
                    <div
                        className="absolute h-full w-1 bg-blue-600 shadow-sm z-10 transition-all duration-200"
                        style={{ left: `${(currentMoveIndex / (evaluations.length - 1)) * 100}%` }}
                    />
                )}
            </div>

            {/* Stats row */}
            <div className="flex justify-between items-center mt-1 px-1">
                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Analysis</span>
                {accuracy !== undefined && (
                    <span className="text-xs font-mono font-bold text-gray-500">{Math.round(accuracy)}</span>
                )}
            </div>
        </div>
    );
}

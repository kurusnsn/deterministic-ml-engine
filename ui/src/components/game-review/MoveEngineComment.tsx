"use client";

import React from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, ChevronRight } from "lucide-react";
import { MoveEngineAnnotation } from "@/types/repertoire";

/**
 * Classification icon and color mapping.
 * Reuses existing SVG assets from /public/svg/
 */
const CLASSIFICATION_CONFIG: Record<string, {
    icon: string;
    label: string;
    color: string;
    bgColor: string;
}> = {
    brilliant: { icon: "/svg/brilliant.svg", label: "Brilliant", color: "#1bada6", bgColor: "rgba(27, 173, 166, 0.1)" },
    great: { icon: "/svg/great_find.svg", label: "Great", color: "#2596be", bgColor: "rgba(37, 150, 190, 0.1)" },
    best: { icon: "/svg/best.svg", label: "Best", color: "#96bc4b", bgColor: "rgba(150, 188, 75, 0.1)" },
    excellent: { icon: "/svg/excellent.svg", label: "Excellent", color: "#96bc4b", bgColor: "rgba(150, 188, 75, 0.1)" },
    good: { icon: "/svg/good.svg", label: "Good", color: "#96af8b", bgColor: "rgba(150, 175, 139, 0.1)" },
    book: { icon: "/svg/book.svg", label: "Book", color: "#a88865", bgColor: "rgba(168, 136, 101, 0.1)" },
    inaccuracy: { icon: "/svg/inaccuracy.svg", label: "Inaccuracy", color: "#f7c045", bgColor: "rgba(247, 192, 69, 0.1)" },
    mistake: { icon: "/svg/mistake.svg", label: "Mistake", color: "#e58f2a", bgColor: "rgba(229, 143, 42, 0.1)" },
    miss: { icon: "/svg/miss.svg", label: "Miss", color: "#ca3431", bgColor: "rgba(202, 52, 49, 0.1)" },
    blunder: { icon: "/svg/blunder.svg", label: "Blunder", color: "#ca3431", bgColor: "rgba(202, 52, 49, 0.1)" },
};

/**
 * Format centipawn evaluation to human-readable string.
 * @param cp Centipawn value
 * @returns Formatted string like "+1.45" or "-0.32"
 */
function formatEval(cp: number): string {
    // Handle mate scores
    if (Math.abs(cp) >= 10000) {
        return cp > 0 ? "+M" : "-M";
    }

    const pawns = cp / 100;
    const formatted = pawns.toFixed(2);
    return pawns >= 0 ? `+${formatted}` : formatted;
}

/**
 * Get color for evaluation display.
 * Positive = green (good for white), Negative = red (good for black)
 */
function getEvalColor(cp: number): string {
    if (cp > 150) return "#4ade80"; // Green for significant white advantage
    if (cp > 50) return "#86efac";  // Light green for slight white advantage
    if (cp > -50) return "#9ca3af"; // Gray for equal
    if (cp > -150) return "#fca5a5"; // Light red for slight black advantage
    return "#f87171"; // Red for significant black advantage
}

interface MoveEngineCommentProps {
    annotation: MoveEngineAnnotation | null;
    onPlayFollowUp?: (pvSan: string[]) => void;
    isLoading?: boolean;
}

/**
 * MoveEngineComment displays engine evaluation and classification for a move.
 * 
 * Features:
 * - Classification icon (brilliant/great/best/good/inaccuracy/mistake/blunder)
 * - Engine evaluation in pawns (e.g., +1.45)
 * - Heuristic commentary if available
 * - "Play follow-up" button when a better move exists
 */
export default function MoveEngineComment({
    annotation,
    onPlayFollowUp,
    isLoading = false,
}: MoveEngineCommentProps) {
    // Loading state
    if (isLoading) {
        return (
            <Card className="bg-white dark:bg-card shadow-sm border rounded-lg animate-pulse">
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-200 dark:bg-gray-800 rounded-full"></div>
                        <div className="flex-1 space-y-2">
                            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-24"></div>
                            <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-16"></div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // No annotation available
    if (!annotation) {
        return (
            <Card className="bg-gray-50 dark:bg-gray-900/50 shadow-sm border rounded-lg">
                <CardContent className="p-4">
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center">
                        Select a move to see engine analysis
                    </p>
                </CardContent>
            </Card>
        );
    }

    const config = CLASSIFICATION_CONFIG[annotation.mistakeType || "good"] || CLASSIFICATION_CONFIG.good;
    const showFollowUp = annotation.betterMoveExists && annotation.pvSan && annotation.pvSan.length > 0;

    return (
        <Card
            className="bg-white dark:bg-card shadow-sm border rounded-lg overflow-hidden"
            style={{ borderLeft: `4px solid ${config.color}` }}
        >
            <CardContent className="p-4 space-y-3">
                {/* Top row: Icon + Classification + Eval */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* Classification Icon */}
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: config.bgColor }}
                        >
                            <Image
                                src={config.icon}
                                alt={config.label}
                                width={28}
                                height={28}
                            />
                        </div>

                        {/* Move and Classification */}
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-lg">{annotation.moveSan}</span>
                                <Badge
                                    variant="secondary"
                                    className="text-xs"
                                    style={{
                                        backgroundColor: config.bgColor,
                                        color: config.color,
                                        borderColor: config.color
                                    }}
                                >
                                    {config.label}
                                </Badge>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                                {annotation.sideToMove} to move
                            </span>
                        </div>
                    </div>

                    {/* Evaluation */}
                    <div className="text-right">
                        <div
                            className="font-mono font-bold text-lg"
                            style={{ color: getEvalColor(annotation.evalCp) }}
                        >
                            {formatEval(annotation.evalCp)}
                        </div>
                        {annotation.evalDelta !== 0 && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                {annotation.evalDelta > 0 ? "+" : ""}{(annotation.evalDelta / 100).toFixed(2)} eval change
                            </div>
                        )}
                    </div>
                </div>

                {/* Heuristic commentary */}
                {annotation.heuristicSummary && annotation.heuristicSummary.commentary && (
                    <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded-md">
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            {annotation.heuristicSummary.commentary}
                        </p>
                    </div>
                )}

                {/* Best move suggestion when there's a better alternative */}
                {annotation.betterMoveExists && annotation.bestMoveSan && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Best move:</span>
                        <span className="font-mono font-semibold text-green-600">
                            {annotation.bestMoveSan}
                        </span>
                    </div>
                )}

                {/* Principal variation preview */}
                {annotation.pvSan && annotation.pvSan.length > 0 && (
                    <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded-md">
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1">
                            <ChevronRight className="w-3 h-3" />
                            <span>Engine line:</span>
                        </div>
                        <div className="font-mono text-sm text-gray-700 dark:text-gray-300">
                            {annotation.pvSan.slice(0, 5).join(" ")}
                            {annotation.pvSan.length > 5 && "..."}
                        </div>
                    </div>
                )}

                {/* Play follow-up button */}
                {showFollowUp && onPlayFollowUp && (
                    <Button
                        variant="default"
                        size="sm"
                        className="w-full"
                        onClick={() => onPlayFollowUp(annotation.pvSan!)}
                        style={{ backgroundColor: config.color }}
                    >
                        <Play className="w-4 h-4 mr-2" />
                        Play follow-up
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}

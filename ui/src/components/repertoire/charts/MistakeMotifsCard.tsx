"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Target, TrendingDown, BookOpen, ChevronDown, ChevronUp, GitFork } from "lucide-react";
import { MistakeMotifEntry } from "@/types/repertoire";
import { cn } from "@/lib/utils";

interface MistakeMotifsCardProps {
    data?: MistakeMotifEntry[];
    className?: string;
    onPracticePuzzles?: (motif: string) => void;
}

const MOTIF_ICONS: Record<string, React.ReactNode> = {
    fork: <GitFork className="w-4 h-4" />,
    pin: <TrendingDown className="w-4 h-4" />,
    skewer: <TrendingDown className="w-4 h-4" />,
    xray: <Target className="w-4 h-4" />,
    hanging_piece: <AlertTriangle className="w-4 h-4" />,
    trapped_piece: <AlertTriangle className="w-4 h-4" />,
    overloaded_piece: <AlertTriangle className="w-4 h-4" />,
    discovered_attack: <Target className="w-4 h-4" />,
};

const MOTIF_COLORS: Record<string, string> = {
    fork: "bg-purple-500/10 text-purple-600 border-purple-200",
    pin: "bg-pink-500/10 text-pink-600 border-pink-200",
    skewer: "bg-teal-500/10 text-teal-600 border-teal-200",
    xray: "bg-orange-500/10 text-orange-600 border-orange-200",
    hanging_piece: "bg-red-500/10 text-red-600 border-red-200",
    trapped_piece: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
    overloaded_piece: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
    discovered_attack: "bg-green-500/10 text-green-600 border-green-200",
};

function formatMotifName(motif: string): string {
    return motif
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPhase(phase: { opening: number; middlegame: number; endgame: number }): string {
    const total = phase.opening + phase.middlegame + phase.endgame;
    if (total === 0) return "";

    const parts = [];
    if (phase.opening > 0) parts.push(`${phase.opening} in opening`);
    if (phase.middlegame > 0) parts.push(`${phase.middlegame} in middlegame`);
    if (phase.endgame > 0) parts.push(`${phase.endgame} in endgame`);

    return parts.slice(0, 2).join(", ");
}

export default function MistakeMotifsCard({
    data = [],
    className,
    onPracticePuzzles,
}: MistakeMotifsCardProps) {
    const [expanded, setExpanded] = useState(false);

    const sortedData = useMemo(() => {
        if (!data || data.length === 0) return [];
        // Already sorted by backend, but ensure it
        return [...data].sort((a, b) =>
            (b.count * Math.abs(b.avg_cp_loss)) - (a.count * Math.abs(a.avg_cp_loss))
        );
    }, [data]);

    const topInsight = sortedData[0]?.nl_insight;
    const displayedData = expanded ? sortedData : sortedData.slice(0, 5);
    const hasMore = sortedData.length > 5;

    if (sortedData.length === 0) {
        return (
            <Card className={cn("overflow-hidden", className)}>
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                        <CardTitle className="text-base font-semibold">Tactical Weaknesses</CardTitle>
                    </div>
                    <CardDescription className="text-xs">Your recurring mistake patterns</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                        No tactical mistakes detected in your games.
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn("overflow-hidden", className)}>
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <CardTitle className="text-base font-semibold">Tactical Weaknesses</CardTitle>
                </div>
                <CardDescription className="text-xs">Your recurring mistake patterns</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Top insight */}
                {topInsight && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                        <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
                            {topInsight}
                        </p>
                    </div>
                )}

                {/* Motif list */}
                <div className="space-y-3">
                    {displayedData.map((entry, idx) => (
                        <div
                            key={entry.motif}
                            className={cn(
                                "p-3 rounded-lg border",
                                MOTIF_COLORS[entry.motif] || "bg-gray-50 dark:bg-gray-900"
                            )}
                        >
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                    {MOTIF_ICONS[entry.motif] || <AlertTriangle className="w-4 h-4" />}
                                    <span className="font-medium text-sm">
                                        {formatMotifName(entry.motif)}
                                    </span>
                                    <Badge variant="secondary" className="text-xs">
                                        {entry.count}×
                                    </Badge>
                                </div>
                                <span className="text-xs font-mono text-red-600 dark:text-red-400">
                                    {entry.avg_cp_loss.toFixed(1)} pawns
                                </span>
                            </div>

                            <div className="text-xs text-muted-foreground space-y-1">
                                {entry.frequent_openings.length > 0 && (
                                    <div>
                                        Openings: {entry.frequent_openings.join(", ")}
                                    </div>
                                )}
                                {entry.critical_ply_range && (
                                    <div>
                                        Critical moves: {Math.floor((entry.critical_ply_range[0] + 1) / 2)}-
                                        {Math.floor((entry.critical_ply_range[1] + 1) / 2)}
                                    </div>
                                )}
                                <div>{formatPhase(entry.phase_distribution)}</div>
                            </div>

                            {onPracticePuzzles && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="mt-2 h-7 text-xs"
                                    onClick={() => onPracticePuzzles(entry.motif)}
                                >
                                    <BookOpen className="w-3 h-3 mr-1" />
                                    Practice puzzles
                                </Button>
                            )}
                        </div>
                    ))}
                </div>

                {hasMore && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="flex items-center justify-center gap-1 w-full text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1"
                    >
                        {expanded ? (
                            <>
                                <ChevronUp className="w-3 h-3" />
                                Show less
                            </>
                        ) : (
                            <>
                                <ChevronDown className="w-3 h-3" />
                                +{sortedData.length - 5} more patterns
                            </>
                        )}
                    </button>
                )}
            </CardContent>
        </Card>
    );
}

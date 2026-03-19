"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Target, TrendingDown, Wrench, ChevronDown, ChevronUp } from "lucide-react";
import { DefensiveMotifEntry } from "@/types/repertoire";
import { cn } from "@/lib/utils";

interface DefensiveBlindspotsCardProps {
    data?: DefensiveMotifEntry[];
    className?: string;
    onFixRepertoire?: (motif: string) => void;
}

const MOTIF_ICONS: Record<string, React.ReactNode> = {
    fork: <Target className="w-4 h-4" />,
    pin: <TrendingDown className="w-4 h-4" />,
    skewer: <TrendingDown className="w-4 h-4" />,
    xray: <Target className="w-4 h-4" />,
    hanging_piece: <Shield className="w-4 h-4" />,
    trapped_piece: <Shield className="w-4 h-4" />,
    overloaded_piece: <Shield className="w-4 h-4" />,
    discovered_attack: <Target className="w-4 h-4" />,
};

const MOTIF_COLORS: Record<string, string> = {
    fork: "bg-purple-500/10 text-purple-600 border-purple-200 dark:border-purple-800",
    pin: "bg-pink-500/10 text-pink-600 border-pink-200 dark:border-pink-800",
    skewer: "bg-teal-500/10 text-teal-600 border-teal-200 dark:border-teal-800",
    xray: "bg-orange-500/10 text-orange-600 border-orange-200 dark:border-orange-800",
    hanging_piece: "bg-red-500/10 text-red-600 border-red-200 dark:border-red-800",
    trapped_piece: "bg-yellow-500/10 text-yellow-600 border-yellow-200 dark:border-yellow-800",
    overloaded_piece: "bg-cyan-500/10 text-cyan-600 border-cyan-200 dark:border-cyan-800",
    discovered_attack: "bg-green-500/10 text-green-600 border-green-200 dark:border-green-800",
};

function formatMotifName(motif: string): string {
    return motif
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTopPhase(phase: { opening: number; middlegame: number; endgame: number }): string {
    const entries = [
        { name: "Opening", count: phase.opening },
        { name: "Middlegame", count: phase.middlegame },
        { name: "Endgame", count: phase.endgame },
    ].filter(e => e.count > 0);

    if (entries.length === 0) return "";

    entries.sort((a, b) => b.count - a.count);
    return entries[0].name.toLowerCase();
}

export default function DefensiveBlindspotsCard({
    data = [],
    className,
    onFixRepertoire,
}: DefensiveBlindspotsCardProps) {
    const [expanded, setExpanded] = useState(false);

    const sortedData = useMemo(() => {
        if (!data || data.length === 0) return [];
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
                        <Shield className="w-5 h-5 text-blue-500" />
                        <CardTitle className="text-base font-semibold">Defensive Blind Spots</CardTitle>
                    </div>
                    <CardDescription className="text-xs">Opponent tactics that exploit you</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                        No defensive vulnerabilities detected.
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn("overflow-hidden", className)}>
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-500" />
                    <CardTitle className="text-base font-semibold">Defensive Blind Spots</CardTitle>
                </div>
                <CardDescription className="text-xs">Opponent tactics that exploit you</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Top insight */}
                {topInsight && (
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                        <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                            {topInsight}
                        </p>
                    </div>
                )}

                {/* Motif list */}
                <div className="space-y-3">
                    {displayedData.map((entry) => (
                        <div
                            key={entry.motif}
                            className={cn(
                                "p-3 rounded-lg border",
                                MOTIF_COLORS[entry.motif] || "bg-gray-50 dark:bg-gray-900"
                            )}
                        >
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                    {MOTIF_ICONS[entry.motif] || <Shield className="w-4 h-4" />}
                                    <span className="font-medium text-sm">
                                        {formatMotifName(entry.motif)}
                                    </span>
                                    <Badge variant="secondary" className="text-xs">
                                        {entry.count}×
                                    </Badge>
                                </div>
                                <span className="text-xs font-mono text-blue-600 dark:text-blue-400">
                                    {Math.abs(entry.avg_cp_loss).toFixed(1)} pawns lost
                                </span>
                            </div>

                            <div className="text-xs text-muted-foreground space-y-1">
                                {entry.vulnerable_openings.length > 0 && (
                                    <div>
                                        Vulnerable in: {entry.vulnerable_openings.join(", ")}
                                    </div>
                                )}
                                {entry.phase_distribution && (
                                    <div>
                                        Occurs in: {formatTopPhase(entry.phase_distribution)}
                                    </div>
                                )}
                            </div>

                            {onFixRepertoire && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="mt-2 h-7 text-xs"
                                    onClick={() => onFixRepertoire(entry.motif)}
                                >
                                    <Wrench className="w-3 h-3 mr-1" />
                                    Fix in repertoire
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

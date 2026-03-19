"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Brain,
    RefreshCw,
    Target,
    TrendingUp,
    TrendingDown,
    BookOpen,
    Puzzle,
    ChevronRight,
    Loader2,
    AlertCircle,
    Zap,
    Trophy,
} from "lucide-react";
import {
    useTrainerSummary,
    useTrainerPuzzles,
    useTrainerPVLines,
    useTrainerRefresh,
    TrainerPuzzle,
    TrainerPVLine,
} from "./useTrainerHooks";
import { TrainerInsightsPanel } from "./TrainerInsightsPanel";

type TimeControl = "all" | "bullet" | "blitz" | "rapid" | "classical";
type Side = "both" | "white" | "black";

interface PreloadedTrainerData {
    has_trainer_data: boolean;
    status: string | null;
    headline: string | null;
    focus_area: string | null;
    summary?: {
        coach_summary: string | null;
        recommendations: Record<string, any>;
        raw_stats: Record<string, any>;
        sample_size: number;
        updated_at: string | null;
    };
}

interface Props {
    preloadedData?: PreloadedTrainerData;
}

export default function ProfileTrainerSection({ preloadedData }: Props = {}) {
    const [timeControl, setTimeControl] = useState<TimeControl>("all");
    const [side, setSide] = useState<Side>("both");
    // If we didn't receive preloaded trainer data, start with fetching enabled
    const [filtersChanged, setFiltersChanged] = useState(!preloadedData?.summary);

    // Only fetch via hook if filters changed from defaults
    const { data: summary, loading: summaryLoading, error: summaryError, refetch: refetchSummary } =
        useTrainerSummary(timeControl, side, { enabled: filtersChanged || !preloadedData?.summary });

    // Combine preloaded data with fetched data
    const effectiveSummary = summary || (preloadedData?.summary ? {
        status: preloadedData.status as any,
        time_control: "all",
        side: "both",
        sample_size: preloadedData.summary.sample_size,
        raw_stats: preloadedData.summary.raw_stats,
        coach_summary: preloadedData.summary.coach_summary,
        recommendations: preloadedData.summary.recommendations,
        updated_at: preloadedData.summary.updated_at,
    } : null);

    // Show loading only if we have no data yet
    const effectiveLoading = !preloadedData && !effectiveSummary && summaryLoading;
    const shouldLoadExtras = !!effectiveSummary && ["ready", "updating"].includes(effectiveSummary.status);

    // Track filter changes
    useEffect(() => {
        if (timeControl !== "all" || side !== "both") {
            setFiltersChanged(true);
        }
    }, [timeControl, side]);

    const { data: puzzles, loading: puzzlesLoading } = useTrainerPuzzles(timeControl, side, 5, { enabled: shouldLoadExtras });
    const { data: pvLines, loading: pvLinesLoading } = useTrainerPVLines(timeControl, side, 5, { enabled: shouldLoadExtras });
    const { refresh, loading: refreshing } = useTrainerRefresh();

    const handleRefresh = async () => {
        try {
            await refresh(timeControl, side);
            // Wait a moment then refetch
            setTimeout(() => refetchSummary(), 2000);
        } catch (e) {
            console.error("Refresh failed:", e);
        }
    };

    // Loading state
    if (effectiveLoading) {
        return (
            <Card className="mb-8">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Brain className="w-5 h-5 text-foreground" />
                        Personal Trainer
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <p>Loading your training profile...</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Error state
    if (summaryError) {
        return (
            <Card className="mb-8">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Brain className="w-5 h-5 text-foreground" />
                        Personal Trainer
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="w-5 h-5" />
                        <p>{summaryError}</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Not enough games state
    if (effectiveSummary?.status === "not_enough_games") {
        return (
            <Card className="mb-8">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Brain className="w-5 h-5 text-foreground" />
                        Personal Trainer
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8">
                        <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold mb-2">Unlock Your Personal Trainer</h3>
                        <p className="text-muted-foreground mb-4">
                            {effectiveSummary.message || "Play a few more games to get personalized coaching insights."}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Games analyzed: {effectiveSummary.sample_size || 0} / 5 required
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Building state
    if (effectiveSummary?.status === "building") {
        return (
            <Card className="mb-8">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Brain className="w-5 h-5 text-foreground" />
                        Personal Trainer
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8">
                        <Loader2 className="w-12 h-12 mx-auto mb-4 text-purple-500 animate-spin" />
                        <h3 className="text-lg font-semibold mb-2">Building Your Training Profile</h3>
                        <p className="text-muted-foreground">
                            {effectiveSummary.message || "Analyzing your games to create personalized recommendations..."}
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const rawStats = effectiveSummary?.raw_stats || {};
    const recommendations = effectiveSummary?.recommendations || {};

    return (
        <Card className="mb-8">
            <CardHeader>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <CardTitle className="flex items-center gap-2">
                        <Brain className="w-5 h-5 text-foreground" />
                        Personal Trainer
                        {summary?.status === "updating" && (
                            <Badge variant="outline" className="ml-2">
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                Updating
                            </Badge>
                        )}
                    </CardTitle>

                    {/* Controls - NO TEXT INPUT */}
                    <div className="flex flex-wrap items-center gap-2">
                        <Select value={timeControl} onValueChange={(v) => setTimeControl(v as TimeControl)}>
                            <SelectTrigger className="w-[130px]">
                                <SelectValue placeholder="Time Control" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="bullet">Bullet</SelectItem>
                                <SelectItem value="blitz">Blitz</SelectItem>
                                <SelectItem value="rapid">Rapid</SelectItem>
                                <SelectItem value="classical">Classical</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={side} onValueChange={(v) => setSide(v as Side)}>
                            <SelectTrigger className="w-[100px]">
                                <SelectValue placeholder="Side" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="both">Both</SelectItem>
                                <SelectItem value="white">White</SelectItem>
                                <SelectItem value="black">Black</SelectItem>
                            </SelectContent>
                        </Select>

                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleRefresh}
                                        disabled={refreshing}
                                    >
                                        <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
                                        Refresh
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Refresh from recent games</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>
            </CardHeader>

            <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left Column: Overview */}
                    <div className="space-y-6">
                        {/* Coach Summary */}
                        {summary?.coach_summary && (
                            <div className="p-4 rounded-lg bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20">
                                <h3 className="font-semibold mb-2 flex items-center gap-2">
                                    <Brain className="w-4 h-4 text-foreground" />
                                    Coach's Analysis
                                </h3>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                    {summary.coach_summary}
                                </p>
                            </div>
                        )}

                        {/* Persistent Trainer Insights (What's Changed) */}
                        {summary && <TrainerInsightsPanel data={summary} />}

                        {/* Stats Overview */}
                        {rawStats.sample_size && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <StatCard
                                    label="Games"
                                    value={rawStats.sample_size}
                                    icon={<Target className="w-4 h-4" />}
                                />
                                <StatCard
                                    label="Score"
                                    value={`${((rawStats.score || 0) * 100).toFixed(0)}%`}
                                    icon={rawStats.score >= 0.5 ?
                                        <TrendingUp className="w-4 h-4 text-green-500" /> :
                                        <TrendingDown className="w-4 h-4 text-red-500" />
                                    }
                                />
                                <StatCard
                                    label="Brilliants"
                                    value={rawStats.games_with_brilliants || 0}
                                    icon={<Zap className="w-4 h-4 text-yellow-500" />}
                                />
                                <StatCard
                                    label="Comebacks"
                                    value={rawStats.comeback_wins || 0}
                                    icon={<Trophy className="w-4 h-4 text-orange-500" />}
                                />
                            </div>
                        )}

                        {/* Blunder Distribution */}
                        {rawStats.blunder_distribution && (
                            <div className="p-4 rounded-lg border">
                                <h3 className="font-semibold mb-3">Blunder Distribution by Phase</h3>
                                <div className="space-y-2">
                                    <BlunderBar
                                        phase="Opening"
                                        count={rawStats.blunder_distribution.opening}
                                        total={
                                            (rawStats.blunder_distribution.opening || 0) +
                                            (rawStats.blunder_distribution.middlegame || 0) +
                                            (rawStats.blunder_distribution.endgame || 0)
                                        }
                                        color="bg-blue-500"
                                    />
                                    <BlunderBar
                                        phase="Middlegame"
                                        count={rawStats.blunder_distribution.middlegame}
                                        total={
                                            (rawStats.blunder_distribution.opening || 0) +
                                            (rawStats.blunder_distribution.middlegame || 0) +
                                            (rawStats.blunder_distribution.endgame || 0)
                                        }
                                        color="bg-purple-500"
                                    />
                                    <BlunderBar
                                        phase="Endgame"
                                        count={rawStats.blunder_distribution.endgame}
                                        total={
                                            (rawStats.blunder_distribution.opening || 0) +
                                            (rawStats.blunder_distribution.middlegame || 0) +
                                            (rawStats.blunder_distribution.endgame || 0)
                                        }
                                        color="bg-orange-500"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Focus Areas */}
                        {recommendations.focus_areas?.length > 0 && (
                            <div className="p-4 rounded-lg border">
                                <h3 className="font-semibold mb-3 flex items-center gap-2">
                                    <Target className="w-4 h-4 text-red-500" />
                                    Focus Areas
                                </h3>
                                <ul className="space-y-2">
                                    {recommendations.focus_areas.map((area, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm">
                                            <ChevronRight className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                                            <span>{area}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Training Actions */}
                    <div className="space-y-6">
                        {/* Puzzles from Your Games */}
                        <div className="p-4 rounded-lg border">
                            <h3 className="font-semibold mb-3 flex items-center gap-2">
                                <Puzzle className="w-4 h-4 text-green-500" />
                                Puzzles from Your Games
                            </h3>
                            {puzzlesLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Loading puzzles...
                                </div>
                            ) : puzzles.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No puzzles available yet. Keep playing and analyzing games!
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {puzzles.map((puzzle) => (
                                        <PuzzleCard key={puzzle.position_id} puzzle={puzzle} />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Study Lines */}
                        <div className="p-4 rounded-lg border">
                            <h3 className="font-semibold mb-3 flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-blue-500" />
                                Study Lines
                            </h3>
                            {pvLinesLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Loading study lines...
                                </div>
                            ) : pvLines.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No study lines available yet. Keep playing and analyzing games!
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {pvLines.map((line) => (
                                        <PVLineCard key={line.position_id} line={line} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Last Updated */}
                {summary?.updated_at && (
                    <p className="text-xs text-muted-foreground mt-4 text-right">
                        Last updated: {new Date(summary.updated_at).toLocaleString()}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

// Subcomponents

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
    return (
        <div className="p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
                {icon}
                <span className="text-xs">{label}</span>
            </div>
            <div className="text-xl font-bold">{value}</div>
        </div>
    );
}

function BlunderBar({ phase, count, total, color }: { phase: string; count: number; total: number; color: string }) {
    const percentage = total > 0 ? (count / total) * 100 : 0;

    return (
        <div className="flex items-center gap-3">
            <span className="text-sm w-24 shrink-0">{phase}</span>
            <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                <div
                    className={`h-full ${color} transition-all`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
            <span className="text-sm text-muted-foreground w-8">{count}</span>
        </div>
    );
}

function PuzzleCard({ puzzle }: { puzzle: TrainerPuzzle }) {
    return (
        <div className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <Badge variant={puzzle.priority === "high" ? "destructive" : "secondary"} className="text-xs">
                            {puzzle.theme}
                        </Badge>
                        <span className="text-xs text-muted-foreground capitalize">{puzzle.priority}</span>
                    </div>
                    <p className="text-sm truncate">{puzzle.reason}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
        </div>
    );
}

function PVLineCard({ line }: { line: TrainerPVLine }) {
    return (
        <div className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm mb-1">{line.display_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{line.study_hint}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
        </div>
    );
}

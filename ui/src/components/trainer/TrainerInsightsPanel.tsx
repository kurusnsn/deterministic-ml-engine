"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    TrendingUp,
    TrendingDown,
    Minus,
    AlertTriangle,
    Target,
    Zap,
} from "lucide-react";
import { TrainerSummary, TrainerEvent, PersistentTrainerData } from "./useTrainerHooks";

interface TrainerInsightsPanelProps {
    data: TrainerSummary;
}

/**
 * Passive display panel for persistent trainer insights.
 * Shows progress trends, detected events, and coaching summaries.
 * 
 * NO user input, NO chat, NO buttons - purely observational.
 */
export function TrainerInsightsPanel({ data }: TrainerInsightsPanelProps) {
    const persistentData = data.persistent_trainer;

    // Don't render if no persistent trainer data
    if (!persistentData) {
        return null;
    }

    const { progress_since_last, detected_events, event_summary, snapshot_period } = persistentData;

    // Don't render if empty
    if (!detected_events.length && !event_summary && Object.keys(progress_since_last).length === 0) {
        return null;
    }

    return (
        <Card className="border-border/50">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" />
                    What&apos;s Changed
                    <Badge variant="outline" className="ml-auto text-xs font-normal">
                        {snapshot_period === "last_50_games" ? "50 games" : "20 games"}
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Event Summary (LLM-generated) */}
                {event_summary && (
                    <div className="text-sm text-muted-foreground leading-relaxed">
                        {event_summary}
                    </div>
                )}

                {/* Detected Events */}
                {detected_events.length > 0 && (
                    <div className="space-y-2">
                        {detected_events.map((event, idx) => (
                            <EventBadge key={idx} event={event} />
                        ))}
                    </div>
                )}

                {/* Progress Deltas */}
                {Object.keys(progress_since_last).length > 0 && (
                    <div className="pt-2 border-t border-border/50">
                        <h4 className="text-xs font-medium text-muted-foreground mb-2">
                            Progress Since Last Report
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(progress_since_last)
                                .filter(([key]) => !key.startsWith("opening_")) // Skip individual openings
                                .slice(0, 4) // Limit to 4 metrics
                                .map(([key, value]) => (
                                    <DeltaItem key={key} metricKey={key} value={value} />
                                ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/**
 * Badge component for displaying event type with appropriate styling
 */
function EventBadge({ event }: { event: TrainerEvent }) {
    const config = getEventConfig(event.type);

    return (
        <div className={`flex items-start gap-2 p-2 rounded-md ${config.bgClass}`}>
            <config.icon className={`h-4 w-4 mt-0.5 ${config.iconClass}`} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${config.textClass}`}>
                        {config.label}
                    </span>
                    {event.confidence >= 0.8 && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                            High confidence
                        </Badge>
                    )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {event.description}
                </p>
            </div>
        </div>
    );
}

/**
 * Individual delta metric display
 */
function DeltaItem({ metricKey, value }: { metricKey: string; value: number }) {
    const label = formatMetricLabel(metricKey);
    const isPositive = isPositiveDelta(metricKey, value);
    const isNeutral = Math.abs(value) < 0.02;

    return (
        <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground truncate">{label}</span>
            <span className={`flex items-center gap-1 font-medium ${isNeutral ? "text-muted-foreground" :
                    isPositive ? "text-green-600 dark:text-green-400" :
                        "text-red-600 dark:text-red-400"
                }`}>
                {isNeutral ? (
                    <Minus className="h-3 w-3" />
                ) : isPositive ? (
                    <TrendingUp className="h-3 w-3" />
                ) : (
                    <TrendingDown className="h-3 w-3" />
                )}
                {formatDeltaValue(metricKey, value)}
            </span>
        </div>
    );
}

/**
 * Get event configuration for styling
 */
function getEventConfig(type: TrainerEvent["type"]) {
    switch (type) {
        case "improvement":
            return {
                icon: TrendingUp,
                label: "Improvement",
                bgClass: "bg-green-500/10",
                iconClass: "text-green-600 dark:text-green-400",
                textClass: "text-green-700 dark:text-green-300",
            };
        case "regression":
            return {
                icon: TrendingDown,
                label: "Focus Area",
                bgClass: "bg-amber-500/10",
                iconClass: "text-amber-600 dark:text-amber-400",
                textClass: "text-amber-700 dark:text-amber-300",
            };
        case "stagnation":
            return {
                icon: Minus,
                label: "Still Working On",
                bgClass: "bg-slate-500/10",
                iconClass: "text-slate-600 dark:text-slate-400",
                textClass: "text-slate-700 dark:text-slate-300",
            };
        case "false_confidence":
            return {
                icon: AlertTriangle,
                label: "Worth Noting",
                bgClass: "bg-purple-500/10",
                iconClass: "text-purple-600 dark:text-purple-400",
                textClass: "text-purple-700 dark:text-purple-300",
            };
        case "consistency":
            return {
                icon: Target,
                label: "Consistency",
                bgClass: "bg-blue-500/10",
                iconClass: "text-blue-600 dark:text-blue-400",
                textClass: "text-blue-700 dark:text-blue-300",
            };
        default:
            return {
                icon: Zap,
                label: "Update",
                bgClass: "bg-slate-500/10",
                iconClass: "text-slate-600",
                textClass: "text-slate-700",
            };
    }
}

/**
 * Format metric key to human-readable label
 */
function formatMetricLabel(key: string): string {
    const labels: Record<string, string> = {
        winrate_delta: "Win Rate",
        blunders_per_game_delta: "Blunders/Game",
        endgame_accuracy_delta: "Endgame",
        variance_delta: "Consistency",
    };
    return labels[key] || key.replace(/_delta$/, "").replace(/_/g, " ");
}

/**
 * Determine if a delta is positive (good)
 */
function isPositiveDelta(key: string, value: number): boolean {
    // For blunders and variance, lower is better
    if (key.includes("blunder") || key.includes("variance")) {
        return value < 0;
    }
    // For everything else, higher is better
    return value > 0;
}

/**
 * Format delta value for display
 */
function formatDeltaValue(key: string, value: number): string {
    if (key.includes("winrate") || key.includes("accuracy")) {
        const pct = Math.abs(value * 100).toFixed(1);
        return `${value >= 0 ? "+" : "-"}${pct}%`;
    }
    if (key.includes("blunder")) {
        return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
    }
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

export default TrainerInsightsPanel;

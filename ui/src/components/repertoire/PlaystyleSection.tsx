"use client";

import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Compass, Lightbulb, Users, Sword, Activity, Brain } from "lucide-react";
import PlaystyleSpiderChart from "./PlaystyleSpiderChart";
import RepertoireFitCard from "./RepertoireFitCard";
import RepertoireSuggestionsCard from "./RepertoireSuggestionsCard";
import { PlaystyleProfile, StyleScore, NormalizedMetric, EntropyMetric } from "@/types/repertoire";

interface PlaystyleSectionProps {
    playstyle?: PlaystyleProfile;
}

export default function PlaystyleSection({ playstyle }: PlaystyleSectionProps) {
    const [activeTab, setActiveTab] = useState<"overall" | "white" | "black">("overall");

    if (!playstyle) return null;

    const currentStyle = (playstyle as any)[activeTab] as StyleScore;
    const { population_metrics } = playstyle;

    return (
        <section className="space-y-6">
            {/* Section Header */}
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                    <Compass className="w-5 h-5 text-primary" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold">Playstyle Profile</h2>
                    <p className="text-sm text-muted-foreground">
                        Your tactical, positional, and structural preferences
                    </p>
                </div>
            </div>

            {/* Main Spider Chart Card */}
            <Card>
                <CardContent className="pt-6">
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                        <div className="flex flex-col lg:flex-row gap-6">
                            {/* Left side: Spider chart with tabs */}
                            <div className="lg:w-1/2">
                                <TabsList className="mb-4">
                                    <TabsTrigger value="overall">All Games</TabsTrigger>
                                    <TabsTrigger value="white">White</TabsTrigger>
                                    <TabsTrigger value="black">Black</TabsTrigger>
                                </TabsList>

                                <TabsContent value="overall" className="mt-0">
                                    <PlaystyleSpiderChart
                                        axes={playstyle.radar_axes}
                                        values={playstyle.radar_data_overall}
                                    />
                                </TabsContent>
                                <TabsContent value="white" className="mt-0">
                                    <PlaystyleSpiderChart
                                        axes={playstyle.radar_axes}
                                        values={playstyle.radar_data_white}
                                    />
                                </TabsContent>
                                <TabsContent value="black" className="mt-0">
                                    <PlaystyleSpiderChart
                                        axes={playstyle.radar_axes}
                                        values={playstyle.radar_data_black}
                                    />
                                </TabsContent>
                            </div>

                            {/* Right side: Summary and recommendations */}
                            <div className="lg:w-1/2 space-y-6">
                                {/* Summary */}
                                <div>
                                    <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                        <Compass className="w-4 h-4 text-muted-foreground" />
                                        Summary
                                    </h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {activeTab === "overall" ? playstyle.summary :
                                            activeTab === "white" ? "Detailed playstyle analysis for your games as White." :
                                                "Detailed playstyle analysis for your games as Black."}
                                    </p>
                                </div>

                                {/* Style Breakdown */}
                                <div className="grid grid-cols-3 gap-3">
                                    <StyleIndicator
                                        label="Tactical"
                                        value={currentStyle.tactical}
                                        complement="Positional"
                                        complementValue={currentStyle.positional}
                                    />
                                    <StyleIndicator
                                        label="Aggressive"
                                        value={currentStyle.aggressive}
                                        complement="Defensive"
                                        complementValue={currentStyle.defensive}
                                    />
                                    <StyleIndicator
                                        label="Open"
                                        value={currentStyle.open_positions}
                                        complement="Closed"
                                        complementValue={currentStyle.closed_positions}
                                    />
                                </div>

                                {/* Recommendations */}
                                {playstyle.recommendations && playstyle.recommendations.length > 0 && (
                                    <div>
                                        <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                            <Lightbulb className="w-4 h-4 text-amber-500" />
                                            Recommendations
                                        </h3>
                                        <ul className="space-y-2">
                                            {playstyle.recommendations.map((rec, i) => (
                                                <li
                                                    key={i}
                                                    className="text-sm text-muted-foreground pl-4 border-l-2 border-amber-500/30"
                                                >
                                                    {rec}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Tabs>
                </CardContent>
            </Card>

            {/* Population Benchmark Section */}
            {population_metrics && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Users className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold">Population Analysis</h3>
                        <Badge variant="secondary" className="ml-auto font-normal">
                            vs {population_metrics.rating_bucket} {population_metrics.speed}
                        </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <PopulationMetricCard
                            title="Aggression"
                            metric={population_metrics.aggression}
                            icon={<Sword className="w-4 h-4 text-orange-500" />}
                        />
                        <PopulationMetricCard
                            title="Volatility"
                            metric={population_metrics.volatility}
                            icon={<Activity className="w-4 h-4 text-blue-500" />}
                        />
                        <EntropyMetricCard
                            metric={population_metrics.style_entropy}
                            icon={<Brain className="w-4 h-4 text-purple-500" />}
                        />
                    </div>
                </div>
            )}

            {/* Repertoire Fit Card */}
            <RepertoireFitCard playstyle={playstyle} />

            {/* Style-Based Suggestions Card */}
            <RepertoireSuggestionsCard playstyle={playstyle} />
        </section>
    );
}

// ----------------------------------------------------------------------------
// Helper Components
// ----------------------------------------------------------------------------

interface StyleIndicatorProps {
    label: string;
    value: number;
    complement: string;
    complementValue: number;
}

function StyleIndicator({ label, value, complement, complementValue }: StyleIndicatorProps) {
    const percentage = Math.round(value * 100);
    const complementPercentage = Math.round(complementValue * 100);

    // Determine which style is dominant
    const isDominant = value > complementValue;
    const dominantLabel = isDominant ? label : complement;
    const dominantValue = isDominant ? percentage : complementPercentage;

    return (
        <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-xs text-muted-foreground mb-1">
                {label} / {complement}
            </div>
            <div className="text-lg font-semibold text-foreground">
                {dominantValue}%
            </div>
            <div className="text-xs font-medium text-primary">
                {dominantLabel}
            </div>
        </div>
    );
}

function PopulationMetricCard({ title, metric, icon }: { title: string, metric: NormalizedMetric | null | undefined, icon: React.ReactNode }) {
    if (!metric) return null;

    // Confidence badge color mapping
    const confidenceColor =
        metric.confidence === 'high' ? 'text-green-600 bg-green-500/10' :
            metric.confidence === 'medium' ? 'text-amber-600 bg-amber-500/10' :
                'text-muted-foreground bg-muted';

    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                        {icon} {title}
                    </div>
                    {metric.confidence && (
                        <div className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-sm ${confidenceColor}`}>
                            {metric.confidence} conf
                        </div>
                    )}
                </div>

                <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-3xl font-bold tracking-tight">{metric.percentile}</span>
                    <span className="text-xs text-muted-foreground">th percentile</span>
                </div>

                <Progress value={metric.percentile} className="h-2 mb-3" />

                <p className="text-xs text-muted-foreground leading-relaxed min-h-[40px]">
                    {metric.interpretation}
                </p>
            </CardContent>
        </Card>
    )
}

function EntropyMetricCard({ metric, icon }: { metric: EntropyMetric | null | undefined, icon: React.ReactNode }) {
    if (!metric) return null;
    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                        {icon} Style Consistency
                    </div>
                </div>

                <div className="mb-4">
                    <div className="text-xl font-semibold capitalize text-primary mb-1">
                        {metric.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                        Entropy: {metric.value}
                    </div>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed min-h-[40px]">
                    {metric.interpretation}
                </p>
            </CardContent>
        </Card>
    )
}

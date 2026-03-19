"use client";

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RepertoireReport } from '@/types/repertoire';
import OpeningOutcomesChart from './OpeningOutcomesChart';
import AvgMoveTimeChart from './AvgMoveTimeChart';
import GameLengthChart from './GameLengthChart';
import WinRateByClusterChart from './WinRateByClusterChart';
import TacticalPatternChart from './TacticalPatternChart';
import { BarChart3, Lightbulb, AlertTriangle, TrendingUp } from 'lucide-react';
import { generateInsights, getTopOpenings, computeAvgMoveTimeByResult, computeGameLengthBins } from '@/lib/overviewHelpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface OverviewSectionProps {
    report: RepertoireReport;
    onScrollToRepertoire?: (category?: string) => void;
}

export default function OverviewSection({
    report,
    onScrollToRepertoire,
}: OverviewSectionProps) {
    const [selectedColor, setSelectedColor] = useState<'all' | 'white' | 'black'>('all');

    // Get all openings from the report
    const allOpenings = [
        ...Object.values(report.white_repertoire || {}).flatMap(group => group.openings || []),
        ...Object.values(report.black_repertoire || {}).flatMap(group => group.openings || []),
    ];

    // Filter openings by selected color
    const filteredOpenings = selectedColor === 'all'
        ? allOpenings
        : allOpenings.filter(o => o.color === selectedColor);

    const timeUsage = report.time_usage || [];
    const histogram = report.game_length_histogram || [];

    // Generate centralized insights
    const topOpenings = getTopOpenings(filteredOpenings, selectedColor, timeUsage);
    const avgMoveTime = computeAvgMoveTimeByResult(timeUsage, filteredOpenings);
    const gameLengthBins = computeGameLengthBins(histogram, selectedColor);
    const insights = generateInsights(topOpenings, avgMoveTime, gameLengthBins);

    return (
        <section id="overview-section" className="space-y-6">
            {/* Section Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
                        <BarChart3 className="w-6 h-6" />
                        Overview
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Key insights into your opening performance
                    </p>
                </div>

                {/* Color Filter Tabs */}
                <Tabs value={selectedColor} onValueChange={(value) => setSelectedColor(value as 'all' | 'white' | 'black')}>
                    <TabsList>
                        <TabsTrigger value="all">Both</TabsTrigger>
                        <TabsTrigger value="white">White</TabsTrigger>
                        <TabsTrigger value="black">Black</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Centralized Insights */}
            {insights.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {insights.map((insight, index) => (
                        <Card key={index} className={`border-l-4 ${insight.type === 'strength' ? 'border-l-green-500 bg-green-50/50 dark:bg-green-950/30' :
                                insight.type === 'warning' ? 'border-l-red-500 bg-red-50/50 dark:bg-red-950/30' :
                                    'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                            }`}>
                            <CardContent className="p-4 flex items-start gap-3">
                                {insight.type === 'strength' ? (
                                    <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                                ) : insight.type === 'warning' ? (
                                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                                ) : (
                                    <Lightbulb className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                                )}
                                <div>
                                    <p className={`text-sm font-medium ${insight.type === 'strength' ? 'text-green-900 dark:text-green-100' :
                                            insight.type === 'warning' ? 'text-red-900 dark:text-red-100' :
                                                'text-blue-900 dark:text-blue-100'
                                        }`}>
                                        {insight.message}
                                    </p>
                                    {insight.opening_eco && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Related to: {insight.opening_eco}
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Chart 1: Opening Outcomes (Top 5) */}
            <OpeningOutcomesChart
                openings={filteredOpenings}
                timeUsage={timeUsage}
                selectedColor={selectedColor}
                onScrollToRepertoire={onScrollToRepertoire}
            />

            {/* Charts 2 & 3: Average Move Time and Game Length */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AvgMoveTimeChart
                    openings={filteredOpenings}
                    timeUsage={timeUsage}
                    selectedColor={selectedColor}
                />
                <GameLengthChart
                    histogram={histogram}
                    selectedColor={selectedColor}
                />
            </div>

            {/* Chart 4: Win Rate by Line Cluster */}
            <WinRateByClusterChart
                openings={filteredOpenings}
                selectedColor={selectedColor}
            />

            {/* NEW: Tactical Pattern Chart (if available) */}
            {report.charts_additional?.tactical_pattern_chart && 
             report.charts_additional.tactical_pattern_chart.length > 0 && (
                <TacticalPatternChart data={report.charts_additional.tactical_pattern_chart} />
            )}
        </section>
    );
}

"use client";

import { useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowDown, AlertCircle, TrendingUp, Target } from 'lucide-react';
import { OpeningStats, TimeUsageEntry } from '@/types/repertoire';
import { getTopOpenings } from '@/lib/overviewHelpers';

interface OpeningOutcomesChartProps {
    openings: OpeningStats[];
    timeUsage: TimeUsageEntry[];
    selectedColor: 'white' | 'black' | 'all';
    onScrollToRepertoire?: () => void;
}

const RESULT_COLORS = {
    wins: '#10b981',
    draws: '#6b7280',
    losses: '#ef4444',
};

export default function OpeningOutcomesChart({
    openings,
    timeUsage,
    selectedColor,
    onScrollToRepertoire,
}: OpeningOutcomesChartProps) {
    // Get top 5 openings by relevance
    const topOpenings = useMemo(() => {
        return getTopOpenings(openings, selectedColor, timeUsage, 5);
    }, [openings, selectedColor, timeUsage]);

    // Prepare chart data
    const chartData = useMemo(() => {
        return topOpenings.map(opening => {
            const total = opening.wins + opening.draws + opening.losses;
            return {
                name: `${opening.eco_code} [${opening.games_count}]`,
                fullName: `${opening.eco_code} ${opening.opening_name}`,
                eco: opening.eco_code,
                wins: opening.wins,
                draws: opening.draws,
                losses: opening.losses,
                total,
                winsPercent: total > 0 ? (opening.wins / total) * 100 : 0,
                drawsPercent: total > 0 ? (opening.draws / total) * 100 : 0,
                lossesPercent: total > 0 ? (opening.losses / total) * 100 : 0,
            };
        });
    }, [topOpenings]);

    // Generate insights
    const insights = useMemo(() => {
        // We'll generate insights from all three charts in the parent component
        // For now, generate opening-specific insights
        const insightList: Array<{ type: 'warning' | 'strength' | 'suggestion'; message: string }> = [];

        topOpenings.forEach(opening => {
            if (opening.loss_rate >= 0.5 && opening.games_count >= 5) {
                insightList.push({
                    type: 'warning',
                    message: `You lose ${(opening.loss_rate * 100).toFixed(0)}% of games in ${opening.eco_code}; address this in REPAIR.`,
                });
            }

            if (opening.winrate >= 0.6 && opening.games_count >= 5) {
                insightList.push({
                    type: 'strength',
                    message: `${opening.eco_code} has strong results (${(opening.winrate * 100).toFixed(0)}% winrate); consider moving to CORE.`,
                });
            }

            if (opening.early_loss_count && opening.early_loss_count >= 3) {
                insightList.push({
                    type: 'warning',
                    message: `${opening.eco_code} appears frequently in short losses; practice this line.`,
                });
            }
        });

        return insightList.slice(0, 4);
    }, [topOpenings]);

    const renderTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-card p-3 border rounded-lg shadow-lg space-y-1">
                    <p className="font-medium text-sm">{data.fullName}</p>
                    <p className="text-xs text-gray-600">Total games: {data.total}</p>
                    <div className="space-y-0.5 pt-1">
                        <p className="text-xs" style={{ color: RESULT_COLORS.wins }}>
                            Wins: {data.wins} ({data.winsPercent.toFixed(1)}%)
                        </p>
                        <p className="text-xs" style={{ color: RESULT_COLORS.draws }}>
                            Draws: {data.draws} ({data.drawsPercent.toFixed(1)}%)
                        </p>
                        <p className="text-xs" style={{ color: RESULT_COLORS.losses }}>
                            Losses: {data.losses} ({data.lossesPercent.toFixed(1)}%)
                        </p>
                    </div>
                </div>
            );
        }
        return null;
    };

    if (chartData.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Opening Outcomes (Top 5)</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-gray-500 text-sm text-center py-8">
                        Not enough data to display opening outcomes. Import more games to see analysis.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart */}
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle className="text-lg">Opening Outcomes (Top 5)</CardTitle>
                    <p className="text-sm text-gray-500">
                        Your most relevant openings by performance and frequency
                    </p>
                </CardHeader>
                <CardContent className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={chartData}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" />
                            <YAxis
                                type="category"
                                dataKey="name"
                                width={75}
                                tick={{ fontSize: 12 }}
                            />
                            <Tooltip content={renderTooltip} />
                            <Bar dataKey="wins" stackId="a" fill={RESULT_COLORS.wins} name="Wins" />
                            <Bar dataKey="draws" stackId="a" fill={RESULT_COLORS.draws} name="Draws" />
                            <Bar dataKey="losses" stackId="a" fill={RESULT_COLORS.losses} name="Losses" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Insights Block */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Target className="w-5 h-5" />
                        Key Insights
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {insights.length > 0 ? (
                        <>
                            {insights.map((insight, index) => (
                                <Alert
                                    key={index}
                                    variant={insight.type === 'warning' ? 'destructive' : 'default'}
                                    className="py-2"
                                >
                                    <div className="flex items-start gap-2">
                                        {insight.type === 'warning' ? (
                                            <AlertCircle className="h-4 w-4 mt-0.5" />
                                        ) : (
                                            <TrendingUp className="h-4 w-4 mt-0.5" />
                                        )}
                                        <AlertDescription className="text-xs">
                                            {insight.message}
                                        </AlertDescription>
                                    </div>
                                </Alert>
                            ))}

                            {/* CTA Button */}
                            <div className="pt-2">
                                <Button
                                    onClick={onScrollToRepertoire}
                                    className="w-full"
                                    variant="default"
                                >
                                    See Recommended Repertoire
                                    <ArrowDown className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                        </>
                    ) : (
                        <p className="text-sm text-gray-500">
                            No significant insights available yet. Import more games for detailed analysis.
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

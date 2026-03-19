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
    Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import { GameLengthHistogramEntry } from '@/types/repertoire';
import { computeGameLengthBins } from '@/lib/overviewHelpers';

interface GameLengthChartProps {
    histogram: GameLengthHistogramEntry[];
    selectedColor: 'white' | 'black' | 'all';
}

const RESULT_COLORS = {
    wins: '#10b981',
    draws: '#6b7280',
    losses: '#ef4444',
};

export default function GameLengthChart({
    histogram,
    selectedColor,
}: GameLengthChartProps) {
    // Compute game length bins
    const chartData = useMemo(() => {
        return computeGameLengthBins(histogram, selectedColor);
    }, [histogram, selectedColor]);

    // Generate insight
    const insight = useMemo(() => {
        const earlyBucket = chartData.find(b => b.bucket === '0-20');
        const lateBuckets = chartData.filter(b => b.bucket === '41-60' || b.bucket === '60+');

        if (!earlyBucket && lateBuckets.length === 0) {
            return 'Not enough data to analyze game length patterns.';
        }

        // Check for early losses
        if (earlyBucket) {
            const earlyTotal = earlyBucket.wins + earlyBucket.draws + earlyBucket.losses;
            const earlyLossRate = earlyTotal > 0 ? earlyBucket.losses / earlyTotal : 0;

            if (earlyLossRate > 0.5 && earlyTotal >= 5) {
                return `Most losses occur before move 25 (${(earlyLossRate * 100).toFixed(0)}% loss rate). Focus on opening preparation.`;
            }
        }

        // Check for late game performance
        const lateTotal = lateBuckets.reduce((sum, b) => sum + b.wins + b.draws + b.losses, 0);
        const lateWins = lateBuckets.reduce((sum, b) => sum + b.wins, 0);
        const lateWinRate = lateTotal > 0 ? lateWins / lateTotal : 0;

        if (lateWinRate > 0.6 && lateTotal >= 5) {
            return `Longer games tend to favor you (${(lateWinRate * 100).toFixed(0)}% winrate in 40+ move games). Your endgame skills are strong.`;
        }

        // Check for consistency
        const allBuckets = chartData.filter(b => {
            const total = b.wins + b.draws + b.losses;
            return total >= 3;
        });

        if (allBuckets.length >= 3) {
            const winRates = allBuckets.map(b => {
                const total = b.wins + b.draws + b.losses;
                return total > 0 ? b.wins / total : 0;
            });
            const avgWinRate = winRates.reduce((sum, wr) => sum + wr, 0) / winRates.length;
            const variance = winRates.reduce((sum, wr) => sum + Math.pow(wr - avgWinRate, 2), 0) / winRates.length;

            if (variance < 0.05) {
                return `Your performance is consistent across all game lengths (${(avgWinRate * 100).toFixed(0)}% avg winrate).`;
            }
        }

        return 'Your game length distribution shows varied performance across different stages.';
    }, [chartData]);

    const renderTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            const total = data.wins + data.draws + data.losses;
            return (
                <div className="bg-card p-3 border rounded-lg shadow-lg space-y-1">
                    <p className="font-medium text-sm">{data.bucket} moves</p>
                    <p className="text-xs text-gray-600">Total games: {total}</p>
                    <div className="space-y-0.5 pt-1">
                        <p className="text-xs" style={{ color: RESULT_COLORS.wins }}>
                            Wins: {data.wins} ({total > 0 ? ((data.wins / total) * 100).toFixed(1) : 0}%)
                        </p>
                        <p className="text-xs" style={{ color: RESULT_COLORS.draws }}>
                            Draws: {data.draws} ({total > 0 ? ((data.draws / total) * 100).toFixed(1) : 0}%)
                        </p>
                        <p className="text-xs" style={{ color: RESULT_COLORS.losses }}>
                            Losses: {data.losses} ({total > 0 ? ((data.losses / total) * 100).toFixed(1) : 0}%)
                        </p>
                    </div>
                </div>
            );
        }
        return null;
    };

    const hasData = chartData.some(b => b.wins + b.draws + b.losses > 0);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Game Length Distribution
                </CardTitle>
                <p className="text-sm text-gray-500">
                    Performance across different game lengths
                </p>
            </CardHeader>
            <CardContent>
                {hasData ? (
                    <>
                        <div className="h-[280px] mb-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="bucket" label={{ value: 'Moves', position: 'insideBottom', offset: -5 }} />
                                    <YAxis allowDecimals={false} label={{ value: 'Games', angle: -90, position: 'insideLeft' }} />
                                    <Tooltip content={renderTooltip} />
                                    <Legend />
                                    <Bar dataKey="wins" name="Wins" stackId="a" fill={RESULT_COLORS.wins} />
                                    <Bar dataKey="draws" name="Draws" stackId="a" fill={RESULT_COLORS.draws} />
                                    <Bar dataKey="losses" name="Losses" stackId="a" fill={RESULT_COLORS.losses} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="border-t pt-3">
                            <p className="text-sm text-gray-700 italic">{insight}</p>
                        </div>
                    </>
                ) : (
                    <p className="text-gray-500 text-sm text-center py-8">
                        Game length data unavailable. Import more games to see distribution.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

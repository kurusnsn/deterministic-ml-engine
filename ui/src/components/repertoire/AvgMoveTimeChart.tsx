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
import { Clock } from 'lucide-react';
import { OpeningStats, TimeUsageEntry } from '@/types/repertoire';
import { computeAvgMoveTimeByResult } from '@/lib/overviewHelpers';

interface AvgMoveTimeChartProps {
    openings: OpeningStats[];
    timeUsage: TimeUsageEntry[];
    selectedColor: 'white' | 'black' | 'all';
}

const RESULT_COLORS = {
    Wins: '#10b981',
    Draws: '#6b7280',
    Losses: '#ef4444',
};

export default function AvgMoveTimeChart({
    openings,
    timeUsage,
    selectedColor,
}: AvgMoveTimeChartProps) {
    // Filter openings by color
    const filteredOpenings = useMemo(() => {
        if (selectedColor === 'all') return openings;
        return openings.filter(o => o.color === selectedColor);
    }, [openings, selectedColor]);

    // Compute average move time by result
    const chartData = useMemo(() => {
        return computeAvgMoveTimeByResult(timeUsage, filteredOpenings);
    }, [timeUsage, filteredOpenings]);

    // Generate insight
    const insight = useMemo(() => {
        const winsTime = chartData.find(d => d.result === 'Wins')?.avgTime || 0;
        const lossesTime = chartData.find(d => d.result === 'Losses')?.avgTime || 0;
        const timeDiff = lossesTime - winsTime;

        if (winsTime === 0 || lossesTime === 0) {
            return 'Not enough data to analyze move time patterns.';
        }

        if (timeDiff > 0.5) {
            return `You think significantly slower in losing games (+${timeDiff.toFixed(1)}s). This suggests unfamiliarity in the opening stage.`;
        } else if (timeDiff < -0.5) {
            return `You think faster in losing games (${Math.abs(timeDiff).toFixed(1)}s less). Your opening knowledge is solid—focus on middlegame transitions.`;
        } else {
            return `Your thinking time is consistent across results, suggesting good opening preparation.`;
        }
    }, [chartData]);

    const renderTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
        if (active && payload && payload.length) {
            const data = payload[0];
            return (
                <div className="bg-card p-3 border rounded-lg shadow-lg">
                    <p className="font-medium text-sm">{data.payload.result}</p>
                    <p className="text-xs text-gray-600">
                        Avg time: {data.value.toFixed(2)}s per move
                    </p>
                </div>
            );
        }
        return null;
    };

    const hasData = chartData.some(d => d.avgTime > 0);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Average Move Time by Result
                </CardTitle>
                <p className="text-sm text-gray-500">
                    Does slow thinking correlate with losses?
                </p>
            </CardHeader>
            <CardContent>
                {hasData ? (
                    <>
                        <div className="h-[280px] mb-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="result" />
                                    <YAxis
                                        label={{ value: 'Seconds per move', angle: -90, position: 'insideLeft' }}
                                        tickFormatter={(value) => `${value.toFixed(1)}s`}
                                    />
                                    <Tooltip content={renderTooltip} />
                                    <Bar dataKey="avgTime" name="Avg Move Time">
                                        {chartData.map((entry, index) => {
                                            const color = RESULT_COLORS[entry.result as keyof typeof RESULT_COLORS];
                                            return (
                                                <Cell key={`cell-${index}`} fill={color} />
                                            );
                                        })}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="border-t pt-3">
                            <p className="text-sm text-gray-700 italic">{insight}</p>
                        </div>
                    </>
                ) : (
                    <p className="text-gray-500 text-sm text-center py-8">
                        Time usage data unavailable. This data is collected from recent games.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

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
    Cell
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Layers, TrendingUp, AlertTriangle } from 'lucide-react';
import { OpeningStats } from '@/types/repertoire';
import { clusterOpenings, ClusterStats } from '@/lib/overviewHelpers';

interface WinRateByClusterChartProps {
    openings: OpeningStats[];
    selectedColor: 'white' | 'black' | 'all';
}

const RESULT_COLORS = {
    wins: '#22c55e',   // green-500
    draws: '#94a3b8',  // slate-400
    losses: '#ef4444', // red-500
};

export default function WinRateByClusterChart({
    openings,
    selectedColor,
}: WinRateByClusterChartProps) {
    const chartData = useMemo(() => {
        return clusterOpenings(openings, 5); // Minimum 5 games to show
    }, [openings]);

    const insight = useMemo(() => {
        if (chartData.length === 0) return null;

        // Find best performing cluster
        const bestCluster = [...chartData].sort((a, b) => b.avgScore - a.avgScore)[0];

        // Find worst performing cluster
        const worstCluster = [...chartData].sort((a, b) => a.avgScore - b.avgScore)[0];

        const insights = [];

        if (bestCluster && bestCluster.avgScore > 0.6) {
            insights.push({
                type: 'strength',
                text: `Cluster "${bestCluster.clusterName}" overperforms with ${(bestCluster.avgScore * 100).toFixed(0)}% expected score.`
            });
        }

        if (worstCluster && worstCluster.avgScore < 0.4) {
            insights.push({
                type: 'weakness',
                text: `Cluster "${worstCluster.clusterName}" underperforms (${(worstCluster.avgScore * 100).toFixed(0)}% score); consider review.`
            });
        }

        return insights;
    }, [chartData]);

    const renderTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload as ClusterStats;
            const total = data.games;
            return (
                <div className="bg-card p-3 border rounded-lg shadow-lg text-sm">
                    <p className="font-semibold mb-2">{data.clusterName}</p>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            <span>Wins: {data.wins} ({((data.wins / total) * 100).toFixed(1)}%)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-slate-400" />
                            <span>Draws: {data.draws} ({((data.draws / total) * 100).toFixed(1)}%)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            <span>Losses: {data.losses} ({((data.losses / total) * 100).toFixed(1)}%)</span>
                        </div>
                        <div className="pt-2 mt-2 border-t text-xs text-gray-500">
                            Total Games: {total}
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-500" />
                    Win Rate by Line Cluster
                </CardTitle>
            </CardHeader>
            <CardContent>
                {chartData.length > 0 ? (
                    <>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={chartData}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" hide />
                                    <YAxis
                                        dataKey="clusterName"
                                        type="category"
                                        width={120}
                                        tick={{ fontSize: 12 }}
                                    />
                                    <Tooltip content={renderTooltip} cursor={{ fill: 'transparent' }} />
                                    <Legend />
                                    <Bar dataKey="wins" name="Wins" stackId="a" fill={RESULT_COLORS.wins} />
                                    <Bar dataKey="draws" name="Draws" stackId="a" fill={RESULT_COLORS.draws} />
                                    <Bar dataKey="losses" name="Losses" stackId="a" fill={RESULT_COLORS.losses} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {insight && insight.length > 0 && (
                            <div className="mt-4 space-y-2">
                                {insight.map((item, idx) => (
                                    <div key={idx} className={`text-sm flex items-start gap-2 p-2 rounded ${item.type === 'strength' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                                        }`}>
                                        {item.type === 'strength' ? (
                                            <TrendingUp className="w-4 h-4 mt-0.5 shrink-0" />
                                        ) : (
                                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                        )}
                                        <span>{item.text}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="h-[300px] flex items-center justify-center text-gray-500 text-sm">
                        Not enough games to form clusters.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

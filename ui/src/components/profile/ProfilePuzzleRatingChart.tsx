"use client";

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { getSessionId } from '@/lib/session';
import Link from 'next/link';
import { LogoSpinner } from '@/components/ui/LogoSpinner';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL as string || '/api/gateway';

// Color palette for different providers
const PROVIDER_COLORS: Record<string, string> = {
    'internal': '#8b5cf6',
    'lichess': '#16a34a',
    'chesscom': '#2563eb',
};

type RatingPoint = {
    recorded_at: string;
    rating: number;
};

type RatingSeries = {
    provider: string;
    time_control: string;
    points: RatingPoint[];
};

type Props = {
    data?: { series: RatingSeries[] }; // Pre-fetched data from aggregated endpoint
    defaultProvider?: 'all' | 'internal' | 'lichess' | 'chesscom';
};

export default function ProfilePuzzleRatingChart({
    data: preloadedData,
    defaultProvider = 'all',
}: Props) {
    const [series, setSeries] = useState<RatingSeries[]>(preloadedData?.series || []);
    const [loading, setLoading] = useState(!preloadedData?.series);
    const [error, setError] = useState<string | null>(null);
    const [provider, setProvider] = useState(defaultProvider);
    const [dateRange, setDateRange] = useState<'30d' | '90d' | '1y' | 'all'>('90d');

    // Sync from preloaded data when it arrives
    useEffect(() => {
        if (preloadedData?.series) {
            setSeries(preloadedData.series);
            setLoading(false);
        }
    }, [preloadedData]);

    // Only fetch when user changes filters (NOT on mount)
    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const headers: Record<string, string> = {};
            const sid = getSessionId();
            if (sid) headers['x-session-id'] = sid;

            let fromDate: string | undefined;
            if (dateRange !== 'all') {
                const now = new Date();
                const days = dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 365;
                const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
                fromDate = from.toISOString();
            }

            const params = new URLSearchParams();
            if (provider !== 'all') params.set('provider', provider);
            if (fromDate) params.set('from_date', fromDate);

            const resp = await fetch(
                `${GATEWAY_URL}/api/me/ratings/puzzle?${params.toString()}`,
                { headers }
            );

            if (!resp.ok) throw new Error(await resp.text());

            const data = await resp.json();
            setSeries(data.series || []);
        } catch (e: any) {
            setError(e?.message || 'Failed to load puzzle rating data');
        } finally {
            setLoading(false);
        }
    }, [provider, dateRange]);

    // Fetch on mount if nothing was preloaded, and whenever filters change
    useEffect(() => {
        const filtersChanged = provider !== defaultProvider || dateRange !== '90d';
        if (!preloadedData?.series || filtersChanged) {
            fetchData();
        }
    }, [preloadedData?.series, provider, dateRange, defaultProvider, fetchData]);

    // Transform for Recharts
    const chartData = useMemo(() => {
        const dateMap = new Map<string, Record<string, number>>();

        for (const s of series) {
            for (const point of s.points) {
                const date = point.recorded_at.split('T')[0];
                if (!dateMap.has(date)) {
                    dateMap.set(date, { date: new Date(date).getTime() });
                }
                dateMap.get(date)![s.provider] = point.rating;
            }
        }

        return Array.from(dateMap.values()).sort((a, b) => (a.date as number) - (b.date as number));
    }, [series]);

    // Get unique providers
    const providers = useMemo(() => {
        return series.map(s => s.provider);
    }, [series]);

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    };

    const getProviderLabel = (prov: string) => {
        if (prov === 'internal') return 'SprintChess';
        if (prov === 'lichess') return 'Lichess';
        if (prov === 'chesscom') return 'Chess.com';
        return prov;
    };

    if (loading) {
        return (
            <div className="h-64 flex items-center justify-center">
                <LogoSpinner size="md" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-64 flex items-center justify-center text-red-500 text-sm">
                {error}
            </div>
        );
    }

    if (series.length === 0 || chartData.length === 0) {
        return (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-sm">
                <p className="mb-2">No puzzle rating data yet.</p>
                <p className="text-xs">
                    <Link href="/puzzles" className="text-foreground underline hover:text-muted-foreground">
                        Start solving puzzles
                    </Link>
                    {' '}to track your improvement.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
                {providers.length > 1 && (
                    <Select value={provider} onValueChange={(v) => setProvider(v as any)}>
                        <SelectTrigger className="w-32">
                            <SelectValue placeholder="Source" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="internal">SprintChess</SelectItem>
                            <SelectItem value="lichess">Lichess</SelectItem>
                            <SelectItem value="chesscom">Chess.com</SelectItem>
                        </SelectContent>
                    </Select>
                )}

                <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
                    <SelectTrigger className="w-28">
                        <SelectValue placeholder="Range" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="30d">30 Days</SelectItem>
                        <SelectItem value="90d">90 Days</SelectItem>
                        <SelectItem value="1y">1 Year</SelectItem>
                        <SelectItem value="all">All Time</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Chart */}
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <XAxis
                            dataKey="date"
                            tickFormatter={formatDate}
                            tick={{ fontSize: 11, fill: '#9ca3af' }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            domain={['dataMin - 50', 'dataMax + 50']}
                            tick={{ fontSize: 11, fill: '#9ca3af' }}
                            axisLine={false}
                            tickLine={false}
                            width={45}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(0,0,0,0.9)',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 12px',
                            }}
                            labelFormatter={(value) => new Date(value).toLocaleDateString()}
                            formatter={(value: number, name: string) => [value, getProviderLabel(name)]}
                        />
                        {providers.length > 1 && (
                            <Legend
                                formatter={(value) => getProviderLabel(value)}
                                wrapperStyle={{ fontSize: '12px' }}
                            />
                        )}
                        {providers.map((prov) => (
                            <Line
                                key={prov}
                                type="monotone"
                                dataKey={prov}
                                stroke={PROVIDER_COLORS[prov] || '#8b5cf6'}
                                strokeWidth={2}
                                dot={false}
                                connectNulls
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

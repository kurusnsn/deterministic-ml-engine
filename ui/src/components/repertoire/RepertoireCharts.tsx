"use client";

import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RepertoireReport, OpeningStats } from '@/types/repertoire';

interface RepertoireChartsProps {
  report: RepertoireReport;
  selectedColor: 'white' | 'black' | 'all';
  timeControlFilter?: string;
}

const RESULT_COLORS: Record<'win' | 'loss' | 'draw', string> = {
  win: '#10b981',
  loss: '#ef4444',
  draw: '#3b82f6',
};

const formatMinutes = (seconds?: number | null) => {
  if (!seconds && seconds !== 0) return '—';
  const mins = seconds / 60;
  return `${mins.toFixed(1)} min`;
};

const getAllOpenings = (report: RepertoireReport, selectedColor: 'white' | 'black' | 'all'): OpeningStats[] => {
  const repertoires = selectedColor === 'all'
    ? { ...report.white_repertoire, ...report.black_repertoire }
    : selectedColor === 'white'
      ? report.white_repertoire
      : report.black_repertoire;

  return Object.values(repertoires).flatMap(group => group.openings || []);
};

const aggregateFromEntries = (entries: any[]) => {
  const resultCounts = { win: 0, loss: 0, draw: 0 };
  const openingMap: Record<string, { wins: number; losses: number; draws: number }> = {};
  const histogramBuckets: Record<string, { wins: number; losses: number; draws: number }> = {};

  const bucketEdges = [
    { upper: 20, label: '0-20' },
    { upper: 40, label: '21-40' },
    { upper: 60, label: '41-60' },
    { upper: 80, label: '61-80' },
  ];

  const getBucket = (moves?: number | null) => {
    if (!moves) return 'Unknown';
    for (const bucket of bucketEdges) {
      if (moves <= bucket.upper) return bucket.label;
    }
    return '81+';
  };

  for (const entry of entries) {
    const result = entry.result as 'win' | 'loss' | 'draw';
    resultCounts[result] += 1;

    const openingName = entry.opening || 'Unknown';
    if (!openingMap[openingName]) {
      openingMap[openingName] = { wins: 0, losses: 0, draws: 0 };
    }
    openingMap[openingName][result] += 1;

    const bucket = getBucket(entry.moves);
    if (!histogramBuckets[bucket]) {
      histogramBuckets[bucket] = { wins: 0, losses: 0, draws: 0 };
    }
    histogramBuckets[bucket][result] += 1;
  }

  return { resultCounts, openingMap, histogramBuckets };
};

export default function RepertoireCharts({ report, selectedColor, timeControlFilter = 'all' }: RepertoireChartsProps) {
  const allOpenings = useMemo(() => getAllOpenings(report, selectedColor), [report, selectedColor]);
  const filteredTimeUsageEntries = useMemo(() => {
    const entries = report.time_usage || [];
    if (!entries.length) return [];
    if (!timeControlFilter || timeControlFilter === 'all') return entries;
    return entries.filter(entry => entry.time_control === timeControlFilter);
  }, [report.time_usage, timeControlFilter]);

  const usingFilteredData = timeControlFilter !== 'all';

  const { resultCounts, openingMap, histogramBuckets } = useMemo(() => {
    if (filteredTimeUsageEntries.length) {
      return aggregateFromEntries(filteredTimeUsageEntries);
    }

    if (usingFilteredData) {
      return {
        resultCounts: { win: 0, loss: 0, draw: 0 },
        openingMap: {},
        histogramBuckets: {},
      };
    }

    const counts = allOpenings.reduce(
      (acc, opening) => {
        acc.win += opening.wins;
        acc.loss += opening.losses;
        acc.draw += opening.draws;
        return acc;
      },
      { win: 0, loss: 0, draw: 0 }
    );
    const openingMap: Record<string, { wins: number; losses: number; draws: number }> = {};
    allOpenings.forEach((opening) => {
      const key = `${opening.eco_code} ${opening.opening_name}`;
      openingMap[key] = {
        wins: opening.wins,
        losses: opening.losses,
        draws: opening.draws,
      };
    });
    const histogram: Record<string, { wins: number; losses: number; draws: number }> = {};
    (report.game_length_histogram || []).forEach((bucket) => {
      histogram[bucket.bucket] = {
        wins: bucket.wins,
        losses: bucket.losses,
        draws: bucket.draws,
      };
    });
    return { resultCounts: counts, openingMap, histogramBuckets: histogram };
  }, [filteredTimeUsageEntries, usingFilteredData, allOpenings, report.game_length_histogram]);

  const resultsData = useMemo(() => {
    return [
      { name: 'Wins', value: resultCounts.win || 0, color: RESULT_COLORS.win },
      { name: 'Losses', value: resultCounts.loss || 0, color: RESULT_COLORS.loss },
      { name: 'Draws', value: resultCounts.draw || 0, color: RESULT_COLORS.draw },
    ].filter(segment => segment.value > 0);
  }, [resultCounts]);

  const openingsData = useMemo(() => {
    const entries = Object.entries(openingMap)
      .map(([name, results]) => ({
        name,
        wins: results.wins,
        losses: results.losses,
        draws: results.draws,
        total: results.wins + results.losses + results.draws,
      }))
      .filter(item => item.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    return entries;
  }, [openingMap]);

  const timeUsageData = useMemo(() => {
    const source = usingFilteredData ? filteredTimeUsageEntries : (report.time_usage || []);
    return source
      .filter(entry => entry.avg_move_time)
      .slice(0, 40)
      .map((entry, index) => ({
        key: entry.game_id || String(index),
        label: entry.opening,
        avgMoveTime: entry.avg_move_time,
        result: entry.result,
        lostOnTime: entry.lost_on_time,
      }));
  }, [filteredTimeUsageEntries, report.time_usage]);

  const gameLengthData = useMemo(() => {
    const entries = Object.entries(histogramBuckets).map(([bucket, counts]) => ({
      bucket,
      wins: counts.wins,
      losses: counts.losses,
      draws: counts.draws,
    }));

    return entries.sort((a, b) => a.bucket.localeCompare(b.bucket));
  }, [histogramBuckets]);

  const renderResultsTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0];
      return (
        <div className="bg-card p-3 border rounded-lg shadow-lg">
          <p className="font-medium" style={{ color: item.payload.color }}>{item.name}</p>
          <p className="text-sm text-gray-600">Games: {item.value}</p>
        </div>
      );
    }
    return null;
  };

  const renderBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card p-3 border rounded-lg shadow-lg space-y-1">
          <p className="font-medium">{label}</p>
          {payload.map((entry: any) => (
            <p key={entry.dataKey} style={{ color: entry.fill }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderTimeTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const entry = payload[0].payload;
      return (
        <div className="bg-card p-3 border rounded-lg shadow-lg space-y-1">
          <p className="font-medium">{entry.label}</p>
          <p className="text-sm text-gray-600">Avg. move time: {formatMinutes(entry.avgMoveTime)}</p>
          <p className="text-sm">Result: {entry.result.toUpperCase()}</p>
          {entry.lostOnTime && <p className="text-sm text-red-500">Lost on time</p>}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Results Overview</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            {resultsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={resultsData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} label>
                    {resultsData.map((entry, index) => (
                      <Cell key={`result-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={renderResultsTooltip} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-sm text-center">Not enough games to show results breakdown.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Opening Outcomes (Top 8)</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            {openingsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={openingsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={100} />
                  <YAxis allowDecimals={false} />
                  <Tooltip content={renderBarTooltip} />
                  <Legend />
                  <Bar dataKey="wins" name="Wins" fill={RESULT_COLORS.win} />
                  <Bar dataKey="losses" name="Losses" fill={RESULT_COLORS.loss} />
                  <Bar dataKey="draws" name="Draws" fill={RESULT_COLORS.draw} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-sm text-center">Import more games to analyse opening performance.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Average Move Time per Game</CardTitle>
            <p className="text-sm text-gray-500">Bars in red indicate games lost on time.</p>
          </CardHeader>
          <CardContent className="h-[320px]">
            {timeUsageData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeUsageData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={100} />
                  <YAxis tickFormatter={(value) => `${(value / 60).toFixed(1)}m`} />
                  <Tooltip content={renderTimeTooltip} />
                  <Bar dataKey="avgMoveTime" name="Avg move time (s)">
                    {timeUsageData.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={entry.lostOnTime ? '#f87171' : '#6366f1'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-sm text-center">Time usage data unavailable for these games.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Game Length Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            {gameLengthData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gameLengthData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" />
                  <YAxis allowDecimals={false} />
                  <Tooltip content={renderBarTooltip} />
                  <Legend />
                  <Bar dataKey="wins" name="Wins" stackId="a" fill={RESULT_COLORS.win} />
                  <Bar dataKey="draws" name="Draws" stackId="a" fill={RESULT_COLORS.draw} />
                  <Bar dataKey="losses" name="Losses" stackId="a" fill={RESULT_COLORS.loss} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-sm text-center">Game length information is not available.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

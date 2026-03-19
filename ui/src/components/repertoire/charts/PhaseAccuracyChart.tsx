"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

interface PhaseData {
  phase: string;
  avgCpLoss: number;
  accuracy: number;
  blunders: number;
}

interface PhaseAccuracyChartProps {
  data: PhaseData[];
}

export default function PhaseAccuracyChart({ data }: PhaseAccuracyChartProps) {
  const weakest = useMemo(() => {
    if (!data || data.length === 0) return "—";
    const sorted = [...data].sort((a, b) => b.avgCpLoss - a.avgCpLoss);
    return sorted[0]?.phase || "—";
  }, [data]);

  const accuracyRange = useMemo(() => {
    if (!data || data.length === 0) return { min: 0, max: 0 };
    const mins = Math.min(...data.map((d) => d.accuracy));
    const maxs = Math.max(...data.map((d) => d.accuracy));
    return { min: mins, max: maxs };
  }, [data]);

  return (
    <Card>
      <CardHeader className="flex items-start justify-between">
        <CardTitle>Accuracy by Game Phase</CardTitle>
        <div className="text-sm text-gray-600 text-right">
          <div>Weakest phase: {weakest}</div>
          <div>
            Accuracy range: {accuracyRange.min.toFixed(1)}% - {accuracyRange.max.toFixed(1)}%
          </div>
        </div>
      </CardHeader>
      <CardContent style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="phase" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="avgCpLoss" name="Avg CP Loss" fill="#f97316" />
            <Bar dataKey="accuracy" name="Accuracy %" fill="#22c55e" />
            <Bar dataKey="blunders" name="Blunders" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

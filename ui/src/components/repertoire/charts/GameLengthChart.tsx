"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { GameLengthHistogramEntry } from "@/types/repertoire";

interface GameLengthChartProps {
  data: GameLengthHistogramEntry[];
}

export default function GameLengthChart({ data }: GameLengthChartProps) {
  const sorted = [...data].sort((a, b) => a.bucket.localeCompare(b.bucket));
  return (
    <Card>
      <CardHeader className="flex items-start justify-between">
        <CardTitle>Game Length Distribution</CardTitle>
        <div className="text-sm text-gray-600 text-right">
          <div>Longer games often mean stable openings.</div>
          <div>Short games can signal early weaknesses.</div>
        </div>
      </CardHeader>
      <CardContent style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sorted}>
            <XAxis dataKey="bucket" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="wins" stackId="a" fill="#22c55e" />
            <Bar dataKey="losses" stackId="a" fill="#ef4444" />
            <Bar dataKey="draws" stackId="a" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

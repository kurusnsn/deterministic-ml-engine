"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { TacticalPatternChartEntry } from "@/types/repertoire";

interface TacticalMotifChartProps {
  data: TacticalPatternChartEntry[];
}

export default function TacticalMotifChart({ data }: TacticalMotifChartProps) {
  const sorted = [...data].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, 8);
  return (
    <Card>
      <CardHeader className="flex items-start justify-between">
        <CardTitle>Tactical Motif Breakdown</CardTitle>
        <div className="text-sm text-gray-600 text-right">
          {top[0] ? `Most frequent: ${top[0].pattern}` : "No motifs recorded"}
        </div>
      </CardHeader>
      <CardContent style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={top} layout="vertical" margin={{ left: 20, right: 20 }}>
            <XAxis type="number" />
            <YAxis dataKey="pattern" type="category" width={140} />
            <Tooltip />
            <Bar dataKey="count" fill="#6366f1" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

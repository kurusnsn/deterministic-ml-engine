"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip } from "recharts";
import { TimeUsageEntry } from "@/types/repertoire";

interface MoveTimeChartProps {
  data: TimeUsageEntry[];
}

export default function MoveTimeChart({ data }: MoveTimeChartProps) {
  const points = data.slice(0, 80).map((entry, idx) => ({
    x: entry.avg_move_time || 0,
    y: entry.moves || 0,
    result: entry.result,
    label: entry.opening,
  }));

  return (
    <Card>
      <CardHeader className="flex items-start justify-between">
        <CardTitle>Move Time vs Result</CardTitle>
        <div className="text-sm text-gray-600 text-right">
          <div>Slow moves do not always prevent mistakes.</div>
          <div>Watch critical moments more than clock time.</div>
        </div>
      </CardHeader>
      <CardContent style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart>
            <XAxis dataKey="x" name="Avg move time (s)" />
            <YAxis dataKey="y" name="Moves" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={points} fill="#0ea5e9" />
          </ScatterChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

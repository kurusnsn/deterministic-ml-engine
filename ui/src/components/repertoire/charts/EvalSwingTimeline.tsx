"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Scatter, ScatterChart, Legend } from "recharts";
import { EvalSwingChartEntry, MoveAnalysis } from "@/types/repertoire";

interface EvalSwingTimelineProps {
  data: EvalSwingChartEntry[];
  moves: MoveAnalysis[];
}

export default function EvalSwingTimeline({ data, moves }: EvalSwingTimelineProps) {
  const points = moves.map((m) => ({
    ply: m.ply,
    type: m.mistake_type || "good",
    eval: m.eval?.cp ? m.eval.cp / 100 : 0,
  }));
  const markers = points.filter((p) => p.type && p.type !== "good");

  return (
    <Card>
      <CardHeader className="flex items-start justify-between">
        <CardTitle>CP Swing Timeline</CardTitle>
        <div className="text-sm text-gray-600 text-right">
          <div>Look for drops around move clusters.</div>
          <div>Markers show inaccuracies/mistakes/blunders.</div>
        </div>
      </CardHeader>
      <CardContent style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="ply" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="eval" stroke="#0ea5e9" dot={false} name="Eval (pawns)" />
            <Scatter data={markers} dataKey="ply" name="errors" fill="#ef4444" shape="circle" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

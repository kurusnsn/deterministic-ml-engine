"use client";

import {
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
import { TacticalPatternChartEntry } from '@/types/repertoire';

interface TacticalPatternChartProps {
  data: TacticalPatternChartEntry[];
}

export default function TacticalPatternChart({ data }: TacticalPatternChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tactical Patterns</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-sm text-center">No tactical pattern data available.</p>
        </CardContent>
      </Card>
    );
  }

  // Show top 10 patterns
  const displayData = data.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Tactical Patterns</CardTitle>
        <p className="text-sm text-gray-500">Most common tactical patterns in your games</p>
      </CardHeader>
      <CardContent className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={displayData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis dataKey="pattern" type="category" width={70} tick={{ fontSize: 12 }} />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-card p-3 border rounded-lg shadow-lg">
                      <p className="font-medium">{payload[0].payload.pattern}</p>
                      <p className="text-sm text-gray-600">Count: {payload[0].value}</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}







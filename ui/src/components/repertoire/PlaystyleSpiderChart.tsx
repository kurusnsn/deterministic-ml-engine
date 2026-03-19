"use client";

import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
} from "recharts";

interface PlaystyleSpiderChartProps {
    axes: string[];
    values: number[]; // 0-1 normalized
}

export default function PlaystyleSpiderChart({ axes, values }: PlaystyleSpiderChartProps) {
    const data = axes.map((label, idx) => ({
        label,
        value: Math.round((values[idx] ?? 0) * 100),
    }));

    return (
        <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={data} outerRadius="75%">
                <PolarGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <PolarAngleAxis
                    dataKey="label"
                    tick={{
                        fontSize: 12,
                        fill: "hsl(var(--foreground))",
                    }}
                />
                <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => `${v}%`}
                />
                <Radar
                    name="You"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.3}
                    strokeWidth={2}
                />
            </RadarChart>
        </ResponsiveContainer>
    );
}

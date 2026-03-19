"use client";

import { useMemo } from "react";
import {
    ResponsiveContainer,
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    ReferenceLine,
    Scatter,
    CartesianGrid,
    ZAxis,
    Area,
} from "recharts";
import ChartWrapper from "./ChartWrapper";

interface AggregatedEvalEntry {
    ply: number;
    avg_eval: number;
    avg_cp_loss: number;
    blunders: number;
    mistakes: number;
    inaccuracies: number;
    sample_size: number;
}

interface EvalSwingAggregatedProps {
    data: AggregatedEvalEntry[];
    selectedColor?: "white" | "black" | "all";
}

export default function EvalSwingAggregated({ data, selectedColor = "all" }: EvalSwingAggregatedProps) {
    const filteredData = useMemo(() => {
        if (!data) return [];
        if (selectedColor === "all") return data;
        return data.filter((d) => {
            const isWhitePly = d.ply % 2 === 1;
            return selectedColor === "white" ? isWhitePly : !isWhitePly;
        });
    }, [data, selectedColor]);

    // Enrich data for chart
    const chartData = useMemo(() => {
        return filteredData.map(d => ({
            ...d,
            // For blunder markers, we want them on the line.
            // If blunders > 0, set value to avg_eval, else null/undefined
            blunderMarker: d.blunders > 0 ? d.avg_eval : null,
            // Blunder intensity (size of dot) - scale logarithmic or linear?
            // Let's say 1 blunder = size 50, 10 blunders = size 200?
            // z-axis in Recharts Scatter takes a number range.
            blunderSize: d.blunders
        }));
    }, [filteredData]);

    if (!data || data.length === 0) {
        return (
            <ChartWrapper
                title="Eval Swing Timeline (Aggregated)"
                insight="No data available"
                showColorToggle={false}
            >
                {() => (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        No aggregated data available
                    </div>
                )}
            </ChartWrapper>
        );
    }

    const maxPly = Math.max(...data.map((d) => d.ply));

    return (
        <ChartWrapper
            title="Eval Swing Timeline (Aggregated)"
            insight="Shows average evaluation trends across all games. Dots indicate blunder intensity."
            showColorToggle={false}
        >
            {() => (
                <div className="h-full flex flex-col">
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ left: 0, right: 10, top: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                                <XAxis
                                    dataKey="ply"
                                    type="number"
                                    domain={[0, 'auto']}
                                    tickCount={Math.min(20, maxPly)}
                                    tick={{ fontSize: 11 }}
                                    label={{ value: "Ply", position: "insideBottomRight", offset: -5, fontSize: 10 }}
                                />

                                {/* Primary Axis: Eval (Pawns) */}
                                <YAxis
                                    yAxisId="eval"
                                    label={{ value: "Avg Eval", angle: -90, position: "insideLeft", fontSize: 10 }}
                                    tick={{ fontSize: 11 }}
                                    domain={['auto', 'auto']}
                                    width={40}
                                />

                                {/* Secondary Hidden Axis for CP loss if we want to add bars later, 
                                    but for now let's keep it simple as requested: Line + Scatter 
                                */}

                                <Tooltip
                                    content={({ active, payload, label }) => {
                                        if (active && payload && payload.length) {
                                            // Payload ordering depends on chart definition order
                                            // Find the main payload entry
                                            const d = payload[0].payload as any;
                                            return (
                                                <div className="bg-background/95 backdrop-blur-sm border rounded p-3 shadow-lg text-xs space-y-1">
                                                    <p className="font-semibold text-sm border-b pb-1 mb-1">Ply {d.ply} (Move {Math.ceil(d.ply / 2)})</p>
                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                                        <span className="text-muted-foreground">Avg Eval:</span>
                                                        <span className={`font-mono font-medium ${d.avg_eval > 0 ? "text-green-500" : d.avg_eval < 0 ? "text-red-500" : ""}`}>
                                                            {d.avg_eval.toFixed(2)}
                                                        </span>

                                                        <span className="text-muted-foreground">CP Loss:</span>
                                                        <span className="font-mono">{d.avg_cp_loss.toFixed(2)}</span>

                                                        {d.blunders > 0 && (
                                                            <>
                                                                <span className="text-red-500 font-medium">Blunders:</span>
                                                                <span className="text-red-500 font-bold">{d.blunders}</span>
                                                            </>
                                                        )}

                                                        <span className="text-muted-foreground">Games:</span>
                                                        <span>{d.sample_size}</span>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Legend wrapperStyle={{ fontSize: 11, paddingTop: '10px' }} />
                                <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" yAxisId="eval" />

                                {/* Optional: Area under curve for subtle swing visualization? 
                                    Maybe too noisy. Let's stick to Line. */}

                                <Line
                                    yAxisId="eval"
                                    type="monotone"
                                    dataKey="avg_eval"
                                    name="Avg Eval"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                    connectNulls
                                />

                                {/* Blunders: Red Dots with Size */}
                                <ZAxis type="number" dataKey="blunderSize" range={[50, 400]} name="Blunders" />
                                <Scatter
                                    yAxisId="eval"
                                    dataKey="blunderMarker"
                                    name="Blunders"
                                    fill="#ef4444"
                                    shape="circle"
                                    fillOpacity={0.8}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </ChartWrapper>
    );
}

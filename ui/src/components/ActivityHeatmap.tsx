"use client";

import React, { useMemo } from "react";
import { LogoSpinner } from "@/components/ui/LogoSpinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ActivityPoint = { date: string | Date; count: number };

interface ActivityHeatmapProps {
  data?: ActivityPoint[]; // Activity data from API
  weeks?: number; // Number of weeks to render (default: 52)
  className?: string;
  loading?: boolean; // Loading state
  error?: string | null; // Error message
}

function startOfWeek(d: Date) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0=Sun
  date.setUTCDate(date.getUTCDate() - day);
  return date;
}

function fmtKey(date: Date) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function colorFor(count: number) {
  if (!count) return "bg-gray-200 dark:bg-gray-800";
  if (count <= 2) return "bg-emerald-200 dark:bg-emerald-900";
  if (count <= 4) return "bg-emerald-300 dark:bg-emerald-800";
  if (count <= 7) return "bg-emerald-500 dark:bg-emerald-700";
  return "bg-emerald-700 dark:bg-emerald-600";
}

function useWeeks(data: ActivityPoint[] | undefined, weeks: number) {
  const map = new Map<string, number>();
  if (data && data.length) {
    for (const p of data) {
      const d = p.date instanceof Date ? p.date : new Date(p.date);
      map.set(fmtKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))), (map.get(fmtKey(d)) || 0) + (p.count || 0));
    }
  }

  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = startOfWeek(new Date(end));
  start.setUTCDate(start.getUTCDate() - (weeks - 1) * 7);

  const columns: { date: Date; count: number }[][] = [];
  const monthLabels: { index: number; label: string }[] = [];
  let lastMonth = -1;

  for (let w = 0; w < weeks; w++) {
    const col: { date: Date; count: number }[] = [];
    const colStart = new Date(start);
    colStart.setUTCDate(start.getUTCDate() + w * 7);
    const month = colStart.getUTCMonth();
    if (month !== lastMonth) {
      const label = colStart.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
      monthLabels.push({ index: w, label });
      lastMonth = month;
    }
    for (let i = 0; i < 7; i++) {
      const d = new Date(colStart);
      d.setUTCDate(colStart.getUTCDate() + i);
      const key = fmtKey(d);
      const count = map.get(key) || 0;
      col.push({ date: d, count });
    }
    columns.push(col);
  }

  return { columns, monthLabels };
}

export default function ActivityHeatmap({ data, weeks = 52, className, loading, error }: ActivityHeatmapProps) {
  console.log('[ACTIVITY HEATMAP COMPONENT] Rendering with props:', {
    dataLength: data?.length || 0,
    weeks,
    loading,
    error
  });

  const points = useMemo(() => data || [], [data]);
  const { columns, monthLabels } = useWeeks(points, weeks);

  if (loading) {
    console.log('[ACTIVITY HEATMAP COMPONENT] Showing loading state');
    return (
      <div className={"w-full " + (className || "")}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Activity</h2>
          <div className="text-xs text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
        <div className="h-32 flex items-center justify-center">
          <LogoSpinner size="md" />
        </div>
      </div>
    );
  }

  if (error) {
    console.log('[ACTIVITY HEATMAP COMPONENT] Showing error state:', error);
    return (
      <div className={"w-full " + (className || "")}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Activity</h2>
        </div>
        <div className="h-32 flex items-center justify-center text-sm text-red-600">
          {error}
        </div>
      </div>
    );
  }

  console.log('[ACTIVITY HEATMAP COMPONENT] ✅ Rendering heatmap grid with', columns.length, 'columns');

  return (
    <TooltipProvider>
      <div className={"w-full " + (className || "")}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Activity</h2>
          <div className="text-xs text-gray-500 dark:text-gray-400">Last {weeks} weeks</div>
        </div>
        <div className="overflow-x-auto">
          <div className="flex items-start gap-2 min-w-fit">
            {/* Y-axis labels */}
            <div className="text-[10px] leading-4 text-gray-500 dark:text-gray-400 mt-6 select-none flex-shrink-0">
              <div className="h-3" />
              <div className="h-3 mt-2">Mon</div>
              <div className="h-3 mt-2">Wed</div>
              <div className="h-3 mt-2">Fri</div>
            </div>
            <div>
              {/* Month labels */}
              <div className="flex text-[10px] text-gray-500 dark:text-gray-400 select-none mb-1">
                {Array.from({ length: columns.length }).map((_, idx) => {
                  const label = monthLabels.find((m) => m.index === idx)?.label;
                  return (
                    <div key={idx} className="flex items-center justify-center" style={{ width: 12 }}>
                      {label || ""}
                    </div>
                  );
                })}
              </div>
              {/* Grid */}
              <div className="flex gap-[2px]">
                {columns.map((col, ci) => (
                  <div key={ci} className="flex flex-col gap-[2px]">
                    {col.map((cell, ri) => (
                      <Tooltip key={ri}>
                        <TooltipTrigger asChild>
                          <div
                            className={`h-3 w-3 rounded-sm ${colorFor(cell.count)} hover:opacity-80 transition-opacity`}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            <span className="font-semibold">{cell.count || 0} activities</span> on{" "}
                            {cell.date.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              timeZone: "UTC",
                            })}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
          <span>Less</span>
          <div className="h-3 w-3 rounded-sm bg-gray-200 dark:bg-gray-800" />
          <div className="h-3 w-3 rounded-sm bg-emerald-200 dark:bg-emerald-900" />
          <div className="h-3 w-3 rounded-sm bg-emerald-300 dark:bg-emerald-800" />
          <div className="h-3 w-3 rounded-sm bg-emerald-500 dark:bg-emerald-700" />
          <div className="h-3 w-3 rounded-sm bg-emerald-700 dark:bg-emerald-600" />
          <span>More</span>
        </div>
      </div>
    </TooltipProvider>
  );
}

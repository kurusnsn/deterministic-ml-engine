"use client";

import { OpeningStats } from "@/types/repertoire";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Circle } from "lucide-react";

interface OpeningRowProps {
  opening: OpeningStats;
  compact?: boolean;
  onClick?: () => void;
  showColor?: boolean;
}

export default function OpeningRow({
  opening,
  compact = false,
  onClick,
  showColor = true,
}: OpeningRowProps) {
  const winratePct = (opening.winrate * 100).toFixed(1);
  const isGoodWinrate = opening.winrate >= 0.55;
  const isPoorWinrate = opening.winrate < 0.45;

  if (compact) {
    if (onClick) {
      return (
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between rounded-md border bg-white/80 dark:bg-white/5 px-3 py-2 transition-colors text-left",
            "cursor-pointer hover:bg-muted/50"
          )}
          onClick={onClick}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            {showColor && (
              <Circle
                className={cn(
                  "w-2.5 h-2.5 shrink-0",
                  opening.color === "white" ? "fill-white stroke-gray-400" : "fill-gray-800 stroke-gray-800"
                )}
              />
            )}
            <span className="font-medium text-sm shrink-0">{opening.eco_code}</span>
            <span className="text-xs text-muted-foreground truncate">
              {opening.opening_name}
            </span>
          </div>
          <div className="text-right shrink-0 ml-2">
            <span className={cn(
              "text-sm font-semibold",
              isGoodWinrate && "text-emerald-600",
              isPoorWinrate && "text-red-600"
            )}>
              {winratePct}%
            </span>
            <span className="text-xs text-muted-foreground ml-1">
              ({opening.games_count})
            </span>
          </div>
        </button>
      );
    }

    return (
      <div
        className={cn(
          "flex items-center justify-between rounded-md border bg-white/80 dark:bg-white/5 px-3 py-2 transition-colors"
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          {showColor && (
            <Circle
              className={cn(
                "w-2.5 h-2.5 shrink-0",
                opening.color === "white" ? "fill-white stroke-gray-400" : "fill-gray-800 stroke-gray-800"
              )}
            />
          )}
          <span className="font-medium text-sm shrink-0">{opening.eco_code}</span>
          <span className="text-xs text-muted-foreground truncate">
            {opening.opening_name}
          </span>
        </div>
        <div className="text-right shrink-0 ml-2">
          <span className={cn(
            "text-sm font-semibold",
            isGoodWinrate && "text-emerald-600",
            isPoorWinrate && "text-red-600"
          )}>
            {winratePct}%
          </span>
          <span className="text-xs text-muted-foreground ml-1">
            ({opening.games_count})
          </span>
        </div>
      </div>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-between rounded-lg border bg-card p-3 transition-all overflow-hidden text-left",
          "cursor-pointer hover:shadow-md hover:border-primary/30"
        )}
        onClick={onClick}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
          {showColor && (
            <div
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border",
                opening.color === "white"
                  ? "bg-white border-gray-200"
                  : "bg-gray-800 border-gray-700"
              )}
            >
              <span
                className={cn(
                  "text-xs font-bold",
                  opening.color === "white" ? "text-gray-800" : "text-white"
                )}
              >
                {opening.color === "white" ? "W" : "B"}
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-sm shrink-0">{opening.eco_code}</span>
              <span className="text-sm text-foreground truncate">
                {opening.opening_name}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {opening.games_count} {opening.games_count === 1 ? 'game' : 'games'}
              {' '}&bull;{' '}
              {opening.wins}W / {opening.draws}D / {opening.losses}L
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-3">
          <div className="text-right">
            <div
              className={cn(
                "text-lg font-bold",
                isGoodWinrate && "text-emerald-600",
                isPoorWinrate && "text-red-600",
                !isGoodWinrate && !isPoorWinrate && "text-foreground"
              )}
            >
              {winratePct}%
            </div>
            <div className="text-xs text-muted-foreground">winrate</div>
          </div>
          {opening.frequency && (
            <Badge variant="secondary" className="text-xs">
              {(opening.frequency * 100).toFixed(0)}% freq
            </Badge>
          )}
        </div>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border bg-card p-3 transition-all overflow-hidden"
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
        {showColor && (
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border",
              opening.color === "white"
                ? "bg-white border-gray-200"
                : "bg-gray-800 border-gray-700"
            )}
          >
            <span
              className={cn(
                "text-xs font-bold",
                opening.color === "white" ? "text-gray-800" : "text-white"
              )}
            >
              {opening.color === "white" ? "W" : "B"}
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-sm shrink-0">{opening.eco_code}</span>
            <span className="text-sm text-foreground truncate">
              {opening.opening_name}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {opening.games_count} {opening.games_count === 1 ? 'game' : 'games'}
            {' '}&bull;{' '}
            {opening.wins}W / {opening.draws}D / {opening.losses}L
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 ml-3">
        <div className="text-right">
          <div
            className={cn(
              "text-lg font-bold",
              isGoodWinrate && "text-emerald-600",
              isPoorWinrate && "text-red-600",
              !isGoodWinrate && !isPoorWinrate && "text-foreground"
            )}
          >
            {winratePct}%
          </div>
          <div className="text-xs text-muted-foreground">winrate</div>
        </div>
        {opening.frequency && (
          <Badge variant="secondary" className="text-xs">
            {(opening.frequency * 100).toFixed(0)}% freq
          </Badge>
        )}
      </div>
    </div>
  );
}

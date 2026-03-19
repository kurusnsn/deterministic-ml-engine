"use client";

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Clock,
  TrendingUp,
  TrendingDown,
  Target,
  ExternalLink,
  Info
} from 'lucide-react';
import { OpeningStats } from '@/types/repertoire';
import { cn } from '@/lib/utils';

interface OpeningCardProps {
  opening: OpeningStats;
  isSelected: boolean;
  onSelectionChange: (eco: string, selected: boolean) => void;
  showActions?: boolean;
  compact?: boolean;
}

export default function OpeningCard({
  opening,
  isSelected,
  onSelectionChange,
  showActions = true,
  compact = false
}: OpeningCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Color coding for winrate
  const getWinrateColor = (winrate: number) => {
    if (winrate >= 0.6) return 'text-green-600 bg-green-50';
    if (winrate >= 0.5) return 'text-blue-600 bg-blue-50';
    if (winrate >= 0.4) return 'text-orange-600 bg-orange-50';
    return 'text-red-600 bg-red-50';
  };

  // Format time display
  const formatTime = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Format percentage
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  const winrateColorClass = getWinrateColor(opening.winrate);

  return (
    <Card className={cn(
      "transition-all duration-200 hover:shadow-md",
      isSelected && "ring-2 ring-blue-500 bg-blue-50/30",
      compact && "p-2"
    )}>
      <CardContent className={cn("p-4", compact && "p-3")}>
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3">
            {showActions && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) =>
                  onSelectionChange(opening.eco_code, !!checked)
                }
                className="mt-1"
              />
            )}

            <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={cn(
              "font-semibold text-gray-900",
              compact ? "text-sm" : "text-base"
            )}>
              {opening.opening_name}
            </h3>
            <Badge variant="outline" className="text-xs">
              {opening.eco_code}
            </Badge>
            <Badge
              variant="secondary"
              className={cn(
                "text-xs",
                opening.color === 'white' ? 'bg-gray-100' : 'bg-gray-800 text-white'
              )}
            >
              {opening.color}
            </Badge>
            {opening.repertoire_tags && opening.repertoire_tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {opening.repertoire_tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-[10px]">
                    {tag === 'core' ? 'Core rep.' : tag === 'secondary' ? 'Secondary' : 'Experimental'}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

          {showActions && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="p-1"
            >
              <Info className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Main Stats */}
        <div className="grid grid-cols-3 gap-4 mb-3">
          {/* Games */}
          <div className="text-center">
            <div className={cn(
              "font-bold text-gray-900",
              compact ? "text-lg" : "text-xl"
            )}>
              {opening.games_count}
            </div>
            <div className="text-xs text-gray-500">Games</div>
          </div>

          {/* Winrate */}
          <div className="text-center">
            <div className={cn(
              "font-bold rounded-md px-2 py-1",
              compact ? "text-lg" : "text-xl",
              winrateColorClass
            )}>
              {formatPercent(opening.winrate)}
            </div>
            <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
              {opening.winrate >= 0.5 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              Winrate
            </div>
          </div>

          {/* Frequency */}
          <div className="text-center">
            <div className={cn(
              "font-bold text-gray-900",
              compact ? "text-lg" : "text-xl"
            )}>
              {formatPercent(opening.frequency)}
            </div>
            <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
              <Target className="w-3 h-3" />
              Frequency
            </div>
          </div>
        </div>

        {/* Record Breakdown */}
        <div className="flex justify-between text-xs text-gray-600 mb-3">
          <span className="text-green-600">+{opening.wins}</span>
          <span className="text-gray-500">={opening.draws}</span>
          <span className="text-red-600">-{opening.losses}</span>
        </div>

        {/* Time Stats (if available) */}
        {(opening.avg_time_seconds || opening.median_time_seconds) && (
          <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Avg: {formatTime(opening.avg_time_seconds)}
            </div>
            <div>
              Median: {formatTime(opening.median_time_seconds)}
            </div>
          </div>
        )}

        {/* Detailed Info (Expandable) */}
        {showDetails && (
          <div className="border-t pt-3 mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-500">Win Rate:</span>
                <span className="ml-2 font-medium">{formatPercent(opening.wins / opening.games_count)}</span>
              </div>
              <div>
                <span className="text-gray-500">Draw Rate:</span>
                <span className="ml-2 font-medium">{formatPercent(opening.draws / opening.games_count)}</span>
              </div>
              <div>
                <span className="text-gray-500">Loss Rate:</span>
                <span className="ml-2 font-medium">{formatPercent(opening.losses / opening.games_count)}</span>
              </div>
              <div>
                <span className="text-gray-500">Games:</span>
                <span className="ml-2 font-medium">{opening.games_count}</span>
              </div>
            </div>

            {showActions && (
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => {
                    window.open(`/practice/custom?eco=${encodeURIComponent(opening.eco_code)}`, '_blank');
                  }}
                >
                  Practice
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => {
                    // TODO: Open analysis for this opening
                    window.open(`/analyze?eco=${opening.eco_code}`, '_blank');
                  }}
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Analyze
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

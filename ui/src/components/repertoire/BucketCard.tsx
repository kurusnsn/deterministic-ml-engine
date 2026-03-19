"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { OpeningStats, RepertoireType } from "@/types/repertoire";
import { TrendingUp, Target, Lightbulb, ChevronRight, Trophy, AlertCircle, HelpCircle, Save, Loader2 } from "lucide-react";
import OpeningRow from "./OpeningRow";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { saveRepertoire } from "@/lib/api/repertoire";
import { useState } from "react";

interface BucketCardProps {
  type: RepertoireType;
  openings: OpeningStats[];
  puzzleCount?: number;
  onViewAll: (type: RepertoireType) => void;
  // New props for saving
  color?: 'white' | 'black' | 'all';
  sourceReportId?: string;
  timeControl?: string;
}

const bucketConfig: Record<
  RepertoireType,
  {
    icon: React.ElementType;
    label: string;
    description: string;
    tooltip: string;
    pillClass: string;
    iconClass: string;
    bgClass: string;
  }
> = {
  core: {
    icon: TrendingUp,
    label: "Core Repertoire",
    description: "Your main opening lines with the most games",
    tooltip: "Openings you play frequently (≥5% of games) with solid results (≥50% winrate). These are your main weapons.",
    pillClass: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
    iconClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  secondary: {
    icon: Target,
    label: "Secondary Repertoire",
    description: "Alternative lines for variety and surprise",
    tooltip: "Openings with moderate frequency (2-5%) or good performance but not yet your main lines. Consider expanding these.",
    pillClass: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700",
    iconClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-50 dark:bg-blue-950/30",
  },
  experimental: {
    icon: Lightbulb,
    label: "Experimental Repertoire",
    description: "New lines you're testing and learning",
    tooltip: "Rarely played openings (<2% of games) with lower winrate (<40%). Consider studying these or dropping them.",
    pillClass: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700",
    iconClass: "text-amber-600 dark:text-amber-400",
    bgClass: "bg-amber-50 dark:bg-amber-950/30",
  },
  repair: {
    icon: AlertCircle,
    label: "Problem Areas",
    description: "Frequently played but struggling - needs work",
    tooltip: "Openings you play frequently (≥5% of games) but with poor results (<40% winrate). Prioritize studying these!",
    pillClass: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700",
    iconClass: "text-red-600 dark:text-red-400",
    bgClass: "bg-red-50 dark:bg-red-950/30",
  },
};

export default function BucketCard({ type, openings, puzzleCount = 0, onViewAll, color, sourceReportId, timeControl }: BucketCardProps) {
  const bucket = bucketConfig[type];
  const Icon = bucket.icon;
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  // Calculate aggregate stats
  const totalGames = openings.reduce((sum, o) => sum + o.games_count, 0);
  const totalWins = openings.reduce((sum, o) => sum + o.wins, 0);
  const totalLosses = openings.reduce((sum, o) => sum + o.losses, 0);
  const totalDraws = openings.reduce((sum, o) => sum + o.draws, 0);
  const avgWinrate = totalGames > 0 ? (totalWins + totalDraws * 0.5) / totalGames : 0;

  // Sort by games count for preview
  const sortedOpenings = [...openings].sort((a, b) => b.games_count - a.games_count);
  const previewOpenings = sortedOpenings.slice(0, 5);

  // Find outliers (min 3 games to be significant)
  const significantOpenings = openings.filter(o => o.games_count >= 3);
  const bestOpening = significantOpenings.length > 0
    ? significantOpenings.reduce((a, b) => a.winrate > b.winrate ? a : b)
    : null;
  const worstOpening = significantOpenings.length > 0
    ? significantOpenings.reduce((a, b) => a.winrate < b.winrate ? a : b)
    : null;

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSaving(true);
    try {
      const mappedOpenings = openings.map(o => ({
        eco: o.eco_code,
        name: o.opening_name,
        color: o.color,
        games_count: o.games_count,
        winrate: o.winrate,
        frequency: o.frequency
      }));

      await saveRepertoire({
        name: `${bucket.label} (${color === 'all' ? 'Mixed' : color})${timeControl ? ' - ' + timeControl : ''}`,
        eco_codes: mappedOpenings.map(o => o.eco),
        openings: mappedOpenings,
        category: type,
        color: color === 'all' ? 'both' : color,
        source_report_id: sourceReportId,
        time_control: timeControl,
      });

      toast({
        title: "Repertoire Saved!",
        description: "Bucket saved successfully to your profile."
      });
    } catch (error) {
      console.error("Failed to save repertoire:", error);
      toast({
        title: "Error saving repertoire",
        description: "Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (openings.length === 0) {
    return (
      <Card className="border-dashed border-2 bg-muted/30">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className={cn("p-2 rounded-lg", bucket.pillClass)}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium">{bucket.label}</p>
              <p className="text-sm">No openings assigned to this bucket yet</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "overflow-hidden transition-all duration-200 hover:shadow-md cursor-pointer group border-muted/60",
      bucket.bgClass
    )}
      onClick={() => onViewAll(type)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg bg-white dark:bg-white/10 shadow-sm ring-1 ring-black/5 dark:ring-white/10", bucket.iconClass)}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                {bucket.label}
                <Badge variant="secondary" className={cn("text-[10px] px-1.5 h-5", bucket.pillClass)}>
                  {openings.length} lines
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-muted-foreground">{bucket.description}</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-xs">{bucket.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-purple-600 hover:bg-white/80 dark:hover:bg-white/10 z-10"
              onClick={handleSave}
              disabled={isSaving}
              title="Save as Repertoire"
              aria-label="Save as repertoire"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            </Button>
            <ChevronRight className="w-5 h-5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 mt-4 p-3 bg-white/60 dark:bg-white/5 rounded-lg border">
          <div className="text-center">
            <div className="text-xl font-bold text-foreground">{totalGames}</div>
            <div className="text-xs text-muted-foreground">Total Games</div>
          </div>
          <div className="text-center border-x">
            <div className={cn(
              "text-xl font-bold",
              avgWinrate >= 0.55 ? "text-emerald-600" :
                avgWinrate >= 0.45 ? "text-foreground" : "text-red-600"
            )}>
              {(avgWinrate * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">Avg Winrate</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-foreground">
              {totalWins}/{totalDraws}/{totalLosses}
            </div>
            <div className="text-xs text-muted-foreground">W/D/L</div>
          </div>
        </div>

        {/* Winrate Progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Win Rate</span>
            <span className="font-medium">{(avgWinrate * 100).toFixed(0)}%</span>
          </div>
          <Progress value={avgWinrate * 100} className="h-2" />
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Quick Insights */}
        <div className="flex gap-2 flex-wrap">
          {bestOpening && (
            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
              <Trophy className="w-3 h-3 mr-1" />
              Best: {bestOpening.eco_code} ({(bestOpening.winrate * 100).toFixed(0)}%)
            </Badge>
          )}
          {worstOpening && worstOpening.winrate < 0.45 && (
            <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800">
              <AlertCircle className="w-3 h-3 mr-1" />
              Focus: {worstOpening.eco_code} ({(worstOpening.winrate * 100).toFixed(0)}%)
            </Badge>
          )}
        </div>

        {/* Opening Preview List */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Top Openings
          </p>
          {previewOpenings.map((opening, idx) => (
            <OpeningRow
              key={`${opening.eco_code}-${opening.color}-${idx}`}
              opening={opening}
              compact
            />
          ))}
        </div>

        {/* View All Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2 group"
          onClick={() => onViewAll(type)}
        >
          View all {openings.length} openings
          <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

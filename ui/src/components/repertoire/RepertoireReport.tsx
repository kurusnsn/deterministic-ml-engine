"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  Download,
  FileText,
  Printer,
  ChevronDown,
  BarChart3,
  Layers,
  Target,
  Clock,
} from "lucide-react";

import {
  RepertoireReport as RepertoireReportType,
  OpeningStats,
  FilterState,
  SuggestedRepertoire,
  RepertoireType,
} from "@/types/repertoire";
import SaveReportDialog from "@/components/SaveReportDialog";
import RepertoireCard from "@/components/RepertoireCard";
import { exportReportAsCSV, exportReportAsHTML, printReport } from "@/lib/exportUtils";
import { cn } from "@/lib/utils";

// Components
import TacticalInsightsCard from "./TacticalInsightsCard";
import MoveList from "./MoveList";
import PuzzleSection from "./PuzzleSection";
import RepertoireRecommendations from "./RepertoireRecommendations";
import BucketCard from "./BucketCard";
import BucketDrawer from "./BucketDrawer";
import PuzzlesBucketCard from "./PuzzlesBucketCard";
import HighlightsSection from "./HighlightsSection";
import PlaystyleSection from "./PlaystyleSection";

// Charts
import OpeningOutcomesChart from "./charts/OpeningOutcomesChart";
import ChartInsightCard from "./charts/ChartInsightCard";
import AccuracyByPhaseChart from "./charts/AccuracyByPhaseChart";
import MistakeBreakdownChart from "./charts/MistakeBreakdownChart";
import EvalSwingAggregated from "./charts/EvalSwingAggregated";
import TacticalMotifsChart from "./charts/TacticalMotifsChart";
import MistakeMotifsCard from "./charts/MistakeMotifsCard";
import DefensiveBlindspotsCard from "./charts/DefensiveBlindspotsCard";
import GameLengthDistributionChart from "./charts/GameLengthDistributionChart";
import MoveTimeVsResultChart from "./charts/MoveTimeVsResultChart";

interface RepertoireReportProps {
  report: RepertoireReportType;
  onSave?: (name: string) => Promise<void>;
  onSaveRepertoire?: (repertoire: SuggestedRepertoire) => Promise<void>;
  isSaving?: boolean;
  className?: string;
  sourceUsernames?: string[];
  linkedAccounts?: { platform: string; username: string }[];
}

export default function RepertoireReport({
  report,
  onSave,
  onSaveRepertoire,
  isSaving = false,
  className,
  sourceUsernames = [],
  linkedAccounts = [],
}: RepertoireReportProps) {
  const [selectedColor, setSelectedColor] = useState<"white" | "black">("white");
  const [activeBucket, setActiveBucket] = useState<RepertoireType | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const repertoireSectionRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<FilterState>({
    sortBy: "frequency",
    sortOrder: "desc",
    searchTerm: "",
    minGames: 1,
    winrateRange: [0, 1],
  });

  // Get openings for current view
  const currentOpenings = useMemo(() => {
    const repertoires =
      selectedColor === "white"
        ? report.white_repertoire
        : report.black_repertoire;

    const allOpenings = Object.entries(repertoires).flatMap(([category, group]) =>
      group.openings.map((opening) => ({ ...opening, category }))
    );

    // Apply filters
    let filtered = allOpenings.filter((opening) => {
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        return (
          opening.opening_name.toLowerCase().includes(searchLower) ||
          opening.eco_code.toLowerCase().includes(searchLower)
        );
      }
      return true;
    });

    if (filters.category) {
      filtered = filtered.filter((opening) => opening.category === filters.category);
    }

    if (filters.minGames > 1) {
      filtered = filtered.filter((opening) => opening.games_count >= filters.minGames);
    }

    filtered = filtered.filter(
      (opening) =>
        opening.winrate >= filters.winrateRange[0] &&
        opening.winrate <= filters.winrateRange[1]
    );

    // Apply sorting
    filtered.sort((a, b) => {
      if (filters.sortBy === "eco") {
        return filters.sortOrder === "asc"
          ? a.eco_code.localeCompare(b.eco_code)
          : b.eco_code.localeCompare(a.eco_code);
      }

      let aVal: number;
      let bVal: number;
      switch (filters.sortBy) {
        case "games":
          aVal = a.games_count;
          bVal = b.games_count;
          break;
        case "winrate":
          aVal = a.winrate;
          bVal = b.winrate;
          break;
        case "frequency":
          aVal = a.frequency;
          bVal = b.frequency;
          break;
        default:
          aVal = a.frequency;
          bVal = b.frequency;
      }

      return filters.sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });

    return filtered;
  }, [report, selectedColor, filters]);

  // Group openings into user-managed repertoire buckets
  const repertoireBuckets = useMemo(() => {
    const buckets: Record<RepertoireType, OpeningStats[]> = {
      core: [],
      secondary: [],
      experimental: [],
      repair: [],
    };

    currentOpenings.forEach((opening) => {
      for (const tag of opening.repertoire_tags || []) {
        if (tag in buckets) {
          buckets[tag as RepertoireType].push(opening);
        }
      }
    });

    // Helper to count puzzles for a set of openings
    const countPuzzlesForOpenings = (openings: OpeningStats[]): number => {
      if (!report.generated_puzzles || report.generated_puzzles.length === 0) {
        console.log('[PuzzleCount] No generated_puzzles in report');
        return 0;
      }
      const ecoSet = new Set(openings.map((o) => o.eco_code).filter(Boolean));
      const puzzlesWithEco = report.generated_puzzles.filter((p) => p.eco);
      const matchingPuzzles = report.generated_puzzles.filter((p) => p.eco && ecoSet.has(p.eco));
      console.log('[PuzzleCount] ECO codes in openings:', Array.from(ecoSet));
      console.log('[PuzzleCount] Total puzzles:', report.generated_puzzles.length);
      console.log('[PuzzleCount] Puzzles with ECO:', puzzlesWithEco.length, puzzlesWithEco.map(p => p.eco));
      console.log('[PuzzleCount] Matching puzzles:', matchingPuzzles.length);
      return matchingPuzzles.length;
    };

    return Object.entries(buckets)
      .map(([type, openings]) => ({
        type: type as RepertoireType,
        openings,
        totalGames: openings.reduce((sum, o) => sum + o.games_count, 0),
        avgWinrate:
          openings.length > 0
            ? openings.reduce((sum, o) => sum + o.winrate * o.games_count, 0) /
            openings.reduce((sum, o) => sum + o.games_count, 0)
            : 0,
        puzzleCount: countPuzzlesForOpenings(openings),
      }))
      .filter((b) => b.openings.length > 0);
  }, [currentOpenings, report.generated_puzzles]);

  const bucketMap = useMemo(() => {
    const map: Record<RepertoireType, OpeningStats[]> = {
      core: [],
      secondary: [],
      experimental: [],
      repair: [],
    };
    repertoireBuckets.forEach((b) => {
      map[b.type] = b.openings;
    });
    return map;
  }, [repertoireBuckets]);

  // Priority insights for quick view
  const priorityInsights = report.insights
    .filter((insight) => insight.priority === "high")
    .slice(0, 3);

  // Generate suggested repertoires from the report
  const puzzlesForOpenings = useCallback(
    (openings: { eco?: string; eco_code?: string }[]) => {
      if (!report.generated_puzzles || report.generated_puzzles.length === 0) return [];
      const ecoSet = new Set(
        openings
          .map((o) => o.eco ?? o.eco_code)
          .filter((eco): eco is string => Boolean(eco))
      );
      return report.generated_puzzles.filter((p) => p.eco && ecoSet.has(p.eco));
    },
    [report.generated_puzzles]
  );

  const suggestedRepertoires: SuggestedRepertoire[] = useMemo(() => {
    const base =
      report.suggested_repertoires && report.suggested_repertoires.length > 0
        ? report.suggested_repertoires
        : [];

    return base.map((rep) => {
      const autoPuzzles = puzzlesForOpenings(rep.openings || []);
      if (!autoPuzzles.length) return rep;
      return {
        ...rep,
        puzzles: autoPuzzles.map((p) => ({
          puzzle_id: p.puzzle_id,
          eco_code: p.eco,
          move_number: p.move_number ?? p.move_ply,
          mistake_type: p.mistake_type,
          source_report_id: report.id,
        })),
      };
    });
  }, [report, puzzlesForOpenings]);

  // Check if we have engine analysis data
  const hasEngineAnalysis = report.engine_analysis?.moves && report.engine_analysis.moves.length > 0;
  const hasChartData = hasEngineAnalysis || (report.game_length_histogram && report.game_length_histogram.length > 0);

  return (
    <div className={cn("space-y-8", className)}>

      {/* Report Details Header */}
      {(report.time_control_filter || report.name) && (
        <div className="flex flex-wrap items-center gap-3">
          {report.name && (
            <h2 className="text-2xl font-bold">{report.name}</h2>
          )}
          {report.time_control_filter && (
            <Badge variant="secondary" className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {report.time_control_filter}
            </Badge>
          )}
          {report.analysis_date && (
            <span className="text-sm text-muted-foreground">
              Analyzed {new Date(report.analysis_date).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {/* Tactical Insights Card */}
      {report.insights &&
        (report.insights.filter((i) => i.priority === "high" && i.type === "warning").length > 0 ||
          report.premium_lc0?.insight_overlays?.extra_insights?.length) && (
          <TacticalInsightsCard
            insights={report.insights}
            weak_lines={report.weak_lines}
            engine_analysis={report.engine_analysis}
            premiumLc0={report.premium_lc0}
          />
        )}


      {/* ========================================== */}
      {/* HIGHLIGHTS SECTION */}
      {/* ========================================== */}
      {report.highlights && report.highlights.length > 0 && (
        <HighlightsSection
          highlights={report.highlights}
          onViewGame={(gameId, ply) => {
            // Navigate to game viewer at specific ply
            window.location.href = `/analyze?game=${gameId}&ply=${ply}`;
          }}
          onPracticePuzzle={(puzzleId) => {
            window.location.href = `/puzzles?puzzle=${puzzleId}`;
          }}
          onAddOpening={(eco) => {
            // Could trigger a modal or navigate to repertoire management
            console.log(`Add opening ${eco} to repertoire`);
          }}
        />
      )}

      {/* ========================================== */}
      {/* PLAYSTYLE PROFILE SECTION */}
      {/* ========================================== */}
      {report.playstyle_profile && (
        <PlaystyleSection playstyle={report.playstyle_profile} />
      )}

      {/* ========================================== */}
      {/* CHARTS SECTION - 2 Column Dashboard */}
      {/* ========================================== */}
      {hasChartData && (
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-primary/10">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Analytics Dashboard</h2>
              <p className="text-sm text-muted-foreground">
                Visualize your performance across different dimensions
              </p>
            </div>
          </div>

          {/* Row 1: Opening Outcomes + Key Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <OpeningOutcomesChart openings={currentOpenings} />
            <ChartInsightCard report={report} openings={currentOpenings} />
          </div>

          {/* Row 2: Accuracy by Phase + Mistake Breakdown */}
          {hasEngineAnalysis && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <AccuracyByPhaseChart moves={report.engine_analysis!.moves} />
              <MistakeBreakdownChart moves={report.engine_analysis!.moves} />
            </div>
          )}

          {/* Row 3: Eval Swing + Legacy Tactical Motifs */}
          {hasEngineAnalysis && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {report.charts_additional?.eval_swing_aggregated &&
                report.charts_additional.eval_swing_aggregated.length > 0 && (
                  <EvalSwingAggregated
                    data={report.charts_additional.eval_swing_aggregated}
                    selectedColor={selectedColor}
                  />
                )}
              <TacticalMotifsChart
                data={report.charts_additional?.tactical_pattern_chart}
                moves={report.engine_analysis?.moves}
              />
            </div>
          )}

          {/* Row 4: Game Length + Move Time */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {report.game_length_histogram && report.game_length_histogram.length > 0 && (
              <GameLengthDistributionChart
                data={report.game_length_histogram}
                timeUsage={report.time_usage}
              />
            )}
            {report.time_usage && report.time_usage.length > 0 && (
              <MoveTimeVsResultChart data={report.time_usage} />
            )}
          </div>

          {/* Row 5: Tactical Motif Analysis */}
          {hasEngineAnalysis && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <MistakeMotifsCard
                data={report.charts_additional?.mistake_motifs}
              />
              <DefensiveBlindspotsCard
                data={report.charts_additional?.defensive_motifs}
              />
            </div>
          )}
        </section>
      )}

      {/* ========================================== */}
      {/* REPERTOIRE SECTION - Bucket Cards */}
      {/* ========================================== */}
      <section ref={repertoireSectionRef} id="repertoire-section">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10">
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Your Repertoire</h2>
            <p className="text-sm text-muted-foreground">
              Openings organized by usage and importance
            </p>
          </div>
        </div>

        {/* Filter Controls */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Color Filter */}
              <div className="flex items-center gap-2">
                <Label className="text-sm">Color:</Label>
                <Tabs
                  value={selectedColor}
                  onValueChange={(value) => setSelectedColor(value as "white" | "black")}
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="white" className="text-xs px-3 h-7 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-white border border-border"></span>
                      White
                    </TabsTrigger>
                    <TabsTrigger value="black" className="text-xs px-3 h-7 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-zinc-800"></span>
                      Black
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bucket Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {repertoireBuckets.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-8 text-center">
                <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Repertoire Buckets Yet</h3>
                <p className="text-sm text-muted-foreground">
                  Openings will appear here once you assign them to Core, Secondary, or Experimental
                  buckets.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {repertoireBuckets.map((bucket) => (
                <BucketCard
                  key={bucket.type}
                  type={bucket.type}
                  openings={bucket.openings}
                  puzzleCount={bucket.puzzleCount}
                  onViewAll={(type) => setActiveBucket(type)}
                  color={selectedColor}
                  sourceReportId={report.id}
                  timeControl={report.time_control_filter}
                />
              ))}
              {/* Puzzles Bucket */}
              <PuzzlesBucketCard
                puzzles={report.generated_puzzles || []}
                sourceReportId={report.id}
                sourceReportName={report.name || `Analysis ${new Date(report.analysis_date).toLocaleDateString()}`}
                timeControl={report.time_control_filter}
                repertoireType="mixed"
                premiumLc0={report.premium_lc0}
              />
            </>
          )}
        </div>

        {/* Bucket Drawer */}
        {activeBucket && (
          <BucketDrawer
            type={activeBucket}
            openings={bucketMap[activeBucket] || []}
            puzzles={report.generated_puzzles || []}
            engineMoves={report.engine_analysis?.moves || []}
            weakLines={report.weak_lines}
            open={!!activeBucket}
            onOpenChange={(open) => {
              if (!open) setActiveBucket(null);
            }}
          />
        )}
      </section>

      {/* ========================================== */}
      {/* DETAILED ANALYSIS SECTION */}
      {/* ========================================== */}

      {/* Move Analysis - Hidden for now, keeping logic for future features
      {hasEngineAnalysis && (
        <Card>
          <CardHeader>
            <CardTitle>Move Analysis</CardTitle>
            <p className="text-sm text-muted-foreground">
              Detailed analysis of moves with engine evaluation and heuristics
            </p>
          </CardHeader>
          <CardContent>
            <MoveList
              moves={report.engine_analysis!.moves}
              puzzles={report.generated_puzzles}
              onPuzzleClick={() => {
                document.getElementById("puzzles-section")?.scrollIntoView({ behavior: "smooth" });
              }}
            />
          </CardContent>
        </Card>
      )}
      */}

      {/* Puzzles Section - Hidden, using PuzzlesBucketCard instead
      {report.generated_puzzles && report.generated_puzzles.length > 0 && (
        <PuzzleSection
          puzzles={report.generated_puzzles}
          onPlayPuzzle={(puzzle) => {
            window.location.href = `/puzzles?puzzle=${puzzle.puzzle_id}`;
          }}
        />
      )}
      */}

      {/* Repertoire Recommendations */}
      {report.weak_lines && report.weak_lines.length > 0 && (
        <RepertoireRecommendations
          weak_lines={report.weak_lines}
          puzzles={report.generated_puzzles || []}
          tactical_insights={report.insights || []}
        />
      )}

      {/* Save Report Dialog */}
      <SaveReportDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={onSave || (async () => { })}
        report={report}
        sourceUsernames={sourceUsernames}
        linkedAccounts={linkedAccounts}
        isSaving={isSaving}
      />
    </div>
  );
}

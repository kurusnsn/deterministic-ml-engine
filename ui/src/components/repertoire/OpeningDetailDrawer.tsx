"use client";

import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import {
  OpeningStats,
  GeneratedPuzzle,
  MoveAnalysis,
  WeakLine,
  RepertoireType,
} from "@/types/repertoire";
import { cn } from "@/lib/utils";
import {
  Trophy,
  Target,
  TrendingUp,
  AlertTriangle,
  Zap,
  BookOpen,
  Puzzle,
  Save,
  ExternalLink,
  ChevronRight,
  Circle,
} from "lucide-react";

interface OpeningDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opening: OpeningStats | null;
  puzzles: GeneratedPuzzle[];
  engineMoves: MoveAnalysis[];
  weakLines?: WeakLine[] | null;
  bucketType?: RepertoireType;
  onSaveToProfile?: (opening: OpeningStats) => Promise<void>;
}

type PhaseKey = "opening" | "middlegame" | "endgame";

const categoryLabel: Record<RepertoireType, { label: string; class: string }> = {
  core: { label: "Core", class: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  secondary: { label: "Secondary", class: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  experimental: { label: "Experimental", class: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  repair: { label: "Repair", class: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

const phaseFromFen = (fen: string | undefined): PhaseKey => {
  if (!fen) return "middlegame";
  const board = fen.split(" ")[0] || "";
  const queens = (board.match(/q/gi) || []).length;
  const material = (board.match(/[prnbqk]/gi) || []).reduce((sum, piece) => {
    const p = piece.toLowerCase();
    const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    return sum + (values[p] || 0);
  }, 0);
  if (queens >= 2) return "opening";
  if (queens === 0 || material <= 20) return "endgame";
  return "middlegame";
};

const formatPct = (val: number | undefined) => {
  if (val === undefined || Number.isNaN(val)) return "—";
  return `${(val * 100).toFixed(1)}%`;
};

export default function OpeningDetailDrawer({
  open,
  onOpenChange,
  opening,
  puzzles,
  engineMoves,
  weakLines,
  bucketType = "core",
  onSaveToProfile,
}: OpeningDetailDrawerProps) {
  const [isSaving, setIsSaving] = useState(false);

  const filteredMoves = useMemo(() => {
    if (!opening) return [];
    return (engineMoves || []).filter(
      (m) => m.eco === opening.eco_code || m.opening_name === opening.opening_name
    );
  }, [opening, engineMoves]);

  const phaseStats = useMemo(() => {
    const buckets: Record<PhaseKey, { cpLossSum: number; count: number; blunders: number }> = {
      opening: { cpLossSum: 0, count: 0, blunders: 0 },
      middlegame: { cpLossSum: 0, count: 0, blunders: 0 },
      endgame: { cpLossSum: 0, count: 0, blunders: 0 },
    };
    filteredMoves.forEach((m) => {
      const phase = phaseFromFen((m as any).fen_after || (m as any).fen_before);
      const cpLoss = Math.abs(m.eval_delta ?? 0);
      buckets[phase].cpLossSum += cpLoss;
      buckets[phase].count += 1;
      if (m.mistake_type === "blunder") buckets[phase].blunders += 1;
    });
    return buckets;
  }, [filteredMoves]);

  const evalAtPly = (ply: number) => {
    const candidate = filteredMoves.find((m) => m.ply >= ply);
    return candidate?.eval?.cp ? (candidate.eval.cp / 100).toFixed(2) : undefined;
  };

  const blunderInfo = useMemo(() => {
    const blunders = filteredMoves.filter((m) => m.mistake_type === "blunder");
    const avgCp = blunders.length
      ? blunders.reduce((sum, b) => sum + Math.abs(b.eval_delta ?? 0), 0) / blunders.length
      : 0;
    const commonMoves = blunders.map((b) => `Move ${Math.ceil(b.ply / 2)}`).slice(0, 3);
    const swingMoments = [...filteredMoves]
      .sort((a, b) => Math.abs(b.eval_delta ?? 0) - Math.abs(a.eval_delta ?? 0))
      .slice(0, 3)
      .map((m) => `Move ${Math.ceil(m.ply / 2)}`);
    const accuracy =
      filteredMoves.length > 0
        ? 1 - filteredMoves.reduce((sum, m) => sum + Math.abs(m.eval_delta ?? 0), 0) / (filteredMoves.length * 300)
        : 0;
    return { avgCp, commonMoves, swingMoments, accuracy: Math.max(0, Math.min(1, accuracy)) };
  }, [filteredMoves]);

  const motifCounts = useMemo(() => {
    const motifs: Record<string, number> = {};
    filteredMoves.forEach((m) => {
      const h = m.heuristics || {};
      Object.keys(h).forEach((k) => {
        if (typeof (h as any)[k] === "boolean" && (h as any)[k]) {
          motifs[k] = (motifs[k] || 0) + 1;
        }
      });
    });
    return motifs;
  }, [filteredMoves]);

  const puzzlesForOpening = useMemo(() => {
    if (!opening) return [];
    const filtered = (puzzles || []).filter(
      (p) => p.eco === opening.eco_code || (p as any).eco_code === opening.eco_code
    );
    // Deduplicate by puzzle_id to avoid React key warnings
    const seen = new Set<string>();
    return filtered.filter((p) => {
      if (seen.has(p.puzzle_id)) return false;
      seen.add(p.puzzle_id);
      return true;
    });
  }, [opening, puzzles]);

  const weakLineNotes = useMemo(() => {
    if (!opening || !weakLines) return [];
    return weakLines.filter((wl) => wl.eco === opening.eco_code);
  }, [opening, weakLines]);

  const handleSave = async () => {
    if (!opening || !onSaveToProfile) return;
    setIsSaving(true);
    try {
      await onSaveToProfile(opening);
    } finally {
      setIsSaving(false);
    }
  };

  const PhaseStatRow = ({ phase, label }: { phase: PhaseKey; label: string }) => {
    const data = phaseStats[phase];
    const avgLoss = data.count ? data.cpLossSum / data.count : 0;
    const accuracy = data.count ? Math.max(0, 1 - avgLoss / 300) : 0;
    const isWeak = avgLoss > 40;

    return (
      <div className={cn(
        "p-3 rounded-lg border",
        isWeak ? "bg-red-50/50 border-red-200 dark:bg-red-950/30 dark:border-red-800" : "bg-muted/30"
      )}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium capitalize">{label}</span>
          {isWeak && <AlertTriangle className="w-4 h-4 text-red-500" />}
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">CP Loss</div>
            <div className={cn("font-semibold", isWeak ? "text-red-600" : "text-foreground")}>
              {avgLoss.toFixed(1)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Accuracy</div>
            <div className="font-semibold">{formatPct(accuracy)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Blunders</div>
            <div className={cn("font-semibold", data.blunders > 0 ? "text-red-600" : "text-foreground")}>
              {data.blunders}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!opening) return null;

  const config = categoryLabel[bucketType] ?? categoryLabel.core;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0">
        <div className="flex flex-col h-full">
          {/* Header */}
          <SheetHeader className="p-6 pb-4 border-b bg-gradient-to-br from-muted/50 to-background">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center border shrink-0",
                    opening.color === "white"
                      ? "bg-white border-gray-200"
                      : "bg-gray-800 border-gray-700"
                  )}
                >
                  <span
                    className={cn(
                      "text-sm font-bold",
                      opening.color === "white" ? "text-gray-800" : "text-white"
                    )}
                  >
                    {opening.color === "white" ? "W" : "B"}
                  </span>
                </div>
                <div>
                  <SheetTitle className="text-lg flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{opening.eco_code}</span>
                    <span>{opening.opening_name}</span>
                  </SheetTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={config.class}>{config.label}</Badge>
                    <Badge variant="outline" className="capitalize">
                      {opening.color}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
            <SheetDescription className="sr-only">
              Detailed analysis of {opening.opening_name}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              {/* Performance Summary */}
              <section>
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  Performance Summary
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold text-foreground">{opening.games_count}</div>
                      <div className="text-xs text-muted-foreground">Games</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <div className={cn(
                        "text-2xl font-bold",
                        opening.winrate >= 0.55 ? "text-emerald-600" :
                          opening.winrate < 0.45 ? "text-red-600" : "text-foreground"
                      )}>
                        {(opening.winrate * 100).toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">Winrate</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold text-foreground">
                        {(opening.frequency * 100).toFixed(0)}%
                      </div>
                      <div className="text-xs text-muted-foreground">Frequency</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <div className="text-sm font-semibold text-foreground">
                        {opening.wins}W / {opening.draws}D / {opening.losses}L
                      </div>
                      <div className="text-xs text-muted-foreground">Record</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Eval Progression */}
                <div className="mt-3 p-3 rounded-lg bg-muted/30 border">
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Average Eval After Move
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Move 5:</span>{" "}
                      <span className="font-semibold">{evalAtPly(10) ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Move 10:</span>{" "}
                      <span className="font-semibold">{evalAtPly(20) ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Move 15:</span>{" "}
                      <span className="font-semibold">{evalAtPly(30) ?? "—"}</span>
                    </div>
                  </div>
                </div>
              </section>

              <Separator />

              {/* Phase Stats */}
              <section>
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-blue-500" />
                  CP Loss per Phase
                </h4>
                {filteredMoves.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Phase-specific analysis is not available for individual openings.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <PhaseStatRow phase="opening" label="Opening" />
                    <PhaseStatRow phase="middlegame" label="Middlegame" />
                    <PhaseStatRow phase="endgame" label="Endgame" />
                  </div>
                )}
              </section>

              <Separator />

              {/* Engine Insights */}
              <section>
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-purple-500" />
                  Engine Insights
                </h4>
                {filteredMoves.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Engine analysis details are not available for individual openings.
                    View the full report for aggregate analysis data.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-muted/30 border">
                        <div className="text-xs text-muted-foreground">Best-Move Accuracy</div>
                        <div className="text-lg font-bold">{formatPct(blunderInfo.accuracy)}</div>
                        <Progress value={blunderInfo.accuracy * 100} className="h-1.5 mt-1" />
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30 border">
                        <div className="text-xs text-muted-foreground">Avg Blunder Loss</div>
                        <div className={cn(
                          "text-lg font-bold",
                          blunderInfo.avgCp > 100 ? "text-red-600" : "text-foreground"
                        )}>
                          {blunderInfo.avgCp.toFixed(0)} cp
                        </div>
                      </div>
                    </div>
                    {blunderInfo.commonMoves.length > 0 && (
                      <div className="mt-3 p-3 rounded-lg bg-red-50/50 border border-red-200">
                        <div className="text-xs text-red-700 dark:text-red-400 font-medium mb-1">Common Blunder Moments</div>
                        <div className="text-sm text-red-600">
                          {blunderInfo.commonMoves.join(", ")}
                        </div>
                      </div>
                    )}
                    {blunderInfo.swingMoments.length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Largest eval swings at: {blunderInfo.swingMoments.join(", ")}
                      </div>
                    )}
                  </>
                )}
              </section>

              <Separator />

              {/* Tactical Patterns */}
              <section>
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-orange-500" />
                  Tactical Patterns
                </h4>
                {Object.keys(motifCounts).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tactical motifs recorded for this opening.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(motifCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([motif, count]) => (
                        <Badge key={motif} variant="outline" className="text-xs">
                          {motif.replace(/_/g, " ")} · {count}
                        </Badge>
                      ))}
                  </div>
                )}
              </section>

              {/* Weak Lines */}
              {weakLineNotes && weakLineNotes.length > 0 && (
                <>
                  <Separator />
                  <section>
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      Weak Line Notes
                    </h4>
                    <div className="space-y-2">
                      {weakLineNotes.map((wl, idx) => (
                        <div key={wl.id || idx} className="p-3 rounded-lg bg-red-50/50 border border-red-200 dark:bg-red-950/30 dark:border-red-800">
                          <div className="font-mono text-sm">{wl.line.join(" ")}</div>
                          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                            <span>{wl.games_count} games</span>
                            <span>{(wl.winrate * 100).toFixed(0)}% winrate</span>
                            <span>Avg swing: {wl.avg_eval_swing.toFixed(1)}</span>
                          </div>
                          {wl.common_mistakes.length > 0 && (
                            <div className="mt-2 text-xs text-red-600">
                              Common mistakes: {wl.common_mistakes.join(", ")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {/* Puzzles */}
              <Separator />
              <section>
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                  <Puzzle className="w-4 h-4 text-indigo-500" />
                  Related Puzzles
                  {puzzlesForOpening.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {puzzlesForOpening.length}
                    </Badge>
                  )}
                </h4>
                {puzzlesForOpening.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No puzzles generated for this opening yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {puzzlesForOpening.slice(0, 5).map((puzzle) => (
                      <div
                        key={puzzle.puzzle_id}
                        className="flex items-center justify-between rounded-lg border p-3 bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div>
                          <div className="font-medium text-sm">Puzzle #{puzzle.puzzle_id.startsWith("pz_") ? puzzle.puzzle_id.slice(3) : puzzle.puzzle_id}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>Move {puzzle.move_number ?? puzzle.move_ply ?? "?"}</span>
                            {puzzle.theme && puzzle.theme.length > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {puzzle.theme[0]}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(`/puzzles?puzzle=${puzzle.puzzle_id}`, "_blank")}
                        >
                          Solve
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </Button>
                      </div>
                    ))}
                    {puzzlesForOpening.length > 5 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => window.open(`/puzzles?eco=${opening.eco_code}`, "_blank")}
                      >
                        View all {puzzlesForOpening.length} puzzles
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    )}
                  </div>
                )}
              </section>
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="p-4 border-t bg-muted/30 flex gap-2">
            {onSaveToProfile && (
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={isSaving}
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? "Saving..." : "Save to Profile Repertoire"}
              </Button>
            )}
            <SheetClose asChild>
              <Button variant="outline" className={onSaveToProfile ? "" : "w-full"}>
                Close
              </Button>
            </SheetClose>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

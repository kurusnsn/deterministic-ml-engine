"use client";

import { useState, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OpeningStats,
  GeneratedPuzzle,
  MoveAnalysis,
  WeakLine,
  RepertoireType,
} from "@/types/repertoire";
import OpeningRow from "./OpeningRow";
import OpeningDetailDrawer from "./OpeningDetailDrawer";
import { TrendingUp, Target, Lightbulb, Search, SortAsc, SortDesc, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface BucketDrawerProps {
  type: RepertoireType;
  openings: OpeningStats[];
  puzzles: GeneratedPuzzle[];
  engineMoves: MoveAnalysis[];
  weakLines?: WeakLine[] | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const bucketConfig: Record<
  RepertoireType,
  {
    icon: React.ElementType;
    label: string;
    pillClass: string;
  }
> = {
  core: {
    icon: TrendingUp,
    label: "Core Repertoire",
    pillClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  secondary: {
    icon: Target,
    label: "Secondary Repertoire",
    pillClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  experimental: {
    icon: Lightbulb,
    label: "Experimental Repertoire",
    pillClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  repair: {
    icon: AlertCircle,
    label: "Problem Areas",
    pillClass: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  },
};

type SortBy = "games" | "winrate" | "frequency" | "eco";

export default function BucketDrawer({
  type,
  openings,
  puzzles,
  engineMoves,
  weakLines,
  open = false,
  onOpenChange,
}: BucketDrawerProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<OpeningStats | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("games");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [colorFilter, setColorFilter] = useState<"all" | "white" | "black">("all");

  const config = bucketConfig[type];
  const Icon = config.icon;

  // Filter and sort openings
  const filteredOpenings = useMemo(() => {
    let result = [...openings];

    // Apply color filter
    if (colorFilter !== "all") {
      result = result.filter((o) => o.color === colorFilter);
    }

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (o) =>
          o.opening_name.toLowerCase().includes(term) ||
          o.eco_code.toLowerCase().includes(term)
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      if (sortBy === "eco") {
        return sortOrder === "asc"
          ? a.eco_code.localeCompare(b.eco_code)
          : b.eco_code.localeCompare(a.eco_code);
      }

      let aVal: number;
      let bVal: number;

      switch (sortBy) {
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
          aVal = a.games_count;
          bVal = b.games_count;
      }

      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });

    return result;
  }, [openings, colorFilter, searchTerm, sortBy, sortOrder]);

  const handleSelect = (opening: OpeningStats) => {
    setSelected(opening);
    setDetailOpen(true);
  };

  // Aggregate stats
  const totalGames = openings.reduce((sum, o) => sum + o.games_count, 0);
  const avgWinrate = totalGames > 0
    ? openings.reduce((sum, o) => sum + o.winrate * o.games_count, 0) / totalGames
    : 0;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0">
          <div className="flex flex-col h-full">
            {/* Header */}
            <SheetHeader className="p-6 pb-4 border-b bg-muted/30">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", config.pillClass)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <SheetTitle className="text-lg">{config.label}</SheetTitle>
                  <SheetDescription className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {openings.length} openings
                    </Badge>
                    <span className="text-xs">
                      {totalGames} games • {(avgWinrate * 100).toFixed(1)}% winrate
                    </span>
                  </SheetDescription>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <div className="relative flex-1">
                  <Label htmlFor="bucket-search" id="bucket-search-label" className="sr-only">
                    Search openings
                  </Label>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="bucket-search"
                    aria-labelledby="bucket-search-label"
                    placeholder="Search openings..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <Select value={colorFilter} onValueChange={(v) => setColorFilter(v as any)}>
                    <SelectTrigger className="w-24 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="white">White</SelectItem>
                      <SelectItem value="black">Black</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                    <SelectTrigger className="w-28 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="games">Games</SelectItem>
                      <SelectItem value="winrate">Winrate</SelectItem>
                      <SelectItem value="frequency">Frequency</SelectItem>
                      <SelectItem value="eco">ECO Code</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
                    aria-label="Toggle sort order"
                  >
                    {sortOrder === "asc" ? (
                      <SortAsc className="w-4 h-4" />
                    ) : (
                      <SortDesc className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </SheetHeader>

            {/* Opening List */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-2">
                {filteredOpenings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchTerm
                      ? "No openings match your search"
                      : "No openings in this bucket"}
                  </div>
                ) : (
                  filteredOpenings.map((op, idx) => (
                    <OpeningRow
                      key={`${op.eco_code}-${op.color}-${idx}`}
                      opening={op}
                      onClick={() => handleSelect(op)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-4 border-t bg-muted/30">
              <SheetClose asChild>
                <Button variant="outline" className="w-full">
                  Close
                </Button>
              </SheetClose>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <OpeningDetailDrawer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        opening={selected}
        puzzles={puzzles}
        engineMoves={engineMoves}
        weakLines={weakLines}
        bucketType={type}
      />
    </>
  );
}

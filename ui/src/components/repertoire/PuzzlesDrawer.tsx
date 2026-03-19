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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Chessboard } from "react-chessboard";
import {
    Puzzle,
    Search,
    X,
    Play,
    ChevronLeft,
    ChevronRight,
    Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GeneratedPuzzle, LC0PremiumOverlay } from "@/types/repertoire";

interface PuzzlesDrawerProps {
    puzzles: GeneratedPuzzle[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPuzzleClick?: (puzzle: GeneratedPuzzle) => void;
    /** LC0 premium overlay data (optional) */
    premiumLc0?: LC0PremiumOverlay;
}

const PUZZLES_PER_PAGE = 20;

/** LC0 tag styling mapping */
const LC0_TAG_STYLES: Record<string, string> = {
    high_tension: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800",
    quiet_solution: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
    decisive: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800",
    ambiguous: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800",
};

function PuzzleRow({
    puzzle,
    onPlay,
    lc0Annotation,
}: {
    puzzle: GeneratedPuzzle;
    onPlay: () => void;
    /** Optional LC0 annotation for premium features */
    lc0Annotation?: {
        lc0_value: number;
        policy_entropy: number;
        tags: string[];
        human_likeliness?: number | null;
    };
}) {
    return (
        <button
            type="button"
            className="flex w-full items-center justify-between p-3 border rounded-lg bg-white dark:bg-card hover:border-purple-300 cursor-pointer transition-colors text-left"
            onClick={onPlay}
        >
            <div className="flex items-center gap-3">
                {/* Mini chess board */}
                <div className="flex-shrink-0">
                    <Chessboard
                        position={puzzle.fen}
                        boardOrientation={puzzle.side_to_move}
                        arePiecesDraggable={false}
                        boardWidth={60}
                        customBoardStyle={{
                            borderRadius: "4px",
                        }}
                    />
                </div>
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                        <Badge
                            variant="outline"
                            className={`text-xs py-0 ${puzzle.mistake_type === "blunder"
                                ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800"
                                : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
                                }`}
                        >
                            {puzzle.mistake_type || "Blunder"}
                        </Badge>
                        {puzzle.eco && (
                            <span className="text-xs text-muted-foreground">{puzzle.eco}</span>
                        )}
                        {/* LC0 Premium indicator */}
                        {lc0Annotation && (
                            <span className="inline-flex items-center gap-0.5 text-purple-500">
                                <Sparkles className="w-3 h-3" />
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Move {puzzle.move_number || "?"}
                    </p>
                    {/* Baseline theme tags */}
                    {puzzle.theme && puzzle.theme.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {puzzle.theme.slice(0, 3).map((theme) => (
                                <Badge
                                    key={theme}
                                    variant="secondary"
                                    className="text-xs py-0 px-1.5 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
                                >
                                    {theme.replace(/_/g, " ")}
                                </Badge>
                            ))}
                            {puzzle.theme.length > 3 && (
                                <Badge variant="secondary" className="text-xs py-0 px-1.5">
                                    +{puzzle.theme.length - 3}
                                </Badge>
                            )}
                        </div>
                    )}
                    {/* LC0 Premium tags (only shown if premium data available) */}
                    {lc0Annotation && lc0Annotation.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                            {lc0Annotation.tags.slice(0, 2).map((tag) => (
                                <Badge
                                    key={`lc0-${tag}`}
                                    variant="outline"
                                    className={cn(
                                        "text-[10px] py-0 px-1",
                                        LC0_TAG_STYLES[tag] || "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700"
                                    )}
                                >
                                    <Sparkles className="w-2 h-2 mr-0.5" />
                                    {tag.replace(/_/g, " ")}
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <Button size="sm" variant="ghost" className="text-purple-600">
                <Play className="w-4 h-4 mr-1" />
                Practice
            </Button>
        </button>
    );
}

export default function PuzzlesDrawer({
    puzzles,
    open,
    onOpenChange,
    onPuzzleClick,
    premiumLc0,
}: PuzzlesDrawerProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [filterType, setFilterType] = useState<"all" | "blunder" | "mistake">(
        "all"
    );
    const [currentPage, setCurrentPage] = useState(0);
    // LC0 Premium: sort mode (only shown if premium data available)
    const [sortMode, setSortMode] = useState<"baseline" | "lc0">(
        premiumLc0?.puzzle_overlays ? "lc0" : "baseline"
    );

    // Check if premium puzzle data is available
    const hasPremiumPuzzles = !!premiumLc0?.puzzle_overlays;
    const puzzleAnnotations = premiumLc0?.puzzle_overlays?.puzzle_annotations || {};
    const rerankedIds = premiumLc0?.puzzle_overlays?.reranked_puzzle_ids || [];

    // Count by type
    const blunderCount = puzzles.filter((p) => p.mistake_type === "blunder").length;
    const mistakeCount = puzzles.filter((p) => p.mistake_type === "mistake").length;

    // Filter and search puzzles
    const filteredPuzzles = useMemo(() => {
        let result = [...puzzles];

        // Apply LC0 reranking if in LC0 sort mode with premium data
        if (sortMode === "lc0" && hasPremiumPuzzles && rerankedIds.length > 0) {
            // Create a map of puzzle_id to puzzle
            const puzzleMap = new Map(puzzles.map(p => [p.puzzle_id, p]));
            // Reorder based on LC0 ranking
            const reordered: GeneratedPuzzle[] = [];
            for (const id of rerankedIds) {
                const puzzle = puzzleMap.get(id);
                if (puzzle) {
                    reordered.push(puzzle);
                    puzzleMap.delete(id);
                }
            }
            // Add any remaining puzzles not in reranked list
            result = [...reordered, ...Array.from(puzzleMap.values())];
        }

        // Apply type filter
        if (filterType !== "all") {
            result = result.filter((p) => p.mistake_type === filterType);
        }

        // Apply search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(
                (p) =>
                    p.eco?.toLowerCase().includes(term) ||
                    p.theme?.some((t) => t.toLowerCase().includes(term))
            );
        }

        return result;
    }, [puzzles, filterType, searchTerm, sortMode, hasPremiumPuzzles, rerankedIds]);

    // Pagination
    const totalPages = Math.ceil(filteredPuzzles.length / PUZZLES_PER_PAGE);
    const paginatedPuzzles = filteredPuzzles.slice(
        currentPage * PUZZLES_PER_PAGE,
        (currentPage + 1) * PUZZLES_PER_PAGE
    );

    // Reset page when filters change
    const handleFilterChange = (type: "all" | "blunder" | "mistake") => {
        setFilterType(type);
        setCurrentPage(0);
    };

    const handleSearchChange = (value: string) => {
        setSearchTerm(value);
        setCurrentPage(0);
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-xl p-0">
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <SheetHeader className="p-6 pb-4 border-b bg-muted/30">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                                <Puzzle className="w-5 h-5" />
                            </div>
                            <div>
                                <SheetTitle className="text-lg">Practice Puzzles</SheetTitle>
                                <SheetDescription className="flex items-center gap-2 mt-1">
                                    <Badge variant="secondary" className="text-xs">
                                        {filteredPuzzles.length} puzzles
                                    </Badge>
                                    <span className="text-xs">
                                        {blunderCount} blunders • {mistakeCount} mistakes
                                    </span>
                                </SheetDescription>
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="flex flex-col gap-3 mt-4">
                            {/* Type filter tabs */}
                            <Tabs
                                value={filterType}
                                onValueChange={(v) => handleFilterChange(v as any)}
                            >
                                <TabsList className="grid w-full grid-cols-3">
                                    <TabsTrigger value="all">All ({puzzles.length})</TabsTrigger>
                                    <TabsTrigger value="blunder" className="text-red-600">
                                        Blunders ({blunderCount})
                                    </TabsTrigger>
                                    <TabsTrigger value="mistake" className="text-amber-600">
                                        Mistakes ({mistakeCount})
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>

                            {/* Search */}
                            <div className="relative">
                                <Label htmlFor="puzzle-search" id="puzzle-search-label" className="sr-only">
                                    Search puzzles
                                </Label>
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    id="puzzle-search"
                                    aria-labelledby="puzzle-search-label"
                                    placeholder="Search by ECO or theme..."
                                    value={searchTerm}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    className="pl-9 h-9"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => handleSearchChange("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2"
                                        aria-label="Clear search"
                                    >
                                        <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                                    </button>
                                )}
                            </div>

                            {/* LC0 Premium: Sort toggle (only shown with premium data) */}
                            {hasPremiumPuzzles && (
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Sparkles className="w-3 h-3 text-purple-500" />
                                        LC0 Premium Sorting
                                    </span>
                                    <div className="inline-flex items-center rounded-md bg-gray-800/50 p-0.5 border border-gray-700">
                                        <button
                                            onClick={() => setSortMode("baseline")}
                                            className={cn(
                                                "px-2 py-1 text-xs font-medium rounded transition-colors",
                                                sortMode === "baseline"
                                                    ? "bg-gray-700 text-white"
                                                    : "text-gray-400 hover:text-gray-200"
                                            )}
                                        >
                                            Baseline
                                        </button>
                                        <button
                                            onClick={() => setSortMode("lc0")}
                                            className={cn(
                                                "px-2 py-1 text-xs font-medium rounded transition-colors",
                                                sortMode === "lc0"
                                                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
                                                    : "text-gray-400 hover:text-gray-200"
                                            )}
                                        >
                                            LC0 Clarity
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </SheetHeader>

                    {/* Puzzle List */}
                    <ScrollArea className="flex-1 p-4">
                        <div className="space-y-2">
                            {paginatedPuzzles.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    {searchTerm
                                        ? "No puzzles match your search"
                                        : "No puzzles available"}
                                </div>
                            ) : (
                                paginatedPuzzles.map((puzzle, idx) => (
                                    <PuzzleRow
                                        key={puzzle.puzzle_id || idx}
                                        puzzle={puzzle}
                                        onPlay={() => {
                                            onPuzzleClick?.(puzzle);
                                            onOpenChange(false);
                                        }}
                                        lc0Annotation={
                                            hasPremiumPuzzles && puzzle.puzzle_id
                                                ? puzzleAnnotations[puzzle.puzzle_id]
                                                : undefined
                                        }
                                    />
                                ))
                            )}
                        </div>
                    </ScrollArea>

                    {/* Footer with pagination */}
                    <div className="p-4 border-t bg-muted/30">
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between mb-3">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                                    disabled={currentPage === 0}
                                >
                                    <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                                </Button>
                                <span className="text-sm text-muted-foreground">
                                    Page {currentPage + 1} of {totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
                                    }
                                    disabled={currentPage >= totalPages - 1}
                                >
                                    Next <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </div>
                        )}
                        <SheetClose asChild>
                            <Button variant="outline" className="w-full">
                                Close
                            </Button>
                        </SheetClose>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}

"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Sparkles,
    TrendingUp,
    Shield,
    BookOpen,
    Zap,
    ChevronDown,
    ChevronUp,
    Play,
    PuzzleIcon,
    Plus,
} from "lucide-react";
import { Chessboard } from "react-chessboard";
import { Highlight, HighlightType } from "@/types/repertoire";
import { cn } from "@/lib/utils";

interface HighlightsSectionProps {
    highlights: Highlight[];
    onViewGame?: (gameId: string, ply: number) => void;
    onPracticePuzzle?: (puzzleId: string) => void;
    onAddOpening?: (eco: string) => void;
}

// Highlight type configuration
const HIGHLIGHT_CONFIG: Record<
    HighlightType,
    {
        title: string;
        icon: typeof Sparkles;
        colorClass: string;
        bgClass: string;
        borderClass: string;
    }
> = {
    brilliant: {
        title: "Brilliant Move",
        icon: Sparkles,
        colorClass: "text-amber-500",
        bgClass: "bg-amber-500/10",
        borderClass: "border-amber-500/30",
    },
    comeback: {
        title: "Epic Comeback",
        icon: TrendingUp,
        colorClass: "text-emerald-500",
        bgClass: "bg-emerald-500/10",
        borderClass: "border-emerald-500/30",
    },
    save: {
        title: "Defensive Save",
        icon: Shield,
        colorClass: "text-blue-500",
        bgClass: "bg-blue-500/10",
        borderClass: "border-blue-500/30",
    },
    perfect_opening: {
        title: "Perfect Opening",
        icon: BookOpen,
        colorClass: "text-purple-500",
        bgClass: "bg-purple-500/10",
        borderClass: "border-purple-500/30",
    },
    tactical_sequence: {
        title: "Tactical Mastery",
        icon: Zap,
        colorClass: "text-orange-500",
        bgClass: "bg-orange-500/10",
        borderClass: "border-orange-500/30",
    },
};

// Order for grouping highlights
const HIGHLIGHT_ORDER: HighlightType[] = [
    "brilliant",
    "comeback",
    "save",
    "perfect_opening",
    "tactical_sequence",
];

function HighlightCard({
    highlight,
    onViewGame,
    onPracticePuzzle,
    onAddOpening,
}: {
    highlight: Highlight;
    onViewGame?: (gameId: string, ply: number) => void;
    onPracticePuzzle?: (puzzleId: string) => void;
    onAddOpening?: (eco: string) => void;
}) {
    const config = HIGHLIGHT_CONFIG[highlight.type];
    const Icon = config.icon;

    const evalSwingText = useMemo(() => {
        const sign = highlight.cp_change >= 0 ? "+" : "";
        return `${sign}${highlight.cp_change.toFixed(1)} pawns`;
    }, [highlight.cp_change]);

    return (
        <Card
            className={cn(
                "relative overflow-hidden transition-all hover:shadow-md",
                config.borderClass,
                "border-l-4"
            )}
        >
            <CardContent className="p-4">
                <div className="flex gap-4">
                    {/* Board thumbnail */}
                    {highlight.fen_before && (
                        <div className="flex-shrink-0 w-24 h-24 rounded border border-border overflow-hidden">
                            <Chessboard
                                position={highlight.fen_before}
                                boardWidth={96}
                                arePiecesDraggable={false}
                                customBoardStyle={{
                                    borderRadius: "0",
                                }}
                                customDarkSquareStyle={{ backgroundColor: "#779952" }}
                                customLightSquareStyle={{ backgroundColor: "#edeed1" }}
                            />
                        </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-2">
                            <div className={cn("p-1.5 rounded", config.bgClass)}>
                                <Icon className={cn("w-4 h-4", config.colorClass)} />
                            </div>
                            <span className={cn("font-semibold text-sm", config.colorClass)}>
                                {config.title}
                            </span>

                            {highlight.eco && (
                                <Badge variant="outline" className="text-xs">
                                    {highlight.eco}
                                </Badge>
                            )}

                            {highlight.move && (
                                <span className="text-sm font-mono text-muted-foreground">
                                    {highlight.move}
                                </span>
                            )}
                        </div>

                        {/* Eval swing */}
                        {highlight.cp_change !== 0 && (
                            <div className="mb-2">
                                <Badge
                                    variant="secondary"
                                    className={cn(
                                        "text-xs",
                                        highlight.cp_change >= 0
                                            ? "bg-emerald-500/10 text-emerald-600"
                                            : "bg-red-500/10 text-red-600"
                                    )}
                                >
                                    {evalSwingText}
                                </Badge>
                            </div>
                        )}

                        {/* Description */}
                        <p className="text-sm text-muted-foreground line-clamp-2">
                            {highlight.description}
                        </p>

                        {/* Motifs */}
                        {highlight.motifs && highlight.motifs.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {highlight.motifs.slice(0, 3).map((motif) => (
                                    <Badge
                                        key={motif}
                                        variant="outline"
                                        className="text-xs capitalize"
                                    >
                                        {motif.replace("_", " ")}
                                    </Badge>
                                ))}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-wrap gap-2 mt-3">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => onViewGame?.(highlight.game_id, highlight.ply)}
                            >
                                <Play className="w-3 h-3 mr-1" />
                                View Game
                            </Button>

                            {highlight.related_puzzles && highlight.related_puzzles.length > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => onPracticePuzzle?.(highlight.related_puzzles[0])}
                                >
                                    <PuzzleIcon className="w-3 h-3 mr-1" />
                                    Practice Puzzle
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default function HighlightsSection({
    highlights,
    onViewGame,
    onPracticePuzzle,
    onAddOpening,
}: HighlightsSectionProps) {
    const [isOpen, setIsOpen] = useState(true);

    // Group highlights by type in specified order
    const groupedHighlights = useMemo(() => {
        const groups: Record<HighlightType, Highlight[]> = {
            brilliant: [],
            comeback: [],
            save: [],
            perfect_opening: [],
            tactical_sequence: [],
        };

        highlights.forEach((h) => {
            if (h.type in groups) {
                groups[h.type].push(h);
            }
        });

        // Return ordered groups that have highlights
        return HIGHLIGHT_ORDER.filter((type) => groups[type].length > 0).map(
            (type) => ({
                type,
                highlights: groups[type],
                config: HIGHLIGHT_CONFIG[type],
            })
        );
    }, [highlights]);

    // Count total highlights
    const totalCount = highlights.length;

    if (totalCount === 0) {
        return null;
    }

    return (
        <section>
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <Card>
                    <CardHeader className="pb-3">
                        <CollapsibleTrigger asChild>
                            <div className="flex items-center justify-between cursor-pointer">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20">
                                        <Sparkles className="w-5 h-5 text-amber-500" />
                                    </div>
                                    <div>
                                        <CardTitle className="flex items-center gap-2">
                                            Highlight Reel
                                            <Badge variant="secondary" className="text-xs">
                                                {totalCount} {totalCount === 1 ? "highlight" : "highlights"}
                                            </Badge>
                                        </CardTitle>
                                        <p className="text-sm text-muted-foreground mt-0.5">
                                            Your best moments from this analysis
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    aria-label={isOpen ? "Collapse highlights" : "Expand highlights"}
                                >
                                    {isOpen ? (
                                        <ChevronUp className="h-4 w-4" />
                                    ) : (
                                        <ChevronDown className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        </CollapsibleTrigger>
                    </CardHeader>

                    <CollapsibleContent>
                        <CardContent className="pt-0">
                            <div className="space-y-6">
                                {groupedHighlights.map(({ type, highlights: typeHighlights, config }) => (
                                    <div key={type}>
                                        {/* Type header */}
                                        <div className="flex items-center gap-2 mb-3">
                                            <config.icon className={cn("w-4 h-4", config.colorClass)} />
                                            <span className={cn("font-medium text-sm", config.colorClass)}>
                                                {config.title}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                ({typeHighlights.length})
                                            </span>
                                        </div>

                                        {/* Highlight cards grid */}
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            {typeHighlights.map((highlight, idx) => (
                                                <HighlightCard
                                                    key={`${highlight.game_id}-${highlight.ply}-${idx}`}
                                                    highlight={highlight}
                                                    onViewGame={onViewGame}
                                                    onPracticePuzzle={onPracticePuzzle}
                                                    onAddOpening={onAddOpening}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>
        </section>
    );
}

"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle, XCircle, Minus, Info } from "lucide-react";
import { StyleAlignment, PlaystyleProfile } from "@/types/repertoire";
import { cn } from "@/lib/utils";

interface RepertoireFitCardProps {
    playstyle: PlaystyleProfile;
}

export default function RepertoireFitCard({ playstyle }: RepertoireFitCardProps) {
    const { aligned_openings, misaligned_openings, neutral_openings } = playstyle;
    const [selectedColor, setSelectedColor] = useState<"white" | "black">("white");

    // Filter openings by selected color
    const filterByColor = (openings: StyleAlignment[]) => {
        return openings.filter((o) => o.color === selectedColor);
    };

    const filteredAligned = useMemo(() => filterByColor(aligned_openings), [aligned_openings, selectedColor]);
    const filteredMisaligned = useMemo(() => filterByColor(misaligned_openings), [misaligned_openings, selectedColor]);
    const filteredNeutral = useMemo(() => filterByColor(neutral_openings), [neutral_openings, selectedColor]);

    // Don't render if no alignment data
    if (aligned_openings.length === 0 && misaligned_openings.length === 0 && neutral_openings.length === 0) {
        return null;
    }

    return (
        <Card className="mt-4">
            <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    Repertoire Fit
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                                <p className="text-sm">
                                    The alignment score measures how well an opening matches your playing style.
                                    It compares the opening's characteristics (tactical, positional, aggressive, etc.)
                                    against your detected preferences from your games.
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                    How well your openings match your playstyle
                </p>
            </CardHeader>
            <CardContent>
                {/* Color Filter Tabs */}
                <div className="flex items-center gap-2 mb-4">
                    <Tabs value={selectedColor} onValueChange={(v) => setSelectedColor(v as "white" | "black")}>
                        <TabsList className="h-8">
                            <TabsTrigger value="white" className="text-xs px-3 h-7 flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-full bg-white border border-gray-300"></span>
                                White
                            </TabsTrigger>
                            <TabsTrigger value="black" className="text-xs px-3 h-7 flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-full bg-zinc-800"></span>
                                Black
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                <Tabs defaultValue="aligned">
                    <TabsList className="mb-4">
                        <TabsTrigger value="aligned" className="flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                            Aligned ({filteredAligned.length})
                        </TabsTrigger>
                        <TabsTrigger value="misaligned" className="flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                            Misaligned ({filteredMisaligned.length})
                        </TabsTrigger>
                        <TabsTrigger value="neutral" className="flex items-center gap-1.5">
                            <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                            Neutral ({filteredNeutral.length})
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="aligned" className="mt-0">
                        <OpeningList
                            openings={filteredAligned}
                            type="aligned"
                            emptyMessage={`No aligned openings for ${selectedColor}.`}
                        />
                    </TabsContent>

                    <TabsContent value="misaligned" className="mt-0">
                        <OpeningList
                            openings={filteredMisaligned}
                            type="misaligned"
                            emptyMessage={`No misaligned openings for ${selectedColor}. Great!`}
                        />
                    </TabsContent>

                    <TabsContent value="neutral" className="mt-0">
                        <OpeningList
                            openings={filteredNeutral}
                            type="neutral"
                            emptyMessage={`No neutral openings for ${selectedColor}.`}
                        />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}

interface OpeningListProps {
    openings: StyleAlignment[];
    type: "aligned" | "misaligned" | "neutral";
    emptyMessage: string;
}

function OpeningList({ openings, type, emptyMessage }: OpeningListProps) {
    if (openings.length === 0) {
        return (
            <p className="text-sm text-muted-foreground py-4 text-center">
                {emptyMessage}
            </p>
        );
    }

    // Limit to top 8 openings per category
    const displayOpenings = openings.slice(0, 8);
    const hasMore = openings.length > 8;

    return (
        <div className="space-y-2">
            {displayOpenings.map((opening, idx) => (
                <OpeningRow key={`${opening.eco}-${opening.color}-${idx}`} opening={opening} type={type} />
            ))}
            {hasMore && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                    +{openings.length - 8} more openings
                </p>
            )}
        </div>
    );
}

interface OpeningRowProps {
    opening: StyleAlignment;
    type: "aligned" | "misaligned" | "neutral";
}

function OpeningRow({ opening, type }: OpeningRowProps) {
    const scorePercent = Math.round(opening.alignment_score * 100);

    const colorClasses = {
        aligned: "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400",
        misaligned: "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400",
        neutral: "bg-muted border-border text-muted-foreground",
    };

    const barColors = {
        aligned: "bg-green-500",
        misaligned: "bg-red-500",
        neutral: "bg-muted-foreground",
    };

    return (
        <div
            className={cn(
                "flex items-center gap-3 p-3 rounded-lg border",
                colorClasses[type]
            )}
        >
            {/* ECO Badge */}
            <Badge variant="outline" className="font-mono text-xs shrink-0">
                {opening.eco}
            </Badge>

            {/* Opening name and color */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{opening.opening_name}</span>
                    <span className="text-xs text-muted-foreground">as {opening.color}</span>
                </div>

                {/* Style tags */}
                {opening.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {opening.tags.map((tag) => (
                            <span
                                key={tag}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-background/50 text-muted-foreground"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Alignment score bar */}
            <div className="w-24 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                        <div
                            className={cn("h-full rounded-full transition-all", barColors[type])}
                            style={{ width: `${scorePercent}%` }}
                        />
                    </div>
                    <span className="text-xs font-medium w-8 text-right">{scorePercent}%</span>
                </div>
            </div>
        </div>
    );
}

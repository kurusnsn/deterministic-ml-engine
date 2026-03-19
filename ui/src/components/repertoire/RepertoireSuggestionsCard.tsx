"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, Plus, BookOpen, Info } from "lucide-react";
import { OpeningSuggestion, PlaystyleProfile } from "@/types/repertoire";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface RepertoireSuggestionsCardProps {
    playstyle: PlaystyleProfile;
    existingWhiteEcos?: string[];
    existingBlackEcos?: string[];
    onAddOpening?: (eco: string, name: string, color: "white" | "black") => void;
}

export default function RepertoireSuggestionsCard({
    playstyle,
    existingWhiteEcos,
    existingBlackEcos,
    onAddOpening,
}: RepertoireSuggestionsCardProps) {
    // Generate suggestions client-side based on playstyle
    // Use useMemo to avoid recalculating on every render, only when inputs change
    const whiteSuggestions = useMemo(() => {
        return generateSuggestionsForStyle(playstyle.white, "white", existingWhiteEcos ?? []);
    }, [playstyle.white, existingWhiteEcos]);

    const blackSuggestions = useMemo(() => {
        return generateSuggestionsForStyle(playstyle.black, "black", existingBlackEcos ?? []);
    }, [playstyle.black, existingBlackEcos]);

    if (whiteSuggestions.length === 0 && blackSuggestions.length === 0) {
        return null;
    }

    return (
        <Card className="mt-4">
            <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Style-Based Suggestions
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                                <p className="text-sm">
                                    The match score shows how well an opening fits your playstyle.
                                    Higher percentages mean the opening's characteristics (tactical, aggressive, etc.)
                                    closely match your detected playing preferences.
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                    Openings that match your playstyle
                </p>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="white">
                    <TabsList className="mb-4">
                        <TabsTrigger value="white" className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full bg-white border"></span>
                            White ({whiteSuggestions.length})
                        </TabsTrigger>
                        <TabsTrigger value="black" className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full bg-zinc-800"></span>
                            Black ({blackSuggestions.length})
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="white" className="mt-0">
                        <SuggestionList
                            suggestions={whiteSuggestions}
                            onAddOpening={onAddOpening}
                        />
                    </TabsContent>

                    <TabsContent value="black" className="mt-0">
                        <SuggestionList
                            suggestions={blackSuggestions}
                            onAddOpening={onAddOpening}
                        />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}

interface SuggestionListProps {
    suggestions: OpeningSuggestion[];
    onAddOpening?: (eco: string, name: string, color: "white" | "black") => void;
}

function SuggestionList({ suggestions, onAddOpening }: SuggestionListProps) {
    if (suggestions.length === 0) {
        return (
            <p className="text-sm text-muted-foreground py-4 text-center">
                No new suggestions available.
            </p>
        );
    }

    return (
        <div className="space-y-3">
            {suggestions.map((suggestion) => (
                <SuggestionRow
                    key={`${suggestion.eco}-${suggestion.color}`}
                    suggestion={suggestion}
                    onAdd={onAddOpening}
                />
            ))}
        </div>
    );
}

interface SuggestionRowProps {
    suggestion: OpeningSuggestion;
    onAdd?: (eco: string, name: string, color: "white" | "black") => void;
}

function SuggestionRow({ suggestion, onAdd }: SuggestionRowProps) {
    const matchPercent = Math.round(suggestion.match_score * 100);

    return (
        <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
            {/* ECO Badge */}
            <Badge variant="outline" className="font-mono text-xs shrink-0 mt-0.5">
                {suggestion.eco}
            </Badge>

            {/* Opening info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{suggestion.name}</span>
                </div>

                {/* Reason */}
                <p className="text-xs text-muted-foreground mt-1">
                    {suggestion.reason}
                </p>

                {/* Style tags */}
                {suggestion.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {suggestion.tags.map((tag) => (
                            <span
                                key={tag}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Match score and actions */}
            <div className="shrink-0 flex flex-col items-end gap-2">
                <div className="flex items-center gap-1.5">
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full bg-amber-500 rounded-full"
                            style={{ width: `${matchPercent}%` }}
                        />
                    </div>
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400 w-10 text-right">
                        {matchPercent}%
                    </span>
                </div>

                <div className="flex gap-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                            window.location.href = `/practice/repertoire`
                        }
                    >
                        <BookOpen className="w-3 h-3 mr-1" />
                        Practice
                    </Button>

                    {onAdd && (
                        <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 px-2 text-xs"
                            onClick={() =>
                                onAdd(suggestion.eco, suggestion.name, suggestion.color)
                            }
                        >
                            <Plus className="w-3 h-3 mr-1" />
                            Add
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

// Client-side suggestion generation (mirrors backend logic)
interface StyleScore {
    tactical: number;
    positional: number;
    aggressive: number;
    defensive: number;
    open_positions: number;
    closed_positions: number;
}

// Subset of openings with known style tags
// Each opening is tagged with which color plays it (white = 1.e4/1.d4 systems, black = defenses)
const OPENING_DATABASE: Array<{
    eco: string;
    name: string;
    tags: string[];
    forColor: "white" | "black";
}> = [
        // ========== WHITE OPENINGS (1.e4/1.d4 systems) ==========
        // Tactical aggressive openings for White
        { eco: "C51", name: "Evans Gambit", tags: ["open", "tactical", "aggressive"], forColor: "white" },
        { eco: "C30", name: "King's Gambit", tags: ["open", "tactical", "aggressive"], forColor: "white" },
        { eco: "C54", name: "Italian: Giuoco Piano", tags: ["open", "tactical"], forColor: "white" },
        { eco: "C45", name: "Scotch Game", tags: ["open", "tactical"], forColor: "white" },
        { eco: "C60", name: "Ruy Lopez", tags: ["open", "positional"], forColor: "white" },
        { eco: "B52", name: "Sicilian: Moscow Variation", tags: ["open", "tactical"], forColor: "white" },
        { eco: "B31", name: "Sicilian: Rossolimo", tags: ["open", "positional"], forColor: "white" },

        // Positional openings for White
        { eco: "E00", name: "Catalan Opening", tags: ["closed", "positional"], forColor: "white" },
        { eco: "A10", name: "English Opening", tags: ["positional"], forColor: "white" },
        { eco: "D00", name: "London System", tags: ["closed", "positional", "defensive"], forColor: "white" },
        { eco: "A01", name: "Larsen's Opening", tags: ["positional"], forColor: "white" },
        { eco: "D30", name: "Queen's Gambit", tags: ["closed", "positional"], forColor: "white" },

        // ========== BLACK OPENINGS (Defenses) ==========
        // Tactical aggressive defenses
        { eco: "B70", name: "Sicilian: Dragon Variation", tags: ["open", "tactical", "aggressive"], forColor: "black" },
        { eco: "B90", name: "Sicilian: Najdorf Variation", tags: ["open", "tactical", "aggressive"], forColor: "black" },
        { eco: "B33", name: "Sicilian: Sveshnikov Variation", tags: ["open", "tactical", "aggressive"], forColor: "black" },
        { eco: "C89", name: "Ruy Lopez: Marshall Attack", tags: ["open", "tactical", "aggressive"], forColor: "black" },
        { eco: "D70", name: "Grünfeld Defense", tags: ["open", "tactical", "aggressive"], forColor: "black" },
        { eco: "E97", name: "King's Indian: Mar del Plata", tags: ["closed", "tactical", "aggressive"], forColor: "black" },

        // Positional/solid defenses
        { eco: "C65", name: "Ruy Lopez: Berlin Defense", tags: ["open", "positional", "defensive"], forColor: "black" },
        { eco: "D37", name: "Queen's Gambit Declined: Classical", tags: ["closed", "positional"], forColor: "black" },
        { eco: "E46", name: "Nimzo-Indian: Rubinstein", tags: ["closed", "positional"], forColor: "black" },
        { eco: "C00", name: "French Defense", tags: ["closed", "positional", "defensive"], forColor: "black" },
        { eco: "B10", name: "Caro-Kann Defense", tags: ["closed", "positional", "defensive"], forColor: "black" },
        { eco: "C42", name: "Petroff Defense", tags: ["open", "positional", "defensive"], forColor: "black" },
        { eco: "D10", name: "Slav Defense", tags: ["closed", "positional", "defensive"], forColor: "black" },
        { eco: "A93", name: "Dutch: Stonewall Variation", tags: ["closed", "positional", "defensive"], forColor: "black" },
    ];

function generateSuggestionsForStyle(
    style: StyleScore,
    color: "white" | "black",
    existingEcos: string[]
): OpeningSuggestion[] {
    const existing = new Set(existingEcos);
    const suggestions: OpeningSuggestion[] = [];

    const userVector = [
        style.tactical,
        style.positional,
        style.aggressive,
        style.defensive,
        style.open_positions,
        style.closed_positions,
    ];

    for (const opening of OPENING_DATABASE) {
        // Only suggest openings that can be played with the requested color
        if (opening.forColor !== color) continue;
        if (existing.has(opening.eco)) continue;

        const openingVector = [
            opening.tags.includes("tactical") ? 1 : 0,
            opening.tags.includes("positional") ? 1 : 0,
            opening.tags.includes("aggressive") ? 1 : 0,
            opening.tags.includes("defensive") ? 1 : 0,
            opening.tags.includes("open") ? 1 : 0,
            opening.tags.includes("closed") ? 1 : 0,
        ];

        const matchScore = cosineSimilarity(userVector, openingVector);

        // Generate reason
        const matchingTraits: string[] = [];
        if (style.tactical > 0.5 && opening.tags.includes("tactical")) matchingTraits.push("tactical");
        if (style.positional > 0.5 && opening.tags.includes("positional")) matchingTraits.push("positional");
        if (style.aggressive > 0.5 && opening.tags.includes("aggressive")) matchingTraits.push("aggressive");
        if (style.defensive > 0.5 && opening.tags.includes("defensive")) matchingTraits.push("defensive");
        if (style.open_positions > 0.5 && opening.tags.includes("open")) matchingTraits.push("open positions");
        if (style.closed_positions > 0.5 && opening.tags.includes("closed")) matchingTraits.push("closed positions");

        const reason = matchingTraits.length > 0
            ? `Matches your ${matchingTraits.join(", ")} style`
            : "May complement your existing repertoire";

        suggestions.push({
            eco: opening.eco,
            name: opening.name,
            color,
            match_score: matchScore,
            tags: opening.tags,
            reason,
        });
    }

    // Sort by match score and return top 5
    suggestions.sort((a, b) => b.match_score - a.match_score);
    return suggestions.slice(0, 5);
}

function cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    if (magnitudeA === 0 || magnitudeB === 0) return 0.5;
    return dotProduct / (magnitudeA * magnitudeB);
}

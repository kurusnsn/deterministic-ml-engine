"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Circle, Trophy } from "lucide-react";
import ProgressBar from "./ProgressBar";
import { cn } from "@/lib/utils";
import { ForcingLine } from "@/types/openings";
import { PositionEvaluationBubble } from "./PositionEvaluationBubble";
import { Affordance } from "@/hooks/useNonLLMCommentaryOverlay";

interface LineListPanelProps {
    lines: ForcingLine[];
    currentLineId: string | null;
    completedLines: Record<string, boolean>;
    onSelectLine: (line: ForcingLine) => void;
    isPlaying?: boolean;
    openingName: string;
    currentLineTitle: string;
    fen?: string;
    plyCount?: number;
    moveSan?: string;
    orientation?: "white" | "black";
    onDrawAffordance?: (affordance: Affordance | null) => void;
}

export default function LineListPanel({
    lines,
    currentLineId,
    completedLines,
    onSelectLine,
    isPlaying = false,
    openingName,
    currentLineTitle,
    fen,
    plyCount = 0,
    moveSan,
    orientation = "white",
    onDrawAffordance,
}: LineListPanelProps) {
    const completedCount = Object.values(completedLines).filter(Boolean).length;
    const progress = lines.length > 0 ? (completedCount / lines.length) * 100 : 0;

    // Compute the Select value by finding the index of the current line
    const currentLineIndex = currentLineId
        ? lines.findIndex(line => line.id === currentLineId)
        : -1;
    const currentSelectValue = currentLineIndex >= 0
        ? `${lines[currentLineIndex].id}-${currentLineIndex}`
        : undefined;
    const handleLineChange = (value: string) => {
        // Value format is `${line.id}-${index}` - extract the index from the end
        const lastDashIndex = value.lastIndexOf('-');
        const indexStr = value.substring(lastDashIndex + 1);
        const index = parseInt(indexStr, 10);

        if (!isNaN(index) && index >= 0 && index < lines.length) {
            onSelectLine(lines[index]);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b space-y-2">
                <div className="text-center space-y-1">
                    <p className="text-sm uppercase tracking-wide text-muted-foreground">Training Line</p>
                    <h2 className="text-xl font-semibold">{currentLineTitle}</h2>
                </div>
                <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Choose line</p>
                    <Select value={currentSelectValue} onValueChange={handleLineChange}>
                        <SelectTrigger size="sm" className="w-full">
                            <SelectValue placeholder="Select a line" />
                        </SelectTrigger>
                        <SelectContent>
                            {lines.map((line, index) => (
                                <SelectItem key={`${line.id}-${index}`} value={`${line.id}-${index}`}>
                                    #{index + 1} {line.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-2 font-semibold text-lg">
                        <Trophy className="w-5 h-5 text-foreground" />
                        <span>Training Progress</span>
                    </div>
                </div>
                <ProgressBar value={progress} label="Lines Mastered" />
            </div>

            <ScrollArea className="flex-1">
                {plyCount > 0 ? (
                    <div className="p-4 space-y-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground pb-1">
                            <div className="w-2 h-2 rounded-full bg-foreground animate-pulse" />
                            <span>Commentary</span>
                        </div>
                        {fen ? (
                            <PositionEvaluationBubble
                                fen={fen}
                                plyCount={plyCount}
                                moveSan={moveSan}
                                onDrawAffordance={onDrawAffordance}
                            />
                        ) : (
                            <div className="space-y-2 text-sm text-muted-foreground">
                                <p className="italic text-xs">Waiting for first move...</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="p-2 space-y-1">
                        {lines.map((line, index) => {
                            const isCompleted = completedLines[line.id];
                            const isActive = currentLineId === line.id;

                            return (
                                <Button
                                    key={`${line.id}-${index}`}
                                    variant="ghost"
                                    className={cn(
                                        "w-full justify-start h-auto py-3 px-3",
                                        isActive && "bg-accent text-accent-foreground"
                                    )}
                                    onClick={() => onSelectLine(line)}
                                >
                                    <div className="flex items-start gap-3 w-full">
                                        <div className="mt-0.5 shrink-0">
                                            {isCompleted ? (
                                                <CheckCircle2 className="w-5 h-5 text-foreground" />
                                            ) : (
                                                <Circle className="w-5 h-5 text-muted-foreground" />
                                            )}
                                        </div>
                                        <div className="flex flex-col items-start gap-1 overflow-hidden flex-1">
                                            <span className="font-medium w-full text-left whitespace-normal">
                                                {line.name}
                                            </span>
                                            {line.description && (
                                                <span className="text-xs text-muted-foreground w-full text-left font-normal whitespace-normal">
                                                    {line.description}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </Button>
                            );
                        })}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}

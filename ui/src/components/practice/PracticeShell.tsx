"use client";

import React, { useState, useEffect, useRef } from "react";
import PracticeBoard from "@/components/practice/PracticeBoard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listRepertoires, createRepertoire, appendToRepertoire, Repertoire } from "@/components/practice/repertoireStore";
import { Save, ChevronsLeft, SkipBack, SkipForward, ChevronsRight, RotateCw, RotateCcw, Lightbulb } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePracticeContext, PracticeProvider, Mode } from "./PracticeContext";

interface PracticeShellProps {
    mode: Mode;
    children: React.ReactNode;
}

type TrainingControlsState = {
    isTrainingMode: boolean;
    showRetry: boolean;
    hintsEnabled: boolean;
    canHint: boolean;
};

function PracticeShellInner({ children }: { children: React.ReactNode }) {
    const {
        mode,
        active,
        setActive,
        setStatusText,
        selectedRep,
        tempTrainingData,
        maiaSide,
        maiaTime,
        maiaLevel,
        maiaOpening,
        maiaSpeed,
        maiaTemperature,
        boardSize,
        setBoardSize,
        handleTimerUpdate,
        handleProgressChange,
        boardRef,
        mounted,
        isDesktop,
    } = usePracticeContext();

    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [saveMode, setSaveMode] = useState<"new" | "existing">("new");
    const [newRepName, setNewRepName] = useState("");
    const [selectedRepId, setSelectedRepId] = useState("");
    const [savedRepertoires, setSavedRepertoires] = useState<Repertoire[]>([]);
    const [desktopLayoutHeight, setDesktopLayoutHeight] = useState<number>(0);
    const [trainingControls, setTrainingControls] = useState<TrainingControlsState>({
        isTrainingMode: false,
        showRetry: false,
        hintsEnabled: false,
        canHint: false,
    });
    const layoutRef = useRef<HTMLDivElement | null>(null);

    // Load saved repertoires for the save dialog
    useEffect(() => {
        if (showSaveDialog) {
            setSavedRepertoires(listRepertoires());
        }
    }, [showSaveDialog]);

    useEffect(() => {
        if (!mounted || !isDesktop) {
            setDesktopLayoutHeight(0);
            return;
        }

        const recalculateLayoutHeight = () => {
            if (!layoutRef.current) return;
            const availableHeight = Math.max(320, Math.floor(layoutRef.current.clientHeight));
            setDesktopLayoutHeight(availableHeight);
        };

        recalculateLayoutHeight();
        window.addEventListener("resize", recalculateLayoutHeight);
        return () => window.removeEventListener("resize", recalculateLayoutHeight);
    }, [mounted, isDesktop]);

    const handleSavePracticeSession = () => {
        if (!tempTrainingData) return;

        if (saveMode === "new") {
            if (!newRepName.trim()) return;
            createRepertoire({
                name: newRepName.trim(),
                side: tempTrainingData.side,
                lines: tempTrainingData.lines,
                openings: tempTrainingData.openings
            });
            setStatusText(`Saved as new repertoire: ${newRepName}`);
        } else {
            if (!selectedRepId) return;
            appendToRepertoire(selectedRepId, tempTrainingData.lines, tempTrainingData.openings);
            const rep = savedRepertoires.find(r => r.id === selectedRepId);
            setStatusText(`Added to repertoire: ${rep?.name}`);
        }

        setShowSaveDialog(false);
        setNewRepName("");
        setSelectedRepId("");
    };

    return (
        <div className="flex flex-col min-h-screen lg:h-[calc(100dvh-3.5rem)] p-4 md:p-6 lg:p-8 bg-background overflow-y-auto lg:overflow-hidden">
            {/* Save Practice Session Dialog */}
            {showSaveDialog && tempTrainingData && (
                <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                    <DialogContent className="max-w-md bg-card border-0 shadow-xl [&>button]:hidden">
                        <DialogHeader>
                            <DialogTitle>Save Practice Session</DialogTitle>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="practice-save-mode" id="practice-save-mode-label" className="text-sm font-medium mb-2 block">
                                    Save as:
                                </Label>
                                <Select value={saveMode} onValueChange={(v) => setSaveMode(v as "new" | "existing")}>
                                    <SelectTrigger id="practice-save-mode" aria-labelledby="practice-save-mode-label">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="new">New Repertoire</SelectItem>
                                        <SelectItem value="existing">Add to Existing</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {saveMode === "new" ? (
                                <div>
                                    <Label htmlFor="practice-new-rep-name" id="practice-new-rep-name-label" className="text-sm font-medium mb-2 block">
                                        Repertoire Name:
                                    </Label>
                                    <Input
                                        id="practice-new-rep-name"
                                        aria-labelledby="practice-new-rep-name-label"
                                        value={newRepName}
                                        onChange={(e) => setNewRepName(e.target.value)}
                                        placeholder="e.g., My Practice Session"
                                    />
                                </div>
                            ) : (
                                <div>
                                    <Label htmlFor="practice-existing-rep" id="practice-existing-rep-label" className="text-sm font-medium mb-2 block">
                                        Select Repertoire:
                                    </Label>
                                    <Select value={selectedRepId} onValueChange={setSelectedRepId}>
                                        <SelectTrigger id="practice-existing-rep" aria-labelledby="practice-existing-rep-label">
                                            <SelectValue placeholder="Choose repertoire..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {savedRepertoires.map((rep) => (
                                                <SelectItem key={rep.id} value={rep.id}>
                                                    {rep.name} ({rep.lines.length} lines)
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            <div className="text-xs text-muted-foreground">
                                {tempTrainingData.openings.length} openings, {tempTrainingData.lines.length} lines
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    onClick={handleSavePracticeSession}
                                    disabled={
                                        (saveMode === "new" && !newRepName.trim()) ||
                                        (saveMode === "existing" && !selectedRepId)
                                    }
                                    className="flex-1"
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    Save
                                </Button>
                                <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* Main content */}
            <div
                ref={layoutRef}
                className="w-full mx-auto flex flex-col lg:flex-row lg:items-stretch lg:justify-center gap-5 flex-1 min-h-0"
            >
                <div className="w-full lg:w-auto lg:h-full lg:flex lg:items-center">
                    <PracticeBoard
                        ref={boardRef}
                        mode={mode}
                        active={active}
                        onActiveChange={setActive}
                        onStatusChange={setStatusText}
                        trainingLines={tempTrainingData?.lines || selectedRep?.lines}
                        repertoireSide={tempTrainingData?.side || selectedRep?.side}
                        openingNames={tempTrainingData?.openings?.map(o => o.name) || selectedRep?.openings?.map(o => o.name)}
                        maiaSide={maiaSide}
                        maiaTimeControl={maiaTime}
                        maiaLevel={maiaLevel}
                        maiaOpening={maiaOpening}
                        maiaSpeed={maiaSpeed}
                        maiaTemperature={maiaTemperature}
                        onBoardSizeChange={setBoardSize}
                        onTimerUpdate={handleTimerUpdate}
                        onProgressChange={handleProgressChange}
                        desktopMaxHeight={mounted && isDesktop && desktopLayoutHeight > 0 ? desktopLayoutHeight : undefined}
                        onTrainingControlsChange={setTrainingControls}
                    />
                </div>
                <div className="relative w-full lg:w-auto flex flex-col" style={{
                    width: mounted && isDesktop ? boardSize / 1.46 : undefined,
                    height: mounted && isDesktop && desktopLayoutHeight > 0 ? desktopLayoutHeight : undefined
                }}>

                    <div className="bg-card rounded-lg shadow-sm border flex-1 w-full lg:w-auto overflow-hidden flex flex-col">
                        {/* Save button for temporary training sessions */}
                        {active && tempTrainingData && (
                            <div className="p-3 border-b bg-neutral-50 dark:bg-neutral-900">
                                <Button
                                    onClick={() => setShowSaveDialog(true)}
                                    size="sm"
                                    variant="outline"
                                    className="w-full"
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    Save This Practice Session
                                </Button>
                            </div>
                        )}
                        {trainingControls.isTrainingMode && (
                            <div className="p-3 border-b bg-muted/30">
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        onClick={() => boardRef.current?.retryMove()}
                                        disabled={!trainingControls.showRetry}
                                        size="sm"
                                        variant="outline"
                                        className="w-full"
                                    >
                                        <RotateCcw className="w-4 h-4 mr-2" />
                                        Retry
                                    </Button>
                                    <Button
                                        onClick={() => boardRef.current?.toggleHint()}
                                        disabled={!trainingControls.canHint}
                                        size="sm"
                                        variant="outline"
                                        className="w-full"
                                    >
                                        <Lightbulb className="w-4 h-4 mr-2" />
                                        {trainingControls.hintsEnabled ? "Solve" : "Hint"}
                                    </Button>
                                </div>
                            </div>
                        )}
                        {children}
                        <div className="border-t p-2 bg-card">
                            <TooltipProvider>
                                <div className="flex gap-2">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                onClick={() => boardRef.current?.goToStart()}
                                                size="icon"
                                                variant="outline"
                                                className="flex-1"
                                                aria-label="Go to start"
                                            >
                                                <ChevronsLeft className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Go to Start</TooltipContent>
                                    </Tooltip>

                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                onClick={() => boardRef.current?.goToPreviousMove()}
                                                size="icon"
                                                variant="outline"
                                                className="flex-1"
                                                aria-label="Previous move"
                                            >
                                                <SkipBack className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Previous Move</TooltipContent>
                                    </Tooltip>

                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                onClick={() => boardRef.current?.goToNextMove()}
                                                size="icon"
                                                variant="outline"
                                                className="flex-1"
                                                aria-label="Next move"
                                            >
                                                <SkipForward className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Next Move</TooltipContent>
                                    </Tooltip>

                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                onClick={() => boardRef.current?.goToEnd()}
                                                size="icon"
                                                variant="outline"
                                                className="flex-1"
                                                aria-label="Go to end"
                                            >
                                                <ChevronsRight className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Go to End</TooltipContent>
                                    </Tooltip>

                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                onClick={() => boardRef.current?.flipBoard()}
                                                size="icon"
                                                variant="outline"
                                                className="flex-1"
                                                aria-label="Flip board"
                                            >
                                                <RotateCw className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Flip Board</TooltipContent>
                                    </Tooltip>
                                </div>
                            </TooltipProvider>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function PracticeShell({ mode, children }: PracticeShellProps) {
    return (
        <PracticeProvider initialMode={mode}>
            <PracticeShellInner>{children}</PracticeShellInner>
        </PracticeProvider>
    );
}

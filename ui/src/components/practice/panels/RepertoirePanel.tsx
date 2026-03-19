"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useSavedRepertoires } from "@/hooks/useRepertoires";
import { SavedRepertoire } from "@/types/repertoire";
import { usePracticeContext } from "../PracticeContext";
import type { Repertoire } from "../repertoireStore";
import Link from "next/link";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="mb-3">
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            {children}
        </div>
    );
}

function ActivePracticePanel({ onStop }: { onStop: () => void }) {
    const { progress, title, mode } = usePracticeContext();

    const current = progress?.current || 0;
    const total = progress?.total || 1; // avoid div by 0
    const percent = Math.round((current / total) * 100);
    const left = total - current;

    return (
        <div className="h-full flex flex-col bg-card">
            <div className="p-4 border-b bg-muted/30">
                <h2 className="font-semibold text-foreground text-lg mb-1">
                    {title || (mode === "repertoire" ? "Repertoire Practice" : "Selected Openings")}
                </h2>
                <div className="text-sm text-muted-foreground">
                    Practice in progress
                </div>
            </div>

            <div className="p-6 flex-1 flex flex-col gap-6">
                <div className="bg-muted border border-border rounded-xl p-6 text-center">
                    <div className="text-4xl font-bold text-foreground mb-1">{left}</div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Openings Left</div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium text-foreground">
                        <span>Progress</span>
                        <span>{percent}%</span>
                    </div>
                    <Progress value={percent} className="h-3" />
                    <div className="text-xs text-muted-foreground text-center mt-1">
                        {current} of {total} completed
                    </div>
                </div>

                <div className="mt-auto">
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={onStop}
                    >
                        Stop Practice
                    </Button>
                </div>
            </div>
        </div>
    );
}

function RepertoirePanelConfig({ onStart }: { onStart: (rep: Repertoire) => void }) {
    const { data: savedRepertoires, isLoading, error } = useSavedRepertoires();
    const [sel, setSel] = useState<string>("");
    const [fetchingLines, setFetchingLines] = useState(false);

    const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "/api/gateway";

    // Helper to fetch mainline for a single opening
    async function fetchMainline(eco: string, name: string): Promise<string[] | null> {
        try {
            let res = await fetch(`${GATEWAY_URL}/eco/mainline`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ eco, name }),
            });
            if (!res.ok) {
                res = await fetch(`/eco/mainline`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ eco, name }),
                });
            }
            if (!res.ok) return null;
            const data = await res.json();
            return Array.isArray(data.san) ? data.san : null;
        } catch {
            return null;
        }
    }

    // Convert SavedRepertoire to practice Repertoire format
    async function convertToRepertoire(saved: SavedRepertoire): Promise<Repertoire> {
        const lines: string[][] = [];

        // Fetch mainlines for each opening
        for (const opening of saved.openings) {
            const mainline = await fetchMainline(opening.eco, opening.name);
            if (mainline && mainline.length > 0) {
                lines.push(mainline);
            }
        }

        return {
            id: saved.id,
            name: saved.name,
            side: saved.color === "both" ? "white" : saved.color,
            lines,
            createdAt: new Date(saved.created_at).getTime(),
            openings: saved.openings.map(o => ({ eco: o.eco, name: o.name })),
        };
    }

    async function handleStartTraining() {
        if (!sel || !savedRepertoires) return;

        const selected = savedRepertoires.find((r) => r.id === sel);
        if (!selected) return;

        setFetchingLines(true);
        try {
            const repertoire = await convertToRepertoire(selected);
            onStart(repertoire);
        } catch (err) {
            console.error("Failed to fetch repertoire lines:", err);
        } finally {
            setFetchingLines(false);
        }
    }

    if (isLoading) {
        return (
            <div className="text-sm text-muted-foreground">
                Loading repertoires...
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-sm text-red-600">
                Error loading repertoires: {error instanceof Error ? error.message : "Unknown error"}
            </div>
        );
    }

    if (!savedRepertoires || savedRepertoires.length === 0) {
        return (
            <div className="text-sm text-muted-foreground">
                No repertoires saved. Save a repertoire from the {" "}
                <Link href="/reports" className="font-medium text-primary hover:underline">
                    Reports page
                </Link>
                {" "} to practice it here.
            </div>
        );
    }

    return (
        <div>
            <Row label="Repertoire">
                <Select value={sel} onValueChange={setSel}>
                    <SelectTrigger size="sm">
                        <SelectValue placeholder="Select repertoire…" />
                    </SelectTrigger>
                    <SelectContent>
                        {savedRepertoires.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                                {r.name} ({r.openings.length} opening{r.openings.length !== 1 ? "s" : ""})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Row>
            <Button
                onClick={handleStartTraining}
                disabled={!sel || fetchingLines}
                className="w-full mt-2"
                size="sm"
            >
                {fetchingLines ? "Loading..." : "Start Training"}
            </Button>
        </div>
    );
}

export function RepertoirePanel() {
    const { active, setActive, onStartRepertoire, onModeChange, mode } = usePracticeContext();

    // Show active panel during practice
    if (active && mode === "repertoire") {
        return (
            <ActivePracticePanel
                onStop={() => {
                    setActive(false);
                    onModeChange(mode);
                }}
            />
        );
    }

    return (
        <div className="h-full flex flex-col bg-card rounded-lg border shadow-sm overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-semibold mb-1">Practice Repertoire</h3>
                        <p className="text-sm text-muted-foreground">
                            Train your saved opening repertoires.
                        </p>
                    </div>
                    <RepertoirePanelConfig onStart={onStartRepertoire} />
                </div>
            </div>
        </div>
    );
}

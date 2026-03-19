"use client";

import React, { useState, useEffect, useRef } from "react";
import { Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { createRepertoire } from "../repertoireStore";
import { usePracticeContext } from "../PracticeContext";

function Row({
    label,
    labelFor,
    children,
}: {
    label: string;
    labelFor?: string;
    children: React.ReactNode;
}) {
    const labelId = labelFor ? `${labelFor}-label` : undefined;

    return (
        <div className="mb-3">
            {labelFor ? (
                <Label
                    htmlFor={labelFor}
                    id={labelId}
                    className="text-xs text-muted-foreground mb-1 block font-normal"
                >
                    {label}
                </Label>
            ) : (
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
            )}
            {children}
        </div>
    );
}

function ActivePracticePanel({ onStop }: { onStop: () => void }) {
    const { progress, title, mode } = usePracticeContext();

    const current = progress?.current || 0;
    const total = progress?.total || 1;
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
                <div className="bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 text-center">
                    <div className="text-4xl font-bold text-foreground mb-1">{left}</div>
                    <div className="text-xs font-medium text-foreground uppercase tracking-wide">Openings Left</div>
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
                        className="w-full border-neutral-300 dark:border-neutral-700 bg-neutral-900 dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200"
                        onClick={onStop}
                    >
                        Stop Practice
                    </Button>
                </div>
            </div>
        </div>
    );
}

type Opening = { eco?: string; name: string; san?: string[] };

function CustomPanelConfig({ onStart, preselectedEco }: { onStart: (data: { lines: string[][]; side: "white" | "black"; openings: { eco?: string; name: string }[] }) => void; preselectedEco?: string }) {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [allOpenings, setAllOpenings] = useState<Opening[]>([]);
    const [results, setResults] = useState<Opening[]>([]);
    const [selected, setSelected] = useState<Opening[]>([]);
    const [autoSelected, setAutoSelected] = useState(false);
    const [repName, setRepName] = useState("");
    const [side, setSide] = useState<"white" | "black">("white");
    const [savedMsg, setSavedMsg] = useState<string | null>(null);
    const [showResults, setShowResults] = useState(false);
    const searchContainerRef = useRef<HTMLDivElement>(null);

    const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "/api/gateway";

    // Load cached openings index
    useEffect(() => {
        const KEY = "eco.openings.index.v1";
        const now = Date.now();
        const TTL = 24 * 60 * 60 * 1000; // 24h
        const cached = (() => {
            try {
                const raw = localStorage.getItem(KEY);
                return raw ? JSON.parse(raw) : null;
            } catch {
                return null;
            }
        })();

        async function fetchIndex() {
            setLoading(true);
            setError(null);
            try {
                let res = await fetch(`${GATEWAY_URL}/eco/openings?max_moves=16`);
                if (!res.ok) {
                    res = await fetch(`/eco/openings?max_moves=16`);
                }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const openings: Opening[] = Array.isArray(data.openings) ? data.openings : [];
                setAllOpenings(openings);
                localStorage.setItem(KEY, JSON.stringify({ ts: now, openings }));
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed to load openings index");
            } finally {
                setLoading(false);
            }
        }

        if (cached && cached.ts && (now - cached.ts) < TTL && Array.isArray(cached.openings)) {
            setAllOpenings(cached.openings);
        } else {
            fetchIndex();
        }
    }, [GATEWAY_URL]);

    // Auto-select opening from ECO query param
    useEffect(() => {
        if (!preselectedEco || autoSelected || allOpenings.length === 0) return;
        const match = allOpenings.find(o => o.eco?.toUpperCase() === preselectedEco.toUpperCase());
        if (match) {
            setSelected([match]);
            setAutoSelected(true);
        }
    }, [preselectedEco, allOpenings, autoSelected]);

    useEffect(() => {
        const q = query.trim().toLowerCase();
        if (!q) {
            setResults(allOpenings);
            return;
        }
        const filtered = allOpenings.filter(o => o.name.toLowerCase().includes(q));
        setResults(filtered.slice(0, 500));
    }, [query, allOpenings]);

    // Click outside handler
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    function addOpening(o: { eco?: string; name: string }) {
        if (selected.find((x) => x.name === o.name)) return;
        setSelected((s) => [...s, o]);
    }

    function removeOpening(name: string) {
        setSelected((s) => s.filter((x) => x.name !== name));
    }

    async function fetchMainline(o: Opening): Promise<string[] | null> {
        try {
            let res = await fetch(`${GATEWAY_URL}/eco/mainline`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ eco: o.eco || undefined, name: o.name }),
            });
            if (!res.ok) {
                res = await fetch(`/eco/mainline`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ eco: o.eco || undefined, name: o.name }),
                });
            }
            if (!res.ok) return null;
            const data = await res.json();
            return Array.isArray(data.san) ? data.san : null;
        } catch {
            return null;
        }
    }

    async function buildLines(): Promise<string[][]> {
        const lines: string[][] = [];
        for (const o of selected) {
            let san: string[] | null | undefined = o.san;
            if (!san || !san.length) {
                san = await fetchMainline(o);
            }
            if (san && san.length) lines.push(san);
        }
        return lines;
    }

    async function saveAsRepertoire() {
        if (!repName.trim() || selected.length === 0) return;
        const lines = await buildLines();
        const rep = createRepertoire({ name: repName.trim(), side, lines, openings: selected });
        setSavedMsg(`Saved '${rep.name}' with ${selected.length} openings${lines.length ? `, ${lines.length} mainlines added` : ""}.`);
    }

    async function startTraining() {
        if (selected.length === 0) return;
        const lines = await buildLines();
        onStart({ lines, side, openings: selected });
    }

    return (
        <div>
            <Row label="Search Openings" labelFor="opening-search">
                <div className="flex gap-2" ref={searchContainerRef}>
                    <div className="relative flex-1">
                        <Input
                            id="opening-search"
                            aria-labelledby="opening-search-label"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onFocus={() => setShowResults(true)}
                            placeholder="e.g., Sicilian Defense"
                            className="flex-1"
                        />
                        {showResults && results.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-card border rounded shadow-lg max-h-96 overflow-y-auto">
                                {results.map((r, idx) => {
                                    const isSelected = selected.some(x => x.name === r.name);
                                    return (
                                        <Button
                                            key={`${r.name}-${idx}`}
                                            variant="ghost"
                                            className="w-full justify-between h-auto p-2 text-left hover:bg-muted whitespace-normal"
                                            onClick={() => {
                                                if (isSelected) {
                                                    removeOpening(r.name);
                                                } else {
                                                    addOpening(r);
                                                }
                                            }}
                                        >
                                            <span className="flex items-center gap-2">
                                                {isSelected ? (
                                                    <Check className="w-4 h-4 text-neutral-900 dark:text-white flex-shrink-0" />
                                                ) : (
                                                    <Circle className="w-4 h-4 text-neutral-400 dark:text-neutral-600 flex-shrink-0" />
                                                )}
                                                <span className="text-sm">{r.name}</span>
                                            </span>
                                            <span className="text-xs text-muted-foreground">{r.eco || ""}</span>
                                        </Button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
                {loading && <div className="text-xs text-muted-foreground mt-1">Loading openings…</div>}
                {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
            </Row>

            {selected.length > 0 && (
                <div className="mb-3">
                    <div className="text-xs text-muted-foreground mb-1">Selected ({selected.length})</div>
                    <div className="flex flex-wrap gap-2">
                        {selected.map((s) => (
                            <span key={s.name} className="px-2 py-1 bg-muted border border-border rounded text-xs flex items-center gap-1 shadow-sm text-foreground">
                                {s.name}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeOpening(s.name)}
                                    className="h-auto p-0 w-auto text-muted-foreground hover:text-foreground hover:bg-transparent ml-1"
                                >
                                    ×
                                </Button>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <Row label="Practice as" labelFor="practice-side">
                <Select value={side} onValueChange={(value) => setSide(value as "white" | "black")}>
                    <SelectTrigger id="practice-side" aria-labelledby="practice-side-label" size="sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="white">White</SelectItem>
                        <SelectItem value="black">Black</SelectItem>
                    </SelectContent>
                </Select>
            </Row>

            <Button
                onClick={startTraining}
                disabled={selected.length === 0}
                className="w-full mb-2"
                size="sm"
            >
                Start Training
            </Button>

            <Row label="Save as Repertoire (Optional)" labelFor="repertoire-name">
                <Input
                    id="repertoire-name"
                    aria-labelledby="repertoire-name-label"
                    value={repName}
                    onChange={(e) => setRepName(e.target.value)}
                    placeholder="e.g., My Openings"
                    className="w-full mb-2"
                />
                <Button
                    onClick={saveAsRepertoire}
                    disabled={!repName.trim() || selected.length === 0}
                    className="w-full"
                    size="sm"
                    variant="outline"
                >
                    Save
                </Button>
                {savedMsg && <div className="mt-2 text-xs text-green-700">{savedMsg}</div>}
            </Row>
        </div>
    );
}

export function CustomPanel({ preselectedEco }: { preselectedEco?: string } = {}) {
    const { active, setActive, onStartSelectOpenings, onModeChange, mode } = usePracticeContext();

    // Show active panel during practice
    if (active && mode === "select-openings") {
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
                        <h3 className="text-lg font-semibold mb-1">Custom Practice</h3>
                        <p className="text-sm text-muted-foreground">
                            Search and select specific openings to practice.
                        </p>
                    </div>
                    <CustomPanelConfig onStart={onStartSelectOpenings} preselectedEco={preselectedEco} />
                </div>
            </div>
        </div>
    );
}

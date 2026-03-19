"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Clock, Loader2 } from "lucide-react";
import { usePracticeContext } from "../PracticeContext";
import { useMaiaPreload } from "@/hooks/useMaiaPreload";

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

function ActiveMaiaPanel({ onStop, onResign, onAbandon, canAbandon }: { onStop: () => void; onResign?: () => void; onAbandon?: () => void; canAbandon?: boolean }) {
    const { whiteTime, blackTime, currentTurn, maiaSide, maiaLevel } = usePracticeContext();

    const formatTime = (seconds: number) => {
        const sec = Math.max(0, Math.floor(seconds));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const isWhiteTurn = currentTurn === 'w';
    const userIsWhite = maiaSide === 'white';

    return (
        <div className="h-full flex flex-col bg-card">
            <div className="p-4 border-b bg-muted/30">
                <h2 className="font-semibold text-foreground text-lg mb-1">
                    Practice vs Maia
                </h2>
                <div className="text-sm text-muted-foreground">
                    Maia {maiaLevel} • Game in progress
                </div>
            </div>

            <div className="p-4 flex-1 flex flex-col">
                <Card className="mb-4">
                    <CardContent className="p-4 space-y-4">
                        {/* Black Player */}
                        <div className={`space-y-2 ${!isWhiteTurn ? "opacity-100" : "opacity-70"}`}>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className="h-3 w-3 rounded-full bg-black border border-white/20"></div>
                                    <span className="font-semibold">{userIsWhite ? `Maia ${maiaLevel}` : "You"}</span>
                                </div>
                                {!isWhiteTurn && <Clock className="h-4 w-4 animate-pulse text-primary" />}
                            </div>
                            <div className={`text-3xl font-mono font-bold tracking-wider bg-muted/50 p-2 rounded text-center ${!isWhiteTurn ? "text-foreground" : "text-muted-foreground"}`}>
                                {formatTime(blackTime)}
                            </div>
                            <Progress value={(blackTime / 300) * 100} className="h-1" />
                        </div>

                        <div className="h-px bg-border w-full my-2"></div>

                        {/* White Player */}
                        <div className={`space-y-2 ${isWhiteTurn ? "opacity-100" : "opacity-70"}`}>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className="h-3 w-3 rounded-full bg-white border border-black/20"></div>
                                    <span className="font-semibold">{userIsWhite ? "You" : `Maia ${maiaLevel}`}</span>
                                </div>
                                {isWhiteTurn && <Clock className="h-4 w-4 animate-pulse text-primary" />}
                            </div>
                            <div className={`text-3xl font-mono font-bold tracking-wider bg-muted/50 p-2 rounded text-center ${isWhiteTurn ? "text-foreground" : "text-muted-foreground"}`}>
                                {formatTime(whiteTime)}
                            </div>
                            <Progress value={(whiteTime / 300) * 100} className="h-1" />
                        </div>
                    </CardContent>
                </Card>

                <div className="mt-auto space-y-2">
                    {canAbandon && onAbandon ? (
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={onAbandon}
                        >
                            Abandon Game
                        </Button>
                    ) : (
                        <Button
                            variant="destructive"
                            className="w-full"
                            onClick={onResign || onStop}
                        >
                            Resign Game
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

function MaiaPanelConfig({ onStart }: { onStart: (cfg: { side: "white" | "black" | "random"; time: string; level: number; opening?: { san: string[]; name: string; eco?: string } | "random"; speed?: "slow" | "normal" | "fast"; temperature?: number }) => void }) {
    const [maiaLevel, setMaiaLevel] = useState<number>(1500);
    const [tc, setTc] = useState("5+0");
    const [inc, setInc] = useState<string>("0");
    const [side, setSide] = useState<"white" | "black" | "random">("white");
    const [speed, setSpeed] = useState<"slow" | "normal" | "fast">("normal");
    const [temperature, setTemperature] = useState<number>(0.8);
    const [openingMode, setOpeningMode] = useState<"none" | "random" | "select">("none");
    const [selectedOpening, setSelectedOpening] = useState<{ san: string[]; name: string; eco?: string } | null>(null);

    // Maia preload - starts loading immediately when panel mounts
    const { isReady: maiaReady, isLoading: maiaLoading, progress: maiaProgress } = useMaiaPreload(true);

    // Opening search state
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [allOpenings, setAllOpenings] = useState<Array<{ eco?: string; name: string; san?: string[] }>>([]);
    const [results, setResults] = useState<Array<{ eco?: string; name: string; san?: string[] }>>([]);
    const [showResults, setShowResults] = useState(false);
    const searchContainerRef = useRef<HTMLDivElement>(null);

    const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "/api/gateway";


    // Load openings index
    useEffect(() => {
        const KEY = "eco.openings.index.v1";
        const now = Date.now();
        const TTL = 24 * 60 * 60 * 1000;
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
            try {
                let res = await fetch(`${GATEWAY_URL}/eco/openings?max_moves=16`);
                if (!res.ok) res = await fetch(`/eco/openings?max_moves=16`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const openings = Array.isArray(data.openings) ? data.openings : [];
                setAllOpenings(openings);
                localStorage.setItem(KEY, JSON.stringify({ ts: now, openings }));
            } catch (e: unknown) {
                console.error("Failed to load openings:", e);
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

    // Filter results based on query
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
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch mainline for an opening
    async function fetchMainline(o: { eco?: string; name: string }): Promise<string[] | null> {
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

    async function handleSelectOpening(o: { eco?: string; name: string; san?: string[] }) {
        let san = o.san;
        if (!san || !san.length) {
            san = await fetchMainline(o) || undefined;
        }
        if (san && san.length) {
            setSelectedOpening({ san, name: o.name, eco: o.eco });
            setShowResults(false);
            setQuery(o.name);
        }
    }

    return (
        <div>
            <Row label="Maia level">
                <Select value={maiaLevel.toString()} onValueChange={(v) => setMaiaLevel(parseInt(v))}>
                    <SelectTrigger size="sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1100">1100</SelectItem>
                        <SelectItem value="1500">1500</SelectItem>
                        <SelectItem value="1900">1900</SelectItem>
                    </SelectContent>
                </Select>
            </Row>
            <Row label="Time Control">
                <Select value={tc} onValueChange={setTc}>
                    <SelectTrigger size="sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="3+0">Blitz 3 min</SelectItem>
                        <SelectItem value="5+0">Blitz 5 min</SelectItem>
                        <SelectItem value="10+0">Rapid 10 min</SelectItem>
                        <SelectItem value="15+0">Rapid 15 min</SelectItem>
                    </SelectContent>
                </Select>
            </Row>
            <Row label="Increment">
                <Select value={inc} onValueChange={setInc}>
                    <SelectTrigger size="sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="0">0s</SelectItem>
                        <SelectItem value="1">1s</SelectItem>
                        <SelectItem value="2">2s</SelectItem>
                        <SelectItem value="3">3s</SelectItem>
                        <SelectItem value="5">5s</SelectItem>
                        <SelectItem value="10">10s</SelectItem>
                    </SelectContent>
                </Select>
            </Row>
            <Row label="Side">
                <Select value={side} onValueChange={(value) => setSide(value as "white" | "black" | "random")}>
                    <SelectTrigger size="sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="white">White</SelectItem>
                        <SelectItem value="black">Black</SelectItem>
                        <SelectItem value="random">Random</SelectItem>
                    </SelectContent>
                </Select>
            </Row>
            <Row label="Response Speed">
                <Select value={speed} onValueChange={(value) => setSpeed(value as "slow" | "normal" | "fast")}>
                    <SelectTrigger size="sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="slow">Slow (2s)</SelectItem>
                        <SelectItem value="normal">Normal (0.9s)</SelectItem>
                        <SelectItem value="fast">Fast (0.4s)</SelectItem>
                    </SelectContent>
                </Select>
            </Row>
            <Row label="Move Variation">
                <Select value={temperature.toString()} onValueChange={(value) => setTemperature(parseFloat(value))}>
                    <SelectTrigger size="sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="0.1">Consistent (Low)</SelectItem>
                        <SelectItem value="0.8">Natural (Normal)</SelectItem>
                        <SelectItem value="1.2">Varied (High)</SelectItem>
                        <SelectItem value="1.5">Experimental (Max)</SelectItem>
                    </SelectContent>
                </Select>
            </Row>
            <Row label="Starting Position">
                <Select value={openingMode} onValueChange={(value) => {
                    setOpeningMode(value as "none" | "random" | "select");
                    if (value !== "select") {
                        setSelectedOpening(null);
                        setQuery("");
                    }
                }}>
                    <SelectTrigger size="sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">Standard position</SelectItem>
                        <SelectItem value="random">Random opening</SelectItem>
                        <SelectItem value="select">Select opening</SelectItem>
                    </SelectContent>
                </Select>
            </Row>
            {openingMode === "select" && (
                <Row label="Search Opening" labelFor="maia-opening-search">
                    <div className="relative" ref={searchContainerRef}>
                        <Input
                            id="maia-opening-search"
                            aria-labelledby="maia-opening-search-label"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onFocus={() => setShowResults(true)}
                            placeholder="e.g., Sicilian Defense"
                            className="w-full h-8 px-2 text-xs"
                        />
                        {showResults && results.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-card border rounded shadow-lg max-h-64 overflow-y-auto">
                                {results.map((r, idx) => (
                                    <Button
                                        key={`${r.name}-${idx}`}
                                        variant="ghost"
                                        className="w-full justify-between h-auto p-2 text-left hover:bg-muted whitespace-normal text-xs"
                                        onClick={() => handleSelectOpening(r)}
                                    >
                                        <span>{r.name}</span>
                                        <span className="text-xs text-muted-foreground">{r.eco || ""}</span>
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                    {loading && <div className="text-xs text-muted-foreground mt-1">Loading openings…</div>}
                </Row>
            )}

            {/* Maia loading progress */}
            {maiaLoading && (
                <div className="mb-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Loading Maia engine... {maiaProgress}%</span>
                    </div>
                    <Progress value={maiaProgress} className="h-1" />
                </div>
            )}

            <Button
                onClick={() => {
                    const base = (tc || "5+0").split("+")[0] || "5";
                    const finalTc = `${base}+${inc}`;
                    const opening = openingMode === "none" ? undefined : openingMode === "random" ? "random" : selectedOpening || undefined;
                    onStart({ side, time: finalTc, level: maiaLevel, opening, speed, temperature });
                }}
                className="w-full mt-2"
                size="sm"
                disabled={!maiaReady}
            >
                {maiaLoading ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading Maia...
                    </>
                ) : maiaReady ? (
                    "Start Game"
                ) : (
                    "Waiting for Maia..."
                )}
            </Button>
        </div>
    );
}

export function MaiaPanel() {
    const { active, setActive, onStartMaia, onModeChange, onResign, onAbandon, canAbandon, mode } = usePracticeContext();

    // Show active Maia panel during game
    if (active && mode === "maia") {
        return (
            <ActiveMaiaPanel
                onStop={() => {
                    setActive(false);
                    onModeChange(mode);
                }}
                onResign={onResign}
                onAbandon={onAbandon}
                canAbandon={canAbandon()}
            />
        );
    }

    return (
        <div className="h-full flex flex-col bg-card rounded-lg border shadow-sm overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-semibold mb-1">Practice vs Maia</h3>
                        <p className="text-sm text-muted-foreground">
                            Play against a human-like neural network engine trained on millions of games.
                        </p>
                    </div>
                    <MaiaPanelConfig onStart={(cfg) => onStartMaia(cfg)} />
                </div>
            </div>
        </div>
    );
}

"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createRepertoire, listRepertoires, Repertoire } from "./repertoireStore";
import { useSavedRepertoires } from "@/hooks/useRepertoires";
import { SavedRepertoire } from "@/types/repertoire";
import { Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Mode = "maia" | "repertoire" | "select-openings";

import { Progress } from "@/components/ui/progress";

interface RightPanelProps {
  mode: Mode;
  active: boolean;
  setActive: (v: boolean) => void;
  statusText?: string;
  progress?: { current: number; total: number };
  whiteTime?: number;
  blackTime?: number;
  currentTurn?: 'w' | 'b';
  maiaSide?: 'white' | 'black';
  maiaLevel?: number;
  onStartRepertoire?: (rep: Repertoire) => void;
  onStartMaia?: (cfg: { side: "white" | "black" | "random"; time: string; level: number; opening?: { san: string[]; name: string; eco?: string } | "random" }) => void;
  onStartSelectOpenings?: (data: { lines: string[][]; side: "white" | "black"; openings: any[] }) => void;
  onModeChange?: (m: Mode) => void;
  title?: string;
  onResign?: () => void;
}

export function RightPanel({ mode, active, setActive, statusText, progress, whiteTime, blackTime, currentTurn, maiaSide, maiaLevel, onStartRepertoire, onStartMaia, onStartSelectOpenings, onModeChange, title, onResign }: RightPanelProps) {


  // Show active Maia panel during game
  if (active && mode === "maia") {
    return (
      <ActiveMaiaPanel
        whiteTime={whiteTime || 0}
        blackTime={blackTime || 0}
        currentTurn={currentTurn || 'w'}
        maiaSide={maiaSide || 'white'}
        maiaLevel={maiaLevel || 1500}
        onStop={() => {
          setActive(false);
          onModeChange?.(mode);
        }}
        onResign={onResign}
      />
    );
  }

  if (active && (mode === "repertoire" || mode === "select-openings")) {
    return (
      <ActivePracticePanel
        mode={mode}
        progress={progress}
        title={title}
        onStop={() => {
          setActive(false);
          onModeChange?.(mode);
        }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-card rounded-lg border shadow-sm overflow-hidden">
      <Tabs value={mode} onValueChange={(v) => onModeChange?.(v as Mode)} className="w-full flex flex-col h-full">
        <div className="p-3 border-b bg-muted/50">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="maia">Maia</TabsTrigger>
            <TabsTrigger value="repertoire">Repertoire</TabsTrigger>
            <TabsTrigger value="select-openings">Custom</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <TabsContent value="maia" className="mt-0 h-full">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-1">Practice vs Maia</h3>
                <p className="text-sm text-muted-foreground">
                  Play against a human-like neural network engine trained on millions of games.
                </p>
              </div>
              <MaiaPanel active={active} setActive={setActive} onStart={onStartMaia} />
            </div>
          </TabsContent>

          <TabsContent value="repertoire" className="mt-0 h-full">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-1">Practice Repertoire</h3>
                <p className="text-sm text-muted-foreground">
                  Train your saved opening repertoires.
                </p>
              </div>
              <RepertoirePracticePanel active={active} setActive={setActive} onStart={onStartRepertoire} />
            </div>
          </TabsContent>

          <TabsContent value="select-openings" className="mt-0 h-full">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-1">Custom Practice</h3>
                <p className="text-sm text-muted-foreground">
                  Search and select specific openings to practice.
                </p>
              </div>
              <SelectOpeningsPanel active={active} setActive={setActive} onStart={onStartSelectOpenings} />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function ActiveMaiaPanel({ whiteTime, blackTime, currentTurn, maiaSide, maiaLevel, onStop, onResign }: { whiteTime: number; blackTime: number; currentTurn: 'w' | 'b'; maiaSide: 'white' | 'black'; maiaLevel: number; onStop: () => void; onResign?: () => void }) {
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
      <div className="p-4 border-b bg-muted/50">
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
          <Button
            variant="destructive"
            className="w-full"
            onClick={onResign || onStop}
          >
            Resign Game
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActivePracticePanel({ mode, progress, onStop, title }: { mode: Mode; progress?: { current: number; total: number }; onStop: () => void; title?: string }) {
  const current = progress?.current || 0;
  const total = progress?.total || 1; // avoid div by 0
  const percent = Math.round((current / total) * 100);
  const left = total - current;

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="p-4 border-b bg-muted/50">
        <h2 className="font-semibold text-foreground text-lg mb-1">
          {title || (mode === "repertoire" ? "Repertoire Practice" : "Selected Openings")}
        </h2>
        <div className="text-sm text-muted-foreground">
          Practice in progress
        </div>
      </div>

      <div className="p-6 flex-1 flex flex-col gap-6">
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-6 text-center">
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
            variant="destructive"
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

function MaiaPanel({ active, setActive, onStart }: { active: boolean; setActive: (v: boolean) => void; onStart?: (cfg: { side: "white" | "black" | "random"; time: string; level: number; opening?: { san: string[]; name: string; eco?: string } | "random" }) => void }) {
  const [maiaLevel, setMaiaLevel] = useState<number>(1500);
  const [tc, setTc] = useState("5+0");
  const [inc, setInc] = useState<string>("0");
  const [side, setSide] = useState<"white" | "black" | "random">("white");
  const [speed, setSpeed] = useState<"slow" | "normal" | "fast">("normal");
  const [openingMode, setOpeningMode] = useState<"none" | "random" | "select">("none");
  const [selectedOpening, setSelectedOpening] = useState<{ san: string[]; name: string; eco?: string } | null>(null);

  // Opening search state (reuse logic from SelectOpeningsPanel)
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [allOpenings, setAllOpenings] = useState<Array<{ eco?: string; name: string; san?: string[] }>>([]);
  const [results, setResults] = useState<Array<{ eco?: string; name: string; san?: string[] }>>([]);
  const [showResults, setShowResults] = useState(false);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);

  const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "/api/gateway";

  // Load openings index
  React.useEffect(() => {
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
      } catch (e: any) {
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
  }, []);

  // Filter results based on query
  React.useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setResults(allOpenings);
      return;
    }
    const filtered = allOpenings.filter(o => o.name.toLowerCase().includes(q));
    setResults(filtered.slice(0, 500));
  }, [query, allOpenings]);

  // Click outside handler
  React.useEffect(() => {
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
      san = await fetchMainline(o);
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
              className="w-full"
              size="sm"
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
      <Button
        onClick={() => {
          const base = (tc || "5+0").split("+")[0] || "5";
          const finalTc = `${base}+${inc}`;
          const opening = openingMode === "none" ? undefined : openingMode === "random" ? "random" : selectedOpening || undefined;
          onStart?.({ side, time: finalTc, level: maiaLevel, opening, speed } as any);
        }}
        className="w-full mt-2"
        size="sm"
      >
        Start Game
      </Button>
    </div>
  );
}

function RepertoirePracticePanel({ active, setActive, onStart }: { active: boolean; setActive: (v: boolean) => void; onStart?: (rep: Repertoire) => void }) {
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
      onStart?.(repertoire);
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
        No repertoires saved. Save a repertoire from the Reports page to practice it here.
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

function SelectOpeningsPanel({ active, setActive, onStart }: { active: boolean; setActive: (v: boolean) => void; onStart?: (data: { lines: string[][]; side: "white" | "black"; openings: any[] }) => void }) {
  type Opening = { eco?: string; name: string; san?: string[] };
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allOpenings, setAllOpenings] = useState<Opening[]>([]);
  const [results, setResults] = useState<Opening[]>([]);
  const [selected, setSelected] = useState<Opening[]>([]);
  const [repName, setRepName] = useState("");
  const [side, setSide] = useState<"white" | "black">("white");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);

  const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "/api/gateway";

  // Load cached openings index (and persist in localStorage)
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
        // Primary: use explicit gateway base URL
        let res = await fetch(`${GATEWAY_URL}/eco/openings?max_moves=16`);
        if (!res.ok) {
          // Fallback: try relative path (uses next.config rewrites)
          res = await fetch(`/eco/openings?max_moves=16`);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const openings: Opening[] = Array.isArray(data.openings) ? data.openings : [];
        setAllOpenings(openings);
        localStorage.setItem(KEY, JSON.stringify({ ts: now, openings }));
      } catch (e: any) {
        setError(e.message || "Failed to load openings index");
      } finally {
        setLoading(false);
      }
    }

    if (cached && cached.ts && (now - cached.ts) < TTL && Array.isArray(cached.openings)) {
      setAllOpenings(cached.openings);
    } else {
      fetchIndex();
    }
  }, []);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Show all openings by default when query is empty
      setResults(allOpenings);
      return;
    }
    const filtered = allOpenings.filter(o => o.name.toLowerCase().includes(q));
    setResults(filtered.slice(0, 500));
  }, [query, allOpenings]);

  // Click outside handler to close results
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
        // Fallback to relative path (Next.js rewrite)
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
    onStart?.({ lines, side, openings: selected });
  }

  return (
    <div>
      <Row label="Search Openings" labelFor="select-openings-search">
        <div className="flex gap-2" ref={searchContainerRef}>
          <div className="relative flex-1">
            <Input
              id="select-openings-search"
              aria-labelledby="select-openings-search-label"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setShowResults(true)}
              placeholder="e.g., Sicilian Defense"
              className="flex-1"
            />
            {showResults && results.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-card border rounded shadow-lg max-h-96 overflow-y-auto">
                {results.map((r, idx) => (
                  <Button
                    key={`${r.name}-${idx}`}
                    variant="ghost"
                    className="w-full justify-between h-auto p-2 text-left hover:bg-muted whitespace-normal"
                    onClick={() => {
                      addOpening(r);
                      // Keep dropdown open - don't call setShowResults(false)
                    }}
                  >
                    <span className="text-sm">{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.eco || ""}</span>
                  </Button>
                ))}
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

      <Row label="Practice as" labelFor="select-openings-side">
        <Select value={side} onValueChange={(value) => setSide(value as "white" | "black")}>
          <SelectTrigger id="select-openings-side" aria-labelledby="select-openings-side-label" size="sm">
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

      <Row label="Save as Repertoire (Optional)" labelFor="select-openings-rep-name">
        <Input
          id="select-openings-rep-name"
          aria-labelledby="select-openings-rep-name-label"
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

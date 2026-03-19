"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Sword, ArrowDownWideNarrow } from "lucide-react";
import OpeningCard from "./OpeningCard";
import { OpeningSystem } from "@/types/openings";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

type SortMode = "popularity" | "alphabetical";

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "/api/gateway";

export default function OpeningsBrowser() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [systems, setSystems] = useState<OpeningSystem[]>([]);
    const [search, setSearch] = useState(searchParams.get("q") || "");
    const [onlyGambits, setOnlyGambits] = useState(searchParams.get("gambits") === "true");
    const [sortBy, setSortBy] = useState<SortMode>((searchParams.get("sort") as SortMode) || "popularity");
    const [loading, setLoading] = useState(true);
    const [masteryStats, setMasteryStats] = useState<Record<string, number>>({});

    // Sync state changes to URL
    useEffect(() => {
        const params = new URLSearchParams();
        if (search) params.set("q", search);
        if (onlyGambits) params.set("gambits", "true");
        if (sortBy !== "popularity") params.set("sort", sortBy);

        const queryString = params.toString();
        const newUrl = queryString ? `?${queryString}` : "/openings";
        router.replace(newUrl, { scroll: false });
    }, [search, onlyGambits, sortBy, router]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [systemsRes, gambitsRes] = await Promise.all([
                    fetch("/data/openings/opening_systems.json"),
                    fetch("/data/openings/opening_db_index.json"),
                ]);
                const systems: OpeningSystem[] = await systemsRes.json();
                const existingIds = new Set(systems.map((s) => s.id));

                let merged = [...systems];
                if (gambitsRes.ok) {
                    const gambits: OpeningSystem[] = await gambitsRes.json();
                    // Add only entries not already covered by opening_systems.json
                    for (const g of gambits) {
                        if (!existingIds.has(g.id)) {
                            merged.push(g);
                        }
                    }
                }
                setSystems(merged);
            } catch (error) {
                console.error("Failed to load openings:", error);
            } finally {
                setLoading(false);
            }
        };

        const fetchMastery = async () => {
            try {
                const response = await fetch(`${GATEWAY_URL}/api/openings/mastered/stats`);
                if (response.ok) {
                    const data = await response.json();
                    setMasteryStats(data.openings || {});
                }
            } catch (error) {
                console.error("Failed to load mastery stats:", error);
            }
        };

        fetchData();
        fetchMastery();
    }, []);

    const filteredSystems = useMemo(() => {
        const results = systems.filter(sys => {
            const matchesSearch =
                sys.name.toLowerCase().includes(search.toLowerCase()) ||
                sys.ecoCodes.some(eco => eco.toLowerCase() === search.toLowerCase());

            const matchesGambit = !onlyGambits || sys.type === "forcing";

            return matchesSearch && matchesGambit;
        });

        // Sort based on selected mode
        return [...results].sort((a, b) => {
            if (sortBy === "popularity") {
                const popularityDiff = (b.popularity ?? 0) - (a.popularity ?? 0);
                if (popularityDiff !== 0) return popularityDiff;
            }
            return a.name.localeCompare(b.name);
        });
    }, [systems, search, onlyGambits, sortBy]);

    if (loading) {
        return <div className="text-center py-20 text-muted-foreground">Loading openings...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-muted/30 p-4 rounded-xl border border-border/50">
                <div className="relative w-full md:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name or ECO (e.g. Italian, C50)..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10 h-11 bg-background border-border/50 focus:ring-primary/20"
                    />
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center space-x-3 bg-background px-4 py-2 rounded-lg border border-border/50 shadow-sm">
                        <Sword className={`h-4 w-4 ${onlyGambits ? 'text-primary' : 'text-muted-foreground'}`} />
                        <Label htmlFor="gambit-filter" className="text-sm font-medium cursor-pointer">Gambits Only</Label>
                        <Switch
                            id="gambit-filter"
                            checked={onlyGambits}
                            onCheckedChange={setOnlyGambits}
                            className="data-[state=checked]:bg-primary"
                        />
                    </div>

                    <div className="flex items-center space-x-2 bg-background px-3 py-2 rounded-lg border border-border/50 shadow-sm">
                        <ArrowDownWideNarrow className="h-4 w-4 text-muted-foreground" />
                        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortMode)}>
                            <SelectTrigger className="w-[140px] border-0 bg-transparent h-auto p-0 focus:ring-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="popularity">Popular</SelectItem>
                                <SelectItem value="alphabetical">A-Z</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 pb-2">
                <Badge variant="secondary" className="px-3 py-1">
                    {filteredSystems.length} Results
                </Badge>
                {search && (
                    <Badge variant="outline" className="px-3 py-1 cursor-pointer hover:bg-muted" onClick={() => setSearch("")}>
                        Clear search: {search} ✕
                    </Badge>
                )}
            </div>

            {filteredSystems.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed border-border rounded-2xl bg-muted/10">
                    <p className="text-muted-foreground text-lg">No openings found matching your criteria.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredSystems.map((system) => (
                        <OpeningCard
                            key={system.id}
                            system={system}
                            masteredCount={masteryStats[system.id] || 0}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

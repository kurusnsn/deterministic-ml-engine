"use client";

import { useCallback, useEffect, useState } from "react";
import { getSessionId } from "@/lib/session";

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "/api/gateway";

// Types
export interface RawStats {
    sample_size: number;
    wins: number;
    losses: number;
    draws: number;
    score: number;
    blunders_per_game: number;
    blunder_distribution: {
        opening: number;
        middlegame: number;
        endgame: number;
    };
    games_with_brilliants: number;
    comeback_wins: number;
    top_openings: Array<{
        eco: string;
        name: string;
        games: number;
        score: number;
    }>;
}

export interface OpeningRecommendation {
    eco: string;
    name: string;
    action: "lean_into" | "patch" | "avoid";
    reason: string;
}

export interface PuzzleRecommendation {
    position_id: string;
    theme: string;
    priority: "high" | "medium" | "low";
    reason: string;
}

export interface PVLineRecommendation {
    position_id: string;
    display_name: string;
    reason: string;
    study_hint: string;
}

export interface Recommendations {
    openings: OpeningRecommendation[];
    focus_areas: string[];
    puzzles: PuzzleRecommendation[];
    pv_lines: PVLineRecommendation[];
}

export interface TrainerSummary {
    status: "ready" | "building" | "updating" | "not_enough_games";
    time_control: string;
    side: string;
    sample_size: number;
    raw_stats: RawStats | Record<string, never>;
    coach_summary: string | null;
    recommendations: Recommendations | Record<string, never>;
    updated_at: string | null;
    message?: string;
    persistent_trainer?: PersistentTrainerData | null;
}

// Persistent Trainer Types (feature-flagged on backend)
export interface TrainerEvent {
    type: "improvement" | "regression" | "stagnation" | "false_confidence" | "consistency";
    signal: Record<string, any>;
    confidence: number;
    description: string;
}

export interface DerivedMetrics {
    winrate: number;
    blunders_per_game: number;
    opening_scores: Record<string, number>;
    endgame_accuracy: number | null;
    variance: number;
    sample_size: number;
}

export interface PersistentTrainerData {
    progress_since_last: Record<string, number>;
    detected_events: TrainerEvent[];
    event_summary: string | null;
    derived_metrics: DerivedMetrics;
    snapshot_period: "last_20_games" | "last_50_games";
}

export interface TrainerPuzzle {
    position_id: string;
    fen: string;
    side_to_move: "white" | "black";
    theme: string;
    priority: "high" | "medium" | "low";
    reason: string;
    best_move: string;
    game_id?: number;
    move_number?: number;
}

export interface TrainerPVLine {
    position_id: string;
    fen: string;
    side_to_move: "white" | "black";
    pv_san: string[];
    display_name: string;
    reason: string;
    study_hint: string;
    game_id?: number;
    move_number?: number;
}

// Helper for request headers (auth is handled server-side by the gateway proxy)
function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const sid = getSessionId();
    if (sid) headers["x-session-id"] = sid;
    return headers;
}

// Hook: useTrainerSummary
interface UseTrainerSummaryOptions {
    enabled?: boolean; // Whether to fetch (default: true), set to false to skip initial fetch
}

export function useTrainerSummary(
    timeControl: string,
    side: string,
    options: UseTrainerSummaryOptions = {}
) {
    const { enabled = true } = options;
    const [data, setData] = useState<TrainerSummary | null>(null);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState<string | null>(null);

    const fetchSummary = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const headers = getAuthHeaders();
            const params = new URLSearchParams({ time_control: timeControl, side });

            const resp = await fetch(`${GATEWAY_URL}/api/me/trainer/summary?${params}`, { headers });

            if (!resp.ok) {
                if (resp.status === 401) {
                    setError("Please log in to view your trainer");
                    return;
                }
                throw new Error(await resp.text());
            }

            const result = await resp.json();
            setData(result);
        } catch (e: any) {
            setError(e?.message || "Failed to load trainer summary");
        } finally {
            setLoading(false);
        }
    }, [timeControl, side]);

    useEffect(() => {
        if (enabled) {
            fetchSummary();
        }
    }, [fetchSummary, enabled]);

    return { data, loading, error, refetch: fetchSummary };
}

// Hook: useTrainerPuzzles
interface UseTrainerExtrasOptions {
    enabled?: boolean;
}

export function useTrainerPuzzles(timeControl: string, side: string, limit = 10, options: UseTrainerExtrasOptions = {}) {
    const { enabled = true } = options;
    const [data, setData] = useState<TrainerPuzzle[]>([]);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState<string | null>(null);

    const fetchPuzzles = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const headers = getAuthHeaders();
            const params = new URLSearchParams({
                time_control: timeControl,
                side,
                limit: limit.toString()
            });

            const resp = await fetch(`${GATEWAY_URL}/api/me/trainer/puzzles?${params}`, { headers });

            if (!resp.ok) throw new Error(await resp.text());

            const result = await resp.json();
            setData(result.puzzles || []);
        } catch (e: any) {
            setError(e?.message || "Failed to load puzzles");
        } finally {
            setLoading(false);
        }
    }, [timeControl, side, limit]);

    useEffect(() => {
        if (enabled) {
            fetchPuzzles();
        }
    }, [fetchPuzzles, enabled]);

    return { data, loading, error, refetch: fetchPuzzles };
}

// Hook: useTrainerPVLines
export function useTrainerPVLines(timeControl: string, side: string, limit = 10, options: UseTrainerExtrasOptions = {}) {
    const { enabled = true } = options;
    const [data, setData] = useState<TrainerPVLine[]>([]);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState<string | null>(null);

    const fetchPVLines = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const headers = getAuthHeaders();
            const params = new URLSearchParams({
                time_control: timeControl,
                side,
                limit: limit.toString()
            });

            const resp = await fetch(`${GATEWAY_URL}/api/me/trainer/pv-lines?${params}`, { headers });

            if (!resp.ok) throw new Error(await resp.text());

            const result = await resp.json();
            setData(result.pv_lines || []);
        } catch (e: any) {
            setError(e?.message || "Failed to load PV lines");
        } finally {
            setLoading(false);
        }
    }, [timeControl, side, limit]);

    useEffect(() => {
        if (enabled) {
            fetchPVLines();
        }
    }, [fetchPVLines, enabled]);

    return { data, loading, error, refetch: fetchPVLines };
}

// Hook: useTrainerRefresh
export function useTrainerRefresh() {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ status: string; message: string } | null>(null);

    const refresh = useCallback(async (timeControl = "all", side = "both") => {
        try {
            setLoading(true);

            const headers = getAuthHeaders();
            headers["Content-Type"] = "application/json";

            const resp = await fetch(`${GATEWAY_URL}/api/me/trainer/refresh`, {
                method: "POST",
                headers,
                body: JSON.stringify({ time_control: timeControl, side })
            });

            if (!resp.ok) throw new Error(await resp.text());

            const data = await resp.json();
            setResult(data);
            return data;
        } catch (e: any) {
            setResult({ status: "error", message: e?.message || "Failed to refresh" });
            throw e;
        } finally {
            setLoading(false);
        }
    }, []);

    return { refresh, loading, result };
}

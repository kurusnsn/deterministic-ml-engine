"use client";

import { useCallback, useEffect, useState } from "react";
import { getSessionId } from "@/lib/session";

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "/api/gateway";

// Types for the aggregated profile response
export interface RatingPoint {
    recorded_at: string;
    rating: number;
}

export interface RatingSeries {
    provider: string;
    time_control: string;
    points: RatingPoint[];
}

export interface TrainerSummaryData {
    coach_summary: string | null;
    recommendations: Record<string, any>;
    raw_stats: Record<string, any>;
    sample_size: number;
    updated_at: string | null;
}

export interface ProfileData {
    // Base home data
    linked_accounts: {
        lichess: { connected: boolean; username: string | null; last_sync_at: string | null };
        chesscom: { connected: boolean; username: string | null; last_sync_at: string | null };
    };
    latest_report: {
        has_report: boolean;
        id: string | null;
        name: string | null;
        created_at: string | null;
        headline: string | null;
    };
    recent_games: Array<{
        id: string;
        played_at: string | null;
        opponent: string;
        result: string;
        source: string;
        time_control?: string;
    }>;
    trainer: {
        has_trainer_data: boolean;
        status: string | null;
        headline: string | null;
        focus_area: string | null;
        summary?: TrainerSummaryData;
    };

    // Profile-specific data
    user?: {
        id: string | null;
        avatar_url: string | null;
        created_at: string | null;
        puzzle_elo: number | null;
    };
    linked_accounts_list?: Array<{ platform: string; username: string }>;
    sync_status?: Record<string, {
        username: string;
        status: string;
        last_synced_at: string | null;
        games_synced: number;
        error_message: string | null;
    }>;
    activity_heatmap?: Array<{ date: string; count: number }>;
    ratings?: {
        game: { series: RatingSeries[] };
        puzzle: { series: RatingSeries[] };
    };
    studies_count?: number;
    repertoires_count?: number;
}

export function useProfileData() {
    const [data, setData] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchProfile = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const headers: Record<string, string> = {};
            const sid = getSessionId();
            if (sid) headers["x-session-id"] = sid;

            // Single aggregated request with profile data
            const resp = await fetch(
                `${GATEWAY_URL}/api/me/home?include_profile=true`,
                { headers }
            );

            if (!resp.ok) {
                if (resp.status === 401) {
                    setError("Please log in to view your profile");
                    return;
                }
                throw new Error(await resp.text());
            }

            const result = await resp.json();
            setData(result);
        } catch (e: any) {
            setError(e?.message || "Failed to load profile data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    return { data, loading, error, refetch: fetchProfile };
}

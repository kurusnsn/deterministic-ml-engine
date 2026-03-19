// API client for home dashboard endpoint

import { getClientAuthHeaders } from '@/lib/auth';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway';

// Types for home dashboard data
export interface LinkedAccountInfo {
    connected: boolean;
    username: string | null;
    last_sync_at: string | null;
}

export interface LinkedAccounts {
    lichess: LinkedAccountInfo;
    chesscom: LinkedAccountInfo;
}

export interface LatestReport {
    has_report: boolean;
    id: string | null;
    name: string | null;
    created_at: string | null;
    headline: string | null;
}

export interface RecentGame {
    id: string;
    played_at: string | null;
    opponent: string;
    result: string;
    source: 'lichess' | 'chesscom' | 'manual';
}

export interface TrainerSummary {
    has_trainer_data: boolean;
    status: 'ready' | 'building' | 'available' | null;
    headline: string | null;
    focus_area: string | null;
}

export interface HomeData {
    linked_accounts: LinkedAccounts;
    latest_report: LatestReport;
    recent_games: RecentGame[];
    trainer: TrainerSummary;
}

/**
 * Fetch aggregated home dashboard data for the current user.
 * Returns linked accounts, latest report, recent games, and trainer summary.
 */
export async function fetchHomeData(): Promise<HomeData> {
    const headers = await getClientAuthHeaders();
    const response = await fetch(`${GATEWAY_URL}/api/me/home`, {
        method: 'GET',
        headers,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch home data' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

/**
 * Check if user has any linked accounts
 */
export function hasAnyLinkedAccounts(data: HomeData): boolean {
    return data.linked_accounts.lichess.connected || data.linked_accounts.chesscom.connected;
}

/**
 * Get the most recent game from home data
 */
export function getMostRecentGame(data: HomeData): RecentGame | null {
    return data.recent_games.length > 0 ? data.recent_games[0] : null;
}

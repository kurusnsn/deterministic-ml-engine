import { MOCK_ROUNDS } from "@/lib/mock-tournament-data";

export type BroadcastPlayer = {
    id?: string;
    name: string;
    rating: number;
    title?: string;
    country?: string;
};

export type BroadcastGame = {
    id: string;
    round?: number;
    white: BroadcastPlayer;
    black: BroadcastPlayer;
    result?: string;
    status?: string;
    moves?: number;
    currentMove?: string;
    whiteTime?: string;
    blackTime?: string;
    fen?: string;
    boardNumber?: number;
};

export type BroadcastRound = {
    round: number;
    games: BroadcastGame[];
};

const GATEWAY_URL = (process.env.NEXT_PUBLIC_GATEWAY_URL as string) || "/api/gateway";
const REVALIDATE_SECONDS = 15;
const requestCache = new Map<string, Promise<any>>();

async function fetchWithFallback<T>(key: string, path: string, fallback: T): Promise<T> {
    if (requestCache.has(key)) {
        return requestCache.get(key) as Promise<T>;
    }

    const promise = (async () => {
        try {
            const resp = await fetch(`${GATEWAY_URL}${path}`, {
                cache: "force-cache",
                next: { revalidate: REVALIDATE_SECONDS },
            });
            if (!resp.ok) throw new Error(`Request failed: ${resp.status}`);
            const data = (await resp.json()) as unknown;
            return (data as T) ?? fallback;
        } catch {
            return fallback;
        }
    })();

    requestCache.set(key, promise);
    return promise;
}

export async function loadTournamentRounds(tournamentId: string): Promise<BroadcastRound[]> {
    const fallback = MOCK_ROUNDS;
    const data = await fetchWithFallback<any>(
        `tournament-rounds-${tournamentId}`,
        `/tournaments/${tournamentId}/rounds`,
        fallback,
    );

    if (Array.isArray(data)) {
        return data as BroadcastRound[];
    }
    if (Array.isArray(data?.rounds)) {
        return data.rounds as BroadcastRound[];
    }
    return fallback;
}

export async function loadRoundGames(tournamentId: string, roundNumber: number): Promise<BroadcastGame[]> {
    const rounds = await loadTournamentRounds(tournamentId);
    const round = rounds.find((r) => Number(r.round) === Number(roundNumber));
    return round?.games ?? [];
}

export async function loadTournamentGame(gameId: string): Promise<BroadcastGame | undefined> {
    const fallback = MOCK_ROUNDS.flatMap((r) => r.games).find((g) => g.id === gameId);
    const data = await fetchWithFallback<any>(
        `tournament-game-${gameId}`,
        `/games/${gameId}`,
        fallback,
    );

    if (!data) return fallback;
    if ("id" in data && data.id === gameId) return data as BroadcastGame;
    return fallback;
}

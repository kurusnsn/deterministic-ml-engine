import { Chess } from "chess.js";

export interface OpeningMove {
  san: string;
  uci: string;
  nextFen?: string;
  frequency: number;
  winrate: number;
  popularity: number;
  sample: number;
  averageRating?: number;
}

export interface OpeningRoot {
  id: string;
  name: string;
  fen: string;
  eco?: string;
  sampleSize?: number;
  moves?: OpeningMove[];
  openingMoves?: string[];
}

interface OpeningDbMove {
  san: string;
  uci: string;
  fen?: string;
  white?: number;
  black?: number;
  draws?: number;
  averageRating?: number;
  total?: number;
  popularity?: number;
}

interface OpeningDbResponse {
  id?: string;
  name?: string;
  eco?: string;
  fen?: string;
  sample?: number;
  total?: number;
  moves?: OpeningDbMove[];
  root?: {
    fen?: string;
    name?: string;
    eco?: string;
    sample?: number;
    total?: number;
    moves?: OpeningDbMove[];
  };
}

export const DEFAULT_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Opening definitions with starting positions and opening moves
// ECO-imported openings use canonical main lines from eco.pgn
const OPENING_DEFINITIONS: Record<string, { name: string; eco?: string; fen: string; openingMoves?: string[] }> = {
  // Gambit openings (use gambit builder for forcing lines)
  stafford: {
    name: "Stafford Gambit",
    eco: "C42",
    // Position after 1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6 4.Nxc6 dxc6
    fen: "r1bqkb1r/ppp2ppp/2p2n2/8/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 0 5",
    // Opening moves to autoplay: e4, e5, Nf3, Nf6, Nxe5, Nc6, Nxc6, dxc6
    openingMoves: ["e4", "e5", "Nf3", "Nf6", "Nxe5", "Nc6", "Nxc6", "dxc6"],
  },
  // ECO-imported openings (theoretical lines)
  italian: {
    name: "Italian Game",
    eco: "C51",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
    openingMoves: ["e4", "e5", "Nf3", "Nc6", "Bc4"],
  },
  sicilian: {
    name: "Sicilian Defense",
    eco: "B20",
    fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    openingMoves: ["e4", "c5"],
  },
  "queens-gambit": {
    name: "Queen's Gambit",
    eco: "D30",
    fen: "rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2",
    openingMoves: ["d4", "d5", "c4"],
  },
  london: {
    name: "London System",
    eco: "D02",
    fen: "rnbqkb1r/ppp1pppp/5n2/3p4/3P1B2/5N2/PPP1PPPP/RN1QKB1R b KQkq - 3 3",
    openingMoves: ["d4", "d5", "Nf3", "Nf6", "Bf4"],
  },
  "caro-kann": {
    name: "Caro-Kann Defense",
    eco: "B12",
    fen: "rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    openingMoves: ["e4", "c6"],
  },
  french: {
    name: "French Defense",
    eco: "C00",
    fen: "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    openingMoves: ["e4", "e6"],
  },
  "ruy-lopez": {
    name: "Ruy Lopez",
    eco: "C80",
    fen: "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
    openingMoves: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
  },
  "kings-indian": {
    name: "King's Indian Defense",
    eco: "E60",
    fen: "rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3",
    openingMoves: ["d4", "Nf6", "c4", "g6"],
  },
  scotch: {
    name: "Scotch Game",
    eco: "C44",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 3",
    openingMoves: ["e4", "e5", "Nf3", "Nc6", "d4"],
  },
  vienna: {
    name: "Vienna Game",
    eco: "C25",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2",
    openingMoves: ["e4", "e5", "Nc3"],
  },
};

// Use Gateway URL for all requests
const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "/api/gateway";

interface LichessExplorerResponse {
  white: number;
  black: number;
  draws: number;
  moves?: Array<{
    san: string;
    uci: string;
    white: number;
    black: number;
    draws: number;
    averageRating?: number;
  }>;
}

// Request throttler to respect Lichess rate limit (20 req/sec)
class RequestThrottler {
  private queue: Array<() => void> = [];
  private activeRequests = 0;
  private lastRequestTime = 0;
  private readonly maxRequestsPerSecond = 10; // Very conservative limit (50% of 20)
  private readonly minDelayMs = 1000 / this.maxRequestsPerSecond;

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        try {
          // Ensure minimum delay between requests
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequestTime;
          if (timeSinceLastRequest < this.minDelayMs) {
            await this.delay(this.minDelayMs - timeSinceLastRequest);
          }

          this.activeRequests++;
          this.lastRequestTime = Date.now();

          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeRequests--;
          this.processQueue();
        }
      };

      // If we can execute immediately, do so; otherwise queue it
      if (this.activeRequests < this.maxRequestsPerSecond) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  private processQueue() {
    if (this.queue.length > 0 && this.activeRequests < this.maxRequestsPerSecond) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Global throttler instance
const requestThrottler = new RequestThrottler();

// Simple delay utility
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchFromLichessExplorer(fen: string, retries = 3): Promise<LichessExplorerResponse> {
  const url = `${GATEWAY_URL}/opening/book`;
  const params = new URLSearchParams({
    fen,
    variant: "standard",
    type: "lichess",
    speeds: "bullet,blitz,rapid,classical",
    ratings: "1600,1800,2000,2200,2500",
    ttl: "600", // 10 minute cache to reduce repeated calls
  });

  // Use throttler to ensure we respect rate limits
  return requestThrottler.throttle(async () => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // Add delay for retries (longer delays to respect rate limits)
        if (attempt > 0) {
          const backoffMs = Math.min(5000 * Math.pow(2, attempt - 1), 30000); // Start at 5s, max 30s
          console.log(`Waiting ${backoffMs}ms before retry...`);
          await delay(backoffMs);
        }

        const res = await fetch(`${url}?${params}`, {
          cache: "no-store",
          headers: {
            "Accept": "application/json",
          },
        });

        if (!res.ok) {
          // If it's a rate limit or server error, retry
          if (res.status === 429 || res.status === 502 || res.status === 503) {
            if (attempt < retries - 1) {
              console.log(`Got ${res.status} error, will retry...`);
              continue;
            }
          }
          throw new Error(`Opening book service responded with ${res.status} for fen ${fen}`);
        }

        return await res.json();
      } catch (error) {
        if (attempt === retries - 1) {
          throw error;
        }
      }
    }

    throw new Error(`Failed to fetch after ${retries} retries for fen ${fen}`);
  });
}

/**
 * Get the starting FEN for an opening by its ID.
 * Returns undefined if the opening is not found.
 */
export function getOpeningStartFen(openingId: string): string | undefined {
  const definition = OPENING_DEFINITIONS[openingId];
  return definition?.fen;
}

/**
 * Get the opening moves to autoplay for an opening by its ID.
 * Returns undefined if the opening is not found or has no opening moves.
 */
export function getOpeningMoves(openingId: string): string[] | undefined {
  const definition = OPENING_DEFINITIONS[openingId];
  return definition?.openingMoves;
}

export async function getOpeningRoot(openingId: string): Promise<OpeningRoot> {
  const definition = OPENING_DEFINITIONS[openingId];

  if (!definition) {
    throw new Error(`Unknown opening ID: ${openingId}. Available: ${Object.keys(OPENING_DEFINITIONS).join(", ")}`);
  }

  const payload = await fetchFromLichessExplorer(definition.fen);
  const sample = payload.white + payload.black + payload.draws;
  const moves = (payload.moves ?? []).map((move) =>
    normalizeMove(move, sample, definition.fen),
  );

  return {
    id: openingId,
    name: definition.name,
    eco: definition.eco,
    fen: definition.fen,
    sampleSize: sample,
    moves,
    openingMoves: definition.openingMoves,
  };
}

export async function getMoves(fen: string): Promise<OpeningMove[]> {
  const payload = await fetchFromLichessExplorer(fen);
  const sample = payload.white + payload.black + payload.draws;
  const moves = (payload.moves ?? []).map((move) =>
    normalizeMove(move, sample, fen),
  );

  return moves;
}

export async function getPositionSample(fen: string): Promise<number> {
  const payload = await fetchFromLichessExplorer(fen);
  return payload.white + payload.black + payload.draws;
}

function normalizeMove(
  move: OpeningDbMove,
  parentSample?: number,
  currentFen?: string,
): OpeningMove {
  const sample =
    move.total ??
    (typeof move.white === "number" || typeof move.black === "number" || typeof move.draws === "number"
      ? (move.white ?? 0) + (move.black ?? 0) + (move.draws ?? 0)
      : 0);

  const winrate =
    sample > 0
      ? ((move.white ?? 0) + 0.5 * (move.draws ?? 0)) / sample
      : 0;

  const popularity =
    typeof move.popularity === "number" && !Number.isNaN(move.popularity)
      ? move.popularity
      : parentSample && parentSample > 0 && sample > 0
        ? sample / parentSample
        : 0;

  const nextFen = move.fen ?? computeNextFen(move, currentFen);

  const san = move.san ?? move.uci ?? "";
  const uci = move.uci ?? san;

  return {
    san,
    uci,
    nextFen,
    frequency: sample,
    winrate,
    popularity,
    sample,
    averageRating: move.averageRating,
  };
}

function computeNextFen(move: OpeningDbMove, currentFen?: string): string | undefined {
  try {
    const chess = new Chess(currentFen ?? DEFAULT_START_FEN);
    let result = move.san ? chess.move(move.san, { strict: false }) : null;

    if (!result && move.uci) {
      const uci = move.uci;
      const uciMove =
        uci.length >= 4
          ? {
              from: uci.slice(0, 2),
              to: uci.slice(2, 4),
              promotion: uci.slice(4) as "q" | "r" | "b" | "n" | undefined,
            }
          : undefined;
      if (uciMove) {
        result = chess.move(uciMove);
      }
    }

    return result ? chess.fen() : undefined;
  } catch {
    return undefined;
  }
}

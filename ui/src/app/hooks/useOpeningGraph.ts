import { Chess, Square } from "chess.js";

export type NormalizedGame = {
  white?: { username?: string };
  black?: { username?: string };
  result?: string; // "1-0" | "0-1" | "1/2-1/2"
  pgn?: string;
};

export type MoveStat = {
  san: string;
  uci: string;
  nextFen: string;
  count: number;
  wins: number;   // white wins count
  draws: number;  // draw count
  losses: number; // white losses count
  winPct: number;  // white wins percentage
  drawPct: number;
  lossPct: number; // white losses percentage
  mover: 'white' | 'black';
  avgOpponentElo?: number;
  lastPlayed?: number; // ms
  level?: number; // frequency level (1-3, like openingtree)
  maxCount?: number; // max count for this position
  orig: string; // source square (like openingtree)
  dest: string; // destination square (like openingtree)
};

type OutcomeCounts = { w: number; d: number; l: number };

export class OpeningGraph {
  // fen -> (uci -> { san, count, outcomes, nextFen, mover, oppEloSum, oppEloCount, lastPlayed })
  private transitions: Map<string, Map<string, { san: string; uci: string; count: number; outcomes: OutcomeCounts; nextFen: string; mover: 'white' | 'black'; oppEloSum: number; oppEloCount: number; lastPlayed?: number }>> = new Map();
  // fen -> list of results for games that reached this fen
  private results: Map<string, Array<{ white?: string; black?: string; result?: string }>> = new Map();
  // fen -> max count for this position (like openingtree's playedByMax)
  private maxCounts: Map<string, number> = new Map();

  reset() {
    this.transitions.clear();
    this.results.clear();
    this.maxCounts.clear();
  }

  addGame(game: NormalizedGame) {
    if (!game?.pgn) return;
    const ch = new Chess();
    try {
      ch.loadPgn(game.pgn);
    } catch {
      return;
    }

    // Re-run the game step by step to capture FEN before each move
    const replay = new Chess();
    const verbose = ch.history({ verbose: true });

    const allFensVisited: string[] = [replay.fen()];

    for (const mv of verbose) {
      const from = mv.from as Square;
      const to = mv.to as Square;
      const promo = mv.promotion as string | undefined;
      const uci = `${from}${to}${promo || ""}`;
      const san = mv.san as string;
      const currentFen = replay.fen();
      const mover: 'white' | 'black' = replay.turn() === 'w' ? 'white' : 'black';

      // Push to get next FEN
      replay.move({ from, to, promotion: promo as any });
      const nextFen = replay.fen();
      allFensVisited.push(nextFen);

      if (!this.transitions.has(currentFen)) this.transitions.set(currentFen, new Map());
      const m = this.transitions.get(currentFen)!;
      if (!m.has(uci)) m.set(uci, { san, uci, count: 0, outcomes: { w: 0, d: 0, l: 0 }, nextFen, mover, oppEloSum: 0, oppEloCount: 0 });
      const rec = m.get(uci)!;
      rec.count += 1;
      
      // Track max count for this position (like openingtree's playedByMax)
      const currentMax = this.maxCounts.get(currentFen) || 0;
      this.maxCounts.set(currentFen, Math.max(currentMax, rec.count));
      // accumulate opponent Elo for mover if available
      const wElo = (game.white as any)?.rating as number | undefined;
      const bElo = (game.black as any)?.rating as number | undefined;
      const opp = mover === 'white' ? bElo : wElo;
      if (typeof opp === 'number' && !Number.isNaN(opp)) {
        rec.oppEloSum += opp;
        rec.oppEloCount += 1;
      }
      const end = (game as any)?.end_time as number | undefined;
      if (typeof end === 'number') {
        rec.lastPlayed = Math.max(rec.lastPlayed || 0, end);
      }
      // outcomes tallied per-game after knowing final result below
    }

    // Determine final result
    const res = (game.result || "").trim();
    let outcome: OutcomeCounts = { w: 0, d: 0, l: 0 };
    if (res === "1-0") outcome = { w: 1, d: 0, l: 0 };
    else if (res === "0-1") outcome = { w: 0, d: 0, l: 1 };
    else if (res === "1/2-1/2") outcome = { w: 0, d: 1, l: 0 };

    // Attribute outcome to each transition from positions visited in this game
    const replay2 = new Chess();
    for (const mv of verbose) {
      const uci = `${mv.from}${mv.to}${mv.promotion || ""}`;
      const currentFen = replay2.fen();
      const m = this.transitions.get(currentFen)?.get(uci);
      if (m) {
        m.outcomes.w += outcome.w;
        m.outcomes.d += outcome.d;
        m.outcomes.l += outcome.l;
      }
      replay2.move({ from: mv.from as Square, to: mv.to as Square, promotion: mv.promotion as any });
    }

    // Record that this game reached each position
    const wname = game.white?.username;
    const bname = game.black?.username;
    const gameData = { 
      white: wname, 
      black: bname, 
      result: game.result,
      pgn: game.pgn,
      // Include additional data that might be available
      ...(game as any).end_time && { end_time: (game as any).end_time },
      ...(game as any).white?.rating && { whiteRating: (game as any).white.rating },
      ...(game as any).black?.rating && { blackRating: (game as any).black.rating },
    };
    
    for (const f of allFensVisited) {
      if (!this.results.has(f)) this.results.set(f, []);
      this.results.get(f)!.push(gameData);
    }
  }

  movesForFen(fen: string): MoveStat[] {
    const map = this.transitions.get(fen);
    if (!map) return [];
    const items = Array.from(map.values());
    const maxCount = this.maxCounts.get(fen) || 1;
    
    return items
      .map((it) => {
        const wins = it.outcomes.w;
        const draws = it.outcomes.d;
        const losses = it.outcomes.l;
        const total = wins + draws + losses || 1;
        
        // Calculate frequency level like openingtree
        const ratio = it.count / maxCount;
        let level = 1;
        if (ratio > 0.8) level = 3;
        else if (ratio > 0.3) level = 2;
        
        return {
          san: it.san,
          uci: it.uci,
          nextFen: it.nextFen,
          count: it.count,
          wins,
          draws,
          losses,
          winPct: (wins / total) * 100,
          drawPct: (draws / total) * 100,
          lossPct: (losses / total) * 100,
          mover: it.mover,
          avgOpponentElo: it.oppEloCount ? Math.round(it.oppEloSum / it.oppEloCount) : undefined,
          lastPlayed: it.lastPlayed,
          level,
          maxCount,
          orig: it.uci.slice(0, 2), // extract from/to squares like openingtree
          dest: it.uci.slice(2, 4),
        } as MoveStat;
      })
      .sort((a, b) => b.count - a.count);
  }

  gameResultsForFen(fen: string) {
    return this.results.get(fen) || [];
  }
}

export function uciFromTo(uci: string): { from: Square; to: Square } | null {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square };
}

// utils/fenAfter.ts
import { Chess } from "chess.js";

/**
 * Returns FEN after applying PV moves[0..idx] on top of rootFen (inclusive).
 * Works with UCI moves like "e2e4" or SAN like "Bb5".
 */
export function fenAfter(rootFen: string, moves: string[], idx: number): string {
  const ch = new Chess(rootFen);
  for (let i = 0; i <= idx; i++) {
    const m = moves[i];
    if (!m) break;
    // try UCI format first
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)) {
      ch.move({
        from: m.slice(0, 2),
        to: m.slice(2, 4),
        promotion: m.length === 5 ? (m[4] as 'q' | 'r' | 'b' | 'n') : undefined,
      });
    } else {
      ch.move(m); // fall back to SAN
    }
  }
  return ch.fen();
}

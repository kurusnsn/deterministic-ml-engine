import { Chess } from "chess.js";

/**
 * Game phase types
 */
export type GamePhase = "opening" | "middlegame" | "endgame";

/**
 * Piece values in pawn units (standard simplified values)
 */
const PIECE_VALUES: Record<string, number> = {
  p: 1, // Pawn
  n: 3, // Knight
  b: 3, // Bishop
  r: 5, // Rook
  q: 9, // Queen
  k: 0, // King (not counted for material)
};

/**
 * Material count result
 */
interface MaterialCount {
  white: number;
  black: number;
  total: number;
  difference: number;
  queenCount: number;
}

/**
 * Calculate total material for both sides
 * @param fen - FEN string or Chess instance
 * @returns Material count breakdown
 */
function calculateMaterial(fen: string | Chess): MaterialCount {
  const chess = typeof fen === "string" ? new Chess(fen) : fen;
  const board = chess.board();

  let whiteMaterial = 0;
  let blackMaterial = 0;
  let queenCount = 0;

  // Iterate through all squares
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = board[row][col];
      if (!square) continue;

      const piece = square.type.toLowerCase();
      const value = PIECE_VALUES[piece] || 0;

      if (square.color === "w") {
        whiteMaterial += value;
      } else {
        blackMaterial += value;
      }

      // Count queens
      if (piece === "q") {
        queenCount++;
      }
    }
  }

  return {
    white: whiteMaterial,
    black: blackMaterial,
    total: whiteMaterial + blackMaterial,
    difference: Math.abs(whiteMaterial - blackMaterial),
    queenCount,
  };
}

/**
 * Classify game phase based on material-based heuristic
 *
 * Rules:
 * - Opening: Both queens on board, material >= 46, material difference <= 3
 * - Endgame:
 *   - No queens AND material <= 20, OR
 *   - One queen AND material <= 12, OR
 *   - Material <= 15 regardless of queens
 * - Middlegame: Everything else
 *
 * @param fen - FEN string or Chess instance
 * @returns Game phase classification
 */
export function classifyGamePhase(fen: string | Chess): GamePhase {
  const material = calculateMaterial(fen);

  // === OPENING PHASE ===
  // All conditions must be true:
  // 1. Both queens are still on the board
  // 2. Material is still near full (>= 46 pawn units)
  // 3. Material is not significantly imbalanced (<= 3 pawn units difference)
  if (
    material.queenCount === 2 &&
    material.total >= 46 &&
    material.difference <= 3
  ) {
    return "opening";
  }

  // === ENDGAME PHASE ===
  // Any of these conditions trigger endgame:

  // Condition A: Strong endgame trigger (no queens, low material)
  if (material.queenCount === 0 && material.total <= 20) {
    return "endgame";
  }

  // Condition B: Minor endgame with one queen
  if (material.queenCount === 1 && material.total <= 12) {
    return "endgame";
  }

  // Condition C: Heavy simplification (very low material regardless of queens)
  if (material.total <= 15) {
    return "endgame";
  }

  // === MIDDLEGAME PHASE ===
  // Default: neither opening nor endgame
  return "middlegame";
}

/**
 * Get detailed phase classification with material breakdown
 * @param fen - FEN string or Chess instance
 * @returns Detailed phase classification info
 */
export function classifyGamePhaseDetailed(fen: string | Chess) {
  const material = calculateMaterial(fen);
  const phase = classifyGamePhase(fen);

  return {
    phase,
    material: {
      white: material.white,
      black: material.black,
      total: material.total,
      difference: material.difference,
      queenCount: material.queenCount,
    },
    conditions: {
      isOpening:
        material.queenCount === 2 &&
        material.total >= 46 &&
        material.difference <= 3,
      isEndgameConditionA: material.queenCount === 0 && material.total <= 20,
      isEndgameConditionB: material.queenCount === 1 && material.total <= 12,
      isEndgameConditionC: material.total <= 15,
    },
  };
}

/**
 * Helper function to get phase color for UI
 * @param phase - Game phase
 * @returns Tailwind color class
 */
export function getPhaseColor(phase: GamePhase): string {
  switch (phase) {
    case "opening":
      return "text-green-600 bg-green-50";
    case "middlegame":
      return "text-blue-600 bg-blue-50";
    case "endgame":
      return "text-purple-600 bg-purple-50";
    default:
      return "text-gray-600 bg-gray-50";
  }
}

/**
 * Helper function to get phase icon
 * @param phase - Game phase
 * @returns Icon name or emoji
 */
export function getPhaseIcon(phase: GamePhase): string {
  switch (phase) {
    case "opening":
      return "🌅"; // Dawn/sunrise for opening
    case "middlegame":
      return "⚔️"; // Crossed swords for battle
    case "endgame":
      return "🏁"; // Checkered flag for finish
    default:
      return "♟️";
  }
}

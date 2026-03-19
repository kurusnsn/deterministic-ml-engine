import { MoveClassification } from "@/components/MoveClassificationBadge";

/**
 * Represents a position's evaluation score
 * Can be either a centipawn value or a mate score
 */
export type EvalScore = {
  type: 'cp' | 'mate';
  value: number; // centipawns or mate in N moves
};

/**
 * Parameters for move classification
 */
export interface MoveClassificationParams {
  evalBeforeMove: EvalScore;
  evalAfterMove: EvalScore;
  bestMoveEval: EvalScore;
  secondBestMoveEval?: EvalScore;
  isWhiteToMove: boolean;
  moveNumber: number;
  isCapture?: boolean;
  isSacrifice?: boolean;
  isOnlyGoodMove?: boolean; // Only one move maintains advantage
  isBook?: boolean;
}

/**
 * Classifies a move based on Stockfish evaluation
 *
 * Algorithm based on chess.com and lichess classification systems:
 * - Brilliant: Best move that involves a sacrifice or is the only good move (Lichess-style)
 * - Great: Significantly better than 2nd best move (>= 100cp advantage over 2nd best, Lichess-style)
 * - Best: The engine's top choice
 * - Excellent: Very close to best (<= 10cp worse)
 * - Good: Reasonable move (<= 50cp worse)
 * - Book: Opening theory move (detected by backend via ECO database lookup)
 * - Inaccuracy: Small mistake (50-100cp loss)
 * - Mistake: Moderate error (100-250cp loss)
 * - Blunder: Major error (250-500cp loss)
 * - Miss: Critical blunder (>500cp loss or missed mate)
 *
 * @param params - Classification parameters
 * @returns The classification of the move
 */
export function classifyMove(params: MoveClassificationParams): MoveClassification {
  const {
    evalBeforeMove,
    evalAfterMove,
    bestMoveEval,
    secondBestMoveEval,
    isWhiteToMove,
    moveNumber,
    isCapture = false,
    isSacrifice = false,
    isOnlyGoodMove = false,
    isBook = false,
  } = params;

  // Convert evaluations to centipawns from the moving player's perspective
  const afterCp = evalScoreToCp(evalAfterMove, isWhiteToMove);
  const bestCp = evalScoreToCp(bestMoveEval, isWhiteToMove);

  // Calculate centipawn loss (how much worse the played move is compared to best)
  const cpLoss = bestCp - afterCp;

  // Check if this is the best move or extremely close
  const isBestMove = cpLoss <= 10; // Within 0.1 pawns

  // Brilliant: Best move that is a sacrifice or only good move in a complex position
  // (Lichess-style: sacrifice OR only good move, not based on cp advantage)
  // Check brilliant/great BEFORE book so brilliant book moves show as brilliant
  if (isBestMove && (isSacrifice || isOnlyGoodMove)) {
    return 'brilliant';
  }

  // Great: Significantly better than 2nd best alternative (Lichess-style: ≥100cp)
  if (isBestMove && secondBestMoveEval) {
    const secondBestCp = evalScoreToCp(secondBestMoveEval, isWhiteToMove);
    const advantageOver2ndBest = bestCp - secondBestCp;
    if (advantageOver2ndBest >= 100) { // 1.0 pawns better than 2nd best (Lichess threshold)
      return 'great';
    }
  }

  // Blunder: Critical error (>5.0 pawns or missed mate) - worst classification
  if (cpLoss > 500 || (bestMoveEval.type === 'mate' && evalAfterMove.type !== 'mate')) {
    return 'blunder';
  }

  // Miss: Major error (2.5-5.0 pawns)
  if (cpLoss > 250) {
    return 'miss';
  }

  // Book move
  if (isBook) {
    return 'book';
  }

  // Note: Book moves are now detected by the backend by checking if the resulting position
  // is in the ECO database. The backend returns 'book' classification directly.
  // We no longer use a simple moveNumber <= 10 heuristic.

  // Best: The top move
  if (isBestMove) {
    return 'best';
  }

  // Excellent: Very close to best
  if (cpLoss <= 30) { // 0.1-0.3 pawns
    return 'excellent';
  }

  // Good: Reasonable move
  if (cpLoss <= 50) { // 0.3-0.5 pawns
    return 'good';
  }

  // Inaccuracy: Small mistake
  if (cpLoss <= 100) { // 0.5-1.0 pawns
    return 'inaccuracy';
  }

  // Mistake: Moderate error
  if (cpLoss <= 250) { // 1.0-2.5 pawns
    return 'mistake';
  }

  return 'blunder';
}

/**
 * Converts an EvalScore to centipawns from a player's perspective
 * @param score - The evaluation score
 * @param fromWhitePerspective - Whether to evaluate from white's perspective
 * @returns Centipawns (positive = advantage for the player)
 */
function evalScoreToCp(score: EvalScore, fromWhitePerspective: boolean): number {
  let cp: number;

  if (score.type === 'mate') {
    // Mate scores: use a large value (10000 cp = 100 pawns)
    // Positive mate value means the player is giving mate
    // Negative mate value means the player is getting mated
    const mateValue = score.value > 0 ? 10000 : -10000;
    // Adjust based on mate distance (closer mate is better)
    const mateDistance = Math.abs(score.value);
    cp = mateValue + (score.value > 0 ? -mateDistance * 10 : mateDistance * 10);
  } else {
    // Regular centipawn score
    cp = score.value;
  }

  // Flip the sign if evaluating from black's perspective
  return fromWhitePerspective ? cp : -cp;
}

/**
 * Parses a Stockfish evaluation string or number into an EvalScore
 * @param evalValue - The evaluation (pawn string like "+0.34", centipawns number, or "mate N" string)
 * @returns Parsed EvalScore in centipawns
 */
export function parseEval(evalValue: number | string): EvalScore {
  if (typeof evalValue === 'string') {
    // Handle mate scores like "mate 3" or "mate -2" or "#3"
    if (evalValue.toLowerCase().includes('mate') || evalValue.startsWith('#')) {
      const mateMatch = evalValue.match(/-?\d+/);
      const mateIn = mateMatch ? parseInt(mateMatch[0]) : 1;
      return { type: 'mate', value: mateIn };
    }
    // Try to parse as number - assume pawn units (e.g., "+0.34" = 34cp)
    // Convert to centipawns by multiplying by 100
    const numValue = parseFloat(evalValue);
    if (!isNaN(numValue)) {
      // Values like "+0.34" are in pawns, convert to centipawns
      return { type: 'cp', value: Math.round(numValue * 100) };
    }
    // Default to 0 if parsing fails
    return { type: 'cp', value: 0 };
  }

  // Number is assumed to be centipawns already
  return { type: 'cp', value: evalValue };
}

/**
 * Simplified classification based on eval change (for backward compatibility)
 * This is the algorithm currently used in game-review
 *
 * @param prevEval - Evaluation before the move (in pawns)
 * @param currentEval - Evaluation after the move (in pawns)
 * @returns The classification of the move
 */
export function classifyMoveByEvalChange(
  prevEval: number,
  currentEval: number
): MoveClassification {
  const evalDiff = Math.abs(currentEval - prevEval);

  if (evalDiff > 3) return 'blunder';
  if (evalDiff > 1.5) return 'mistake';
  if (evalDiff > 0.5) return 'inaccuracy';
  if (evalDiff < 0.1) return 'best';

  return 'good';
}

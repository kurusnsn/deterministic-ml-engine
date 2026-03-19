import { Chess, Move } from "chess.js";
import { EvalScore, parseEval } from "./moveClassification";
import { GamePhase, classifyGamePhase } from "./gamePhaseClassification";

/**
 * Analysis data for a single move with evaluation context
 */
export interface MoveAnalysis {
  moveNumber: number;              // Full move number (1, 2, 3...)
  fen: string;                     // FEN after the move
  evalBefore: EvalScore;           // Evaluation before move
  evalAfter: EvalScore;            // Evaluation after move
  bestEval?: EvalScore;            // Best possible evaluation (optional)
  isWhiteMove: boolean;            // True if white's move
  phase: GamePhase;                // Game phase during this move
  san?: string;                    // Move in SAN notation
  cpLoss?: number;                 // Calculated cp loss (cached)
}

/**
 * Complete accuracy analysis for a game
 */
export interface AccuracyResult {
  overall: number;                 // Overall game accuracy (0-100)

  byPlayer: {
    white: number;                 // White's accuracy (0-100)
    black: number;                 // Black's accuracy (0-100)
  };

  byPhase: {
    opening: number | null;        // Opening accuracy or null if no opening
    middlegame: number | null;     // Middlegame accuracy or null
    endgame: number | null;        // Endgame accuracy or null
  };

  byPlayerAndPhase: {
    white: {
      opening: number | null;
      middlegame: number | null;
      endgame: number | null;
    };
    black: {
      opening: number | null;
      middlegame: number | null;
      endgame: number | null;
    };
  };

  stats: {
    totalMoves: number;            // Total moves analyzed
    whiteMovesCount: number;       // White's move count
    blackMovesCount: number;       // Black's move count
    averageCpLoss: number;         // Overall average cp loss
    averageCpLossByPlayer: {
      white: number;
      black: number;
    };
    phaseDistribution: {           // Move count per phase
      opening: number;
      middlegame: number;
      endgame: number;
    };
  };
}

/**
 * Centipawn loss statistics for a group of moves
 */
export interface CentipawnLossStats {
  totalCpLoss: number;             // Sum of all cp losses
  moveCount: number;               // Number of moves
  averageCpLoss: number;           // Average cp loss per move
  maxCpLoss: number;               // Worst single move
  perfectMoves: number;            // Moves with 0 cp loss
}

/**
 * Convert an EvalScore to centipawns from a player's perspective
 * (Re-exported from moveClassification.ts for internal use)
 */
function evalScoreToCp(score: EvalScore, fromWhitePerspective: boolean): number {
  let cp: number;

  if (score.type === "mate") {
    // Mate scores: use a large value (10000 cp = 100 pawns)
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
 * Convert average centipawn loss to accuracy percentage
 * Uses Chess.com's exponential decay formula
 *
 * @param averageCpLoss - Average centipawn loss per move
 * @returns Accuracy percentage (0-100)
 *
 * @example
 * cpLossToAccuracy(0)   // ~100%
 * cpLossToAccuracy(25)  // ~90%
 * cpLossToAccuracy(50)  // ~80%
 */
export function cpLossToAccuracy(averageCpLoss: number): number {
  // Chess.com-style formula: 103.1668 * e^(-0.004 * cpLoss) - 3.1669
  // Adjusted decay constant for better scaling across skill levels
  const accuracy = 103.1668 * Math.exp(-0.004 * averageCpLoss) - 3.1669;

  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, accuracy));
}

/**
 * Calculate centipawn loss for a single move
 *
 * @param evalBefore - Evaluation before the move
 * @param evalAfter - Evaluation after the move
 * @param isWhiteMove - Whether this is white's move
 * @returns Centipawn loss (always >= 0)
 *
 * @example
 * const cpLoss = calculateMoveCpLoss(
 *   { type: 'cp', value: 50 },
 *   { type: 'cp', value: -30 },
 *   true  // white's move
 * ); // Returns 80 (lost 80 centipawns)
 */
export function calculateMoveCpLoss(
  evalBefore: EvalScore,
  evalAfter: EvalScore,
  isWhiteMove: boolean
): number {
  // Convert evaluations to centipawns from the moving player's perspective
  const cpBefore = evalScoreToCp(evalBefore, isWhiteMove);
  const cpAfter = evalScoreToCp(evalAfter, isWhiteMove);

  // Loss = decrease in evaluation from player's perspective
  const loss = cpBefore - cpAfter;

  // Only count losses (not gains from opponent mistakes)
  return Math.max(0, loss);
}

/**
 * Filter moves by player and/or phase
 *
 * @param moves - All moves
 * @param options - Filter criteria
 * @returns Filtered moves
 *
 * @example
 * const whiteMoves = filterMoves(allMoves, { player: 'white' });
 * const openingMoves = filterMoves(allMoves, { phase: 'opening' });
 * const whiteOpening = filterMoves(allMoves, {
 *   player: 'white',
 *   phase: 'opening'
 * });
 */
export function filterMoves(
  moves: MoveAnalysis[],
  options: {
    player?: "white" | "black";
    phase?: GamePhase | GamePhase[];
  }
): MoveAnalysis[] {
  let filtered = moves;

  if (options.player) {
    filtered = filtered.filter((m) =>
      options.player === "white" ? m.isWhiteMove : !m.isWhiteMove
    );
  }

  if (options.phase) {
    const phases = Array.isArray(options.phase) ? options.phase : [options.phase];
    filtered = filtered.filter((m) => phases.includes(m.phase));
  }

  return filtered;
}

/**
 * Calculate centipawn loss statistics for a group of moves
 *
 * @param moves - Moves to analyze
 * @returns Statistics about centipawn losses
 */
export function calculateCpLossStats(
  moves: MoveAnalysis[]
): CentipawnLossStats {
  if (moves.length === 0) {
    return {
      totalCpLoss: 0,
      moveCount: 0,
      averageCpLoss: 0,
      maxCpLoss: 0,
      perfectMoves: 0,
    };
  }

  let totalCpLoss = 0;
  let maxCpLoss = 0;
  let perfectMoves = 0;

  moves.forEach((move) => {
    const cpLoss =
      move.cpLoss ??
      calculateMoveCpLoss(move.evalBefore, move.evalAfter, move.isWhiteMove);

    totalCpLoss += cpLoss;
    maxCpLoss = Math.max(maxCpLoss, cpLoss);
    if (cpLoss === 0) perfectMoves++;
  });

  return {
    totalCpLoss,
    moveCount: moves.length,
    averageCpLoss: totalCpLoss / moves.length,
    maxCpLoss,
    perfectMoves,
  };
}

/**
 * Build MoveAnalysis array from game history with evaluations
 * This is the main bridge function for components
 *
 * @param gameHistory - Chess.js move history (verbose)
 * @param evaluations - Evaluation for each position (including start)
 * @param startingFen - Starting FEN (defaults to standard start position)
 * @returns Array of move analysis ready for accuracy calculation
 *
 * @example
 * const game = new Chess();
 * // ... play moves ...
 * const history = game.history({ verbose: true });
 * const evals = await fetchEvaluationsForGame(history);
 * const analysis = buildMoveAnalysis(history, evals);
 */
export function buildMoveAnalysis(
  gameHistory: Move[],
  evaluations: EvalScore[],
  startingFen: string = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
): MoveAnalysis[] {
  if (evaluations.length !== gameHistory.length + 1) {
    throw new Error(
      `Evaluations array length (${evaluations.length}) must be game history length + 1 (${gameHistory.length + 1})`
    );
  }

  const analysis: MoveAnalysis[] = [];
  const game = new Chess(startingFen);

  gameHistory.forEach((move, index) => {
    const fenBefore = game.fen();
    const evalBefore = evaluations[index];

    // Make the move
    game.move(move);

    const fenAfter = game.fen();
    const evalAfter = evaluations[index + 1];
    const phase = classifyGamePhase(fenAfter);

    analysis.push({
      moveNumber: Math.floor(index / 2) + 1,
      fen: fenAfter,
      evalBefore,
      evalAfter,
      isWhiteMove: move.color === "w",
      phase,
      san: move.san,
    });
  });

  return analysis;
}

/**
 * Main function: Calculate complete game accuracy from move analysis
 *
 * @param moves - Array of analyzed moves with evaluations
 * @returns Complete accuracy breakdown by player and phase
 *
 * @example
 * const moves = buildMoveAnalysis(gameHistory, evaluations);
 * const accuracy = calculateGameAccuracy(moves);
 * console.log(`White: ${accuracy.byPlayer.white}%`);
 */
export function calculateGameAccuracy(moves: MoveAnalysis[]): AccuracyResult {
  // Initialize statistics collectors
  const cpLossesByPlayerPhase: {
    white: {
      opening: number[];
      middlegame: number[];
      endgame: number[];
    };
    black: {
      opening: number[];
      middlegame: number[];
      endgame: number[];
    };
  } = {
    white: {
      opening: [],
      middlegame: [],
      endgame: [],
    },
    black: {
      opening: [],
      middlegame: [],
      endgame: [],
    },
  };

  // Categorize and calculate cp loss for each move
  moves.forEach((move) => {
    const player = move.isWhiteMove ? "white" : "black";
    const phase = move.phase;
    const cpLoss = calculateMoveCpLoss(
      move.evalBefore,
      move.evalAfter,
      move.isWhiteMove
    );

    cpLossesByPlayerPhase[player][phase].push(cpLoss);
  });

  // Helper to calculate accuracy for array of cp losses
  const calcAccuracy = (cpLosses: number[]): number | null => {
    if (cpLosses.length === 0) return null;
    const avg = cpLosses.reduce((a, b) => a + b, 0) / cpLosses.length;
    return cpLossToAccuracy(avg);
  };

  // Helper to calculate average cp loss
  const calcAvgCpLoss = (cpLosses: number[]): number => {
    if (cpLosses.length === 0) return 0;
    return cpLosses.reduce((a, b) => a + b, 0) / cpLosses.length;
  };

  // Aggregate cp losses for each player
  const whiteCpLosses = [
    ...cpLossesByPlayerPhase.white.opening,
    ...cpLossesByPlayerPhase.white.middlegame,
    ...cpLossesByPlayerPhase.white.endgame,
  ];

  const blackCpLosses = [
    ...cpLossesByPlayerPhase.black.opening,
    ...cpLossesByPlayerPhase.black.middlegame,
    ...cpLossesByPlayerPhase.black.endgame,
  ];

  const allCpLosses = [...whiteCpLosses, ...blackCpLosses];

  // Calculate accuracies for each combination
  const result: AccuracyResult = {
    overall: calcAccuracy(allCpLosses) ?? 0,
    byPlayer: {
      white: calcAccuracy(whiteCpLosses) ?? 0,
      black: calcAccuracy(blackCpLosses) ?? 0,
    },
    byPhase: {
      opening: calcAccuracy([
        ...cpLossesByPlayerPhase.white.opening,
        ...cpLossesByPlayerPhase.black.opening,
      ]),
      middlegame: calcAccuracy([
        ...cpLossesByPlayerPhase.white.middlegame,
        ...cpLossesByPlayerPhase.black.middlegame,
      ]),
      endgame: calcAccuracy([
        ...cpLossesByPlayerPhase.white.endgame,
        ...cpLossesByPlayerPhase.black.endgame,
      ]),
    },
    byPlayerAndPhase: {
      white: {
        opening: calcAccuracy(cpLossesByPlayerPhase.white.opening),
        middlegame: calcAccuracy(cpLossesByPlayerPhase.white.middlegame),
        endgame: calcAccuracy(cpLossesByPlayerPhase.white.endgame),
      },
      black: {
        opening: calcAccuracy(cpLossesByPlayerPhase.black.opening),
        middlegame: calcAccuracy(cpLossesByPlayerPhase.black.middlegame),
        endgame: calcAccuracy(cpLossesByPlayerPhase.black.endgame),
      },
    },
    stats: {
      totalMoves: moves.length,
      whiteMovesCount: whiteCpLosses.length,
      blackMovesCount: blackCpLosses.length,
      averageCpLoss: calcAvgCpLoss(allCpLosses),
      averageCpLossByPlayer: {
        white: calcAvgCpLoss(whiteCpLosses),
        black: calcAvgCpLoss(blackCpLosses),
      },
      phaseDistribution: {
        opening:
          cpLossesByPlayerPhase.white.opening.length +
          cpLossesByPlayerPhase.black.opening.length,
        middlegame:
          cpLossesByPlayerPhase.white.middlegame.length +
          cpLossesByPlayerPhase.black.middlegame.length,
        endgame:
          cpLossesByPlayerPhase.white.endgame.length +
          cpLossesByPlayerPhase.black.endgame.length,
      },
    },
  };

  return result;
}

# Game Accuracy Algorithm

Centipawn-loss-based accuracy calculation for chess games with phase breakdown (opening/middlegame/endgame).

## Overview

This algorithm calculates player accuracy based on how much centipawn value they lose compared to the best moves (perfect play). It uses Chess.com's exponential decay formula to convert centipawn loss into a 0-100% accuracy score.

## Key Concepts

### Centipawn Loss

Centipawn loss measures how much worse a played move is compared to the best move:
- **0 cp loss** = Perfect move (played the best move)
- **10-30 cp loss** = Excellent move (very close to best)
- **50-100 cp loss** = Inaccuracy (small mistake)
- **100-250 cp loss** = Mistake (moderate error)
- **250+ cp loss** = Blunder (major error)

### Accuracy Formula

```typescript
accuracy = 103.1668 * e^(-0.004 * avgCpLoss) - 3.1669
```

**Scaling:**
- 0 cp avg loss → ~100% accuracy
- 10 cp avg loss → ~96% accuracy
- 25 cp avg loss → ~90% accuracy
- 50 cp avg loss → ~80% accuracy
- 100 cp avg loss → ~66% accuracy

## API Reference

### Core Types

```typescript
interface MoveAnalysis {
  moveNumber: number;      // Move number (1, 2, 3...)
  fen: string;            // Position after move
  evalBefore: EvalScore;  // Eval before move
  evalAfter: EvalScore;   // Eval after move
  bestEval?: EvalScore;   // Best possible eval
  isWhiteMove: boolean;   // True for white
  phase: GamePhase;       // "opening" | "middlegame" | "endgame"
  san?: string;           // Move notation (e.g., "Nf3")
  cpLoss?: number;        // Cached centipawn loss
}

interface AccuracyResult {
  overall: number;        // Overall game accuracy (0-100)

  byPlayer: {
    white: number;
    black: number;
  };

  byPhase: {
    opening: number | null;
    middlegame: number | null;
    endgame: number | null;
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
    totalMoves: number;
    whiteMovesCount: number;
    blackMovesCount: number;
    averageCpLoss: number;
    averageCpLossByPlayer: { white: number; black: number };
    phaseDistribution: { opening: number; middlegame: number; endgame: number };
  };
}
```

### Functions

#### `calculateGameAccuracy(moves: MoveAnalysis[]): AccuracyResult`

Main function to calculate complete accuracy breakdown.

```typescript
const analysis = buildMoveAnalysis(gameHistory, evaluations);
const accuracy = calculateGameAccuracy(analysis);

console.log(`White: ${accuracy.byPlayer.white.toFixed(1)}%`);
console.log(`Black: ${accuracy.byPlayer.black.toFixed(1)}%`);
console.log(`Opening: ${accuracy.byPhase.opening?.toFixed(1)}%`);
```

#### `buildMoveAnalysis(gameHistory: Move[], evaluations: EvalScore[], startingFen?: string): MoveAnalysis[]`

Bridge function to convert Chess.js game history into MoveAnalysis format.

```typescript
import { Chess } from "chess.js";
import { buildMoveAnalysis } from "@/lib/gameAccuracy";

const game = new Chess();
// ... play moves ...

const history = game.history({ verbose: true });
const evaluations = await fetchEvaluationsForGame(history);
const analysis = buildMoveAnalysis(history, evaluations);
```

**Important:** Evaluations array must have length = gameHistory.length + 1 (includes starting position).

#### `calculateMoveCpLoss(evalBefore: EvalScore, evalAfter: EvalScore, isWhiteMove: boolean): number`

Calculate centipawn loss for a single move.

```typescript
const cpLoss = calculateMoveCpLoss(
  { type: "cp", value: 50 },   // Before: +0.5
  { type: "cp", value: -30 },  // After: -0.3
  true  // White's move
);
// Returns: 80 (lost 0.8 pawns)
```

#### `cpLossToAccuracy(averageCpLoss: number): number`

Convert average centipawn loss to accuracy percentage.

```typescript
cpLossToAccuracy(0)    // ~100%
cpLossToAccuracy(25)   // ~90%
cpLossToAccuracy(50)   // ~80%
cpLossToAccuracy(100)  // ~66%
```

#### `filterMoves(moves: MoveAnalysis[], options: {...}): MoveAnalysis[]`

Filter moves by player and/or phase.

```typescript
// Get white's moves
const whiteMoves = filterMoves(analysis, { player: "white" });

// Get opening moves
const openingMoves = filterMoves(analysis, { phase: "opening" });

// Get white's opening moves
const whiteOpening = filterMoves(analysis, {
  player: "white",
  phase: "opening"
});
```

#### `calculateCpLossStats(moves: MoveAnalysis[]): CentipawnLossStats`

Calculate statistics for a group of moves.

```typescript
const stats = calculateCpLossStats(whiteMoves);
console.log(`Average cp loss: ${stats.averageCpLoss}`);
console.log(`Perfect moves: ${stats.perfectMoves}`);
console.log(`Worst move: ${stats.maxCpLoss} cp`);
```

## Usage Examples

### Example 1: Analyze a Complete Game

```typescript
import { Chess } from "chess.js";
import { calculateGameAccuracy, buildMoveAnalysis } from "@/lib/gameAccuracy";
import { parseEval } from "@/lib/moveClassification";

async function analyzeGame(pgn: string) {
  const game = new Chess();
  game.loadPgn(pgn);

  const history = game.history({ verbose: true });

  // Fetch evaluations for each position
  const evaluations = [];
  game.reset();

  // Starting position
  let evalResult = await evaluate(game.fen());
  evaluations.push(parseEval(evalResult));

  // Each move
  for (const move of history) {
    game.move(move);
    evalResult = await evaluate(game.fen());
    evaluations.push(parseEval(evalResult));
  }

  // Calculate accuracy
  const analysis = buildMoveAnalysis(history, evaluations);
  const accuracy = calculateGameAccuracy(analysis);

  return accuracy;
}
```

### Example 2: Display in UI Component

```typescript
import { useMemo } from "react";
import { calculateGameAccuracy, buildMoveAnalysis } from "@/lib/gameAccuracy";

function GameReviewPage() {
  const [gameHistory, setGameHistory] = useState<Move[]>([]);
  const [evaluationHistory, setEvaluationHistory] = useState<EvalScore[]>([]);

  const accuracy = useMemo(() => {
    if (!gameHistory.length || !evaluationHistory.length) return null;

    const analysis = buildMoveAnalysis(gameHistory, evaluationHistory);
    return calculateGameAccuracy(analysis);
  }, [gameHistory, evaluationHistory]);

  return (
    <div>
      {accuracy && (
        <>
          <p>
            Accuracy: White {accuracy.byPlayer.white.toFixed(1)}% •
                      Black {accuracy.byPlayer.black.toFixed(1)}%
          </p>

          {/* Phase breakdown */}
          {accuracy.byPhase.opening && (
            <div>Opening: {accuracy.byPhase.opening.toFixed(1)}%</div>
          )}
          {accuracy.byPhase.middlegame && (
            <div>Middlegame: {accuracy.byPhase.middlegame.toFixed(1)}%</div>
          )}
          {accuracy.byPhase.endgame && (
            <div>Endgame: {accuracy.byPhase.endgame.toFixed(1)}%</div>
          )}
        </>
      )}
    </div>
  );
}
```

### Example 3: Phase-Specific Analysis

```typescript
import { filterMoves, calculateCpLossStats } from "@/lib/gameAccuracy";

function analyzeByPhase(analysis: MoveAnalysis[]) {
  const phases: GamePhase[] = ["opening", "middlegame", "endgame"];

  phases.forEach(phase => {
    const phaseMoves = filterMoves(analysis, { phase });

    if (phaseMoves.length === 0) {
      console.log(`${phase}: No moves in this phase`);
      return;
    }

    const whiteMoves = filterMoves(phaseMoves, { player: "white" });
    const blackMoves = filterMoves(phaseMoves, { player: "black" });

    const whiteStats = calculateCpLossStats(whiteMoves);
    const blackStats = calculateCpLossStats(blackMoves);

    console.log(`\n${phase.toUpperCase()}`);
    console.log(`White: ${whiteStats.averageCpLoss.toFixed(1)} avg cp loss`);
    console.log(`Black: ${blackStats.averageCpLoss.toFixed(1)} avg cp loss`);
  });
}
```

### Example 4: Find Critical Mistakes

```typescript
import { filterMoves } from "@/lib/gameAccuracy";

function findBlunders(analysis: MoveAnalysis[]) {
  const blunders = analysis
    .map((move, index) => {
      const cpLoss = calculateMoveCpLoss(
        move.evalBefore,
        move.evalAfter,
        move.isWhiteMove
      );
      return { ...move, cpLoss, index };
    })
    .filter(m => m.cpLoss >= 250) // Blunders = 250+ cp loss
    .sort((a, b) => b.cpLoss - a.cpLoss); // Worst first

  console.log("Critical mistakes:");
  blunders.forEach(blunder => {
    const player = blunder.isWhiteMove ? "White" : "Black";
    console.log(`Move ${blunder.moveNumber}. ${blunder.san} by ${player}: ${blunder.cpLoss} cp loss`);
  });
}
```

## Integration Points

### Game Review Page

Replace hardcoded accuracy values:

```typescript
// Before
const accuracy = { white: 85, black: 82 }; // Hardcoded

// After
const accuracy = useMemo(() => {
  const analysis = buildMoveAnalysis(gameHistory, evaluations);
  return calculateGameAccuracy(analysis);
}, [gameHistory, evaluations]);
```

### Analyze Page

Show real-time accuracy as positions are analyzed:

```typescript
const [accuracy, setAccuracy] = useState<AccuracyResult | null>(null);

useEffect(() => {
  if (gameHistory.length > 0 && evaluations.length > 0) {
    const analysis = buildMoveAnalysis(gameHistory, evaluations);
    setAccuracy(calculateGameAccuracy(analysis));
  }
}, [gameHistory, evaluations]);
```

## How It Works

### 1. Data Collection

For each move in the game:
- Get FEN before and after the move
- Get Stockfish evaluation for both positions
- Determine game phase (opening/middlegame/endgame)

### 2. Centipawn Loss Calculation

For each move:
```
cpLoss = max(0, evalBefore - evalAfter)
```
(from the moving player's perspective)

### 3. Aggregation

Group moves by player and phase, calculate average cp loss for each group.

### 4. Accuracy Conversion

Convert average cp loss to accuracy using the exponential formula:
```
accuracy = 103.1668 * e^(-0.004 * avgCpLoss) - 3.1669
```

### 5. Results

Return complete breakdown:
- Overall accuracy
- Per-player accuracy
- Per-phase accuracy
- Per-player-and-phase accuracy
- Statistics

## Edge Cases

### Games with One Phase

If a game only reaches the opening phase, middlegame and endgame accuracies will be `null`:

```typescript
const accuracy = calculateGameAccuracy(analysis);
if (accuracy.byPhase.middlegame === null) {
  console.log("Game ended in opening");
}
```

### Perfect Play

If a player makes only best moves (0 cp loss average), accuracy will be ~100%:

```typescript
accuracy.byPlayer.white  // ~99.9% (not exactly 100 due to formula)
```

### Empty Games

For empty move arrays, all values default to 0:

```typescript
const accuracy = calculateGameAccuracy([]);
accuracy.overall  // 0
accuracy.byPlayer.white  // 0
```

## Testing

Run the test suite:

```bash
npm test gameAccuracy.test.ts
```

The tests cover:
- ✅ Formula accuracy (expected scaling)
- ✅ Centipawn loss calculation (white/black perspective)
- ✅ Mate score handling
- ✅ Filtering by player/phase
- ✅ Statistics calculation
- ✅ Integration with Chess.js
- ✅ Edge cases (empty games, one-phase games, asymmetric performance)

## Performance Considerations

- **Caching**: The `MoveAnalysis` interface includes a `cpLoss` field for caching calculated values
- **Lazy Evaluation**: Phase classification is done per-move, not pre-computed
- **Memory**: For a 40-move game, ~40 `MoveAnalysis` objects (~10KB total)

## Dependencies

- `chess.js` - For move history and FEN handling
- `@/lib/moveClassification` - For `EvalScore` type and `evalScoreToCp()` utility
- `@/lib/gamePhaseClassification` - For phase determination

## Future Enhancements

Possible improvements:
- Weight recent moves higher in accuracy calculation
- Detect position complexity and adjust thresholds
- Include time pressure as a factor
- Comparative accuracy (vs opponent rating)
- Opening book detection (don't penalize "inaccuracies" in known theory)

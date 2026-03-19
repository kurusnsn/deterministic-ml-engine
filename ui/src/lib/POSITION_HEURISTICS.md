# Position Heuristics Engine

A comprehensive chess position evaluator that analyzes tactical patterns, positional features, and endgame characteristics. Designed for Sprint Chess mode to evaluate positions without search.

## Overview

The Position Heuristics Engine evaluates ONLY the resulting position after a move. It does not search alternative moves or compare with best play. All evaluations complete in under 50ms, making it suitable for real-time analysis.

## Key Features

### Tactical Pattern Detection
- **Forks**: One piece attacking multiple enemy pieces
- **Pins**: Pieces pinned to more valuable pieces or king
- **Hanging Pieces**: Undefended pieces under attack
- **Mate Threats**: Forced mate in 1 opportunities

### Positional Evaluation
- **Piece Activity**: Mobility and centralization
- **King Safety**: Pawn shield, open files, nearby attackers
- **Pawn Structure**: Isolated, doubled, passed pawns
- **Space Control**: Squares controlled by each side
- **File Control**: Open, semi-open, and closed files

### Endgame Features
- **Opposition**: King opposition status
- **Passed Pawns**: Distance to promotion, blockades
- **Rook Positioning**: 7th rank, open files, passed pawn support

## API Reference

### Core Types

```typescript
interface HeuristicEvaluation {
  // Position metadata
  fen: string;
  to_move: Color;
  evaluation_time_ms: number;

  // TACTICS
  tactics: {
    forks: Fork[];
    pins: Pin[];
    hanging_pieces: HangingPiece[];
    mate_threats: {
      white: MateThreat;
      black: MateThreat;
    };
  };

  // POSITIONAL
  positional: {
    piece_activity: {
      white: { mobility: number; centralization: number; };
      black: { mobility: number; centralization: number; };
    };
    king_safety: {
      white: {
        pawn_shield: number;           // 0-10
        open_files_near_king: number;
        attackers_near_king: number;
        safety_score: number;           // 0-10
      };
      black: { /* same */ };
    };
    pawn_structure: {
      white: PawnStructureDetails;
      black: PawnStructureDetails;
    };
    space: {
      white: number;
      black: number;
      center_control: { white: number; black: number; };
    };
    files: FileControl[];
  };

  // ENDGAME
  endgame: {
    opposition: Opposition;
    passed_pawns: PassedPawnEval[];
    rook_positioning: {
      white: RookPositioning;
      black: RookPositioning;
    };
  };

  // SUMMARY
  summary: {
    material: { white: number; black: number; };
    tactical_score: number;     // -10 to +10
    positional_score: number;   // -10 to +10
    endgame_score: number;      // -10 to +10
    overall_centipawns: number;
  };
}

interface Fork {
  attacker_square: Square;
  attacker_piece: string;
  targets: Square[];
  target_pieces: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface Pin {
  pinning_square: Square;
  pinning_piece: string;
  pinned_square: Square;
  pinned_piece: string;
  behind_square: Square;
  behind_piece: string;
  is_absolute: boolean;  // True if pinned to king
}

interface HangingPiece {
  square: Square;
  piece: string;
  value: number;
  attackers: number;
  defenders: number;
}

interface MateThreat {
  can_mate: boolean;
  mating_square?: Square;
  mating_piece?: string;
}

interface PawnStructureDetails {
  isolated: Square[];
  backward: Square[];
  passed: Square[];
  doubled: { file: string; squares: Square[] }[];
  chains: Square[][];
}

interface FileControl {
  file: string;
  status: 'open' | 'semi_open_white' | 'semi_open_black' | 'closed';
  controlled_by: 'white' | 'black' | 'contested' | 'neutral';
}

interface Opposition {
  has_opposition: 'white' | 'black' | 'none';
  king_distance: number;
  is_direct_opposition: boolean;
}

interface PassedPawnEval {
  square: Square;
  color: Color;
  promotion_distance: number;
  is_protected: boolean;
  is_blockaded: boolean;
  is_free: boolean;
}

interface RookPositioning {
  on_seventh_rank: Square[];
  on_open_files: Square[];
  behind_passed_pawns: Square[];
  active_rooks: number;
  passive_rooks: number;
}
```

### Functions

#### `evaluatePosition(position: Chess | string): HeuristicEvaluation`

Main function to evaluate a chess position comprehensively.

```typescript
import { Chess } from "chess.js";
import { evaluatePosition } from "@/lib/positionHeuristics";

const game = new Chess();
game.move("e4");
const evaluation = evaluatePosition(game);

console.log(`Material: ${evaluation.summary.material.white} vs ${evaluation.summary.material.black}`);
console.log(`Tactical score: ${evaluation.summary.tactical_score}`);
console.log(`Positional score: ${evaluation.summary.positional_score}`);
console.log(`Overall: ${evaluation.summary.overall_centipawns} centipawns`);
```

**Parameters:**
- `position`: Chess.js instance or FEN string

**Returns:**
- Complete heuristic evaluation (see `HeuristicEvaluation` interface)

**Performance:**
- Typical evaluation: 10-40ms
- Complex positions: < 50ms

#### `quickEvaluate(position: Chess | string): number`

Returns only the centipawn score for fast evaluation.

```typescript
const score = quickEvaluate(game);
console.log(`Position evaluation: ${score} centipawns`);
```

**Parameters:**
- `position`: Chess.js instance or FEN string

**Returns:**
- Overall centipawn score (positive = white advantage)

## Usage Examples

### Example 1: Tactical Analysis

```typescript
import { Chess } from "chess.js";
import { evaluatePosition } from "@/lib/positionHeuristics";

// Analyze for tactical patterns
const game = new Chess("r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4");
game.move("Ng5"); // Knight attacks f7

const evaluation = evaluatePosition(game);

// Check for forks
evaluation.tactics.forks.forEach(fork => {
  console.log(`Fork by ${fork.attacker_piece} on ${fork.attacker_square}`);
  console.log(`Targets: ${fork.targets.join(", ")}`);
  console.log(`Severity: ${fork.severity}`);
});

// Check for mate threats
if (evaluation.tactics.mate_threats.white.can_mate) {
  const threat = evaluation.tactics.mate_threats.white;
  console.log(`White can mate with ${threat.mating_piece} to ${threat.mating_square}`);
}
```

### Example 2: Positional Evaluation

```typescript
// Evaluate king safety and pawn structure
const evaluation = evaluatePosition(game);

const whiteKingSafety = evaluation.positional.king_safety.white;
console.log(`King safety score: ${whiteKingSafety.safety_score}/10`);
console.log(`Pawn shield: ${whiteKingSafety.pawn_shield}/10`);
console.log(`Open files near king: ${whiteKingSafety.open_files_near_king}`);

const whitePawns = evaluation.positional.pawn_structure.white;
console.log(`Isolated pawns: ${whitePawns.isolated.join(", ")}`);
console.log(`Passed pawns: ${whitePawns.passed.join(", ")}`);
console.log(`Doubled pawns: ${whitePawns.doubled.length} files`);
```

### Example 3: Endgame Analysis

```typescript
// Analyze endgame features
const game = new Chess("8/5k2/8/4P3/8/8/5K2/8 w - - 0 1");
const evaluation = evaluatePosition(game);

// Check opposition
const opp = evaluation.endgame.opposition;
if (opp.is_direct_opposition) {
  console.log(`${opp.has_opposition} has the opposition`);
}

// Analyze passed pawns
evaluation.endgame.passed_pawns.forEach(pawn => {
  console.log(`${pawn.color} passed pawn on ${pawn.square}`);
  console.log(`Distance to promotion: ${pawn.promotion_distance}`);
  console.log(`Protected: ${pawn.is_protected}, Blockaded: ${pawn.is_blockaded}`);
});
```

### Example 4: Real-Time Sprint Chess Evaluation

```typescript
import { quickEvaluate } from "@/lib/positionHeuristics";

function evaluateMove(game: Chess, move: string): number {
  // Make the move
  game.move(move);

  // Evaluate the resulting position
  const score = quickEvaluate(game);

  // Undo the move
  game.undo();

  return score;
}

// Find the best move by heuristic evaluation
const moves = game.moves();
let bestMove = moves[0];
let bestScore = -Infinity;

moves.forEach(move => {
  const score = evaluateMove(game, move);
  if (score > bestScore) {
    bestScore = score;
    bestMove = move;
  }
});

console.log(`Best move by heuristics: ${bestMove} (${bestScore} cp)`);
```

### Example 5: Display in UI Component

```typescript
import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { evaluatePosition } from "@/lib/positionHeuristics";

function PositionAnalysis() {
  const [game] = useState(() => new Chess());

  const evaluation = useMemo(() => {
    return evaluatePosition(game);
  }, [game]);

  return (
    <div>
      <h2>Position Evaluation</h2>

      {/* Material */}
      <div>
        Material: {evaluation.summary.material.white} - {evaluation.summary.material.black}
      </div>

      {/* Overall score */}
      <div>
        Evaluation: {evaluation.summary.overall_centipawns > 0 ? "+" : ""}
        {evaluation.summary.overall_centipawns} cp
      </div>

      {/* Tactical warnings */}
      {evaluation.tactics.hanging_pieces.length > 0 && (
        <div className="warning">
          {evaluation.tactics.hanging_pieces.length} hanging pieces!
        </div>
      )}

      {/* Mate threats */}
      {evaluation.tactics.mate_threats[game.turn()].can_mate && (
        <div className="alert">
          Mate in 1 available!
        </div>
      )}

      {/* King safety */}
      <div>
        King Safety: {evaluation.positional.king_safety.white.safety_score}/10
      </div>
    </div>
  );
}
```

## Evaluation Methodology

### Material Values

Standard piece values in centipawns:
- Pawn: 100
- Knight: 300
- Bishop: 300
- Rook: 500
- Queen: 900
- King: 0 (invaluable)

### Tactical Scoring

**Fork Severity:**
- Critical: Total target value ≥ 1200 (e.g., Q+R)
- High: Total target value ≥ 800 (e.g., Q+N)
- Medium: Total target value ≥ 500 (e.g., R+N)
- Low: Total target value < 500

**Pin Detection:**
- Absolute pin: Pinned to king (cannot legally move)
- Relative pin: Pinned to more valuable piece

### Positional Scoring

**King Safety (0-10 scale):**
- Base: Pawn shield strength (0-10)
- Penalty: -2 per open file near king
- Penalty: -1 per enemy attacker within 3 squares
- Clamped to 0-10 range

**Mobility:**
- Counts legal moves for side to move
- Approximates pseudo-legal attacks for opponent

**Centralization:**
- Counts minor pieces (N, B) in extended center (c3-f6 rectangle)
- Higher score = better piece placement

**Space Control:**
- Number of squares controlled by each side
- Center control specifically tracked (d4, d5, e4, e5)

### Endgame Scoring

**Opposition:**
- Direct opposition: Kings 2 squares apart on same file/rank
- Side NOT to move has the opposition

**Passed Pawn Evaluation:**
- Free passed pawn (can advance): High value
- Protected passed pawn: Moderate value
- Blockaded passed pawn: Lower value
- Distance to promotion: Closer = more valuable

**Rook Activity:**
- Active rook: On 7th rank or open file
- Passive rook: Blocked by own pawns

### Overall Score Calculation

```typescript
overall_centipawns =
  (white_material - black_material) +
  (tactical_score * 50) +
  (positional_score * 20) +
  (endgame_score * 30)
```

Component scores are clamped to -10 to +10 before weighting.

## Performance Considerations

**Optimization Techniques:**
- Precomputed square arrays (no runtime generation)
- Pseudo-legal move generation (faster than legal)
- Attack map caching per evaluation
- Single-pass material calculation

**Benchmarks:**
- Starting position: ~15-20ms
- Middlegame position: ~15-25ms
- Endgame position: ~10-15ms
- 100 evaluations: ~1.5-2.0 seconds

**Memory Usage:**
- Single evaluation: ~50KB (dominated by Chess.js instance)
- No persistent state between evaluations

## Limitations

### Not Implemented (Simplified)
- Skewers (requires x-ray attack completion)
- Overloaded defenders (complex defender counting)
- Discovered attacks (requires move history)
- Trapped pieces (requires extensive mobility analysis)
- Weak squares (requires pawn structure lookahead)
- Outposts (requires complex strategic evaluation)
- Backward pawns (requires chain analysis)
- Pawn chains (requires structure traversal)

### Approximations
- Opponent mobility uses pseudo-legal moves (not exact legal moves)
- X-ray attacks simplified (no full ray tracing)
- Hanging piece counting approximated (simplified attacker/defender count)

### Known Edge Cases
- Doesn't detect quiet positional sacrifices
- May overvalue material in sacrificial positions
- Doesn't understand fortress positions
- No understanding of zugzwang

## Future Enhancements

Possible improvements:
- Complete tactical pattern detection (skewers, discovered attacks, etc.)
- Dynamic piece-square tables for positional evaluation
- Piece coordination metrics
- Tempo evaluation
- Pawn storm detection
- Fortress and zugzwang recognition
- Performance optimization to achieve <10ms target

## Dependencies

- `chess.js` - Chess logic and move generation
- TypeScript - Type safety

## Testing

Run the test suite:

```bash
npm test -- positionHeuristics.test.ts
```

The tests cover:
- ✅ Basic functionality (40 tests)
- ✅ Tactical pattern detection
- ✅ Positional evaluation
- ✅ Endgame features
- ✅ Material calculation
- ✅ Summary scores
- ✅ Performance benchmarks
- ✅ Edge cases
- ✅ Integration scenarios

## Integration Points

### Sprint Chess Mode

Use this evaluator to show position assessment after each move:

```typescript
function onMovePlayed(move: string) {
  game.move(move);
  const evaluation = evaluatePosition(game);

  displayEvaluation(evaluation.summary.overall_centipawns);

  if (evaluation.tactics.mate_threats[game.turn()].can_mate) {
    showMateAlert();
  }
}
```

### Position Comparison

Compare before/after evaluations:

```typescript
const beforeEval = quickEvaluate(game);
game.move(move);
const afterEval = quickEvaluate(game);

const improvement = afterEval - beforeEval;
console.log(`Move ${move}: ${improvement > 0 ? "+" : ""}${improvement} cp`);
```

### Training Mode

Highlight tactical patterns for learning:

```typescript
const evaluation = evaluatePosition(game);

if (evaluation.tactics.forks.length > 0) {
  highlightSquares(evaluation.tactics.forks[0].targets, "fork");
}

if (evaluation.tactics.pins.length > 0) {
  highlightSquares([evaluation.tactics.pins[0].pinned_square], "pin");
}
```

## Algorithm Details

For implementation details, see the source code at:
`/ui/src/lib/positionHeuristics.ts`

Key algorithms:
- Ray tracing for pins (lines 555-597)
- Pawn structure analysis (lines 662-729)
- King safety evaluation (lines 734-805)
- Opposition detection (lines 855-877)
- Fork detection (lines 452-491)

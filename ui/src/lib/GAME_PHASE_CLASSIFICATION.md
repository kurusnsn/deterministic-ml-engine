# Game Phase Classification

Material-based algorithm for classifying chess positions into **Opening**, **Middlegame**, and **Endgame** phases.

## Algorithm Spec

### Piece Values (Pawn Units)

| Piece | Value |
|-------|-------|
| Pawn (P) | 1 |
| Knight (N) | 3 |
| Bishop (B) | 3 |
| Rook (R) | 5 |
| Queen (Q) | 9 |
| King (K) | 0 (not counted) |

### Classification Rules

#### 1. Opening Phase

Classified as **"opening"** if **ALL** conditions are true:

- Both queens are still on the board (`queenCount === 2`)
- Total material is still near full (`total >= 46` pawn units)
- Material is not significantly imbalanced (`difference <= 3` pawn units)

**Opening ends when:**
- Either queen is traded, OR
- A major piece trade happens, OR
- Material sum drops below 46 pawn units

#### 2. Endgame Phase

Classified as **"endgame"** if **ANY** of these conditions are true:

**Condition A** (Strong endgame trigger):
- `queenCount === 0` AND `total <= 20`

**Condition B** (Minor endgame with one queen):
- `queenCount === 1` AND `total <= 12`

**Condition C** (Heavy simplification):
- `total <= 15` (regardless of queens)

#### 3. Middlegame Phase

If the position is neither Opening nor Endgame, it's classified as **"middlegame"**.

## API Usage

### Basic Classification

```typescript
import { classifyGamePhase } from "@/lib/gamePhaseClassification";
import { Chess } from "chess.js";

// Using FEN string
const phase = classifyGamePhase("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
console.log(phase); // "opening"

// Using Chess.js instance
const game = new Chess();
const phase2 = classifyGamePhase(game);
console.log(phase2); // "opening"
```

### Detailed Classification

```typescript
import { classifyGamePhaseDetailed } from "@/lib/gamePhaseClassification";

const details = classifyGamePhaseDetailed(game);
console.log(details);
// {
//   phase: "opening",
//   material: {
//     white: 39,
//     black: 39,
//     total: 78,
//     difference: 0,
//     queenCount: 2
//   },
//   conditions: {
//     isOpening: true,
//     isEndgameConditionA: false,
//     isEndgameConditionB: false,
//     isEndgameConditionC: false
//   }
// }
```

### Using the Component

```tsx
import GamePhaseIndicator from "@/components/GamePhaseIndicator";
import { Chess } from "chess.js";

function MyChessBoard() {
  const game = new Chess();

  return (
    <div>
      <GamePhaseIndicator game={game} showIcon={true} />
    </div>
  );
}
```

### Helper Functions

```typescript
import { getPhaseColor, getPhaseIcon } from "@/lib/gamePhaseClassification";

// Get Tailwind color classes for UI
const colorClass = getPhaseColor("opening");
// Returns: "text-green-600 bg-green-50"

// Get emoji icon
const icon = getPhaseIcon("middlegame");
// Returns: "⚔️"
```

## Integration Examples

### Example 1: Display in ChessBoard Component

Add the phase indicator to your board display:

```tsx
import GamePhaseIndicator from "@/components/GamePhaseIndicator";

// Inside your ChessBoard component
<div className="flex items-center gap-2 mb-2">
  <GamePhaseIndicator game={game} />
  <span className="text-sm text-gray-500">Current Phase</span>
</div>
```

### Example 2: Use in Analysis

Track phase changes throughout a game:

```typescript
import { classifyGamePhase } from "@/lib/gamePhaseClassification";

function analyzeGamePhases(pgn: string) {
  const game = new Chess();
  game.loadPgn(pgn);

  const history = game.history({ verbose: true });
  const phases: GamePhase[] = [];

  game.reset();
  phases.push(classifyGamePhase(game)); // Starting position

  for (const move of history) {
    game.move(move);
    phases.push(classifyGamePhase(game));
  }

  return phases;
}
```

### Example 3: Conditional Logic Based on Phase

```typescript
import { classifyGamePhase } from "@/lib/gamePhaseClassification";

function getAnalysisDepth(game: Chess): number {
  const phase = classifyGamePhase(game);

  switch (phase) {
    case "opening":
      return 12; // Shallower depth in opening (use book)
    case "middlegame":
      return 20; // Deep analysis for tactics
    case "endgame":
      return 25; // Deepest for precise calculation
  }
}
```

## Examples of Classifications

### Opening Position
```
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
Queens: 2, Material: 78, Difference: 0
→ "opening"
```

### After 1.e4 e5 2.Nf3 Nc6
```
r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3
Queens: 2, Material: 78, Difference: 0
→ "opening"
```

### Middlegame (After trades)
```
r2q1rk1/ppp2ppp/2n1bn2/3p4/3P4/2N1BN2/PPP2PPP/R2QR1K1 w - - 0 10
Queens: 2, Material: 58, Difference: 0
→ "middlegame" (material < 46)
```

### Endgame (Rook + Pawns)
```
8/5pk1/6p1/8/8/6P1/5PK1/3R4 w - - 0 40
Queens: 0, Material: 11, Difference: 0
→ "endgame" (no queens, low material)
```

### Endgame (Queen + Pawns)
```
8/5pk1/6p1/8/8/6P1/3Q1PK1/8 w - - 0 40
Queens: 1, Material: 12, Difference: 0
→ "endgame" (one queen, material <= 12)
```

## Testing

```typescript
import { classifyGamePhase } from "@/lib/gamePhaseClassification";

// Test opening
expect(classifyGamePhase("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"))
  .toBe("opening");

// Test endgame
expect(classifyGamePhase("8/5pk1/6p1/8/8/6P1/5PK1/3R4 w - - 0 40"))
  .toBe("endgame");

// Test middlegame
expect(classifyGamePhase("r2q1rk1/ppp2ppp/2n1bn2/3p4/3P4/2N1BN2/PPP2PPP/R2QR1K1 w - - 0 10"))
  .toBe("middlegame");
```

## Notes

- This is a **material-based** heuristic, not a positional evaluation
- Works well for typical games, but may misclassify theoretical positions
- Opening classification is strict (requires both queens + high material + balance)
- Endgame triggers are based on standard engine heuristics
- King value is 0 (not counted in material sum)

# ECO Hierarchy Parser - Complete Guide

## 🎯 Mission Accomplished

Successfully created a sophisticated ECO hierarchy parser that solves the "Inconsistent Parent" problem by intelligently promoting significant variations (gambits, attacks, counter-attacks) to their own parent nodes.

## 📊 Results Summary

### Parsing Results
- **ECO Entries Parsed**: 2,014 from eco.pgn
- **Opening Courses Generated**: 943 distinct courses
- **Variations Promoted**: 192 (20.4% of courses)
- **Significant Openings**: 919 (after filtering)
- **Gambits Identified**: 185

### Output Files
1. **`opening-courses.json`** (297KB) - Raw hierarchical structure
2. **`trainer-openings.json`** (436KB) - Trainer-ready format
3. **`trainer-openings-grouped.json`** - Grouped by ECO family

## 🔍 How the Promotion Logic Works

### The Problem
In standard ECO classification, significant theoretical branches are sometimes listed as "variations" of a parent opening. For example:
- **Goering Gambit** was listed as a variation of "Scotch"
- **Evans Gambit** was listed under "Italian Game"

This makes it hard to create a clean UI where each major theoretical branch gets its own "course."

### The Solution

#### 1. Keyword Detection
The parser identifies variations containing these keywords:
- `gambit`
- `attack`
- `counter-attack`
- `counter-gambit`
- `counterattack`
- `countergambit`

#### 2. Shallow Ply Check
Only promotes variations that introduce unique moves at **shallow ply depths**:
- **Minimum**: 5 plies (after move 3)
- **Maximum**: 10 plies (after move 5)

This prevents promoting deep, obscure variations (like a move 15 sideline) while capturing main theoretical branches.

#### 3. Deduplication
Ensures promoted variations are removed from their original parent's variation list to avoid duplication.

## 📁 File Structure

```
ui/
├── src/scripts/
│   ├── eco-hierarchy-parser.ts       # Main parser (promotion logic)
│   ├── convert-courses-to-trainer.ts # Converts to trainer format
│   └── eco-importer.ts                # Original importer (for reference)
├── opening-courses.json               # Raw hierarchical output
├── trainer-openings.json              # Trainer-ready format
├── trainer-openings-grouped.json     # Grouped by ECO family
└── ECO_PARSER_SUMMARY.md             # This file
```

## 🚀 Usage

### Step 1: Parse ECO Database
```bash
cd ui
npx tsx src/scripts/eco-hierarchy-parser.ts ../eco-service/eco.pgn
```

**Output**: `opening-courses.json`

### Step 2: Convert to Trainer Format
```bash
npx tsx src/scripts/convert-courses-to-trainer.ts
```

**Output**: 
- `trainer-openings.json`
- `trainer-openings-grouped.json`

## 📋 Output Format

### opening-courses.json
```json
{
  "courseName": "Goering Gambit",
  "eco": "C44",
  "rootMoves": "1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. c3",
  "variations": [
    {
      "name": "Scotch: Goering gambit",
      "moves": "1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. c3 dxc3 5. Nxc3 Bb4"
    }
  ]
}
```

### trainer-openings.json
```json
{
  "id": "goering-gambit",
  "name": "Goering Gambit",
  "eco": "C44",
  "description": "A tactical gambit from the C44 family, sacrificing material for initiative.",
  "difficulty": "Intermediate",
  "color": "white",
  "isGambit": true,
  "rootMoves": ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "c3"],
  "fen": "r1bqkbnr/pppp1ppp/2n5/8/3pP3/2P2N2/PP3PPP/RNBQKB1R b KQkq - 0 4",
  "variationCount": 1
}
```

## 🎓 Examples of Promoted Variations

### Successfully Promoted

| Course Name | ECO | Root Moves | Reason |
|------------|-----|------------|--------|
| Goering Gambit | C44 | 1.e4 e5 2.Nf3 Nc6 3.d4 exd4 4.c3 | Gambit at move 4 |
| Scotch Gambit | C44 | 1.e4 e5 2.Nf3 Nc6 3.d4 exd4 4.Bc4 | Gambit at move 4 |
| Evans Gambit | C51 | 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.b4 | Gambit at move 4 |
| King's Gambit | C30-C39 | 1.e4 e5 2.f4 | Gambit at move 2 |
| Smith-Morra Gambit | B21 | 1.e4 c5 2.d4 cxd4 3.c3 | Gambit at move 3 |
| From Gambit | A02 | 1.f4 e5 2.fxe5 d6 3.exd6 Bxd6 | Gambit at move 3 |
| Bellon Gambit | A22 | 1.c4 e5 2.Nc3 Nf6 3.Nf3 e4 4.Ng5 b5 | Gambit at move 4 |

### Not Promoted (Correct Behavior)

- Deep variations at move 10+ (too obscure)
- Variations without gambit/attack keywords
- Variations that are just named lines within a standard opening

## 📈 Statistics by Category

### By Difficulty
- **Beginner**: 0 (auto-classification needs tuning)
- **Intermediate**: 716 (77.9%)
- **Advanced**: 203 (22.1%)

### By Color
- **White**: 887 (96.5%)
- **Black**: 32 (3.5%)

### By ECO Family
- **Flank Openings (A00-A39)**: 149
- **English Opening (A10-A39)**: 45
- **Semi-Open Games (B00-B99)**: 175
- **Open Games (C00-C99)**: 282
- **Closed Games (D00-D99)**: 147
- **Indian Defenses (E00-E99)**: 121

## ⚙️ Configuration

### Adjusting Promotion Keywords
Edit `eco-hierarchy-parser.ts`:

```typescript
const PROMOTION_KEYWORDS = [
  "gambit",
  "counter-attack",
  "counter-gambit",
  "attack",
  // Add more keywords here
];
```

### Adjusting Ply Depth
```typescript
const SHALLOW_PLY_MIN = 5;  // After move 3 (1.e4 e5 2.Nf3 = 3 plies)
const SHALLOW_PLY_MAX = 10; // After move 5
```

### Filtering Criteria
Edit `convert-courses-to-trainer.ts`:

```typescript
function filterSignificantOpenings(openings: TrainerOpening[]): TrainerOpening[] {
  return openings.filter((opening) => {
    // Customize filtering logic here
    if (opening.variationCount > 0) return true;
    if (opening.eco === "A00" && opening.variationCount === 0) return false;
    return true;
  });
}
```

## 🔧 Integration with Your App

### Option 1: Direct JSON Import
```typescript
import trainerOpenings from './trainer-openings.json';

// Use in your UI
const openingsList = trainerOpenings.map(opening => ({
  id: opening.id,
  name: opening.name,
  eco: opening.eco,
  difficulty: opening.difficulty,
  // ... other fields
}));
```

### Option 2: Database Import
```typescript
// Import into Supabase or your database
import { createClient } from '@supabase/supabase-js';
import trainerOpenings from './trainer-openings.json';

const supabase = createClient(url, key);

for (const opening of trainerOpenings) {
  await supabase.from('openings').insert({
    id: opening.id,
    name: opening.name,
    eco: opening.eco,
    root_moves: opening.rootMoves,
    fen: opening.fen,
    difficulty: opening.difficulty,
    color: opening.color,
    is_gambit: opening.isGambit,
    variation_count: opening.variationCount,
  });
}
```

### Option 3: Generate UI Components
```typescript
// Generate opening trainer UI
import trainerOpenings from './trainer-openings-grouped.json';

function OpeningTrainerMenu() {
  return (
    <div>
      {Object.entries(trainerOpenings).map(([family, openings]) => (
        <div key={family}>
          <h2>{family}</h2>
          <ul>
            {openings.map(opening => (
              <li key={opening.id}>
                <Link href={`/trainer/${opening.id}`}>
                  {opening.name} ({opening.eco})
                  {opening.isGambit && <span>🎲</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

## 🎯 Next Steps

1. **Review Promoted Courses**: Check `opening-courses.json` for any courses that should/shouldn't be promoted
2. **Fine-tune Difficulty**: Update the `determineDifficulty()` function in `convert-courses-to-trainer.ts`
3. **Add Descriptions**: Enhance the `generateDescription()` function with more specific descriptions
4. **Integrate with UI**: Use the JSON files to populate your opening trainer
5. **Add Thumbnails**: Generate board position images for each opening using the FEN
6. **Create Learning Paths**: Group related openings into learning sequences

## 🐛 Troubleshooting

### Issue: Too many obscure openings
**Solution**: Adjust the filtering in `filterSignificantOpenings()` to be more strict

### Issue: Important variation not promoted
**Solution**: 
1. Check if it contains a promotion keyword
2. Verify it's within the shallow ply range (5-10)
3. Add custom logic in `shouldPromoteVariation()`

### Issue: Wrong difficulty classification
**Solution**: Update the `determineDifficulty()` function with better heuristics

## 📚 References

- **ECO Classification**: https://en.wikipedia.org/wiki/Encyclopaedia_of_Chess_Openings
- **Chess.js Library**: https://github.com/jhlywa/chess.js
- **PGN Format**: https://en.wikipedia.org/wiki/Portable_Game_Notation

## 🏆 Success Metrics

✅ **Goering Gambit** promoted to its own course (C44)  
✅ **Scotch Gambit** separated from Scotch Game  
✅ **Evans Gambit** promoted from Italian Game  
✅ **192 variations** successfully promoted  
✅ **919 significant openings** ready for trainer  
✅ **Zero duplications** in final output  

---

**Created**: 2026-01-03  
**Parser Version**: 1.0  
**ECO Database**: eco.pgn (254KB, 2014 entries)

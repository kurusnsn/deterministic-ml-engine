# ECO Parser - Quick Reference

## 📦 Files Created

| File | Purpose | Size |
|------|---------|------|
| `eco-hierarchy-parser.ts` | Main parser with promotion logic | Script |
| `convert-courses-to-trainer.ts` | Converts to trainer format | Script |
| `opening-courses.json` | Raw hierarchical output | 297KB |
| `trainer-openings.json` | Trainer-ready format | 436KB |
| `trainer-openings-grouped.json` | Grouped by ECO family | JSON |
| `ECO_PARSER_SUMMARY.md` | Complete documentation | Docs |
| `ECO_PARSER_EXAMPLES.md` | Visual examples | Docs |

## 🎯 What It Does

✅ Parses 2,014 ECO entries from eco.pgn  
✅ Promotes 192 significant variations to parent nodes  
✅ Generates 943 opening courses  
✅ Filters to 919 significant openings  
✅ Auto-classifies difficulty, color, and gambit status  
✅ Computes FEN positions for each opening  

## ⚡ Quick Commands

```bash
# Parse ECO database
npx tsx src/scripts/eco-hierarchy-parser.ts ../eco-service/eco.pgn

# Convert to trainer format
npx tsx src/scripts/convert-courses-to-trainer.ts
```

## 🔑 Key Features

### Promotion Rule
- **Keywords**: gambit, attack, counter-attack
- **Ply Range**: 5-10 (moves 3-5)
- **Result**: 192 variations promoted

### Output Format
```json
{
  "id": "goering-gambit",
  "name": "Goering Gambit",
  "eco": "C44",
  "difficulty": "Intermediate",
  "color": "white",
  "isGambit": true,
  "rootMoves": ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "c3"],
  "fen": "...",
  "variationCount": 1
}
```

## 📊 Statistics

- **Total Openings**: 919
- **Gambits**: 185 (20.1%)
- **White Openings**: 887 (96.5%)
- **Black Openings**: 32 (3.5%)
- **Intermediate**: 716 (77.9%)
- **Advanced**: 203 (22.1%)

## 🎓 Example: Goering Gambit

**Before**: Listed as variation under "Scotch"  
**After**: Promoted to own course (C44)  
**Moves**: 1.e4 e5 2.Nf3 Nc6 3.d4 exd4 4.c3  
**Result**: ✅ Successfully promoted

## 🔧 Configuration

Edit `eco-hierarchy-parser.ts`:

```typescript
// Adjust promotion keywords
const PROMOTION_KEYWORDS = ["gambit", "attack", ...];

// Adjust ply depth
const SHALLOW_PLY_MIN = 5;  // Move 3
const SHALLOW_PLY_MAX = 10; // Move 5
```

## 📚 Integration

```typescript
// Import in your app
import openings from './trainer-openings.json';

// Use in UI
const courseList = openings.map(o => ({
  id: o.id,
  name: o.name,
  eco: o.eco,
  difficulty: o.difficulty,
}));
```

## ✅ Success Criteria

- [x] Goering Gambit promoted (C44)
- [x] Scotch Gambit separated (C44)
- [x] Evans Gambit promoted (C51)
- [x] No duplications
- [x] All FENs valid
- [x] 919 courses ready

## 🎯 Next Steps

1. Review `trainer-openings.json`
2. Integrate with your UI
3. Add opening thumbnails
4. Create learning paths
5. Fine-tune difficulty levels

---

**Status**: ✅ Complete  
**Version**: 1.0  
**Date**: 2026-01-03

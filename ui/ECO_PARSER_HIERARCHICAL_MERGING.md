# ECO Parser - Hierarchical Merging Implementation

## Problem Solved

Courses that were direct continuations of each other (same ECO, one is a subset of the other's moves) were appearing as separate courses instead of being organized hierarchically.

### Examples

**Polish Opening (A00)**
- Before: "Polish (Sokolsky)" (1.b4) and "Polish" (1.b4 Nh6) as separate courses
- After: "Polish" merged as a variation under "Polish (Sokolsky)"

**Queen's Pawn Game (D02)**
- Before: "Queen's pawn game" (1.d4 d5 2.Nf3) and "Queen's bishop game" (1.d4 d5 2.Nf3 Nf6 3.Bf4) as separate courses
- After: "Queen's bishop game" merged as a variation under "Queen's pawn game"

## Implementation

### Functions Added

1. **`mergeHierarchicalCourses()`** - Main merging logic
   - Iterates through all courses
   - Finds children (direct continuations)
   - Merges children into parent as variations

2. **`isDirectContinuation()`** - Checks if one move sequence continues another
   - Validates child has more moves than parent
   - Ensures all parent moves match the start of child moves

3. **`parseMoveString()`** - Converts formatted moves back to array
   - "1. b4 Nh6" → ["b4", "Nh6"]

### Merging Criteria

A course is merged into another if:
1. **Same ECO code** (e.g., both A00)
2. **Direct continuation** (child's moves start with all of parent's moves)
3. **More moves** (child has at least one more move than parent)

## Results

### Statistics
- **Before merging**: 885 courses
- **After merging**: 520 courses
- **Merged**: 365 hierarchical relationships (41% reduction!)

### Sample Output

```json
{
  "courseName": "Polish (Sokolsky) opening",
  "eco": "A00",
  "rootMoves": "1. b4",
  "variations": [
    { "name": "Polish", "moves": "1. b4 Nh6" },
    { "name": "Outflank variation", "moves": "1. b4 c6" }
  ]
}
```

```json
{
  "courseName": "Queen's pawn game",
  "eco": "D02",
  "rootMoves": "1. d4 d5 2. Nf3",
  "variations": [
    { "name": "Chigorin variation", "moves": "1. d4 d5 2. Nf3 Nc6" },
    { "name": "Krause variation", "moves": "1. d4 d5 2. Nf3 c5" },
    { "name": "Main line", "moves": "1. d4 d5 2. Nf3 Nf6" },
    { "name": "Queen's bishop game", "moves": "1. d4 d5 2. Nf3 Nf6 3. Bf4" }
  ]
}
```

## Benefits

1. **Better Organization**: Natural hierarchy reflects how openings actually develop
2. **Fewer Top-Level Courses**: 520 vs 885 - easier to navigate
3. **Logical Grouping**: Related lines grouped under their parent opening
4. **Trainer-Friendly**: Users can study an opening and its natural continuations together

## Processing Pipeline

```
Parse PGN (2014 entries)
    ↓
Group by ECO + Opening (885 groups)
    ↓
Promote significant variations (192 promoted)
    ↓
Deduplicate variations
    ↓
Generate courses (885 courses)
    ↓
Merge hierarchical courses (520 courses) ← NEW STEP
    ↓
Output JSON
```

## Edge Cases Handled

- **Multiple children**: Parent can have multiple direct continuations
- **Child variations**: When merging, child's variations are also included
- **Same ECO requirement**: Only merges within the same ECO code
- **Order independence**: Works regardless of course order in array

---

**Status**: ✅ Complete  
**Date**: 2026-01-03  
**Impact**: 365 courses merged (41% reduction)  
**Files Modified**: `eco-hierarchy-parser.ts`

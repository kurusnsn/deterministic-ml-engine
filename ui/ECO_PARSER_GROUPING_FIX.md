# ECO Parser Grouping Fix - Summary

## Problem Identified

The user noticed that "Evans gambit declined" variations were appearing as separate courses instead of being grouped together:

**Before:**
- Evans gambit declined (C51)
- Evans gambit declined, Lange variation (C51)
- Evans gambit declined, Pavlov variation (C51)
- Evans gambit declined, Hirschbach variation (C51)
- ... (8 separate courses)

## Root Cause

The PGN file lists these as distinct opening names:
```
[Opening "Evans gambit declined"]
[Opening "Evans gambit declined, Lange variation"]
[Opening "Evans gambit declined, Pavlov variation"]
```

The original parser grouped by exact opening name match, treating each as a separate course.

## Solution Implemented

### 1. Added Normalization Functions

```typescript
function normalizeOpeningName(openingName: string): string {
  // "Evans gambit declined, Lange variation" → "Evans gambit declined"
  const commaIndex = openingName.indexOf(',');
  return commaIndex !== -1 
    ? openingName.substring(0, commaIndex).trim() 
    : openingName;
}

function extractVariationFromOpening(openingName: string): string | undefined {
  // "Evans gambit declined, Lange variation" → "Lange variation"
  const commaIndex = openingName.indexOf(',');
  return commaIndex !== -1 
    ? openingName.substring(commaIndex + 1).trim() 
    : undefined;
}
```

### 2. Updated Grouping Logic

Modified `groupAndPromoteEntries()` to:
- Normalize opening names before grouping
- Extract embedded variations and move them to the variation field
- Group by `ECO + normalizedOpening` instead of `ECO + opening`

### 3. Cleaned Up Variation Names

Simplified variation name generation to avoid redundancy:
- Before: "Evans gambit declined, Lange variation: Lange variation"
- After: "Lange variation"

## Results

### Before Fix
- **Total Courses**: 943
- **Evans Gambit Declined**: 9 separate courses

### After Fix
- **Total Courses**: 885 (58 fewer)
- **Evans Gambit Declined**: 1 course with 8 variations

### Final Output

```json
{
  "courseName": "Evans gambit declined",
  "eco": "C51",
  "rootMoves": "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4",
  "variations": [
    { "name": "Lange variation", "moves": "..." },
    { "name": "Pavlov variation", "moves": "..." },
    { "name": "Hirschbach variation", "moves": "..." },
    { "name": "Vasquez variation", "moves": "..." },
    { "name": "Hicken variation", "moves": "..." },
    { "name": "5.a4", "moves": "..." },
    { "name": "Showalter variation", "moves": "..." },
    { "name": "Cordel variation", "moves": "..." }
  ]
}
```

## Impact

✅ **58 opening groups merged** (943 → 885 courses)  
✅ **Cleaner hierarchy** - related variations properly grouped  
✅ **Better UX** - users see one "Evans gambit declined" course with variations  
✅ **Consistent naming** - variation names are clean and concise  

## Files Modified

- `/Users/kurus/macmini/ui/src/scripts/eco-hierarchy-parser.ts`
  - Added `normalizeOpeningName()` function
  - Added `extractVariationFromOpening()` function
  - Updated `groupAndPromoteEntries()` to use normalization
  - Simplified variation name generation

## Testing

Verified with Evans Gambit declined (C51):
- ✅ All 8 variations grouped under one course
- ✅ Variation names are clean (no redundancy)
- ✅ Root moves correctly identified
- ✅ No duplications

---

**Status**: ✅ Complete  
**Date**: 2026-01-03  
**Improvement**: 58 fewer courses, better organization

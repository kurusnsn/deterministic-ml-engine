# Board System Architecture

This module provides a modular, reusable chess board system with overlay rendering, state management, and feature composition.

## Architecture Layers

```
Feature Layer (features/analyze/AnalyzeBoard.tsx)
    │
    ├── Assembles hooks + renders panels
    │
    ▼
React Layer (react/)
    │
    ├── BoardShell      → Layout: eval bar + board + captured pieces
    ├── BoardSurface    → Smart layer: event wiring, state sync
    ├── UniversalBoard  → Pure presentational: board + overlay canvas
    └── ChessBoardWrapper → react-chessboard wrapper
    │
    ▼
Hooks Layer (hooks/)
    │
    ├── useBoardDrawing   → User drawing (circles, arrows)
    ├── useBoardSounds    → Sound effects (move, capture, etc.)
    ├── useBoardOverlays  → Worker management, overlay merging
    └── useBoardSizing    → Responsive sizing, resize handle
    │
    ▼
Core Layer (core/)
    │
    ├── useBoardStore    → Zustand state (arrows, highlights, etc.)
    ├── board-engine     → Chess.js wrapper
    └── move-tree        → AnalysisController re-export
    │
    ▼
Overlay Layer (overlay/)
    │
    ├── OverlayCanvas    → Canvas component
    ├── draw*.ts         → Drawing functions
    └── overlayRenderer  → Render orchestration
    │
    ▼
Workers Layer (workers/)
    │
    ├── overlayWorker    → Off-thread overlay computation
    └── workerClient     → Worker communication wrapper
```

## Component Responsibilities

### UniversalBoard (pure presentational)
- Wraps ChessBoardWrapper + OverlayCanvas
- No event handling beyond what react-chessboard provides
- Props passed through to underlying components

### BoardSurface (smart-but-reusable)
- Wires UniversalBoard to hooks/state
- Captures drawing events (right-click, left-click clear, contextmenu)
- Syncs hover/drag state to overlay store
- Handles sizing/retina sync
- Optional resize handle

### BoardShell (layout only)
- Layout container: eval bar + BoardSurface + captured pieces
- No feature logic, pure layout

### AnalyzeBoard (feature composer)
- Assembles all hooks
- Renders analysis panels (history, PV lines, opening book, LLM)
- Contains feature-specific logic (LLM streaming, study save/load)

## State Management

### useBoardStore (Zustand)
Manages overlay rendering state:
- `fen`, `orientation`, `boardSize`
- `arrows`, `grid`, `threats`, `highlights`, `pvLines`
- `lastMove`, `selectedSquare`, `hoveredSquare`
- `ripples` (animations)

### Local State (in feature composers)
- Game state (Chess.js instance)
- Move tree (AnalysisController)
- UI toggles (overlay visibility, tabs)

## File Structure

```
ui/src/board/
├── README.md                 # This file
├── core/
│   ├── useBoardStore.ts      # Zustand overlay state
│   ├── board-engine.ts       # Chess.js wrapper
│   ├── move-tree.ts          # Re-export from utils/ChessMoveTree.ts
│   └── coords.ts             # Coordinate utilities
├── hooks/
│   ├── useBoardDrawing.ts    # User drawing system
│   ├── useBoardSounds.ts     # Sound effects
│   ├── useBoardOverlays.ts   # Worker + overlay management
│   └── useBoardSizing.ts     # Responsive sizing
├── overlay/
│   ├── OverlayCanvas.tsx     # Canvas component
│   ├── overlayRenderer.ts    # Render orchestration
│   ├── drawArrow.ts          # Arrow drawing
│   ├── drawGrid.ts           # Evaluation boxes
│   ├── drawHighlights.ts     # Square highlights
│   ├── drawThreats.ts        # Threat arrows
│   └── drawRipples.ts        # Ripple animations
├── react/
│   ├── UniversalBoard.tsx    # Board + overlay wrapper
│   ├── ChessBoardWrapper.tsx # react-chessboard wrapper
│   ├── BoardSurface.tsx      # Smart board with events
│   └── BoardShell.tsx        # Layout component
└── workers/
    ├── overlayWorker.ts      # Web worker
    ├── workerClient.ts       # Worker communication
    └── workerMessageTypes.ts # Message types

ui/src/features/analyze/
└── AnalyzeBoard.tsx          # Feature composer
```

---

## Manual Smoke Test Checklist

Run after each refactoring step to ensure nothing is broken:

### Basic Board Functionality
- [ ] Page loads without console errors
- [ ] Board renders with correct position
- [ ] Drag and drop legal move works
- [ ] Illegal move is rejected with sound
- [ ] Promotion dialog appears and works
- [ ] Flip board button works

### Drawing System
- [ ] Right-click draws circle on square
- [ ] Right-click + drag draws arrow
- [ ] Multiple colors work (Shift, Ctrl, Alt modifiers)
- [ ] Left-click clears all drawings
- [ ] Drawings persist during navigation

### Overlay System
- [ ] Grid overlay toggle works (shows eval boxes)
- [ ] Threat lines toggle works
- [ ] PV arrows toggle works
- [ ] Best move arrow appears
- [ ] Last move highlight appears
- [ ] Legal move dots appear on piece selection

### Evaluation
- [ ] Eval bar updates on position change
- [ ] Eval bar shows correct color (white/black advantage)
- [ ] Eval score displays correctly

### Navigation
- [ ] Start button (|<) goes to beginning
- [ ] Back button (<) goes to previous move
- [ ] Forward button (>) goes to next move
- [ ] End button (>|) goes to latest position
- [ ] Clicking move in history jumps to that position
- [ ] Variations can be entered and navigated

### Analysis Features (after AnalyzeBoard wired)
- [ ] LLM panel opens
- [ ] LLM analysis streams on new moves
- [ ] Opening book shows theory
- [ ] PV lines panel displays engine analysis
- [ ] Move classification badges appear
- [ ] Study save/load works

---

## Migration Guide

### For new features
Import from the board namespace:
```typescript
import { useBoardStore } from '@/board/core/useBoardStore';
import { useBoardDrawing } from '@/board/hooks/useBoardDrawing';
import { BoardSurface } from '@/board/react/BoardSurface';
```

### For existing ChessBoard.tsx consumers
During transition, ChessBoard.tsx re-exports AnalyzeBoard. After migration:
```typescript
// Old
import ChessBoard from '@/components/ChessBoard';

// New
import { AnalyzeBoard } from '@/features/analyze/AnalyzeBoard';
```

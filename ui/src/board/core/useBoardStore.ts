/**
 * Phase 2: Implemented - Zustand store for board overlay state
 */

import { create } from "zustand";
import { Square } from "chess.js";

// ===== TYPE DEFINITIONS =====

export interface Arrow {
    from: Square;
    to: Square;
    color: string;
    isKnight?: boolean;  // For L-shaped knight arrows
}

export interface GridSquare {
    square: Square;
    score: string;
    color: string; // Tailwind color class or rgba
}

export interface Threat {
    from: Square;
    to: Square;
    color: string;
}

export interface Highlight {
    square: Square;
    type: "lastMove" | "selected" | "legal" | "userCircle";
    legalVariant?: "dot" | "ring";
    color?: string;
    fillColor?: string;
    entering?: boolean;
    exiting?: boolean;
    startTime?: number;
    style?: React.CSSProperties;
}

export interface PVLine {
    moves: string[];
    eval: number;
}

// ===== STORE INTERFACE =====

export interface BoardStoreState {
    // Core game state
    fen: string;
    orientation: "white" | "black";
    boardSize: number;

    // Overlay data
    arrows: Arrow[];
    pvLines: PVLine[];
    grid: GridSquare[];
    threats: Threat[];
    highlights: Highlight[];

    // Move tracking
    lastMove: { from: Square; to: Square } | null;
    selectedSquare: Square | null;
    hoveredSquare: Square | null;

    // Ripple animation
    ripples: { square: Square; start: number; color?: string }[];

    // Actions
    setFen: (fen: string) => void;
    setOrientation: (orientation: "white" | "black") => void;
    setBoardSize: (size: number) => void;
    setArrows: (arrows: Arrow[]) => void;
    setPVLines: (pvLines: PVLine[]) => void;
    setGrid: (grid: GridSquare[]) => void;
    setThreats: (threats: Threat[]) => void;
    setHighlights: (highlights: Highlight[]) => void;
    setLastMove: (move: { from: Square; to: Square } | null) => void;
    setSelectedSquare: (square: Square | null) => void;
    setHoveredSquare: (square: Square | null) => void;

    // Ripple actions
    addRipple: (square: Square, color?: string) => void;
    removeRipple: (start: number) => void; // Remove by timestamp ID

    // Batch update for efficiency
    updateOverlays: (overlays: {
        arrows?: Arrow[];
        grid?: GridSquare[];
        threats?: Threat[];
        pvLines?: PVLine[];
    }) => void;

    // Clear all overlays
    clearOverlays: () => void;
}

// ===== ZUSTAND STORE IMPLEMENTATION =====

export const useBoardStore = create<BoardStoreState>((set) => ({
    // ===== INITIAL STATE =====

    // Core game state
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    orientation: "white",
    boardSize: 500,

    // Overlay data (all empty initially)
    arrows: [],
    pvLines: [],
    grid: [],
    threats: [],
    highlights: [],

    // Move tracking
    lastMove: null,
    selectedSquare: null,
    hoveredSquare: null,

    // Ripple animation
    ripples: [],

    // ===== ACTIONS =====

    setFen: (fen) => set({ fen }),

    setOrientation: (orientation) => set({ orientation }),

    setBoardSize: (boardSize) => set({ boardSize }),

    setArrows: (arrows) => set({ arrows }),

    setPVLines: (pvLines) => set({ pvLines }),

    setGrid: (grid) => set({ grid }),

    setThreats: (threats) => set({ threats }),

    setHighlights: (highlights) => set({ highlights }),

    setLastMove: (lastMove) => set({ lastMove }),

    setSelectedSquare: (selectedSquare) => set({ selectedSquare }),

    setHoveredSquare: (hoveredSquare) => set({ hoveredSquare }),

    // Ripple actions
    addRipple: (square, color) =>
        set((state) => ({
            ripples: [...state.ripples, { square, start: performance.now(), color }],
        })),

    removeRipple: (start) =>
        set((state) => ({
            ripples: state.ripples.filter((r) => r.start !== start),
        })),

    // Batch update multiple overlay types in one render
    updateOverlays: (overlays) =>
        set((state) => ({
            ...state,
            ...overlays,
        })),

    // Clear all overlays
    clearOverlays: () =>
        set({
            arrows: [],
            grid: [],
            threats: [],
            highlights: [],
        }),
}));

// ===== SELECTORS =====

/**
 * Initial position FEN (standard starting position)
 */
export const INITIAL_POSITION_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Selector to check if the board is at the initial position.
 * Use this to conditionally gate commentary or other features.
 */
export const isInitialPosition = (state: BoardStoreState): boolean =>
    state.fen.startsWith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");

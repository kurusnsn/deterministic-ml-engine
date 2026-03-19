/**
 * Board Engine Types
 *
 * Core TypeScript interfaces for the universal chess board engine.
 * These types define the configuration system that allows each page
 * to customize board behavior while sharing the same underlying engine.
 */

import { Square, Move, Color, PieceSymbol } from "chess.js";

// ===== MOVE RESULT =====

/**
 * Standardized move result format.
 * This format is preserved for backend compatibility.
 */
export interface MoveResult {
    from: string;
    to: string;
    san: string;
    fen: string;
    promotion?: string;
    // Extended info from chess.js
    captured?: PieceSymbol;
    flags: string;
    piece: PieceSymbol;
    color: Color;
}

// ===== MODE-SPECIFIC CONFIGS =====

export interface AnalyzeConfig {
    /** Enable engine analysis (Stockfish) */
    enableEngine?: boolean;
    /** Enable LLM commentary */
    enableLLM?: boolean;
    /** Multi-PV depth */
    multiPV?: number;
    /** Analysis depth */
    depth?: number;
}

export interface PuzzleConfig {
    /** The correct move in UCI format */
    correctMove?: string;
    /** Behavior when incorrect move is made */
    failBehavior?: "shake" | "block" | "hint";
    /** Callback when puzzle is solved */
    onSolved?: () => void;
    /** Callback when puzzle attempt fails */
    onFailed?: (attemptedMove: string) => void;
}

export interface OpeningConfig {
    /** Highlight moves that are in the opening book */
    highlightBookMoves?: boolean;
    /** Callback when opening line changes */
    onLineChange?: (line: string[]) => void;
    /** Current opening ECO code */
    eco?: string;
}

export interface ReviewConfig {
    /** Move annotations to display */
    annotations?: MoveAnnotation[];
    /** Show best move arrow */
    showBestMove?: boolean;
    /** Allow editing annotations */
    editable?: boolean;
}

export interface MoveAnnotation {
    ply: number;
    classification?: string;
    evalBefore?: string;
    evalAfter?: string;
    bestMove?: string;
    comment?: string;
}

// ===== MAIN BOARD CONFIG =====

export type BoardMode = "analyze" | "puzzle" | "review" | "opening" | "free";

/**
 * BoardConfig - Main configuration interface for the universal chess board.
 *
 * Each page can customize board behavior through this config:
 * - /analyze uses mode: "analyze" with engine + LLM enabled
 * - /puzzles uses mode: "puzzle" with correctMove validation
 * - /game-review uses mode: "review" with annotations
 * - /openings uses mode: "opening" with book move highlighting
 */
export interface BoardConfig {
    /** Board operation mode */
    mode: BoardMode;

    // ===== CORE TOGGLES =====

    /** Allow piece dragging */
    draggable?: boolean;
    /** Show legal move indicators when piece is selected */
    highlightLegalMoves?: boolean;
    /** Highlight the last move made */
    highlightLastMove?: boolean;
    /** Show analysis arrows (PV, threats) */
    arrows?: boolean;
    /** Show threat detection lines */
    threats?: boolean;
    /** Allow illegal moves (for analysis/exploration) */
    allowIllegalMoves?: boolean;
    /** Enable premove functionality */
    premove?: boolean;
    /** Show grid overlay with evaluations */
    showGrid?: boolean;

    // ===== EVENT CALLBACKS =====

    /** Called after a legal move is made */
    onMove?: (move: MoveResult) => void;
    /** Called when a square is selected */
    onSelect?: (square: Square) => void;
    /** Called when a piece is dropped (before move validation) */
    onDrop?: (move: MoveResult) => void;
    /** Called when an illegal move is attempted */
    onIllegalMove?: (reason: string, from: Square, to: Square) => void;
    /** Called when position changes (navigation, load, etc.) */
    onPositionChange?: (fen: string) => void;

    // ===== MODE-SPECIFIC CONFIGS =====

    analyze?: AnalyzeConfig;
    puzzle?: PuzzleConfig;
    opening?: OpeningConfig;
    review?: ReviewConfig;
}

// ===== ENGINE STATE =====

export interface EngineState {
    /** Current FEN position */
    fen: string;
    /** Current turn */
    turn: Color;
    /** Currently selected square */
    selectedSquare: Square | null;
    /** Legal moves for selected piece */
    legalMoves: Square[];
    /** Last move made */
    lastMove: { from: Square; to: Square } | null;
    /** Is the game over? */
    isGameOver: boolean;
    /** Game status message */
    status: string;
}

// ===== ENGINE API =====

/**
 * BoardEngineAPI - The public API returned by useBoardEngine hook.
 *
 * This is what ChessBoard.tsx uses to interact with all game logic.
 */
export interface BoardEngineAPI {
    // State
    state: EngineState;

    // Move operations
    makeMove: (from: Square, to: Square, promotion?: PieceSymbol) => MoveResult | null;
    validateMove: (from: Square, to: Square) => boolean;

    // Selection
    selectSquare: (square: Square) => void;
    clearSelection: () => void;

    // Position control
    loadFen: (fen: string) => boolean;
    loadPgn: (pgn: string) => boolean;
    resetToStart: () => void;

    // Queries
    getLegalMovesForSquare: (square: Square) => Square[];
    getPosition: () => string;
    getTurn: () => Color;
    isCheck: () => boolean;
    isCheckmate: () => boolean;

    // Input handlers (for wiring to react-chessboard)
    onSquareClick: (square: Square) => void;
    onDragStart: (piece: string, sourceSquare: Square) => void;
    onDragEnd: () => void;
    onDrop: (sourceSquare: Square, targetSquare: Square, piece: string) => boolean;
}

// ===== SOUND TYPES =====

export type SoundType = "move" | "capture" | "castle" | "check" | "promote" | "illegal";

// ===== INTERNAL TYPES =====

export interface MoveContext {
    game: import("chess.js").Chess;
    config: BoardConfig;
    fenBeforeMove: string;
}

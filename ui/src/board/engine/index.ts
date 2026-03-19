/**
 * Board Engine Module
 *
 * Universal chess board engine with config-driven behavior.
 * Supports multiple modes: analyze, puzzle, review, opening, free.
 *
 * @example
 * ```tsx
 * import { useBoardEngine, mergeConfig } from '@/board/engine';
 *
 * const engine = useBoardEngine({
 *   config: {
 *     mode: 'analyze',
 *     arrows: true,
 *     onMove: (move) => console.log(move),
 *   },
 * });
 * ```
 */

// Types
export type {
    BoardConfig,
    BoardMode,
    MoveResult,
    EngineState,
    BoardEngineAPI,
    SoundType,
    AnalyzeConfig,
    PuzzleConfig,
    OpeningConfig,
    ReviewConfig,
    MoveAnnotation,
} from "./types";

// Config utilities
export {
    defaultBoardConfig,
    modeDefaults,
    mergeConfig,
    createAnalyzeConfig,
    createPuzzleConfig,
    createReviewConfig,
    createOpeningConfig,
    validateConfig,
} from "./boardConfig";

// Move handlers
export {
    executeMove,
    isLegalMove,
    isPromotionMove,
    toMoveResult,
    getSoundType,
    getPromotionPiece,
    invokeCallbacks,
    invokeIllegalMoveCallback,
    isPuzzleMoveCorrect,
    handleMove,
} from "./moveHandlers";

// Input controller
export {
    getLegalMovesForSquare,
    isOwnPiece,
    handleClick,
    handleDragStart,
    handleDragEnd,
    handleDrop,
    getNavigationAction,
    getWheelAction,
} from "./inputController";

// FEN controller
export {
    loadFen,
    loadPgn,
    resetToStart,
    validateFen,
    validatePgn,
    replayMoves,
    replaySanMoves,
    getGameStatus,
    getCapturedPieces,
    toUci,
    parseUci,
} from "./fenController";

// Main hook
export { useBoardEngine } from "./useBoardEngine";
export type { UseBoardEngineOptions } from "./useBoardEngine";

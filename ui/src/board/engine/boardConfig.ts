/**
 * Board Configuration System
 *
 * Provides default configurations and utilities for merging/validating configs.
 * This system allows each page to customize board behavior while ensuring
 * safe defaults and backwards compatibility.
 */

import { BoardConfig, BoardMode } from "./types";

// ===== DEFAULT CONFIGURATIONS =====

/**
 * Base default configuration.
 * Safe defaults that work for any mode.
 */
export const defaultBoardConfig: BoardConfig = {
    mode: "free",
    draggable: true,
    highlightLegalMoves: true,
    highlightLastMove: true,
    arrows: false,
    threats: false,
    allowIllegalMoves: false,
    premove: false,
    showGrid: false,
};

/**
 * Mode-specific default overrides.
 * These are applied on top of the base defaults when a mode is specified.
 */
export const modeDefaults: Record<BoardMode, Partial<BoardConfig>> = {
    analyze: {
        arrows: true,
        threats: true,
        showGrid: true,
        analyze: {
            enableEngine: true,
            enableLLM: true,
            multiPV: 3,
            depth: 20,
        },
    },
    puzzle: {
        highlightLegalMoves: true,
        allowIllegalMoves: false,
        arrows: false,
        puzzle: {
            failBehavior: "shake",
        },
    },
    review: {
        draggable: false,
        arrows: true,
        highlightLastMove: true,
        review: {
            showBestMove: true,
            editable: false,
        },
    },
    opening: {
        arrows: true,
        highlightLegalMoves: false,
        opening: {
            highlightBookMoves: true,
        },
    },
    free: {
        // Just uses base defaults
    },
};

// ===== CONFIG UTILITIES =====

/**
 * Merge user-provided config with defaults.
 *
 * Order of precedence (highest to lowest):
 * 1. User-provided config
 * 2. Mode-specific defaults
 * 3. Base defaults
 *
 * @param overrides - Partial config to apply
 * @returns Complete BoardConfig with all required fields
 *
 * @example
 * ```ts
 * const config = mergeConfig({
 *   mode: "analyze",
 *   arrows: false, // Override mode default
 * });
 * // Result: analyze mode defaults with arrows disabled
 * ```
 */
export function mergeConfig(overrides: Partial<BoardConfig>): BoardConfig {
    const mode = overrides.mode || "free";
    const modeDefault = modeDefaults[mode] || {};

    // Deep merge for nested mode-specific configs
    const merged: BoardConfig = {
        ...defaultBoardConfig,
        ...modeDefault,
        ...overrides,
    };

    // Merge mode-specific nested configs
    if (mode === "analyze" && (modeDefault.analyze || overrides.analyze)) {
        merged.analyze = {
            ...modeDefault.analyze,
            ...overrides.analyze,
        };
    }

    if (mode === "puzzle" && (modeDefault.puzzle || overrides.puzzle)) {
        merged.puzzle = {
            ...modeDefault.puzzle,
            ...overrides.puzzle,
        };
    }

    if (mode === "opening" && (modeDefault.opening || overrides.opening)) {
        merged.opening = {
            ...modeDefault.opening,
            ...overrides.opening,
        };
    }

    if (mode === "review" && (modeDefault.review || overrides.review)) {
        merged.review = {
            ...modeDefault.review,
            ...overrides.review,
        };
    }

    return merged;
}

/**
 * Create a config optimized for analysis mode.
 *
 * @param overrides - Additional overrides
 * @returns Complete BoardConfig for analysis
 */
export function createAnalyzeConfig(overrides?: Partial<BoardConfig>): BoardConfig {
    return mergeConfig({
        mode: "analyze",
        ...overrides,
    });
}

/**
 * Create a config optimized for puzzle mode.
 *
 * @param correctMove - The correct move in UCI format
 * @param overrides - Additional overrides
 * @returns Complete BoardConfig for puzzles
 */
export function createPuzzleConfig(
    correctMove: string,
    overrides?: Partial<BoardConfig>
): BoardConfig {
    return mergeConfig({
        mode: "puzzle",
        puzzle: {
            correctMove,
            ...overrides?.puzzle,
        },
        ...overrides,
    });
}

/**
 * Create a config optimized for game review mode.
 *
 * @param annotations - Move annotations to display
 * @param overrides - Additional overrides
 * @returns Complete BoardConfig for review
 */
export function createReviewConfig(
    annotations?: BoardConfig["review"],
    overrides?: Partial<BoardConfig>
): BoardConfig {
    return mergeConfig({
        mode: "review",
        review: annotations,
        ...overrides,
    });
}

/**
 * Create a config optimized for opening trainer mode.
 *
 * @param overrides - Additional overrides
 * @returns Complete BoardConfig for opening training
 */
export function createOpeningConfig(overrides?: Partial<BoardConfig>): BoardConfig {
    return mergeConfig({
        mode: "opening",
        ...overrides,
    });
}

// ===== VALIDATION =====

/**
 * Validate a config and warn about potential issues.
 * This is a development-time helper.
 *
 * @param config - Config to validate
 * @returns Array of warning messages (empty if valid)
 */
export function validateConfig(config: BoardConfig): string[] {
    const warnings: string[] = [];

    // Check for conflicting settings
    if (config.mode === "puzzle" && config.allowIllegalMoves) {
        warnings.push(
            "Puzzle mode with allowIllegalMoves=true may cause unexpected behavior"
        );
    }

    if (config.mode === "review" && config.draggable) {
        warnings.push(
            "Review mode typically has draggable=false for read-only navigation"
        );
    }

    // Check for missing required mode-specific config
    if (config.mode === "puzzle" && !config.puzzle?.correctMove) {
        warnings.push("Puzzle mode should specify puzzle.correctMove");
    }

    return warnings;
}

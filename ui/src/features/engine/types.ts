/**
 * Engine Types
 * 
 * Shared type definitions for the engine abstraction layer.
 * These types are used by both ServerEngineClient and WasmEngineClient.
 */

import type { EngineMode } from './engineSettingsStore';

/**
 * Options for engine analysis requests
 */
export interface EngineOptions {
    /** Search depth (plies). If not specified, uses store default. */
    depth?: number;

    /** Time limit in milliseconds. Optional, not all engines support this. */
    movetimeMs?: number;

    /** Number of principal variations to return. Default is 1. */
    multiPv?: number;
}

/**
 * Result from engine analysis
 */
export interface EngineResult {
    /** Best move in UCI format (e.g., "e2e4") */
    bestMove: string;

    /** Centipawn score from engine's perspective */
    cp?: number;

    /** Mate in N moves (positive = engine winning, negative = engine losing) */
    mate?: number;

    /** Principal variation - sequence of best moves in UCI format */
    pv?: string[];

    /** Raw response data for debugging or extra fields */
    raw?: unknown;
}

/**
 * Interface for engine clients
 */
export interface EngineClient {
    /**
     * Analyze a position
     * @param fen - Position in FEN format
     * @param options - Analysis options
     * @param modeOverride - Override the store's engine mode
     */
    analyze(
        fen: string,
        options?: EngineOptions,
        modeOverride?: EngineMode
    ): Promise<EngineResult>;
}

/**
 * Engine Settings Store
 * 
 * Zustand store providing single source of truth for engine mode and depth
 * used in /analyze. This controls whether analysis uses the server-side
 * Stockfish or local WASM Stockfish running in a Web Worker.
 */

import { create } from 'zustand';

export type EngineMode = 'server' | 'wasm' | 'auto';

interface EngineSettingsState {
    /** Current engine mode: server (default), wasm, or auto */
    mode: EngineMode;

    /** Current analysis depth (1-40) */
    depth: number;

    /** Set the engine mode */
    setMode: (mode: EngineMode) => void;

    /** Set the analysis depth */
    setDepth: (depth: number) => void;
}

/**
 * Default depth for analysis.
 * 18 is a good balance between analysis quality and speed.
 */
export const DEFAULT_ENGINE_DEPTH = 18;

export const useEngineSettingsStore = create<EngineSettingsState>((set) => ({
    // Default MUST match current production behavior (server mode)
    mode: 'server',
    depth: DEFAULT_ENGINE_DEPTH,

    setMode: (mode) => set({ mode }),

    setDepth: (depth) => {
        // Clamp depth to valid range
        const clampedDepth = Math.max(1, Math.min(40, depth));
        set({ depth: clampedDepth });
    },
}));

/**
 * Unified Engine Client
 * 
 * Routes analysis requests to either the server Stockfish or WASM Stockfish
 * based on the current engine mode from the settings store.
 */

import type { EngineOptions, EngineResult, EngineClient } from './types';
import type { EngineMode } from './engineSettingsStore';
import { useEngineSettingsStore } from './engineSettingsStore';
import { serverEngineClient } from './ServerEngineClient';
import { wasmEngineClient } from './WasmEngineClient';

class UnifiedEngineClientImpl implements EngineClient {
    /**
     * Analyze a position using the configured engine
     * 
     * @param fen - Position in FEN format
     * @param options - Analysis options (depth will use store default if not specified)
     * @param modeOverride - Override the store's engine mode for this request
     */
    async analyze(
        fen: string,
        options: EngineOptions = {},
        modeOverride?: EngineMode
    ): Promise<EngineResult> {
        const { mode: storeMode, depth: storeDepth } = useEngineSettingsStore.getState();
        const mode = modeOverride ?? storeMode;

        // Use store depth as default if not specified in options
        const engineOptions: EngineOptions = {
            ...options,
            depth: options.depth ?? storeDepth,
        };

        switch (mode) {
            case 'server':
                return serverEngineClient.analyze(fen, engineOptions);

            case 'wasm':
                return wasmEngineClient.analyze(fen, engineOptions);

            case 'auto':
                // Auto mode: prefer WASM (faster, no network), fall back to server on failure
                if (this.isWasmSupported()) {
                    try {
                        return await wasmEngineClient.analyze(fen, engineOptions);
                    } catch (err) {
                        console.warn('[UnifiedEngine] WASM engine failed, falling back to server:', err);
                        return serverEngineClient.analyze(fen, engineOptions);
                    }
                } else {
                    return serverEngineClient.analyze(fen, engineOptions);
                }

            default:
                // Fallback to server for unknown modes
                return serverEngineClient.analyze(fen, engineOptions);
        }
    }

    /**
     * Check if WASM engine is supported in this environment
     */
    private isWasmSupported(): boolean {
        return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
    }

    /**
     * Stop any ongoing analysis (only affects WASM engine)
     */
    stop(): void {
        wasmEngineClient.stop();
    }
}

// Export singleton instance
export const unifiedEngineClient = new UnifiedEngineClientImpl();

// Also export the class for testing
export { UnifiedEngineClientImpl };

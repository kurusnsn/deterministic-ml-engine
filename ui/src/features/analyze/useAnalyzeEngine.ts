/**
 * useAnalyzeEngine Hook
 * 
 * Hook for /analyze page components to perform engine analysis.
 * Uses the unified engine client which routes to server or WASM
 * based on the current engine settings.
 */

import { useCallback } from 'react';
import { unifiedEngineClient } from '../engine/UnifiedEngineClient';
import { useEngineSettingsStore } from '../engine/engineSettingsStore';
import type { EngineOptions, EngineResult } from '../engine/types';

export interface UseAnalyzeEngineReturn {
    /** Analyze a position and get engine evaluation */
    analyzePosition: (fen: string, options?: EngineOptions) => Promise<EngineResult>;

    /** Stop any ongoing WASM analysis */
    stopAnalysis: () => void;

    /** Current engine mode */
    mode: 'server' | 'wasm' | 'auto';

    /** Current analysis depth */
    depth: number;
}

/**
 * Hook providing engine analysis functionality for /analyze
 * 
 * @example
 * ```tsx
 * const { analyzePosition, mode, depth } = useAnalyzeEngine();
 * 
 * const result = await analyzePosition(fen);
 * console.log(result.bestMove, result.cp);
 * ```
 */
export function useAnalyzeEngine(): UseAnalyzeEngineReturn {
    const mode = useEngineSettingsStore((s) => s.mode);
    const depth = useEngineSettingsStore((s) => s.depth);

    const analyzePosition = useCallback(
        async (fen: string, options: EngineOptions = {}): Promise<EngineResult> => {
            return unifiedEngineClient.analyze(fen, options);
        },
        []
    );

    const stopAnalysis = useCallback(() => {
        unifiedEngineClient.stop();
    }, []);

    return {
        analyzePosition,
        stopAnalysis,
        mode,
        depth,
    };
}

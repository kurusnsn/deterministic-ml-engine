"use client";

import { useState, useEffect, useCallback } from "react";

interface UseMaiaPreloadResult {
    isReady: boolean;
    isLoading: boolean;
    progress: number; // 0-100
    error: string | null;
    startPreload: () => void;
}

/**
 * Hook to preload Maia ONNX model with progress tracking.
 * Call startPreload() to begin loading, or set autoStart=true.
 */
export function useMaiaPreload(autoStart = false): UseMaiaPreloadResult {
    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const startPreload = useCallback(async () => {
        // Check if already ready (avoid re-import)
        try {
            const { isMaiaReady } = await import("@/lib/engine/maiaEngine");
            if (isMaiaReady()) {
                setIsReady(true);
                setProgress(100);
                return;
            }
        } catch {
            // Module not loaded yet, continue
        }

        setIsLoading(true);
        setError(null);

        try {
            const { initMaia, isMaiaReady } = await import("@/lib/engine/maiaEngine");

            await initMaia((loaded, total) => {
                const pct = Math.round((loaded / total) * 100);
                setProgress(pct);
            });

            setIsReady(isMaiaReady());
            setProgress(100);
        } catch (e) {
            console.error("Failed to preload Maia:", e);
            setError(e instanceof Error ? e.message : "Failed to load Maia engine");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (autoStart) {
            startPreload();
        }
    }, [autoStart, startPreload]);

    // Also check initial state
    useEffect(() => {
        (async () => {
            try {
                const { isMaiaReady } = await import("@/lib/engine/maiaEngine");
                if (isMaiaReady()) {
                    setIsReady(true);
                    setProgress(100);
                }
            } catch {
                // Not loaded yet
            }
        })();
    }, []);

    return { isReady, isLoading, progress, error, startPreload };
}

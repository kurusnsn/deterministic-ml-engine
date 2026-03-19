/**
 * Overlay management hook
 *
 * Manages:
 * - Worker lifecycle for heavy computations (grid, threats, PV)
 * - Request throttling (100ms minimum)
 * - Merging UI-only overlays with worker results
 * - Store updates
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useBoardStore, Arrow, GridSquare, Threat, Highlight } from "@/board/core/useBoardStore";
import { OverlayWorkerWrapper, getOverlayWorker, terminateOverlayWorker } from "@/board/workers/workerClient";

const WORKER_THROTTLE_MS = 100;

export interface OverlaySettings {
  grid: {
    enabled: boolean;
    maxBoxes: number;
  };
  threats: {
    enabled: boolean;
    threshold: number;
  };
  pv: {
    enabled: boolean;
    showBestMove: boolean;
  };
}

export interface UIOverlayData {
  highlights: Highlight[];
  userArrows: Arrow[];
}

export interface UseBoardOverlaysOptions {
  fen: string;
  boardSize: number;
  orientation: "white" | "black";
  moveEvalMap: Record<string, Record<string, number>>;
  pvLines: Array<{ moves: string[]; eval: number }>;
  settings: OverlaySettings;
  uiOverlays: UIOverlayData;
  draggingFrom: string | null;
  selectedSquare: string | null;
}

export interface UseBoardOverlaysReturn {
  /** Request a worker computation manually (usually not needed) */
  requestComputation: () => void;
  /** Terminate the worker (for cleanup) */
  terminate: () => void;
}

/**
 * Hook that manages overlay computation via Web Worker
 *
 * This hook:
 * 1. Initializes and manages the overlay worker lifecycle
 * 2. Throttles requests to prevent overwhelming the worker
 * 3. Merges worker results with UI-only overlays
 * 4. Updates the board store with combined overlay data
 *
 * @example
 * ```tsx
 * useBoardOverlays({
 *   fen,
 *   boardSize,
 *   orientation,
 *   moveEvalMap,
 *   pvLines,
 *   settings: {
 *     grid: { enabled: showGrid, maxBoxes: 5 },
 *     threats: { enabled: showThreats, threshold: 100 },
 *     pv: { enabled: showArrows, showBestMove: true },
 *   },
 *   uiOverlays: { highlights, userArrows },
 *   draggingFrom,
 *   selectedSquare,
 * });
 * ```
 */
export const useBoardOverlays = (options: UseBoardOverlaysOptions): UseBoardOverlaysReturn => {
  const {
    fen,
    boardSize,
    orientation,
    moveEvalMap,
    pvLines,
    settings,
    uiOverlays,
    draggingFrom,
    selectedSquare,
  } = options;

  // Refs for worker management
  const workerRef = useRef<OverlayWorkerWrapper | null>(null);
  const requestIdRef = useRef(0);
  const lastUpdateRef = useRef(0);
  const currentFenRef = useRef(fen);

  // Keep FEN ref updated
  useEffect(() => {
    currentFenRef.current = fen;
  }, [fen]);

  // Initialize worker on mount
  useEffect(() => {
    workerRef.current = getOverlayWorker();
    return () => {
      // Don't terminate on unmount - worker is shared
      // terminateOverlayWorker() can be called manually if needed
    };
  }, []);

  // Request computation function
  const requestComputation = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;

    lastUpdateRef.current = Date.now();
    const requestId = ++requestIdRef.current;

    // Determine mode based on drag state
    const mode = draggingFrom ? "dragging" : selectedSquare ? "selected" : "idle";

    // Send computation request to worker
    worker
      .computeOverlays({
        fen,
        mode,
        evalData: moveEvalMap,
        threatSettings: {
          enabled: settings.threats.enabled,
          threshold: settings.threats.threshold,
        },
        gridSettings: {
          enabled: settings.grid.enabled,
          maxBoxes: settings.grid.maxBoxes,
        },
        pvSettings: {
          enabled: settings.pv.enabled,
          showBestMove: settings.pv.showBestMove,
        },
        multipvData: pvLines,
      })
      .then((result) => {
        // Ignore stale responses
        if (requestId !== requestIdRef.current) {
          return;
        }

        // Ignore responses for different FEN (prevents stale arrows after move)
        if (result.fen !== currentFenRef.current) {
          return;
        }

        // Merge worker results with UI-only data
        const workerArrows = result.arrows || [];
        const workerGrid = result.grid || [];
        const workerThreats = result.threats || [];

        // Add PV arrow if available and not dragging
        const pvArrow = !draggingFrom && result.bestMoveArrow ? [result.bestMoveArrow] : [];

        // Combine worker arrows with user-drawn arrows
        const combinedArrows: Arrow[] = [
          ...pvArrow,
          ...workerArrows,
          ...uiOverlays.userArrows,
        ];

        // Single batched Zustand update
        useBoardStore.setState({
          boardSize,
          orientation,
          fen,
          highlights: uiOverlays.highlights,
          arrows: combinedArrows,
          grid: workerGrid as GridSquare[],
          threats: workerThreats as Threat[],
        });
      })
      .catch((error) => {
        console.error("[useBoardOverlays] Worker computation error:", error);
        // On error, update with UI-only data
        useBoardStore.setState({
          boardSize,
          orientation,
          fen,
          highlights: uiOverlays.highlights,
          arrows: uiOverlays.userArrows,
          grid: [],
          threats: [],
        });
      });
  }, [
    fen,
    boardSize,
    orientation,
    moveEvalMap,
    pvLines,
    settings,
    uiOverlays,
    draggingFrom,
    selectedSquare,
  ]);

  // Throttled worker computation effect
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;

    // Throttle worker requests during rapid changes
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    if (timeSinceLastUpdate < WORKER_THROTTLE_MS) {
      // Schedule throttled update
      const timeoutId = setTimeout(() => {
        requestComputation();
      }, WORKER_THROTTLE_MS - timeSinceLastUpdate);
      return () => clearTimeout(timeoutId);
    }

    requestComputation();
  }, [requestComputation]);

  // Terminate function for manual cleanup
  const terminate = useCallback(() => {
    terminateOverlayWorker();
    workerRef.current = null;
  }, []);

  return {
    requestComputation,
    terminate,
  };
};

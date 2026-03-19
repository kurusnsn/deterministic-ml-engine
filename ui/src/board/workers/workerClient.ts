/**
 * Phase 3: Worker communication helper for main thread
 * Provides type-safe interface to communicate with overlay worker
 */

import {
    MessageToWorker,
    MessageFromWorker,
    ThreatSettings,
    GridSettings,
    PVSettings,
} from "./workerMessageTypes";

// ===== WORKER WRAPPER CLASS =====

export class OverlayWorkerWrapper {
    private worker: Worker | null = null;
    private messageId = 0;
    private pendingCallbacks = new Map<
        number,
        (response: MessageFromWorker) => void
    >();

    constructor() {
        this.initWorker();
    }

    /**
     * Initialize the Web Worker
     */
    private initWorker(): void {
        try {
            // Create worker from overlayWorker.ts
            this.worker = new Worker(
                new URL("./overlayWorker.ts", import.meta.url),
                { type: "module" }
            );

            // Listen for messages from worker
            this.worker.onmessage = (event: MessageEvent<MessageFromWorker>) => {
                const response = event.data;

                // For now, just call all pending callbacks since we don't have message IDs yet
                // In a production system, you'd want to add message IDs to track requests
                this.pendingCallbacks.forEach((callback) => {
                    callback(response);
                });
                this.pendingCallbacks.clear();
            };

            // Handle worker errors
            this.worker.onerror = (error) => {
                console.error("[OverlayWorkerWrapper] Worker error:", error);
            };

            console.log("[OverlayWorkerWrapper] Worker initialized");
        } catch (error) {
            console.error("[OverlayWorkerWrapper] Failed to initialize worker:", error);
        }
    }

    /**
     * Compute overlays for current position
     * @param params - Computation parameters
     * @returns Promise that resolves with computed overlays
     */
    public async computeOverlays(params: {
        fen: string;
        mode: "idle" | "dragging" | "selected";
        evalData?: Record<string, Record<string, number>>;
        threatSettings: ThreatSettings;
        gridSettings: GridSettings;
        pvSettings: PVSettings;
        multipvData?: Array<{ moves: string[]; eval: number }>;
    }): Promise<MessageFromWorker["payload"]> {
        return new Promise((resolve, reject) => {
            if (!this.worker) {
                reject(new Error("Worker not initialized"));
                return;
            }

            const messageId = this.messageId++;

            // Store callback
            this.pendingCallbacks.set(messageId, (response) => {
                resolve(response.payload);
            });

            // Send message to worker
            const message: MessageToWorker = {
                type: "COMPUTE_OVERLAYS",
                payload: params,
            };

            this.worker.postMessage(message);

            // Timeout after 5 seconds
            setTimeout(() => {
                if (this.pendingCallbacks.has(messageId)) {
                    this.pendingCallbacks.delete(messageId);
                    reject(new Error("Worker timeout"));
                }
            }, 5000);
        });
    }

    /**
     * Terminate the worker
     */
    public terminate(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.pendingCallbacks.clear();
            console.log("[OverlayWorkerWrapper] Worker terminated");
        }
    }
}

// ===== SINGLETON INSTANCE =====

let workerInstance: OverlayWorkerWrapper | null = null;

/**
 * Get or create the worker instance
 * @returns Worker wrapper instance
 */
export function getOverlayWorker(): OverlayWorkerWrapper {
    if (!workerInstance) {
        workerInstance = new OverlayWorkerWrapper();
    }
    return workerInstance;
}

/**
 * Terminate the worker instance
 */
export function terminateOverlayWorker(): void {
    if (workerInstance) {
        workerInstance.terminate();
        workerInstance = null;
    }
}

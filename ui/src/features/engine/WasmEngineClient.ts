/**
 * WASM Engine Client
 * 
 * Client that manages a Web Worker running WASM Stockfish.
 * Analysis runs off the main thread, keeping the UI responsive.
 */

import type { EngineOptions, EngineResult } from './types';

/** Timeout for analysis requests (30 seconds) */
const ANALYSIS_TIMEOUT_MS = 30000;

/** Default depth if not specified */
const DEFAULT_DEPTH = 18;

export class WasmEngineClient {
    private worker: Worker | null = null;
    private ready: Promise<void> | null = null;
    private isReady = false;

    /**
     * Ensure the worker is initialized and ready for commands
     */
    private ensureWorker(): Promise<void> {
        if (this.ready) return this.ready;

        // Create worker using Vite/Webpack compatible URL syntax
        this.worker = new Worker(
            new URL('./stockfish.worker.ts', import.meta.url),
            { type: 'module' }
        );

        this.ready = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('WASM engine initialization timeout'));
            }, 10000);

            const handleMessage = (event: MessageEvent) => {
                const msg = event.data;

                if (msg?.type === 'error') {
                    clearTimeout(timeout);
                    this.worker?.removeEventListener('message', handleMessage);
                    reject(new Error(msg.payload));
                    return;
                }

                if (msg?.type === 'engine-output' && typeof msg.payload === 'string') {
                    // uciok signals engine is ready
                    if (msg.payload.includes('uciok')) {
                        clearTimeout(timeout);
                        this.worker?.removeEventListener('message', handleMessage);
                        this.isReady = true;
                        resolve();
                    }
                }
            };

            this.worker!.addEventListener('message', handleMessage);

            // Kick off initialization
            this.worker!.postMessage({ type: 'init' });
        });

        return this.ready;
    }

    /**
     * Analyze a position using WASM Stockfish
     */
    async analyze(fen: string, options: EngineOptions = {}): Promise<EngineResult> {
        await this.ensureWorker();

        const worker = this.worker!;
        const depth = options.depth ?? DEFAULT_DEPTH;
        const multiPv = options.multiPv ?? 1;

        return new Promise<EngineResult>((resolve, reject) => {
            let bestMove = '';
            let cp: number | undefined;
            let mate: number | undefined;
            let pv: string[] = [];
            let currentDepth = 0;

            const timeout = setTimeout(() => {
                worker.removeEventListener('message', handleMessage);
                reject(new Error('WASM engine analysis timeout'));
            }, ANALYSIS_TIMEOUT_MS);

            const handleMessage = (event: MessageEvent) => {
                const msg = event.data;
                if (msg?.type !== 'engine-output') return;

                const text: string = msg.payload;
                if (typeof text !== 'string') return;

                // Parse UCI "info" lines for score and pv
                if (text.startsWith('info ')) {
                    const parts = text.split(/\s+/);

                    // Parse depth
                    const depthIdx = parts.indexOf('depth');
                    if (depthIdx !== -1) {
                        currentDepth = parseInt(parts[depthIdx + 1], 10);
                    }

                    // Parse score (cp or mate)
                    const scoreIdx = parts.indexOf('score');
                    if (scoreIdx !== -1) {
                        const scoreType = parts[scoreIdx + 1];
                        const value = parseInt(parts[scoreIdx + 2], 10);

                        if (scoreType === 'cp') {
                            cp = value;
                            mate = undefined;
                        } else if (scoreType === 'mate') {
                            mate = value;
                            cp = undefined;
                        }
                    }

                    // Parse PV (principal variation)
                    const pvIdx = parts.indexOf('pv');
                    if (pvIdx !== -1) {
                        pv = parts.slice(pvIdx + 1);
                    }
                }

                // "bestmove" signals analysis complete
                if (text.startsWith('bestmove ')) {
                    clearTimeout(timeout);
                    bestMove = text.split(/\s+/)[1] || '';
                    worker.removeEventListener('message', handleMessage);

                    resolve({
                        bestMove,
                        cp,
                        mate,
                        pv,
                        raw: { depth: currentDepth },
                    });
                }
            };

            worker.addEventListener('message', handleMessage);

            // Send UCI commands
            worker.postMessage({ type: 'command', payload: 'ucinewgame' });
            worker.postMessage({ type: 'command', payload: `position fen ${fen}` });

            if (multiPv > 1) {
                worker.postMessage({
                    type: 'command',
                    payload: `setoption name MultiPV value ${multiPv}`,
                });
            }

            worker.postMessage({
                type: 'command',
                payload: `go depth ${depth}`,
            });
        });
    }

    /**
     * Stop any ongoing analysis
     */
    stop(): void {
        if (this.worker && this.isReady) {
            this.worker.postMessage({ type: 'command', payload: 'stop' });
        }
    }

    /**
     * Terminate the worker and clean up
     */
    terminate(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.ready = null;
            this.isReady = false;
        }
    }
}

// Singleton instance for convenience
export const wasmEngineClient = new WasmEngineClient();

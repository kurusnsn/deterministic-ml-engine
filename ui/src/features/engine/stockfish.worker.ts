/**
 * Stockfish Web Worker
 * 
 * This worker wraps the WASM Stockfish engine and handles communication
 * with the main thread via postMessage. It loads the existing Stockfish
 * WASM build from the public directory.
 * 
 * Message Protocol:
 * - Main -> Worker: { type: 'init' } - Initialize the engine
 * - Main -> Worker: { type: 'command', payload: string } - Send UCI command
 * - Worker -> Main: { type: 'engine-output', payload: string } - Engine output line
 * - Worker -> Main: { type: 'ready' } - Engine initialized and ready
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Web Worker globals - using any to avoid lib issues
declare function importScripts(...urls: string[]): void;

// Declare the global STOCKFISH function that will be available after importScripts
declare const STOCKFISH: () => {
    postMessage: (cmd: string) => void;
    onmessage: ((event: MessageEvent | string) => void) | null;
};

let engine: ReturnType<typeof STOCKFISH> | null = null;

function initEngine(): void {
    if (engine) return;

    try {
        // Import the Stockfish script
        // This will define the global STOCKFISH function
        importScripts('/stockfish.js');

        // Create engine instance
        engine = STOCKFISH();

        // Forward engine output to main thread
        engine.onmessage = (event: MessageEvent | string) => {
            const line = typeof event === 'string' ? event : event.data;
            postMessage({ type: 'engine-output', payload: line });
        };
    } catch (error) {
        postMessage({ type: 'error', payload: String(error) });
    }
}

onmessage = (event: MessageEvent) => {
    const { type, payload } = event.data as { type: string; payload?: string };

    if (type === 'init') {
        initEngine();
        if (engine) {
            // Start UCI negotiation
            engine.postMessage('uci');
        }
        return;
    }

    // Lazy init if not already done
    if (!engine) {
        initEngine();
    }

    if (type === 'command' && engine && payload) {
        engine.postMessage(payload);
    }
};

// Export empty object to make this a module (required for TypeScript)
export { };

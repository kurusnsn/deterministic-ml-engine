/**
 * Server Engine Client
 * 
 * Wrapper around the existing server Stockfish API.
 * This class maintains full backwards compatibility with the current
 * backend - no changes are made to the API contract.
 */

import type { EngineOptions, EngineResult } from './types';

const GATEWAY_URL =
    (process.env.NEXT_PUBLIC_GATEWAY_URL as string) ?? '/api/gateway';

export class ServerEngineClient {
    private baseUrl: string;

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl ?? GATEWAY_URL;
    }

    async analyze(fen: string, options: EngineOptions = {}): Promise<EngineResult> {
        // Build request body matching existing backend contract
        const body: Record<string, unknown> = { fen };

        if (typeof options.depth === 'number') {
            body.depth = options.depth;
        }
        if (typeof options.movetimeMs === 'number') {
            body.movetimeMs = options.movetimeMs;
        }
        if (typeof options.multiPv === 'number') {
            body.multipv = options.multiPv;
        }

        const res = await fetch(`${this.baseUrl}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            throw new Error(`Server engine error: ${res.status}`);
        }

        const data = await res.json();

        // Map existing response fields into EngineResult
        // The server returns: { stockfish: { analysis: [...] }, eco?: {...} }
        const analysis = data.stockfish?.analysis?.[0];

        if (!analysis) {
            throw new Error('Server returned empty analysis');
        }

        // Extract score - can be number (centipawns) or string (mate)
        let cp: number | undefined;
        let mate: number | undefined;

        if (typeof analysis.score === 'number') {
            cp = analysis.score;
        } else if (typeof analysis.score === 'string' && analysis.score.startsWith('mate')) {
            const mateMatch = analysis.score.match(/mate\s+(-?\d+)/);
            if (mateMatch) {
                mate = parseInt(mateMatch[1], 10);
            }
        }

        return {
            bestMove: analysis.uci ?? analysis.move ?? '',
            cp,
            mate,
            pv: analysis.pv_uci ?? analysis.pv ?? [],
            raw: data,
        };
    }
}

// Singleton instance for convenience
export const serverEngineClient = new ServerEngineClient();

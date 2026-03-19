/**
 * Phase 3: Implemented - Web Worker for overlay computation
 */

import {
    MessageToWorker,
    MessageFromWorker,
    WorkerArrow,
    WorkerGridSquare,
    WorkerThreat,
    EvalData,
    ThreatSettings,
    GridSettings,
    PVSettings,
} from "./workerMessageTypes";

// ===== HELPER FUNCTIONS =====

/**
 * Extract side to move from FEN string
 * Returns 'w' for White, 'b' for Black
 */
function getSideToMove(fen: string): 'w' | 'b' {
    return fen.split(' ')[1] as 'w' | 'b';
}

// ===== PROCESSOR FUNCTIONS =====

/**
 * Process grid overlay data from evaluation scores
 * Uses exact color logic from OverlayGrid.tsx
 * Note: Scores are always from White's perspective, so we flip comparisons for Black
 */
function processGrid(
    fen: string,
    evalData: Record<string, Record<string, number>> | undefined,
    settings: GridSettings
): WorkerGridSquare[] {
    if (!settings.enabled || !evalData) {
        return [];
    }

    const gridSquares: WorkerGridSquare[] = [];

    // Scores are from White's perspective - for Black, lower scores are better
    const isBlackToMove = getSideToMove(fen) === 'b';

    // Find best overall score across all moves
    const allScores = Object.values(evalData).flatMap((targets) =>
        Object.values(targets)
    );

    if (allScores.length === 0) {
        return [];
    }

    // For White, best = highest score; for Black, best = lowest score
    const bestScore = isBlackToMove ? Math.min(...allScores) : Math.max(...allScores);

    // For each source square, find its best move
    const sourceMoves: Array<{ from: string; to: string; score: number }> = [];

    for (const from in evalData) {
        const targets = evalData[from];
        let bestTarget: { to: string; score: number } | null = null;

        for (const to in targets) {
            const score = targets[to];
            // For White, higher is better; for Black, lower is better
            const isBetter = isBlackToMove
                ? (bestTarget === null || score < bestTarget.score)
                : (bestTarget === null || score > bestTarget.score);
            if (isBetter) {
                bestTarget = { to, score };
            }
        }

        if (bestTarget) {
            sourceMoves.push({ from, to: bestTarget.to, score: bestTarget.score });
        }
    }

    // Sort by score: White wants highest first, Black wants lowest first
    sourceMoves.sort((a, b) => isBlackToMove ? a.score - b.score : b.score - a.score);
    const topMoves = sourceMoves.slice(0, settings.maxBoxes || Infinity);

    // Create grid squares for top moves
    for (const move of topMoves) {
        const value = move.score;
        // For White: diff = bestScore - value (higher is worse for this move)
        // For Black: diff = value - bestScore (lower is worse for this move, so we flip)
        const diff = isBlackToMove ? value - bestScore : bestScore - value;

        // Format score label: +X or -X
        const scoreLabel =
            value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;

        // Determine color based on diff (exact logic from OverlayGrid.tsx)
        let color: string;
        if (value === bestScore) {
            color = "bg-blue-700"; // absolute best
        } else if (diff < 2) {
            color = "bg-green-500"; // very close (≤ 0.2 pawns worse)
        } else if (diff < 5) {
            color = "bg-yellow-500"; // moderate (≤ 0.5 pawns worse)
        } else {
            color = "bg-red-600"; // clearly worse
        }

        gridSquares.push({
            square: move.from as any, // Source square shows the eval box
            score: scoreLabel,
            color,
        });
    }

    return gridSquares;
}

/**
 * Process threat arrows from current position
 * Uses chess.js for game state analysis
 */
function processThreats(
    fen: string,
    settings: ThreatSettings
): WorkerThreat[] {
    if (!settings.enabled) {
        return [];
    }

    try {
        // Import Chess dynamically in worker context
        // Note: chess.js must be available in worker scope
        const { Chess } = require('chess.js');
        const game = new Chess(fen);

        const threats: WorkerThreat[] = [];
        const board = game.board();
        const currentTurn = game.turn();

        // Piece values in centipawns
        const pieceValues: Record<string, number> = {
            'p': 100,
            'n': 300,
            'b': 300,
            'r': 500,
            'q': 900,
            'k': 0
        };

        // Check each square for opponent pieces under attack
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const square = (String.fromCharCode(97 + file) + (rank + 1)) as any;
                const piece = board[7 - rank][file];

                // Only check opponent's pieces
                if (!piece || piece.color === currentTurn) continue;

                // Check if this square is attacked by current player
                const isAttacked = game.isAttacked(square, currentTurn);
                if (!isAttacked) continue;

                // Get value of the piece
                const pieceValue = pieceValues[piece.type] || 0;

                // Only show if piece value exceeds threshold
                if (pieceValue < settings.threshold) continue;

                // Find attackers and draw arrows from them to this piece
                try {
                    // Test all squares to find attackers
                    for (let aRank = 0; aRank < 8; aRank++) {
                        for (let aFile = 0; aFile < 8; aFile++) {
                            const attackerSquare = (String.fromCharCode(97 + aFile) + (aRank + 1)) as any;
                            const attacker = board[7 - aRank][aFile];

                            if (!attacker || attacker.color !== currentTurn) continue;

                            // Check if this piece can move to the target square
                            const moves = game.moves({ square: attackerSquare, verbose: true });
                            const canAttack = moves.some((m: any) => m.to === square);

                            if (canAttack) {
                                threats.push({
                                    from: attackerSquare,
                                    to: square,
                                    color: 'rgb(239, 68, 68)' // Red arrows, fully opaque
                                });
                            }
                        }
                    }
                } catch (e) {
                    // Ignore errors in attack detection
                }
            }
        }

        return threats;
    } catch (error) {
        console.error('[OverlayWorker] Error in threat detection:', error);
        return [];
    }
}

/**
 * Process PV (Principal Variation) lines
 * Simple passthrough for now
 */
function processPV(
    multipvData: Array<{ moves: string[]; eval: number }> | undefined,
    settings: PVSettings
): Array<{ moves: string[]; eval: number }> {
    if (!settings.enabled || !multipvData) {
        return [];
    }

    // Just pass through the PV data
    return multipvData;
}

/**
 * Process best move arrow from evaluation data
 * Extracts the single best move and creates arrow
 * Note: Scores are from White's perspective, so we flip comparison for Black
 */
function processBestMove(
    fen: string,
    evalData: Record<string, Record<string, number>> | undefined,
    settings: PVSettings
): WorkerArrow | null {
    if (!settings.showBestMove || !evalData) {
        return null;
    }

    // Scores are from White's perspective - for Black, lower scores are better
    const isBlackToMove = getSideToMove(fen) === 'b';

    let bestMove: { from: string; to: string; score: number } | null = null;

    // Find the absolute best move across all source squares
    for (const from in evalData) {
        const targets = evalData[from];
        for (const to in targets) {
            const score = targets[to];
            // For White, higher is better; for Black, lower is better
            const isBetter = isBlackToMove
                ? (bestMove === null || score < bestMove.score)
                : (bestMove === null || score > bestMove.score);
            if (isBetter) {
                bestMove = { from, to, score };
            }
        }
    }

    if (!bestMove) {
        return null;
    }

    // Return arrow with blue color (from existing code)
    return {
        from: bestMove.from as any,
        to: bestMove.to as any,
        color: "blue",
    };
}

// ===== WORKER MESSAGE HANDLER =====

self.onmessage = (event: MessageEvent<MessageToWorker>) => {
    const { type, payload } = event.data;

    if (type === "COMPUTE_OVERLAYS") {
        try {
            // Process each overlay type
            const grid = processGrid(
                payload.fen,
                payload.evalData,
                payload.gridSettings
            );

            const threats = processThreats(
                payload.fen,
                payload.threatSettings
            );

            const pvLines = processPV(
                payload.multipvData,
                payload.pvSettings
            );

            const bestMoveArrow = processBestMove(
                payload.fen,
                payload.evalData,
                payload.pvSettings
            );

            // Note: bestMoveArrow is sent separately in the response payload
            // and handled by ChessBoard.tsx to avoid duplicates
            const arrows: WorkerArrow[] = [];

            // Send computed overlays back to main thread
            const response: MessageFromWorker = {
                type: "OVERLAYS_COMPUTED",
                payload: {
                    fen: payload.fen, // Include FEN to validate response matches current position
                    arrows,
                    grid,
                    threats,
                    pvLines,
                    bestMoveArrow: bestMoveArrow,
                },
            };

            self.postMessage(response);
        } catch (error) {
            // Log error but don't crash worker
            console.error("[OverlayWorker] Error computing overlays:", error);

            // Send empty response on error
            const errorResponse: MessageFromWorker = {
                type: "OVERLAYS_COMPUTED",
                payload: {
                    fen: payload.fen,
                    arrows: [],
                    grid: [],
                    threats: [],
                    pvLines: [],
                    bestMoveArrow: null,
                },
            };

            self.postMessage(errorResponse);
        }
    }
};

// Log worker initialization
console.log("[OverlayWorker] Initialized and ready");

// Export empty object to make this a module
export { };

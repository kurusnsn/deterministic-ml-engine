/**
 * Phase 4: Threat computation logic (runs on main thread with chess.js)
 * This extracts the threat detection logic from ChessBoard.tsx getThreatArrows()
 */

import { Chess, Square } from "chess.js";

// ===== THREAT DETECTION =====

export interface ThreatArrow {
    from: Square;
    to: Square;
    color: string;
}

/**
 * Compute threat arrows for the current position
 * This uses the exact logic from ChessBoard.tsx getThreatArrows()
 * 
 * @param game - Chess.js instance with current position
 * @param enabled - Whether threat detection is enabled
 * @param threshold - Centipawn threshold for showing threats (default: 300)
 * @returns Array of threat arrows
 */
export function computeThreats(
    game: Chess,
    enabled: boolean,
    threshold: number = 300
): ThreatArrow[] {
    if (!enabled) {
        return [];
    }

    const threats: ThreatArrow[] = [];
    const board = game.board();
    const currentTurn = game.turn();

    // Piece values in centipawns (exact values from ChessBoard.tsx)
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
            const square = (String.fromCharCode(97 + file) + (rank + 1)) as Square;
            const piece = board[7 - rank][file];

            // Only check opponent's pieces
            if (!piece || piece.color === currentTurn) continue;

            // Check if this square is attacked by current player
            const isAttacked = game.isAttacked(square, currentTurn);
            if (!isAttacked) continue;

            // Get value of the piece
            const pieceValue = pieceValues[piece.type] || 0;

            // Only show if piece value exceeds threshold
            if (pieceValue < threshold) continue;

            // Find attackers and draw arrows from them to this piece
            try {
                // Test all squares to find attackers
                for (let aRank = 0; aRank < 8; aRank++) {
                    for (let aFile = 0; aFile < 8; aFile++) {
                        const attackerSquare = (String.fromCharCode(97 + aFile) + (aRank + 1)) as Square;
                        const attacker = board[7 - aRank][aFile];

                        if (!attacker || attacker.color !== currentTurn) continue;

                        // Check if this piece can move to the target square
                        const moves = game.moves({ square: attackerSquare, verbose: true });
                        const canAttack = moves.some((m: any) => m.to === square);

                        if (canAttack) {
                            // Use exact color from ChessBoard.tsx
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
}

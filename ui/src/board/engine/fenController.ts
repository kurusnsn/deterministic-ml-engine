/**
 * FEN Controller
 *
 * Extracted FEN/position management logic from ChessBoard.tsx.
 * Handles loading, parsing, and synchronizing positions.
 */

import { Chess, Square } from "chess.js";

// ===== FEN OPERATIONS =====

/**
 * Load a FEN position into a Chess.js instance.
 *
 * @param game - Chess.js instance
 * @param fen - FEN string to load
 * @returns true if successful, false if FEN is invalid
 */
export function loadFen(game: Chess, fen: string): boolean {
    try {
        game.load(fen);
        return true;
    } catch {
        return false;
    }
}

/**
 * Load a PGN into a Chess.js instance.
 *
 * @param game - Chess.js instance
 * @param pgn - PGN string to load
 * @returns true if successful, false if PGN is invalid
 */
export function loadPgn(
    game: Chess,
    pgn: string
): boolean {
    try {
        game.loadPgn(pgn);
        return true;
    } catch {
        return false;
    }
}

/**
 * Reset a Chess.js instance to the starting position.
 *
 * @param game - Chess.js instance
 */
export function resetToStart(game: Chess): void {
    game.reset();
}

// ===== FEN VALIDATION =====

/**
 * Validate a FEN string without loading it.
 *
 * @param fen - FEN string to validate
 * @returns Validation result with success flag and optional error
 */
export function validateFen(fen: string): { valid: boolean; error?: string } {
    try {
        const testGame = new Chess();
        testGame.load(fen);
        return { valid: true };
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : "Invalid FEN",
        };
    }
}

/**
 * Validate a PGN string without loading it.
 *
 * @param pgn - PGN string to validate
 * @returns Validation result with success flag and optional error
 */
export function validatePgn(pgn: string): { valid: boolean; error?: string } {
    try {
        const testGame = new Chess();
        testGame.loadPgn(pgn);
        return { valid: true };
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : "Invalid PGN",
        };
    }
}

// ===== POSITION RECONSTRUCTION =====

export interface ReplayResult {
    success: boolean;
    finalFen: string;
    error?: string;
    failedAtPly?: number;
}

/**
 * Replay a sequence of moves from UCIs starting from a position.
 *
 * @param startingFen - Starting position FEN
 * @param ucis - Array of UCI move strings
 * @returns ReplayResult with final position
 */
export function replayMoves(startingFen: string, ucis: string[]): ReplayResult {
    const game = new Chess(startingFen);

    for (let i = 0; i < ucis.length; i++) {
        const uci = ucis[i];
        if (!uci || uci.length < 4) {
            return {
                success: false,
                finalFen: game.fen(),
                error: `Invalid UCI at ply ${i}: ${uci}`,
                failedAtPly: i,
            };
        }

        try {
            const from = uci.slice(0, 2) as Square;
            const to = uci.slice(2, 4) as Square;
            const promotion = uci.length > 4 ? uci[4] : undefined;

            const result = game.move({ from, to, promotion: promotion as any });
            if (!result) {
                return {
                    success: false,
                    finalFen: game.fen(),
                    error: `Failed to execute move at ply ${i}: ${uci}`,
                    failedAtPly: i,
                };
            }
        } catch (error) {
            return {
                success: false,
                finalFen: game.fen(),
                error: `Error at ply ${i}: ${error instanceof Error ? error.message : "Unknown error"}`,
                failedAtPly: i,
            };
        }
    }

    return {
        success: true,
        finalFen: game.fen(),
    };
}

/**
 * Replay a sequence of SAN moves from a starting position.
 *
 * @param startingFen - Starting position FEN
 * @param sans - Array of SAN move strings
 * @returns ReplayResult with final position
 */
export function replaySanMoves(startingFen: string, sans: string[]): ReplayResult {
    const game = new Chess(startingFen);

    for (let i = 0; i < sans.length; i++) {
        const san = sans[i];
        if (!san) {
            return {
                success: false,
                finalFen: game.fen(),
                error: `Empty SAN at ply ${i}`,
                failedAtPly: i,
            };
        }

        try {
            const result = game.move(san);
            if (!result) {
                return {
                    success: false,
                    finalFen: game.fen(),
                    error: `Failed to execute move at ply ${i}: ${san}`,
                    failedAtPly: i,
                };
            }
        } catch (error) {
            return {
                success: false,
                finalFen: game.fen(),
                error: `Error at ply ${i}: ${error instanceof Error ? error.message : "Unknown error"}`,
                failedAtPly: i,
            };
        }
    }

    return {
        success: true,
        finalFen: game.fen(),
    };
}

// ===== POSITION QUERIES =====

/**
 * Get the game status string for display.
 *
 * @param game - Chess.js instance
 * @returns Human-readable status string
 */
export function getGameStatus(game: Chess): string {
    if (game.isCheckmate()) return "Checkmate!";
    if (game.isStalemate()) return "Stalemate!";
    if (game.isDraw()) return "Draw!";
    if (game.isCheck()) return "Check!";
    return game.turn() === "w" ? "White to move" : "Black to move";
}

/**
 * Get captured pieces from the current position.
 *
 * @param fen - Current position FEN
 * @returns Object with white and black captured pieces
 */
export function getCapturedPieces(fen: string): { white: string[]; black: string[] } {
    // Starting material
    const startingMaterial = {
        white: ["K", "Q", "R", "R", "B", "B", "N", "N", "P", "P", "P", "P", "P", "P", "P", "P"],
        black: ["k", "q", "r", "r", "b", "b", "n", "n", "p", "p", "p", "p", "p", "p", "p", "p"],
    };

    // Parse current pieces
    const position = fen.split(" ")[0];
    const currentWhite: string[] = [];
    const currentBlack: string[] = [];

    for (const char of position) {
        if (/[KQRBNP]/.test(char)) {
            currentWhite.push(char);
        } else if (/[kqrbnp]/.test(char)) {
            currentBlack.push(char);
        }
    }

    // Calculate captured
    const whiteCaptured = [...startingMaterial.black];
    for (const piece of currentBlack) {
        const idx = whiteCaptured.indexOf(piece);
        if (idx !== -1) whiteCaptured.splice(idx, 1);
    }

    const blackCaptured = [...startingMaterial.white];
    for (const piece of currentWhite) {
        const idx = blackCaptured.indexOf(piece);
        if (idx !== -1) blackCaptured.splice(idx, 1);
    }

    return {
        white: whiteCaptured.map((p) => p.toUpperCase()),
        black: blackCaptured.map((p) => p.toUpperCase()),
    };
}

// ===== UCI/SAN CONVERSION =====

/**
 * Convert a move to UCI format.
 *
 * @param from - Source square
 * @param to - Target square
 * @param promotion - Promotion piece (optional)
 * @returns UCI string
 */
export function toUci(from: string, to: string, promotion?: string): string {
    return `${from}${to}${promotion || ""}`;
}

/**
 * Parse a UCI string into its components.
 *
 * @param uci - UCI string
 * @returns Object with from, to, and optional promotion
 */
export function parseUci(uci: string): { from: Square; to: Square; promotion?: string } {
    return {
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: uci.length > 4 ? uci[4] : undefined,
    };
}

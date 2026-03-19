/**
 * Chess.js wrapper with game state management
 *
 * Provides a clean API for:
 * - Loading positions (FEN/PGN)
 * - Making moves
 * - Game status queries
 * - Move validation
 */

import { Chess, Move, Square, Color, PieceSymbol } from "chess.js";

export interface MoveResult {
  success: boolean;
  move?: Move;
  fen: string;
  error?: string;
}

export interface GameStatus {
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  isGameOver: boolean;
  turn: Color;
}

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

/**
 * Board engine wrapping Chess.js with a clean API
 *
 * @example
 * ```tsx
 * const engine = new BoardEngine();
 * engine.loadFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
 *
 * const result = engine.playMove({ from: "e7", to: "e5" });
 * if (result.success) {
 *   console.log("New position:", result.fen);
 * }
 * ```
 */
export class BoardEngine {
  private game: Chess;

  constructor(fen?: string) {
    this.game = new Chess(fen);
  }

  /**
   * Get the underlying Chess.js instance
   * (For advanced operations not covered by this wrapper)
   */
  get chess(): Chess {
    return this.game;
  }

  // ===== POSITION LOADING =====

  /**
   * Load a position from FEN string
   */
  loadFen(fen: string): boolean {
    try {
      this.game.load(fen);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load a game from PGN string
   */
  loadPgn(pgn: string): boolean {
    try {
      this.game.loadPgn(pgn);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reset to starting position
   */
  reset(): void {
    this.game.reset();
  }

  // ===== MOVE OPERATIONS =====

  /**
   * Make a move on the board
   */
  playMove(input: MoveInput): MoveResult {
    try {
      const move = this.game.move({
        from: input.from,
        to: input.to,
        promotion: input.promotion,
      });

      if (move) {
        return {
          success: true,
          move,
          fen: this.game.fen(),
        };
      }

      return {
        success: false,
        fen: this.game.fen(),
        error: "Invalid move",
      };
    } catch (error) {
      return {
        success: false,
        fen: this.game.fen(),
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Make a move using SAN notation (e.g., "e4", "Nf3")
   */
  playMoveSan(san: string): MoveResult {
    try {
      const move = this.game.move(san);

      if (move) {
        return {
          success: true,
          move,
          fen: this.game.fen(),
        };
      }

      return {
        success: false,
        fen: this.game.fen(),
        error: "Invalid move",
      };
    } catch (error) {
      return {
        success: false,
        fen: this.game.fen(),
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Undo the last move
   */
  undo(): Move | null {
    return this.game.undo();
  }

  // ===== POSITION QUERIES =====

  /**
   * Get current FEN string
   */
  fen(): string {
    return this.game.fen();
  }

  /**
   * Get PGN string
   */
  pgn(): string {
    return this.game.pgn();
  }

  /**
   * Get whose turn it is
   */
  turn(): Color {
    return this.game.turn();
  }

  /**
   * Get move history
   */
  history(): string[] {
    return this.game.history();
  }

  /**
   * Get verbose move history
   */
  historyVerbose(): Move[] {
    return this.game.history({ verbose: true });
  }

  // ===== GAME STATUS =====

  /**
   * Get complete game status
   */
  getStatus(): GameStatus {
    return {
      isCheck: this.game.isCheck(),
      isCheckmate: this.game.isCheckmate(),
      isStalemate: this.game.isStalemate(),
      isDraw: this.game.isDraw(),
      isGameOver: this.game.isGameOver(),
      turn: this.game.turn(),
    };
  }

  /**
   * Check if king is in check
   */
  inCheck(): boolean {
    return this.game.isCheck();
  }

  /**
   * Check if game is over (checkmate, stalemate, or draw)
   */
  isGameOver(): boolean {
    return this.game.isGameOver();
  }

  /**
   * Check if position is checkmate
   */
  isCheckmate(): boolean {
    return this.game.isCheckmate();
  }

  /**
   * Check if position is stalemate
   */
  isStalemate(): boolean {
    return this.game.isStalemate();
  }

  // ===== MOVE VALIDATION =====

  /**
   * Get all legal moves for current position
   */
  getLegalMoves(square?: Square): Move[] {
    if (square) {
      return this.game.moves({ square, verbose: true }) as Move[];
    }
    return this.game.moves({ verbose: true }) as Move[];
  }

  /**
   * Check if a move is legal
   */
  isLegalMove(from: Square, to: Square): boolean {
    const moves = this.getLegalMoves(from);
    return moves.some((m) => m.to === to);
  }

  /**
   * Check if a square is attacked by the opponent
   */
  isAttacked(square: Square, byColor: Color): boolean {
    return this.game.isAttacked(square, byColor);
  }

  // ===== PIECE QUERIES =====

  /**
   * Get piece at a square
   */
  get(square: Square): { type: PieceSymbol; color: Color } | null {
    const piece = this.game.get(square);
    return piece || null;
  }

  /**
   * Get the board as a 2D array
   */
  board(): ({ type: PieceSymbol; color: Color; square: Square } | null)[][] {
    return this.game.board();
  }
}

/**
 * Create a new board engine instance
 */
export const createBoardEngine = (fen?: string): BoardEngine => {
  return new BoardEngine(fen);
};

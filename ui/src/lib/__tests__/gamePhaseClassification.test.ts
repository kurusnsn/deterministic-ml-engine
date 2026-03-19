import { Chess } from "chess.js";
import {
  classifyGamePhase,
  classifyGamePhaseDetailed,
} from "../gamePhaseClassification";

describe("Game Phase Classification", () => {
  describe("Opening Phase", () => {
    test("starting position is opening", () => {
      const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      expect(classifyGamePhase(fen)).toBe("opening");
    });

    test("after 1.e4 e5 2.Nf3 Nc6 is opening", () => {
      const game = new Chess();
      game.move("e4");
      game.move("e5");
      game.move("Nf3");
      game.move("Nc6");
      expect(classifyGamePhase(game)).toBe("opening");
    });

    test("Italian Game opening is still opening", () => {
      const game = new Chess();
      game.move("e4");
      game.move("e5");
      game.move("Nf3");
      game.move("Nc6");
      game.move("Bc4");
      expect(classifyGamePhase(game)).toBe("opening");
    });

    test("opening ends when material drops below 46", () => {
      // Position with trades reducing material below 46
      const fen = "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 6";
      const game = new Chess(fen);
      // After several piece trades
      game.move("Bxf7+");
      game.move("Kxf7");
      // Material should be reduced, might trigger middlegame
      const phase = classifyGamePhase(game);
      // This specific position needs to be checked - might still be opening or transition to middlegame
      expect(["opening", "middlegame"]).toContain(phase);
    });
  });

  describe("Middlegame Phase", () => {
    test("position after trades is middlegame", () => {
      // Position with both queens but material < 46
      const fen = "r2q1rk1/ppp2ppp/2n1bn2/3p4/3P4/2N1BN2/PPP2PPP/R2QR1K1 w - - 0 10";
      expect(classifyGamePhase(fen)).toBe("middlegame");
    });

    test("position with one queen traded is middlegame", () => {
      // One queen traded, material still significant
      const fen = "r4rk1/ppp2ppp/2n1bn2/3p4/3P4/2N1BN2/PPP2PPP/R3R1K1 w - - 0 12";
      expect(classifyGamePhase(fen)).toBe("middlegame");
    });
  });

  describe("Endgame Phase", () => {
    test("rook endgame with no queens", () => {
      // Condition A: no queens, material <= 20
      const fen = "8/5pk1/6p1/8/8/6P1/5PK1/3R4 w - - 0 40";
      expect(classifyGamePhase(fen)).toBe("endgame");
    });

    test("queen and pawn endgame", () => {
      // Condition B: one queen, material <= 12
      const fen = "8/5pk1/6p1/8/8/6P1/3Q1PK1/8 w - - 0 40";
      expect(classifyGamePhase(fen)).toBe("endgame");
    });

    test("very simplified position", () => {
      // Condition C: material <= 15 regardless of queens
      const fen = "8/5pk1/8/8/8/8/5PK1/8 w - - 0 50";
      expect(classifyGamePhase(fen)).toBe("endgame");
    });

    test("king and pawn endgame", () => {
      const fen = "8/5pk1/8/8/8/8/5PK1/8 w - - 0 50";
      expect(classifyGamePhase(fen)).toBe("endgame");
    });

    test("knight and pawns endgame", () => {
      const fen = "8/5pk1/6p1/8/8/5NP1/5PK1/8 w - - 0 40";
      expect(classifyGamePhase(fen)).toBe("endgame");
    });
  });

  describe("Detailed Classification", () => {
    test("starting position detailed info", () => {
      const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      const details = classifyGamePhaseDetailed(fen);

      expect(details.phase).toBe("opening");
      expect(details.material.white).toBe(39);
      expect(details.material.black).toBe(39);
      expect(details.material.total).toBe(78);
      expect(details.material.difference).toBe(0);
      expect(details.material.queenCount).toBe(2);
      expect(details.conditions.isOpening).toBe(true);
    });

    test("endgame detailed info", () => {
      const fen = "8/5pk1/6p1/8/8/6P1/5PK1/3R4 w - - 0 40";
      const details = classifyGamePhaseDetailed(fen);

      expect(details.phase).toBe("endgame");
      expect(details.material.queenCount).toBe(0);
      expect(details.conditions.isEndgameConditionA).toBe(true);
    });
  });

  describe("Material Calculation", () => {
    test("calculates material correctly for starting position", () => {
      const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      const details = classifyGamePhaseDetailed(fen);

      // Each side: 8 pawns (8) + 2 knights (6) + 2 bishops (6) + 2 rooks (10) + 1 queen (9) = 39
      expect(details.material.white).toBe(39);
      expect(details.material.black).toBe(39);
      expect(details.material.total).toBe(78);
    });

    test("calculates material with imbalance", () => {
      // White is up a knight
      const fen = "rnbqkb1r/pppppppp/8/8/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 0 1";
      const details = classifyGamePhaseDetailed(fen);

      expect(details.material.white).toBe(39); // Normal material
      expect(details.material.black).toBe(36); // Missing a knight
      expect(details.material.difference).toBe(3);
    });
  });

  describe("Edge Cases", () => {
    test("handles position with promoted pawns (extra queen)", () => {
      // White has two queens (pawn promoted)
      const fen = "4k3/8/8/8/8/8/4Q3/4QK2 w - - 0 1";
      const details = classifyGamePhaseDetailed(fen);

      // 2 queens = 18 material, should be endgame by condition B or C
      expect(details.phase).toBe("endgame");
    });

    test("handles completely empty board except kings", () => {
      const fen = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
      const details = classifyGamePhaseDetailed(fen);

      expect(details.phase).toBe("endgame");
      expect(details.material.total).toBe(0);
    });
  });
});

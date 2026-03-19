import { Chess } from "chess.js";
import {
  calculateGameAccuracy,
  calculateMoveCpLoss,
  cpLossToAccuracy,
  buildMoveAnalysis,
  filterMoves,
  calculateCpLossStats,
  MoveAnalysis,
} from "../gameAccuracy";

describe("Game Accuracy Calculation", () => {
  describe("cpLossToAccuracy formula", () => {
    test("perfect play returns ~100%", () => {
      expect(cpLossToAccuracy(0)).toBeCloseTo(100, 0);
    });

    test("10 cp average loss returns ~96%", () => {
      expect(cpLossToAccuracy(10)).toBeCloseTo(96, 0);
    });

    test("25 cp average loss returns ~90%", () => {
      expect(cpLossToAccuracy(25)).toBeCloseTo(90, 0);
    });

    test("50 cp average loss returns ~80%", () => {
      expect(cpLossToAccuracy(50)).toBeCloseTo(80, -1); // Looser tolerance
    });

    test("100 cp average loss returns ~65%", () => {
      expect(cpLossToAccuracy(100)).toBeCloseTo(65, -1); // Looser tolerance
    });

    test("very high cp loss returns positive value", () => {
      const accuracy = cpLossToAccuracy(500);
      expect(accuracy).toBeGreaterThan(0);
      expect(accuracy).toBeLessThan(100);
    });

    test("negative cp loss is clamped to 100", () => {
      expect(cpLossToAccuracy(-10)).toBe(100);
    });
  });

  describe("calculateMoveCpLoss", () => {
    test("white move with evaluation drop", () => {
      const loss = calculateMoveCpLoss(
        { type: "cp", value: 50 }, // Before: +0.5
        { type: "cp", value: -30 }, // After: -0.3
        true // White's move
      );
      expect(loss).toBe(80); // Lost 0.8 pawns
    });

    test("black move with evaluation drop", () => {
      const loss = calculateMoveCpLoss(
        { type: "cp", value: -50 }, // Before: +0.5 for black
        { type: "cp", value: 30 }, // After: -0.3 for black
        false // Black's move
      );
      expect(loss).toBe(80); // Lost 0.8 pawns from black's perspective
    });

    test("position improvement returns 0 loss", () => {
      const loss = calculateMoveCpLoss(
        { type: "cp", value: 20 },
        { type: "cp", value: 50 },
        true
      );
      expect(loss).toBe(0); // No loss, actually improved
    });

    test("equal evaluation returns 0 loss", () => {
      const loss = calculateMoveCpLoss(
        { type: "cp", value: 50 },
        { type: "cp", value: 50 },
        true
      );
      expect(loss).toBe(0);
    });

    test("mate score handling - missing mate", () => {
      const loss = calculateMoveCpLoss(
        { type: "mate", value: 3 }, // Mate in 3
        { type: "cp", value: 100 }, // Gave up mate for material
        true
      );
      expect(loss).toBeGreaterThan(500); // Large loss for missing mate
    });

    test("mate score handling - improving to mate", () => {
      const loss = calculateMoveCpLoss(
        { type: "cp", value: 500 },
        { type: "mate", value: 2 }, // Found mate in 2
        true
      );
      expect(loss).toBe(0); // No loss, improved to mate
    });
  });

  describe("filterMoves", () => {
    const testMoves: MoveAnalysis[] = [
      {
        moveNumber: 1,
        fen: "fen1",
        evalBefore: { type: "cp", value: 0 },
        evalAfter: { type: "cp", value: 0 },
        isWhiteMove: true,
        phase: "opening",
      },
      {
        moveNumber: 1,
        fen: "fen2",
        evalBefore: { type: "cp", value: 0 },
        evalAfter: { type: "cp", value: 0 },
        isWhiteMove: false,
        phase: "opening",
      },
      {
        moveNumber: 2,
        fen: "fen3",
        evalBefore: { type: "cp", value: 0 },
        evalAfter: { type: "cp", value: 0 },
        isWhiteMove: true,
        phase: "middlegame",
      },
      {
        moveNumber: 2,
        fen: "fen4",
        evalBefore: { type: "cp", value: 0 },
        evalAfter: { type: "cp", value: 0 },
        isWhiteMove: false,
        phase: "endgame",
      },
    ];

    test("filter by player - white", () => {
      const whiteMoves = filterMoves(testMoves, { player: "white" });
      expect(whiteMoves.length).toBe(2);
      expect(whiteMoves.every((m) => m.isWhiteMove)).toBe(true);
    });

    test("filter by player - black", () => {
      const blackMoves = filterMoves(testMoves, { player: "black" });
      expect(blackMoves.length).toBe(2);
      expect(blackMoves.every((m) => !m.isWhiteMove)).toBe(true);
    });

    test("filter by phase - opening", () => {
      const openingMoves = filterMoves(testMoves, { phase: "opening" });
      expect(openingMoves.length).toBe(2);
      expect(openingMoves.every((m) => m.phase === "opening")).toBe(true);
    });

    test("filter by phase - multiple phases", () => {
      const moves = filterMoves(testMoves, {
        phase: ["opening", "middlegame"],
      });
      expect(moves.length).toBe(3);
    });

    test("filter by player and phase combined", () => {
      const whiteOpening = filterMoves(testMoves, {
        player: "white",
        phase: "opening",
      });
      expect(whiteOpening.length).toBe(1);
      expect(whiteOpening[0].isWhiteMove).toBe(true);
      expect(whiteOpening[0].phase).toBe("opening");
    });

    test("filter with no matches returns empty array", () => {
      const result = filterMoves(testMoves, {
        player: "white",
        phase: "endgame",
      });
      expect(result.length).toBe(0);
    });
  });

  describe("calculateCpLossStats", () => {
    test("calculates stats for moves with varying cp loss", () => {
      const moves: MoveAnalysis[] = [
        {
          moveNumber: 1,
          fen: "fen1",
          evalBefore: { type: "cp", value: 50 },
          evalAfter: { type: "cp", value: 50 },
          isWhiteMove: true,
          phase: "opening",
          cpLoss: 0, // Perfect move
        },
        {
          moveNumber: 1,
          fen: "fen2",
          evalBefore: { type: "cp", value: -50 },
          evalAfter: { type: "cp", value: -100 },
          isWhiteMove: false,
          phase: "opening",
          cpLoss: 50, // Small mistake
        },
        {
          moveNumber: 2,
          fen: "fen3",
          evalBefore: { type: "cp", value: 100 },
          evalAfter: { type: "cp", value: -200 },
          isWhiteMove: true,
          phase: "opening",
          cpLoss: 300, // Blunder
        },
      ];

      const stats = calculateCpLossStats(moves);

      expect(stats.moveCount).toBe(3);
      expect(stats.totalCpLoss).toBe(350);
      expect(stats.averageCpLoss).toBeCloseTo(116.67, 1);
      expect(stats.maxCpLoss).toBe(300);
      expect(stats.perfectMoves).toBe(1);
    });

    test("handles empty array", () => {
      const stats = calculateCpLossStats([]);

      expect(stats.moveCount).toBe(0);
      expect(stats.totalCpLoss).toBe(0);
      expect(stats.averageCpLoss).toBe(0);
      expect(stats.maxCpLoss).toBe(0);
      expect(stats.perfectMoves).toBe(0);
    });

    test("calculates cp loss if not cached", () => {
      const moves: MoveAnalysis[] = [
        {
          moveNumber: 1,
          fen: "fen1",
          evalBefore: { type: "cp", value: 100 },
          evalAfter: { type: "cp", value: 50 },
          isWhiteMove: true,
          phase: "opening",
          // No cpLoss cached - should calculate
        },
      ];

      const stats = calculateCpLossStats(moves);
      expect(stats.totalCpLoss).toBe(50);
    });
  });

  describe("buildMoveAnalysis", () => {
    test("builds analysis from Chess.js game history", () => {
      const game = new Chess();
      game.move("e4");
      game.move("e5");
      game.move("Nf3");
      game.move("Nc6");

      const history = game.history({ verbose: true });
      const evaluations = [
        { type: "cp" as const, value: 20 }, // Start
        { type: "cp" as const, value: 20 }, // After e4
        { type: "cp" as const, value: -20 }, // After e5
        { type: "cp" as const, value: 30 }, // After Nf3
        { type: "cp" as const, value: -25 }, // After Nc6
      ];

      const analysis = buildMoveAnalysis(history, evaluations);

      expect(analysis.length).toBe(4);
      expect(analysis[0].isWhiteMove).toBe(true);
      expect(analysis[0].san).toBe("e4");
      expect(analysis[1].isWhiteMove).toBe(false);
      expect(analysis[1].san).toBe("e5");
      expect(analysis[0].phase).toBe("opening");
    });

    test("throws error if evaluations length is incorrect", () => {
      const game = new Chess();
      game.move("e4");

      const history = game.history({ verbose: true });
      const evaluations = [{ type: "cp" as const, value: 20 }]; // Too few

      expect(() => buildMoveAnalysis(history, evaluations)).toThrow();
    });

    test("uses custom starting FEN", () => {
      const customFen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
      const game = new Chess(customFen);
      game.move("Bc4");

      const history = game.history({ verbose: true });
      const evaluations = [
        { type: "cp" as const, value: 30 },
        { type: "cp" as const, value: 35 },
      ];

      const analysis = buildMoveAnalysis(history, evaluations, customFen);

      expect(analysis.length).toBe(1);
      expect(analysis[0].san).toBe("Bc4");
    });
  });

  describe("calculateGameAccuracy", () => {
    test("perfect game returns 100% for both players", () => {
      const perfectMoves: MoveAnalysis[] = [
        {
          moveNumber: 1,
          fen: "fen1",
          evalBefore: { type: "cp", value: 20 },
          evalAfter: { type: "cp", value: 20 },
          isWhiteMove: true,
          phase: "opening",
        },
        {
          moveNumber: 1,
          fen: "fen2",
          evalBefore: { type: "cp", value: -20 },
          evalAfter: { type: "cp", value: -20 },
          isWhiteMove: false,
          phase: "opening",
        },
      ];

      const result = calculateGameAccuracy(perfectMoves);
      expect(result.byPlayer.white).toBeCloseTo(100, 0);
      expect(result.byPlayer.black).toBeCloseTo(100, 0);
      expect(result.overall).toBeCloseTo(100, 0);
    });

    test("game with only opening phase", () => {
      const openingOnlyMoves: MoveAnalysis[] = [
        {
          moveNumber: 1,
          fen: "fen1",
          evalBefore: { type: "cp", value: 20 },
          evalAfter: { type: "cp", value: 20 },
          isWhiteMove: true,
          phase: "opening",
        },
        {
          moveNumber: 1,
          fen: "fen2",
          evalBefore: { type: "cp", value: -20 },
          evalAfter: { type: "cp", value: -20 },
          isWhiteMove: false,
          phase: "opening",
        },
      ];

      const result = calculateGameAccuracy(openingOnlyMoves);
      expect(result.byPhase.opening).toBeGreaterThan(0);
      expect(result.byPhase.middlegame).toBeNull();
      expect(result.byPhase.endgame).toBeNull();
    });

    test("asymmetric performance by player", () => {
      const moves: MoveAnalysis[] = [
        {
          moveNumber: 1,
          fen: "fen1",
          evalBefore: { type: "cp", value: 20 },
          evalAfter: { type: "cp", value: 20 }, // White plays perfectly (0 cp loss)
          isWhiteMove: true,
          phase: "opening",
        },
        {
          moveNumber: 1,
          fen: "fen2",
          evalBefore: { type: "cp", value: -20 }, // Black up 0.2 pawns
          evalAfter: { type: "cp", value: 180 }, // After black blunders, white up 1.8 pawns (200 cp loss for black)
          isWhiteMove: false,
          phase: "opening",
        },
      ];

      const result = calculateGameAccuracy(moves);
      // White (0 cp loss) should have significantly higher accuracy than Black (200 cp loss)
      expect(result.byPlayer.white).toBeGreaterThan(result.byPlayer.black + 10);
    });

    test("asymmetric performance by phase", () => {
      const moves: MoveAnalysis[] = [
        // White plays well in opening
        {
          moveNumber: 1,
          fen: "fen1",
          evalBefore: { type: "cp", value: 20 },
          evalAfter: { type: "cp", value: 20 },
          isWhiteMove: true,
          phase: "opening",
        },
        // White plays poorly in endgame
        {
          moveNumber: 20,
          fen: "fen2",
          evalBefore: { type: "cp", value: 100 },
          evalAfter: { type: "cp", value: -100 }, // Blunder
          isWhiteMove: true,
          phase: "endgame",
        },
        // Black moves (filler)
        {
          moveNumber: 1,
          fen: "fen3",
          evalBefore: { type: "cp", value: -20 },
          evalAfter: { type: "cp", value: -20 },
          isWhiteMove: false,
          phase: "opening",
        },
        {
          moveNumber: 20,
          fen: "fen4",
          evalBefore: { type: "cp", value: 100 },
          evalAfter: { type: "cp", value: 100 },
          isWhiteMove: false,
          phase: "endgame",
        },
      ];

      const result = calculateGameAccuracy(moves);
      expect(result.byPlayerAndPhase.white.opening).toBeGreaterThan(
        result.byPlayerAndPhase.white.endgame!
      );
    });

    test("statistics are calculated correctly", () => {
      const moves: MoveAnalysis[] = [
        {
          moveNumber: 1,
          fen: "fen1",
          evalBefore: { type: "cp", value: 20 },
          evalAfter: { type: "cp", value: -30 },
          isWhiteMove: true,
          phase: "opening",
        },
        {
          moveNumber: 1,
          fen: "fen2",
          evalBefore: { type: "cp", value: 30 },
          evalAfter: { type: "cp", value: 30 },
          isWhiteMove: false,
          phase: "middlegame",
        },
        {
          moveNumber: 2,
          fen: "fen3",
          evalBefore: { type: "cp", value: 30 },
          evalAfter: { type: "cp", value: 30 },
          isWhiteMove: true,
          phase: "endgame",
        },
      ];

      const result = calculateGameAccuracy(moves);

      expect(result.stats.totalMoves).toBe(3);
      expect(result.stats.whiteMovesCount).toBe(2);
      expect(result.stats.blackMovesCount).toBe(1);
      expect(result.stats.phaseDistribution.opening).toBe(1);
      expect(result.stats.phaseDistribution.middlegame).toBe(1);
      expect(result.stats.phaseDistribution.endgame).toBe(1);
    });

    test("handles empty moves array", () => {
      const result = calculateGameAccuracy([]);

      expect(result.overall).toBe(0);
      expect(result.byPlayer.white).toBe(0);
      expect(result.byPlayer.black).toBe(0);
      expect(result.stats.totalMoves).toBe(0);
    });
  });

  describe("integration test - full game", () => {
    test("analyzes a simple game with mixed accuracy", () => {
      const game = new Chess();

      // Play a short game with some good and bad moves
      game.move("e4"); // Good opening move
      game.move("e5"); // Good response
      game.move("Nf3"); // Good
      game.move("Nc6"); // Good
      game.move("Bc4"); // Good
      game.move("d6"); // Slightly inaccurate
      game.move("O-O"); // Good
      game.move("Bg4"); // Decent

      const history = game.history({ verbose: true });

      // Simulate evaluations (in real scenario, these come from Stockfish)
      const evaluations = [
        { type: "cp" as const, value: 20 }, // Start
        { type: "cp" as const, value: 20 }, // After e4
        { type: "cp" as const, value: -20 }, // After e5
        { type: "cp" as const, value: 30 }, // After Nf3
        { type: "cp" as const, value: -25 }, // After Nc6
        { type: "cp" as const, value: 35 }, // After Bc4
        { type: "cp" as const, value: -50 }, // After d6 (slightly worse)
        { type: "cp" as const, value: 55 }, // After O-O
        { type: "cp" as const, value: -45 }, // After Bg4
      ];

      const analysis = buildMoveAnalysis(history, evaluations);
      const accuracy = calculateGameAccuracy(analysis);

      // Verify structure
      expect(accuracy.byPlayer.white).toBeGreaterThan(0);
      expect(accuracy.byPlayer.black).toBeGreaterThan(0);
      expect(accuracy.overall).toBeGreaterThan(0);
      expect(accuracy.byPhase.opening).toBeGreaterThan(0);

      // Verify stats
      expect(accuracy.stats.totalMoves).toBe(8);
      expect(accuracy.stats.whiteMovesCount).toBe(4);
      expect(accuracy.stats.blackMovesCount).toBe(4);
    });
  });
});

/**
 * Board Engine Tests
 *
 * Tests for the board engine modules.
 */

import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import {
    mergeConfig,
    defaultBoardConfig,
    createAnalyzeConfig,
    createPuzzleConfig,
    validateConfig,
} from "../boardConfig";
import {
    executeMove,
    isLegalMove,
    isPromotionMove,
    toMoveResult,
    getSoundType,
    isPuzzleMoveCorrect,
} from "../moveHandlers";
import {
    getLegalMovesForSquare,
    isOwnPiece,
    handleClick,
    handleDragStart,
    handleDrop,
} from "../inputController";
import {
    loadFen,
    loadPgn,
    validateFen,
    validatePgn,
    replayMoves,
    getGameStatus,
    parseUci,
    toUci,
} from "../fenController";

// ===== CONFIG TESTS =====

describe("boardConfig", () => {
    describe("mergeConfig", () => {
        it("should return default config when no overrides provided", () => {
            const config = mergeConfig({});
            expect(config.mode).toBe("free");
            expect(config.draggable).toBe(true);
            expect(config.highlightLegalMoves).toBe(true);
        });

        it("should apply mode-specific defaults for analyze mode", () => {
            const config = mergeConfig({ mode: "analyze" });
            expect(config.arrows).toBe(true);
            expect(config.threats).toBe(true);
            expect(config.analyze?.enableEngine).toBe(true);
        });

        it("should apply mode-specific defaults for puzzle mode", () => {
            const config = mergeConfig({ mode: "puzzle" });
            expect(config.allowIllegalMoves).toBe(false);
            expect(config.puzzle?.failBehavior).toBe("shake");
        });

        it("should allow overriding mode defaults", () => {
            const config = mergeConfig({ mode: "analyze", arrows: false });
            expect(config.arrows).toBe(false);
        });
    });

    describe("createAnalyzeConfig", () => {
        it("should create analyze config with engine enabled", () => {
            const config = createAnalyzeConfig();
            expect(config.mode).toBe("analyze");
            expect(config.analyze?.enableEngine).toBe(true);
        });
    });

    describe("createPuzzleConfig", () => {
        it("should create puzzle config with correct move", () => {
            const config = createPuzzleConfig("e2e4");
            expect(config.mode).toBe("puzzle");
            expect(config.puzzle?.correctMove).toBe("e2e4");
        });
    });

    describe("validateConfig", () => {
        it("should warn about puzzle mode with illegal moves allowed", () => {
            const warnings = validateConfig({
                mode: "puzzle",
                allowIllegalMoves: true,
            });
            expect(warnings.length).toBeGreaterThan(0);
        });

        it("should warn about missing correctMove in puzzle mode", () => {
            const warnings = validateConfig({ mode: "puzzle" });
            expect(warnings.some((w) => w.includes("correctMove"))).toBe(true);
        });
    });
});

// ===== MOVE HANDLERS TESTS =====

describe("moveHandlers", () => {
    describe("isLegalMove", () => {
        it("should return true for legal move e2-e4", () => {
            const game = new Chess();
            expect(isLegalMove(game, "e2", "e4")).toBe(true);
        });

        it("should return false for illegal move e2-e5", () => {
            const game = new Chess();
            expect(isLegalMove(game, "e2", "e5")).toBe(false);
        });
    });

    describe("isPromotionMove", () => {
        it("should detect white pawn promotion", () => {
            const game = new Chess("8/P7/8/8/8/8/8/4K2k w - - 0 1");
            expect(isPromotionMove(game, "a7", "a8")).toBe(true);
        });

        it("should not detect regular pawn move as promotion", () => {
            const game = new Chess();
            expect(isPromotionMove(game, "e2", "e4")).toBe(false);
        });
    });

    describe("executeMove", () => {
        it("should execute a legal move", () => {
            const game = new Chess();
            const result = executeMove(game, { from: "e2", to: "e4" });
            expect(result.success).toBe(true);
            expect(result.move?.san).toBe("e4");
        });

        it("should reject an illegal move", () => {
            const game = new Chess();
            const result = executeMove(game, { from: "e2", to: "e5" });
            expect(result.success).toBe(false);
        });
    });

    describe("getSoundType", () => {
        it("should return castle for castling move", () => {
            const game = new Chess("r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1");
            const move = game.move("O-O");
            expect(getSoundType(move!, game.isCheck())).toBe("castle");
        });

        it("should return capture for capture move", () => {
            const game = new Chess("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2");
            const move = game.move("exd5");
            expect(getSoundType(move!, game.isCheck())).toBe("capture");
        });
    });

    describe("isPuzzleMoveCorrect", () => {
        it("should validate correct puzzle move", () => {
            const moveResult = { from: "e2", to: "e4", san: "e4", fen: "", flags: "", piece: "p" as const, color: "w" as const };
            expect(isPuzzleMoveCorrect(moveResult, "e2e4")).toBe(true);
        });

        it("should reject incorrect puzzle move", () => {
            const moveResult = { from: "e2", to: "e3", san: "e3", fen: "", flags: "", piece: "p" as const, color: "w" as const };
            expect(isPuzzleMoveCorrect(moveResult, "e2e4")).toBe(false);
        });
    });
});

// ===== INPUT CONTROLLER TESTS =====

describe("inputController", () => {
    describe("getLegalMovesForSquare", () => {
        it("should return legal moves for e2 pawn", () => {
            const game = new Chess();
            const moves = getLegalMovesForSquare(game, "e2");
            expect(moves).toContain("e3");
            expect(moves).toContain("e4");
            expect(moves.length).toBe(2);
        });
    });

    describe("isOwnPiece", () => {
        it("should return true for white piece on white's turn", () => {
            const game = new Chess();
            expect(isOwnPiece(game, "e2")).toBe(true);
        });

        it("should return false for black piece on white's turn", () => {
            const game = new Chess();
            expect(isOwnPiece(game, "e7")).toBe(false);
        });

        it("should return false for empty square", () => {
            const game = new Chess();
            expect(isOwnPiece(game, "e4")).toBe(false);
        });
    });

    describe("handleClick", () => {
        it("should select piece when clicking own piece with no selection", () => {
            const game = new Chess();
            const config = mergeConfig({});
            const result = handleClick(game, config, "e2", null);
            expect(result.action).toBe("select");
            expect(result.legalMoves).toContain("e4");
        });

        it("should move when clicking legal target with selection", () => {
            const game = new Chess();
            const config = mergeConfig({});
            const result = handleClick(game, config, "e4", "e2");
            expect(result.action).toBe("move");
            expect(result.from).toBe("e2");
        });
    });

    describe("handleDragStart", () => {
        it("should allow dragging own piece", () => {
            const game = new Chess();
            const config = mergeConfig({});
            const result = handleDragStart(game, config, "wP", "e2");
            expect(result.allowed).toBe(true);
            expect(result.legalMoves).toContain("e4");
        });

        it("should not allow dragging when draggable is false", () => {
            const game = new Chess();
            const config = mergeConfig({ draggable: false });
            const result = handleDragStart(game, config, "wP", "e2");
            expect(result.allowed).toBe(false);
        });
    });

    describe("handleDrop", () => {
        it("should allow legal drop", () => {
            const game = new Chess();
            const config = mergeConfig({});
            const result = handleDrop(game, config, "e2", "e4");
            expect(result.shouldMove).toBe(true);
            expect(result.isLegal).toBe(true);
        });

        it("should reject illegal drop", () => {
            const game = new Chess();
            const config = mergeConfig({});
            const result = handleDrop(game, config, "e2", "e5");
            expect(result.shouldMove).toBe(false);
        });
    });
});

// ===== FEN CONTROLLER TESTS =====

describe("fenController", () => {
    describe("loadFen", () => {
        it("should load valid FEN", () => {
            const game = new Chess();
            const success = loadFen(game, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
            expect(success).toBe(true);
            expect(game.turn()).toBe("b");
        });

        it("should reject invalid FEN", () => {
            const game = new Chess();
            const success = loadFen(game, "invalid fen");
            expect(success).toBe(false);
        });
    });

    describe("validateFen", () => {
        it("should validate correct FEN", () => {
            const result = validateFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
            expect(result.valid).toBe(true);
        });

        it("should reject invalid FEN", () => {
            const result = validateFen("not a fen");
            expect(result.valid).toBe(false);
        });
    });

    describe("replayMoves", () => {
        it("should replay UCI moves correctly", () => {
            const result = replayMoves("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", [
                "e2e4",
                "e7e5",
                "g1f3",
            ]);
            expect(result.success).toBe(true);
            expect(result.finalFen).toContain("5N2"); // Knight on f3
        });

        it("should fail on invalid move", () => {
            const result = replayMoves("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", [
                "e2e5", // Invalid
            ]);
            expect(result.success).toBe(false);
        });
    });

    describe("getGameStatus", () => {
        it("should report white to move for starting position", () => {
            const game = new Chess();
            expect(getGameStatus(game)).toBe("White to move");
        });

        it("should report checkmate", () => {
            const game = new Chess("rnb1kbnr/pppp1ppp/4p3/8/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3");
            expect(getGameStatus(game)).toBe("Checkmate!");
        });
    });

    describe("parseUci", () => {
        it("should parse regular move", () => {
            const result = parseUci("e2e4");
            expect(result.from).toBe("e2");
            expect(result.to).toBe("e4");
            expect(result.promotion).toBeUndefined();
        });

        it("should parse promotion move", () => {
            const result = parseUci("a7a8q");
            expect(result.from).toBe("a7");
            expect(result.to).toBe("a8");
            expect(result.promotion).toBe("q");
        });
    });

    describe("toUci", () => {
        it("should convert to UCI format", () => {
            expect(toUci("e2", "e4")).toBe("e2e4");
            expect(toUci("a7", "a8", "q")).toBe("a7a8q");
        });
    });
});

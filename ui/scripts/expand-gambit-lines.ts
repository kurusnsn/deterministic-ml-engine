/**
 * Expand forcing lines for all gambits that currently have <20 lines.
 * This script:
 * 1. Identifies gambits with <20 lines in opening_systems.json
 * 2. Generates new forcing lines using the Lichess API directly
 * 3. Merges new lines with existing ones, avoiding duplicates
 * 4. Updates the opening_lines JSON files with unique line names and IDs
 *
 * Run with: npx tsx scripts/expand-gambit-lines.ts
 */

import fs from "fs";
import path from "path";
import { Chess } from "chess.js";
import Bottleneck from "bottleneck";
import { OpeningSystem } from "../src/types/openings";

// Constants
const SYSTEMS_PATH = path.join(process.cwd(), "public/data/openings/opening_systems.json");
const LINES_DIR = path.join(process.cwd(), "public/data/openings/opening_lines");
const MIN_LINE_TARGET = 20;

// Generator constants
const MIN_GAME_COUNT = 1000;
const MIN_FORCING_WINRATE = 55.0;
const STABLE_WINRATE_LOW = 45.0;
const STABLE_WINRATE_HIGH = 55.0;
const MAX_LINE_PLY = 14;
const SEARCH_PLY = 10;
const MAX_VISITED_POSITIONS = 100; // Cap explored positions per gambit
const MAX_API_CALLS_PER_GAMBIT = 200; // Hard cap on Lichess API calls per gambit

// Rate limiting: Lichess allows up to 15 req/s but we keep it very conservative
const limiter = new Bottleneck({
    minTime: 1000, // 1 request per second to be safe
    maxConcurrent: 1,
});

// Interfaces
interface OpeningMove {
    san: string;
    uci: string;
    nextFen?: string;
    frequency: number;
    winrate: number;
    gameCount: number;
}

interface LineNode {
    move: string;
    san: string;
    uci?: string;
    fen: string;
    gameCount: number;
    winrate: number;
    depth: number;
}

interface ForcingLineMetadata {
    mistake_move_index: number;
    punishment_move_index: number;
    gameCounts: number[];
    winrates: number[];
    forcingSide: "white" | "black";
    source: "lichess-db";
    type: "forcing";
}

interface ForcingLine {
    id: string;
    name: string;
    moves: string[];
    eco?: string;
    metadata: ForcingLineMetadata;
}

interface ExistingLineFile {
    opening: string;
    openingId: string;
    perspective: string;
    lines: ForcingLine[];
    generatedAt?: string;
}

interface MoveStats {
    san: string;
    uci: string;
    gameCount: number;
    whiteWinrate: number;
    blackWinrate: number;
    nextFen?: string;
}

interface GenerationContext {
    openingId: string;
    openingName: string;
    forcingSide: "white" | "black";
    lineBudget: number;
    lines: ForcingLine[];
    visited: Set<string>;
    eco?: string;
    apiCalls: number;
    aborted: boolean;
    startedAt: number;
}

const GAMBIT_TIMEOUT_MS = 180_000; // 3 minutes per gambit

function isTimedOut(ctx: GenerationContext): boolean {
    if (ctx.aborted) return true;
    if (Date.now() - ctx.startedAt > GAMBIT_TIMEOUT_MS) {
        ctx.aborted = true;
        return true;
    }
    return false;
}

// Move cache to avoid redundant API calls
const moveCache = new Map<string, OpeningMove[]>();

// Fetch from Lichess Explorer API directly
async function fetchFromLichess(fen: string): Promise<OpeningMove[]> {
    const params = new URLSearchParams({
        fen,
        variant: "standard",
        speeds: "bullet,blitz,rapid,classical",
        ratings: "1600,1800,2000,2200,2500",
    });
    const url = `https://explorer.lichess.ovh/lichess?${params}`;

    for (let attempt = 0; attempt < 3; attempt++) {
        const res = await limiter.schedule(() =>
            fetch(url, {
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(15000),
            })
        );

        if (res.ok) {
            const data = await res.json();
            return (data.moves ?? []).map(
                (move: { san: string; uci: string; white: number; black: number; draws: number }) => {
                    const gameCount = move.white + move.black + move.draws;
                    const winrate = gameCount > 0 ? (move.white + 0.5 * move.draws) / gameCount : 0;
                    return {
                        san: move.san,
                        uci: move.uci,
                        nextFen: computeNextFen(move.san, fen),
                        frequency: gameCount,
                        winrate,
                        gameCount,
                    };
                }
            );
        }

        if (res.status === 429) {
            const wait = 5000 * (attempt + 1);
            console.log(`    429 rate limited, waiting ${wait / 1000}s (attempt ${attempt + 1}/3)...`);
            await new Promise((r) => setTimeout(r, wait));
            continue;
        }

        throw new Error(`Lichess API error: ${res.status}`);
    }

    console.log(`    Giving up after 3 rate-limit retries`);
    return [];
}

function computeNextFen(san: string, currentFen: string): string | undefined {
    try {
        const chess = new Chess(currentFen);
        const result = chess.move(san, { strict: false });
        return result ? chess.fen() : undefined;
    } catch {
        return undefined;
    }
}

async function loadMoves(fen: string, ctx?: GenerationContext): Promise<OpeningMove[]> {
    if (ctx && isTimedOut(ctx)) return [];
    if (moveCache.has(fen)) {
        return moveCache.get(fen)!;
    }
    if (ctx && ctx.apiCalls >= MAX_API_CALLS_PER_GAMBIT) {
        return [];
    }
    if (ctx) ctx.apiCalls++;
    const moves = await fetchFromLichess(fen);
    moveCache.set(fen, moves);
    return moves;
}

async function loadMovesWithStats(fen: string, ctx?: GenerationContext): Promise<MoveStats[]> {
    const moves = await loadMoves(fen, ctx);
    return moves.map((move) => ({
        san: move.san,
        uci: move.uci,
        gameCount: move.gameCount,
        whiteWinrate: move.winrate * 100,
        blackWinrate: (1 - move.winrate) * 100,
        nextFen: move.nextFen,
    }));
}

function parseActiveColor(fen: string): "w" | "b" {
    const parts = fen.split(" ");
    return parts[1] === "b" ? "b" : "w";
}

function getWinrateForSide(move: MoveStats, forcingSide: "white" | "black"): number {
    return forcingSide === "white" ? move.whiteWinrate : move.blackWinrate;
}

function hashString(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = (hash << 5) - hash + input.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

function buildLineId(openingId: string, nodes: LineNode[]): string {
    const stem = nodes
        .map((node) => node.move.replace(/[^\w]+/g, "-").toLowerCase())
        .slice(0, 6)
        .join("-");
    const suffix = Math.abs(hashString(nodes.map((node) => node.move).join("-"))).toString(36);
    return `${openingId}-${stem}-${suffix}`;
}

function buildLineName(openingName: string, nodes: LineNode[], existingNames: Set<string>): string {
    const keyMove = nodes[nodes.length - 1]?.move.replace(/[+#?!]/g, "") ?? "Main";

    let candidate = `${keyMove} Line`;
    if (!existingNames.has(candidate)) {
        existingNames.add(candidate);
        return candidate;
    }

    // Fallback with move sequence
    const moveSeq = nodes.slice(-3).map((n) => n.move).join(" ");
    candidate = `After ${moveSeq}`;
    if (!existingNames.has(candidate)) {
        existingNames.add(candidate);
        return candidate;
    }

    // Final fallback: numbered
    let counter = 1;
    do {
        candidate = `Variation ${counter++}`;
    } while (existingNames.has(candidate));

    existingNames.add(candidate);
    return candidate;
}

async function expandLine(fen: string, depth: number, ctx: GenerationContext): Promise<LineNode[]> {
    if (isTimedOut(ctx) || depth >= MAX_LINE_PLY) return [];

    const moves = await loadMovesWithStats(fen, ctx);
    if (moves.length === 0) return [];

    const sortedMoves = moves
        .filter((m) => m.gameCount >= MIN_GAME_COUNT)
        .sort((a, b) => getWinrateForSide(b, ctx.forcingSide) - getWinrateForSide(a, ctx.forcingSide));

    const bestMove = sortedMoves[0];
    if (!bestMove?.nextFen) return [];

    const winrate = getWinrateForSide(bestMove, ctx.forcingSide);

    // Stop if winrate stabilizes
    if (winrate >= STABLE_WINRATE_LOW && winrate <= STABLE_WINRATE_HIGH) return [];
    if (bestMove.gameCount < MIN_GAME_COUNT) return [];

    const node: LineNode = {
        move: bestMove.san,
        san: bestMove.san,
        uci: bestMove.uci,
        fen: bestMove.nextFen,
        gameCount: bestMove.gameCount,
        winrate,
        depth,
    };

    if (depth + 1 >= MAX_LINE_PLY) return [node];

    const tail = await expandLine(bestMove.nextFen, depth + 1, ctx);
    return [node, ...tail];
}

async function buildForcingLine(
    prefix: LineNode[],
    mistakeNode: LineNode,
    ctx: GenerationContext,
    existingNames: Set<string>
): Promise<ForcingLine | null> {
    const moves = await loadMovesWithStats(mistakeNode.fen, ctx);
    if (moves.length === 0) return null;

    const sortedMoves = moves
        .filter((m) => m.gameCount >= MIN_GAME_COUNT)
        .sort((a, b) => getWinrateForSide(b, ctx.forcingSide) - getWinrateForSide(a, ctx.forcingSide));

    const bestMove = sortedMoves[0];
    if (!bestMove?.nextFen) return null;

    const bestWinrate = getWinrateForSide(bestMove, ctx.forcingSide);
    if (bestWinrate < MIN_FORCING_WINRATE) return null;

    const punishmentNode: LineNode = {
        move: bestMove.san,
        san: bestMove.san,
        uci: bestMove.uci,
        fen: bestMove.nextFen,
        gameCount: bestMove.gameCount,
        winrate: bestWinrate,
        depth: prefix.length + 1,
    };

    const continuation = await expandLine(punishmentNode.fen, prefix.length + 2, ctx);
    const nodes = [...prefix, mistakeNode, punishmentNode, ...continuation];

    return {
        id: buildLineId(ctx.openingId, nodes),
        name: buildLineName(ctx.openingName, nodes, existingNames),
        moves: nodes.map((n) => n.move),
        eco: ctx.eco,
        metadata: {
            mistake_move_index: prefix.length,
            punishment_move_index: prefix.length + 1,
            gameCounts: nodes.map((n) => n.gameCount),
            winrates: nodes.map((n) => n.winrate),
            forcingSide: ctx.forcingSide,
            source: "lichess-db",
            type: "forcing",
        },
    };
}

async function explorePosition(
    fen: string,
    prefix: LineNode[],
    ply: number,
    ctx: GenerationContext,
    existingNames: Set<string>
): Promise<void> {
    if (isTimedOut(ctx) || ply >= SEARCH_PLY || ctx.lines.length >= ctx.lineBudget) return;
    if (ctx.visited.size >= MAX_VISITED_POSITIONS) return;
    if (ctx.apiCalls >= MAX_API_CALLS_PER_GAMBIT) return;
    if (ctx.visited.has(fen)) return;
    ctx.visited.add(fen);

    const moves = await loadMovesWithStats(fen, ctx);
    if (moves.length === 0) return;

    // Find forcing moves
    const forcingMoves = moves.filter(
        (m) => m.gameCount >= MIN_GAME_COUNT && getWinrateForSide(m, ctx.forcingSide) >= MIN_FORCING_WINRATE
    );

    for (const move of forcingMoves) {
        if (!move.nextFen || ctx.lines.length >= ctx.lineBudget) continue;

        const mistakeNode: LineNode = {
            move: move.san,
            san: move.san,
            uci: move.uci,
            fen: move.nextFen,
            gameCount: move.gameCount,
            winrate: getWinrateForSide(move, ctx.forcingSide),
            depth: prefix.length,
        };

        const line = await buildForcingLine(prefix, mistakeNode, ctx, existingNames);
        if (line) {
            ctx.lines.push(line);
        }
    }

    // Follow popular continuations
    const continuations = moves
        .filter((m) => m.gameCount >= MIN_GAME_COUNT)
        .sort((a, b) => b.gameCount - a.gameCount)
        .slice(0, 2);

    for (const move of continuations) {
        if (!move.nextFen || ctx.lines.length >= ctx.lineBudget) continue;

        const node: LineNode = {
            move: move.san,
            san: move.san,
            uci: move.uci,
            fen: move.nextFen,
            gameCount: move.gameCount,
            winrate: getWinrateForSide(move, ctx.forcingSide),
            depth: prefix.length,
        };

        await explorePosition(move.nextFen, [...prefix, node], ply + 1, ctx, existingNames);
    }
}

function determineForcingSide(openingId: string, canonicalMoves?: string[]): "white" | "black" {
    const normalized = openingId.toLowerCase();

    // Black forcing openings
    if (normalized.includes("englund")) return "black";
    if (normalized.includes("shilling")) return "black";
    if (normalized.includes("stafford")) return "black";
    if (normalized.includes("elephant")) return "black";
    if (normalized.includes("latvian")) return "black";
    if (normalized.includes("rousseau")) return "black";

    // If we have moves, odd number = White's gambit
    if (canonicalMoves && canonicalMoves.length > 0) {
        return canonicalMoves.length % 2 === 1 ? "white" : "black";
    }

    return "white";
}

function isGambitSystem(system: OpeningSystem): boolean {
    return (
        system.type === "forcing" ||
        system.name.toLowerCase().includes("gambit") ||
        system.name.toLowerCase().includes("trap")
    );
}

function loadExistingLines(openingId: string): ExistingLineFile | null {
    const filePath = path.join(LINES_DIR, `${openingId.toLowerCase()}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
        return null;
    }
}

function saveLines(openingId: string, data: ExistingLineFile): void {
    const filePath = path.join(LINES_DIR, `${openingId.toLowerCase()}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function normalizeMoveSequence(moves: string[]): string {
    return moves.join("-").toLowerCase().replace(/[^a-z0-9\-]/g, "");
}

function getActualLineCount(openingId: string): number {
    const existing = loadExistingLines(openingId);
    return existing?.lines?.length ?? 0;
}

async function main() {
    console.log("=== Gambit Line Expansion Script ===\n");

    const systems: OpeningSystem[] = JSON.parse(fs.readFileSync(SYSTEMS_PATH, "utf-8"));

    // Filter for gambits and check ACTUAL line count from files, not system metadata
    const allGambits = systems.filter((s) => isGambitSystem(s));
    const gambitsToExpand = allGambits.filter((s) => getActualLineCount(s.id) < MIN_LINE_TARGET);

    console.log(`Found ${gambitsToExpand.length} gambits needing expansion (actual file line count < ${MIN_LINE_TARGET}):\n`);
    gambitsToExpand.forEach((g) => {
        const actual = getActualLineCount(g.id);
        console.log(`  - ${g.name} (${g.id}): ${actual} lines`);
    });
    console.log("");

    let totalNewLines = 0;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < gambitsToExpand.length; i++) {
        const system = gambitsToExpand[i];
        console.log(`\n[${i + 1}/${gambitsToExpand.length}] Processing: ${system.name}`);

        try {
            const existing = loadExistingLines(system.id);
            const existingLineIds = new Set<string>();
            const existingMoveSequences = new Set<string>();
            const existingNames = new Set<string>();

            if (existing) {
                for (const line of existing.lines) {
                    existingLineIds.add(line.id);
                    existingMoveSequences.add(normalizeMoveSequence(line.moves));
                    existingNames.add(line.name);
                }
                console.log(`  Existing lines: ${existing.lines.length}`);
            }

            const ctx: GenerationContext = {
                openingId: system.id,
                openingName: system.name,
                forcingSide: determineForcingSide(system.id, system.canonicalMoves),
                lineBudget: 25,
                lines: [],
                visited: new Set(),
                eco: system.ecoCodes[0],
                apiCalls: 0,
                aborted: false,
                startedAt: Date.now(),
            };

            console.log(`  Generating new forcing lines (side: ${ctx.forcingSide})...`);
            await explorePosition(system.fen, [], 0, ctx, existingNames);
            if (ctx.aborted) console.log(`  ⏱ Timeout reached (${GAMBIT_TIMEOUT_MS / 1000}s)`);
            console.log(`  Generated ${ctx.lines.length} candidate lines (${ctx.apiCalls} API calls)`);

            // Filter duplicates
            const uniqueNewLines: ForcingLine[] = [];
            for (const line of ctx.lines) {
                const moveSeq = normalizeMoveSequence(line.moves);
                if (existingLineIds.has(line.id) || existingMoveSequences.has(moveSeq)) {
                    continue;
                }
                uniqueNewLines.push(line);
                existingLineIds.add(line.id);
                existingMoveSequences.add(moveSeq);
            }

            if (uniqueNewLines.length === 0) {
                console.log(`  No new unique lines to add`);
                successCount++;
                continue;
            }

            const mergedData: ExistingLineFile = existing ?? {
                opening: system.name,
                openingId: system.id,
                perspective: system.perspective || "white",
                lines: [],
                generatedAt: new Date().toISOString(),
            };

            mergedData.lines.push(...uniqueNewLines);
            mergedData.generatedAt = new Date().toISOString();

            saveLines(system.id, mergedData);
            console.log(`  ✓ Added ${uniqueNewLines.length} new lines (total: ${mergedData.lines.length})`);

            totalNewLines += uniqueNewLines.length;
            successCount++;

            // Clear cache between gambits to prevent cross-contamination of exploration trees
            moveCache.clear();
        } catch (error) {
            console.error(`  ✗ Failed: ${error}`);
            failCount++;
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Processed: ${gambitsToExpand.length} gambits`);
    console.log(`Success: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Total new lines added: ${totalNewLines}`);
}

main().catch(console.error);

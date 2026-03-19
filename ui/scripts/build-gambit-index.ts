/**
 * Build a static index of all opening-db/ entries not already in opening_systems.json.
 * Generates public/data/openings/opening_db_index.json for use by OpeningsBrowser.
 *
 * Run with: npx tsx scripts/build-gambit-index.ts
 */

import fs from "fs";
import path from "path";
import { Chess } from "chess.js";

const OPENING_DB_DIR = path.join(process.cwd(), "opening-db");
const SYSTEMS_PATH = path.join(
    process.cwd(),
    "public/data/openings/opening_systems.json"
);
const OUTPUT_PATH = path.join(
    process.cwd(),
    "public/data/openings/opening_db_index.json"
);

const START_FEN =
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

interface OpeningDbLine {
    id: string;
    name: string;
    moves: string[];
    metadata?: {
        forcingSide?: "white" | "black";
        type?: string;
        source?: string;
        gameCounts?: number[];
        winrates?: number[];
    };
}

interface OpeningDbFile {
    id: string;
    name: string;
    opening: string;
    generatedAt: string;
    lines: OpeningDbLine[];
}

interface OpeningSystemEntry {
    id: string;
    familyId: string;
    name: string;
    ecoCodes: string[];
    type: "forcing" | "neutral" | "semi-forcing";
    canonicalMoves: string[];
    fen: string;
    perspective: "white" | "black";
    lineCount: number;
    popularity?: number;
    avgWinrate?: number;
    source: "opening-db";
}

/** Try to play moves from the start. Returns valid prefix + resulting FEN. */
function computeFenFromMoves(moves: string[]): {
    fen: string;
    validMoves: string[];
} {
    const chess = new Chess();
    const validMoves: string[] = [];

    for (const move of moves) {
        try {
            const result = chess.move(move, { strict: false });
            if (result) {
                validMoves.push(move);
            } else {
                break;
            }
        } catch {
            break;
        }
    }

    return { fen: chess.fen(), validMoves };
}

/** Determine type from content: name/id gambit → forcing, lichess-db → forcing, else neutral */
function deriveType(
    dbFile: OpeningDbFile
): "forcing" | "neutral" | "semi-forcing" {
    const nameLower = dbFile.name.toLowerCase();
    if (nameLower.includes("gambit") || dbFile.id.toLowerCase().includes("gambit")) {
        return "forcing";
    }
    const hasLichessSource = dbFile.lines.some(
        (l) => l.metadata?.source === "lichess-db"
    );
    return hasLichessSource ? "forcing" : "neutral";
}

/** Compute popularity and winrate from lichess-db lines.
 *
 * Popularity = the root-position game count of the FIRST lichess line.
 * Multiple lines often share the same root, so summing would inflate the number.
 * The first line's gameCounts[0] best represents "how often this opening is reached."
 *
 * avgWinrate = weighted average of the forcing side's winrate, weighted by how
 * many games each line's root position reaches (gameCounts[0]).
 */
function computeStats(
    lines: OpeningDbLine[]
): { popularity?: number; avgWinrate?: number } {
    const lichessLines = lines.filter(
        (l) =>
            l.metadata?.source === "lichess-db" &&
            l.metadata.gameCounts &&
            l.metadata.gameCounts[0] > 0
    );
    if (lichessLines.length === 0) return {};

    // Popularity: first lichess line's root game count (representative of how
    // common the opening's starting position is in real games)
    const popularity = lichessLines[0].metadata!.gameCounts![0];

    // Weighted-average winrate for the forcing side across all lines
    let weightedSum = 0;
    let totalWeight = 0;
    for (const line of lichessLines) {
        const games = line.metadata!.gameCounts![0];
        const rawWinrate = line.metadata!.winrates?.[0] ?? 50;
        const forcingSide = line.metadata!.forcingSide;
        // winrates[] is from white's perspective; invert for black's forcing side
        const forcingWinrate =
            forcingSide === "black" ? 100 - rawWinrate : rawWinrate;
        weightedSum += forcingWinrate * games;
        totalWeight += games;
    }
    const avgWinrate = totalWeight > 0 ? weightedSum / totalWeight : 50;

    return { popularity, avgWinrate };
}

function derivePerspective(
    validMoves: string[],
    lines: OpeningDbLine[]
): "white" | "black" {
    // Prefer forcingSide from lichess lines
    const lichessLine = lines.find((l) => l.metadata?.source === "lichess-db");
    if (lichessLine?.metadata?.forcingSide) {
        return lichessLine.metadata.forcingSide;
    }
    // Derive from canonical moves count (odd = white played last = white's system)
    if (validMoves.length === 0) return "white";
    return validMoves.length % 2 === 1 ? "white" : "black";
}

function main() {
    const normalizeId = (id: string) =>
        id.toLowerCase().replace(/[^a-z0-9]/g, "");

    // Load existing system IDs to avoid duplicates
    const systemsData = fs.readFileSync(SYSTEMS_PATH, "utf-8");
    const systems: Array<{ id: string }> = JSON.parse(systemsData);
    const existingIds = new Set(systems.map((s) => s.id));
    const existingNormalized = new Set(systems.map((s) => normalizeId(s.id)));
    console.log(`${existingIds.size} existing systems in opening_systems.json`);

    // Read all opening-db files
    const files = fs
        .readdirSync(OPENING_DB_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort();
    console.log(`${files.length} files in opening-db/\n`);

    const entries: OpeningSystemEntry[] = [];

    for (const file of files) {
        const filePath = path.join(OPENING_DB_DIR, file);
        const dbFile: OpeningDbFile = JSON.parse(
            fs.readFileSync(filePath, "utf-8")
        );

        // Skip if already covered by opening_systems.json (exact or normalized)
        if (
            existingIds.has(dbFile.id) ||
            existingNormalized.has(normalizeId(dbFile.id))
        ) {
            console.log(`  skip (dup): ${dbFile.id}`);
            continue;
        }

        // Skip files with 0 lines
        if (!dbFile.lines || dbFile.lines.length === 0) {
            console.log(`  skip (empty): ${dbFile.id}`);
            continue;
        }

        // Determine type
        const type = deriveType(dbFile);

        // Compute canonical moves from first line
        const firstLine = dbFile.lines[0];
        const { fen, validMoves } = computeFenFromMoves(firstLine.moves);

        // Compute stats
        const { popularity, avgWinrate } = computeStats(dbFile.lines);

        const perspective = derivePerspective(validMoves, dbFile.lines);

        const entry: OpeningSystemEntry = {
            id: dbFile.id,
            familyId: dbFile.id,
            name: dbFile.name,
            ecoCodes: [],
            type,
            canonicalMoves: validMoves,
            fen,
            perspective,
            lineCount: dbFile.lines.length,
            source: "opening-db",
            ...(popularity !== undefined && { popularity }),
            ...(avgWinrate !== undefined && { avgWinrate }),
        };

        entries.push(entry);

        const statsStr =
            popularity !== undefined
                ? `pop=${Math.round(popularity / 1000)}k wr=${avgWinrate?.toFixed(1)}%`
                : "no real stats";
        console.log(
            `  add [${type}]: ${entry.name} (${entry.lineCount} lines, ${validMoves.length > 0 ? validMoves.join(" ") : "continuation"}, ${statsStr})`
        );
    }

    // Sort: gambits first (forcing), then alphabetically within each group
    entries.sort((a, b) => {
        if (a.type === "forcing" && b.type !== "forcing") return -1;
        if (a.type !== "forcing" && b.type === "forcing") return 1;
        return a.name.localeCompare(b.name);
    });

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(entries, null, 2));
    const gambits = entries.filter((e) => e.type === "forcing").length;
    const others = entries.length - gambits;
    console.log(
        `\nWrote ${entries.length} entries (${gambits} gambits, ${others} general) to opening_db_index.json`
    );
}

main();

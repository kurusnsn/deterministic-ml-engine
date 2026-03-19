/**
 * ECO Importer - Parses eco.pgn and extracts theoretical opening lines
 *
 * This script reads the ECO PGN file and generates:
 * 1. Opening definitions for openingService.ts
 * 2. Opening entries for data/openings.ts
 * 3. Cached line JSON files for each opening
 *
 * Usage: npx tsx src/scripts/eco-importer.ts [path-to-eco.pgn]
 */

import * as fs from "fs";
import * as path from "path";
import { Chess } from "chess.js";

// ========================
// Types
// ========================

interface ECOEntry {
  eco: string;
  opening: string;
  variation?: string;
  moves: string[];
  movesText: string;
}

interface OpeningFamily {
  id: string;
  eco: string;
  name: string;
  description: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  color: "white" | "black";
  isGambit: boolean;
  lines: ECOLine[];
}

interface ECOLine {
  id: string;
  name: string;
  moves: string[];
  eco: string;
  fen: string;
  openingMoves?: string[];
}

interface OpeningDefinition {
  name: string;
  eco: string;
  fen: string;
  openingMoves?: string[];
}

// ========================
// PGN Parser
// ========================

function parseECOPgn(pgnContent: string): ECOEntry[] {
  const entries: ECOEntry[] = [];

  // Remove initial comment block
  const cleanedContent = pgnContent.replace(/^\s*\{[\s\S]*?\}\s*/, "");

  // Split into individual games/entries
  // Each entry starts with [ECO
  const entryBlocks = cleanedContent.split(/(?=\[ECO\s+)/);

  for (const block of entryBlocks) {
    if (!block.trim()) continue;

    // Extract headers
    const ecoMatch = block.match(/\[ECO\s+"([^"]+)"\]/);
    const openingMatch = block.match(/\[Opening\s+"([^"]+)"\]/);
    const variationMatch = block.match(/\[Variation\s+"([^"]+)"\]/);

    if (!ecoMatch || !openingMatch) continue;

    // Extract moves - everything after headers until * or result
    const headerEnd = block.lastIndexOf("]");
    const movesSection = block.slice(headerEnd + 1).trim();

    // Clean up moves - remove result markers and annotations
    const movesText = movesSection
      .replace(/\s*(\*|1-0|0-1|1\/2-1\/2)\s*$/, "")
      .replace(/\{[^}]*\}/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\$\d+/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Parse SAN moves
    const moves = parseSANMoves(movesText);

    if (moves.length === 0) continue;

    entries.push({
      eco: ecoMatch[1],
      opening: openingMatch[1],
      variation: variationMatch?.[1],
      moves,
      movesText,
    });
  }

  return entries;
}

function parseSANMoves(movesText: string): string[] {
  const moves: string[] = [];

  // Remove move numbers (1. 2. etc) and extract just the moves
  const tokens = movesText
    .replace(/\d+\.+/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 0);

  const chess = new Chess();

  for (const token of tokens) {
    // Skip non-move tokens
    if (!token.match(/^[KQRBNP]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?$|^O-O(-O)?[+#]?$/)) {
      continue;
    }

    try {
      const result = chess.move(token, { strict: false });
      if (result) {
        moves.push(result.san);
      }
    } catch {
      // Invalid move, stop parsing
      break;
    }
  }

  return moves;
}

function computeFenFromMoves(moves: string[]): string {
  const chess = new Chess();
  for (const move of moves) {
    try {
      chess.move(move, { strict: false });
    } catch {
      break;
    }
  }
  return chess.fen();
}

// ========================
// Opening Family Grouping
// ========================

// These are the main openings we want to feature in the trainer
// Mapped to their primary ECO codes
const FEATURED_OPENINGS: Record<string, {
  pattern: RegExp;
  eco: string[];
  color: "white" | "black";
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  // Override with canonical main line moves
  canonicalMoves?: string[];
}> = {
  "italian": {
    pattern: /Giuoco Piano|Italian/i,
    eco: ["C50", "C51", "C52", "C53", "C54"],
    color: "white",
    difficulty: "Beginner",
    canonicalMoves: ["e4", "e5", "Nf3", "Nc6", "Bc4"],
  },
  "sicilian": {
    pattern: /Sicilian/i,
    eco: ["B20", "B21", "B22", "B23", "B24", "B25", "B26", "B27", "B28", "B29", "B30", "B31", "B32", "B33", "B34", "B35", "B36", "B37", "B38", "B39", "B40", "B41", "B42", "B43", "B44", "B45", "B46", "B47", "B48", "B49", "B50", "B51", "B52", "B53", "B54", "B55", "B56", "B57", "B58", "B59", "B60", "B61", "B62", "B63", "B64", "B65", "B66", "B67", "B68", "B69", "B70", "B71", "B72", "B73", "B74", "B75", "B76", "B77", "B78", "B79", "B80", "B81", "B82", "B83", "B84", "B85", "B86", "B87", "B88", "B89", "B90", "B91", "B92", "B93", "B94", "B95", "B96", "B97", "B98", "B99"],
    color: "black",
    difficulty: "Advanced",
    canonicalMoves: ["e4", "c5"],
  },
  "queens-gambit": {
    pattern: /Queen's gambit/i,
    eco: ["D06", "D07", "D08", "D09", "D10", "D11", "D12", "D13", "D14", "D15", "D16", "D17", "D18", "D19", "D20", "D21", "D22", "D23", "D24", "D25", "D26", "D27", "D28", "D29", "D30", "D31", "D32", "D33", "D34", "D35", "D36", "D37", "D38", "D39", "D40", "D41", "D42", "D43", "D44", "D45", "D46", "D47", "D48", "D49", "D50", "D51", "D52", "D53", "D54", "D55", "D56", "D57", "D58", "D59"],
    color: "white",
    difficulty: "Intermediate",
    canonicalMoves: ["d4", "d5", "c4"],
  },
  "london": {
    pattern: /London system/i,
    eco: ["A48", "D02"],
    color: "white",
    difficulty: "Beginner",
    canonicalMoves: ["d4", "d5", "Nf3", "Nf6", "Bf4"],
  },
  "caro-kann": {
    pattern: /Caro-Kann/i,
    eco: ["B10", "B11", "B12", "B13", "B14", "B15", "B16", "B17", "B18", "B19"],
    color: "black",
    difficulty: "Intermediate",
    canonicalMoves: ["e4", "c6"],
  },
  "french": {
    pattern: /French defence/i,
    eco: ["C00", "C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17", "C18", "C19"],
    color: "black",
    difficulty: "Intermediate",
    canonicalMoves: ["e4", "e6"],
  },
  "ruy-lopez": {
    pattern: /Ruy Lopez|Spanish/i,
    eco: ["C60", "C61", "C62", "C63", "C64", "C65", "C66", "C67", "C68", "C69", "C70", "C71", "C72", "C73", "C74", "C75", "C76", "C77", "C78", "C79", "C80", "C81", "C82", "C83", "C84", "C85", "C86", "C87", "C88", "C89", "C90", "C91", "C92", "C93", "C94", "C95", "C96", "C97", "C98", "C99"],
    color: "white",
    difficulty: "Intermediate",
    canonicalMoves: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
  },
  "kings-indian": {
    pattern: /King's Indian/i,
    eco: ["E60", "E61", "E62", "E63", "E64", "E65", "E66", "E67", "E68", "E69", "E70", "E71", "E72", "E73", "E74", "E75", "E76", "E77", "E78", "E79", "E80", "E81", "E82", "E83", "E84", "E85", "E86", "E87", "E88", "E89", "E90", "E91", "E92", "E93", "E94", "E95", "E96", "E97", "E98", "E99"],
    color: "black",
    difficulty: "Advanced",
    canonicalMoves: ["d4", "Nf6", "c4", "g6"],
  },
  "scotch": {
    pattern: /Scotch/i,
    eco: ["C44", "C45"],
    color: "white",
    difficulty: "Intermediate",
    canonicalMoves: ["e4", "e5", "Nf3", "Nc6", "d4"],
  },
  "vienna": {
    pattern: /Vienna/i,
    eco: ["C25", "C26", "C27", "C28", "C29"],
    color: "white",
    difficulty: "Intermediate",
    canonicalMoves: ["e4", "e5", "Nc3"],
  },
};

// Opening descriptions
const OPENING_DESCRIPTIONS: Record<string, string> = {
  "italian": "A classic open game starting with 1.e4 e5 2.Nf3 Nc6 3.Bc4.",
  "sicilian": "The most popular and best-scoring response to 1.e4.",
  "queens-gambit": "One of the oldest and most solid openings for White.",
  "london": "A solid system for White where the bishop develops to f4.",
  "caro-kann": "A solid defense to 1.e4 characterized by 1...c6.",
  "french": "A solid defense to 1.e4 with 1...e6, leading to closed positions.",
  "ruy-lopez": "One of the oldest and most analyzed openings, 1.e4 e5 2.Nf3 Nc6 3.Bb5.",
  "kings-indian": "A hypermodern defense allowing White a large center then counterattacking.",
  "scotch": "An open game beginning 1.e4 e5 2.Nf3 Nc6 3.d4.",
  "vienna": "A flexible opening starting 1.e4 e5 2.Nc3.",
};

function groupEntriesByFamily(entries: ECOEntry[]): Map<string, OpeningFamily> {
  const families = new Map<string, OpeningFamily>();

  for (const [familyId, config] of Object.entries(FEATURED_OPENINGS)) {
    // Find the best representative entry for this opening
    const matchingEntries = entries.filter(entry => {
      const matchesPattern = config.pattern.test(entry.opening) ||
                             (entry.variation && config.pattern.test(entry.variation));
      const matchesEco = config.eco.includes(entry.eco);
      return matchesPattern || matchesEco;
    });

    if (matchingEntries.length === 0) continue;

    // Sort by move count (prefer entries with 3-6 moves as main lines)
    const sortedEntries = matchingEntries.sort((a, b) => {
      const aOptimal = Math.abs(a.moves.length - 4);
      const bOptimal = Math.abs(b.moves.length - 4);
      return aOptimal - bOptimal;
    });

    // Get the best representative entry
    const mainEntry = sortedEntries[0];

    // Check if it's a gambit
    const isGambit = matchingEntries.some(e =>
      e.opening.toLowerCase().includes("gambit") ||
      (e.variation && e.variation.toLowerCase().includes("gambit"))
    );

    // Find ECO code with most entries
    const ecoCounts = new Map<string, number>();
    for (const entry of matchingEntries) {
      ecoCounts.set(entry.eco, (ecoCounts.get(entry.eco) || 0) + 1);
    }
    const primaryEco = [...ecoCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    // Use canonical moves if defined, otherwise from main entry
    const canonicalMoves = config.canonicalMoves || mainEntry.moves;
    const canonicalFen = computeFenFromMoves(canonicalMoves);

    // Create lines from distinct variations
    const lines: ECOLine[] = [];
    const seenMoves = new Set<string>();

    // Add the canonical line first
    lines.push({
      id: `${familyId}-main`,
      name: getDisplayName(familyId, mainEntry),
      moves: canonicalMoves,
      eco: primaryEco,
      fen: canonicalFen,
      openingMoves: canonicalMoves,
    });
    seenMoves.add(canonicalMoves.join(","));

    for (const entry of matchingEntries.slice(0, 20)) {
      const movesKey = entry.moves.join(",");
      if (seenMoves.has(movesKey)) continue;
      seenMoves.add(movesKey);

      const fen = computeFenFromMoves(entry.moves);
      const variationName = entry.variation
        ? `${entry.opening}: ${entry.variation}`
        : entry.opening;

      lines.push({
        id: `${familyId}-${entry.eco.toLowerCase()}-${lines.length}`,
        name: variationName,
        moves: entry.moves,
        eco: entry.eco,
        fen,
        openingMoves: entry.moves,
      });
    }

    // Get a nice display name
    const displayName = getDisplayName(familyId, mainEntry);

    families.set(familyId, {
      id: familyId,
      eco: primaryEco,
      name: displayName,
      description: OPENING_DESCRIPTIONS[familyId] || `A theoretical opening from the ${primaryEco} family.`,
      difficulty: config.difficulty,
      color: config.color,
      isGambit,
      lines,
    });
  }

  return families;
}

function getDisplayName(familyId: string, entry: ECOEntry): string {
  const names: Record<string, string> = {
    "italian": "Italian Game",
    "sicilian": "Sicilian Defense",
    "queens-gambit": "Queen's Gambit",
    "london": "London System",
    "caro-kann": "Caro-Kann Defense",
    "french": "French Defense",
    "ruy-lopez": "Ruy Lopez",
    "kings-indian": "King's Indian Defense",
    "scotch": "Scotch Game",
    "vienna": "Vienna Game",
  };
  return names[familyId] || entry.opening;
}

// ========================
// Output Generation
// ========================

interface GeneratedOutput {
  openingsData: string;
  openingDefinitions: string;
  cachedLines: Map<string, object>;
}

function generateOutput(families: Map<string, OpeningFamily>): GeneratedOutput {
  const openingsArray: string[] = [];
  const definitionsArray: string[] = [];
  const cachedLines = new Map<string, object>();

  for (const [id, family] of families) {
    // Skip if this is a hardcoded opening (stafford)
    if (id === "stafford") continue;

    // Opening entry for data/openings.ts
    openingsArray.push(`    {
        id: "${id}",
        name: "${family.name}",
        description: "${family.description}",
        difficulty: "${family.difficulty}",
        color: "${family.color}",
    }`);

    // Opening definition for openingService.ts
    // Use canonical moves from the config
    const config = FEATURED_OPENINGS[id];
    const canonicalMoves = config?.canonicalMoves || family.lines[0]?.moves || [];
    const canonicalFen = computeFenFromMoves(canonicalMoves);

    const openingMovesPart = canonicalMoves.length > 0
      ? `\n    openingMoves: ${JSON.stringify(canonicalMoves)},`
      : "";

    definitionsArray.push(`  "${id}": {
    name: "${family.name}",
    eco: "${family.eco}",
    fen: "${canonicalFen}",${openingMovesPart}
  }`);

    // Cached lines JSON for opening-db/
    // Convert ECO lines to forcing line format for compatibility
    const forcingLines = family.lines.map((line, idx) => ({
      id: `${id}-eco-${idx}-${hashString(line.moves.join(""))}`,
      name: line.name,
      moves: line.moves,
      metadata: {
        mistake_move_index: 0,
        punishment_move_index: 1,
        gameCounts: line.moves.map(() => 10000), // Placeholder
        winrates: line.moves.map(() => 50), // Placeholder
        forcingSide: family.color,
        source: "eco-db",
        type: "forcing" as const,
      },
    }));

    cachedLines.set(id, {
      id,
      name: family.name,
      opening: family.name,
      generatedAt: new Date().toISOString(),
      lines: forcingLines,
    });
  }

  return {
    openingsData: openingsArray.join(",\n"),
    openingDefinitions: definitionsArray.join(",\n"),
    cachedLines,
  };
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 6);
}

// ========================
// Main
// ========================

async function main() {
  const args = process.argv.slice(2);
  const pgnPath = args[0] || path.join(process.cwd(), "..", "eco-service", "eco.pgn");

  console.log(`Reading ECO PGN from: ${pgnPath}`);

  if (!fs.existsSync(pgnPath)) {
    console.error(`File not found: ${pgnPath}`);
    process.exit(1);
  }

  const pgnContent = fs.readFileSync(pgnPath, "utf-8");
  console.log(`Parsing ${pgnContent.length} bytes...`);

  const entries = parseECOPgn(pgnContent);
  console.log(`Parsed ${entries.length} ECO entries`);

  const families = groupEntriesByFamily(entries);
  console.log(`Grouped into ${families.size} opening families`);

  const output = generateOutput(families);

  // Output opening definitions
  console.log("\n=== Opening Definitions (for openingService.ts) ===\n");
  console.log(output.openingDefinitions);

  // Output openings data
  console.log("\n=== Openings Data (for data/openings.ts) ===\n");
  console.log(output.openingsData);

  // Write cached line files
  const openingDbDir = path.join(process.cwd(), "opening-db");
  if (!fs.existsSync(openingDbDir)) {
    fs.mkdirSync(openingDbDir, { recursive: true });
  }

  console.log("\n=== Writing cached line files ===\n");
  for (const [id, data] of output.cachedLines) {
    const filePath = path.join(openingDbDir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Written: ${filePath}`);
  }

  console.log("\nDone! Review the output above and update the source files.");
}

main().catch(console.error);

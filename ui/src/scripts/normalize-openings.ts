import * as fs from "fs";
import * as path from "path";
import { Chess } from "chess.js";

interface ECOEntry {
    eco: string;
    opening: string;
    variation?: string;
    moves: string[];
}

interface OpeningSystem {
    id: string;
    familyId: string;
    name: string;
    ecoCodes: string[];
    type: "forcing" | "neutral" | "semi-forcing";
    canonicalMoves: string[];
    fen: string;
}

interface OpeningFamily {
    id: string;
    name: string;
    ecoCodes: string[];
    systems: string[]; // system IDs
}

// -----------------------------------------------------------------------------
// Normalization Rules & Helper Functions
// -----------------------------------------------------------------------------

function cleanOpeningName(name: string): string {
    return name
        .replace(/defence/gi, "Defense")
        .replace(/variation/gi, "")
        .replace(/gambit accepted/gi, "Gambit")
        .replace(/gambit declined/gi, "Gambit")
        .replace(/gambit half accepted/gi, "Gambit")
        .replace(/['']/g, "")
        .replace(/\s+/g, " ")
        .replace(/,\s*$/, "")
        .trim();
}

function getFamilyId(name: string): string {
    const cleaned = cleanOpeningName(name).toLowerCase();

    if (cleaned.includes("sicilian")) return "sicilian";
    if (cleaned.includes("french")) return "french";
    if (cleaned.includes("caro-kann")) return "caro-kann";
    if (cleaned.includes("ruy lopez") || cleaned.includes("spanish")) return "ruy-lopez";
    if (cleaned.includes("italian") || cleaned.includes("giuoco piano") || cleaned.includes("evans gambit")) return "italian";
    if (cleaned.includes("queens gambit")) return "queens-gambit";
    if (cleaned.includes("kings indian defense")) return "kings-indian";
    if (cleaned.includes("kings indian attack")) return "kings-indian-attack";
    if (cleaned.includes("nimzo-indian")) return "nimzo-indian";
    if (cleaned.includes("bogo-indian")) return "bogo-indian";
    if (cleaned.includes("queens indian")) return "queens-indian";
    if (cleaned.includes("gruenfeld") || cleaned.includes("grunfeld")) return "gruenfeld";
    if (cleaned.includes("dutch")) return "dutch";
    if (cleaned.includes("english")) return "english";
    if (cleaned.includes("scandinavian") || cleaned.includes("centre counter")) return "scandinavian";
    if (cleaned.includes("petrov") || cleaned.includes("petroff")) return "petrov";
    if (cleaned.includes("philidor")) return "philidor";
    if (cleaned.includes("pirc")) return "pirc";
    if (cleaned.includes("modern defense") || cleaned.includes("robatsch")) return "modern";
    if (cleaned.includes("vienna")) return "vienna";
    if (cleaned.includes("scotch")) return "scotch";
    if (cleaned.includes("bishop opening")) return "bishops-opening";
    if (cleaned.includes("london system")) return "london";
    if (cleaned.includes("four knights")) return "four-knights";
    if (cleaned.includes("three knights")) return "three-knights";

    return "miscellaneous";
}

function getFamilyName(id: string): string {
    const names: Record<string, string> = {
        "sicilian": "Sicilian Defense",
        "french": "French Defense",
        "caro-kann": "Caro-Kann Defense",
        "ruy-lopez": "Ruy Lopez",
        "italian": "Italian Game",
        "queens-gambit": "Queen's Gambit",
        "kings-indian": "King's Indian Defense",
        "kings-indian-attack": "King's Indian Attack",
        "nimzo-indian": "Nimzo-Indian Defense",
        "bogo-indian": "Bogo-Indian Defense",
        "queens-indian": "Queen's Indian Defense",
        "gruenfeld": "Gruenfeld Defense",
        "dutch": "Dutch Defense",
        "english": "English Opening",
        "scandinavian": "Scandinavian Defense",
        "petrov": "Petrov's Defense",
        "philidor": "Philidor's Defense",
        "pirc": "Pirc Defense",
        "modern": "Modern Defense",
        "vienna": "Vienna Game",
        "scotch": "Scotch Game",
        "bishops-opening": "Bishop's Opening",
        "london": "London System",
        "four-knights": "Four Knights Game",
        "three-knights": "Three Knights Game",
        "miscellaneous": "Irregular Openings",
    };
    return names[id] || id.split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}

const MAJOR_SYSTEMS: Record<string, string[]> = {
    "sicilian": ["Najdorf", "Dragon", "Taimanov", "Kan", "Scheveningen", "Classical", "Sveshnikov", "Alapin", "Closed", "Smith-Morra Gambit", "Grand Prix"],
    "french": ["Advance", "Exchange", "Winawer", "Tarrasch", "Classical"],
    "caro-kann": ["Advance", "Exchange", "Panov", "Classical"],
    "ruy-lopez": ["Berlin", "Exchange", "Marshall", "Open", "Closed"],
    "italian": ["Giuoco Piano", "Evans Gambit", "Two Knights Defense", "Hungarian Defense"],
    "queens-gambit": ["Accepted", "Declined", "Slav", "Semi-Slav", "Catalan"],
    "kings-indian": ["Classical", "Samisch", "Fianchetto", "Four Pawns Attack"],
    "dutch": ["Leningrad", "Stonewall", "Classical"],
    "english": ["Symmetrical", "Reverse Sicilian"],
    "gruenfeld": ["Exchange", "Russian", "Modern"],
};

function getSystemName(entry: ECOEntry, familyId: string): string {
    const opening = cleanOpeningName(entry.opening);
    const variation = entry.variation ? cleanOpeningName(entry.variation) : "";
    const full = `${opening} ${variation}`.trim();

    if (full.toLowerCase().includes("gambit")) {
        // Return specific gambit name
        const gambitMatch = full.match(/([A-Z][a-z]+(\s+[A-Z][a-z]+)*\s+Gambit)/i);
        if (gambitMatch) return cleanOpeningName(gambitMatch[1]);
        return cleanOpeningName(opening);
    }

    if (MAJOR_SYSTEMS[familyId]) {
        for (const major of MAJOR_SYSTEMS[familyId]) {
            if (full.toLowerCase().includes(major.toLowerCase())) {
                return major;
            }
        }
    }

    // Miscellaneous rule: Only keep Gambits as systems, everything else is just the family name
    if (familyId === "miscellaneous") return "Irregular Openings";

    return getFamilyName(familyId);
}

const FORCING_KEYWORDS = ["gambit", "stafford", "englund", "blackburne", "traps", "vienna", "danish", "goring"];

function determineType(name: string, variation?: string): "forcing" | "neutral" | "semi-forcing" {
    const full = `${name} ${variation || ""}`.toLowerCase();
    if (FORCING_KEYWORDS.some(k => full.includes(k))) return "forcing";
    return "neutral";
}

function parseECOPgn(pgnContent: string): ECOEntry[] {
    const entries: ECOEntry[] = [];
    const cleanedContent = pgnContent.replace(/^\s*\{[\s\S]*?\}\s*/, "");
    const entryBlocks = cleanedContent.split(/(?=\[ECO\s+)/);

    for (const block of entryBlocks) {
        if (!block.trim()) continue;

        const ecoMatch = block.match(/\[ECO\s+"([^"]+)"\]/);
        const openingMatch = block.match(/\[Opening\s+"([^"]+)"\]/);
        const variationMatch = block.match(/\[Variation\s+"([^"]+)"\]/);

        if (!ecoMatch || !openingMatch) continue;

        const headerEnd = block.lastIndexOf("]");
        const movesSection = block.slice(headerEnd + 1).trim();

        const movesText = movesSection
            .replace(/\s*(\*|1-0|0-1|1\/2-1\/2)\s*$/, "")
            .replace(/\{[^}]*\}/g, "")
            .replace(/\([^)]*\)/g, "")
            .replace(/\$\d+/g, "")
            .replace(/\s+/g, " ")
            .trim();

        const moves = parseSANMoves(movesText);
        if (moves.length === 0) continue;

        entries.push({
            eco: ecoMatch[1],
            opening: openingMatch[1],
            variation: variationMatch?.[1],
            moves,
        });
    }
    return entries;
}

function parseSANMoves(movesText: string): string[] {
    const moves: string[] = [];
    const tokens = movesText
        .replace(/\d+\.+/g, " ")
        .split(/\s+/)
        .filter(t => t.length > 0);

    const chess = new Chess();
    for (const token of tokens) {
        if (!token.match(/^[KQRBNP]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?$|^O-O(-O)?[+#]?$/)) continue;
        try {
            const result = chess.move(token, { strict: false });
            if (result) moves.push(result.san);
        } catch { break; }
    }
    return moves;
}

// -----------------------------------------------------------------------------
// Main Pipeline
// -----------------------------------------------------------------------------

async function main() {
    const pgnPath = path.join(process.cwd(), "eco-service", "eco.pgn");
    if (!fs.existsSync(pgnPath)) {
        console.error(`File not found: ${pgnPath}`);
        process.exit(1);
    }

    const pgnContent = fs.readFileSync(pgnPath, "utf-8");
    const rawEntries = parseECOPgn(pgnContent);

    const families = new Map<string, OpeningFamily>();
    const systems = new Map<string, OpeningSystem>();

    for (const entry of rawEntries) {
        const familyId = getFamilyId(entry.opening);
        const familyName = getFamilyName(familyId);
        const systemName = getSystemName(entry, familyId);

        if (!families.has(familyId)) {
            families.set(familyId, {
                id: familyId,
                name: familyName,
                ecoCodes: [],
                systems: []
            });
        }
        const family = families.get(familyId)!;
        if (!family.ecoCodes.includes(entry.eco)) family.ecoCodes.push(entry.eco);

        const systemId = `${familyId}-${systemName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

        if (!systems.has(systemId)) {
            let limit = 8;
            if (systemName === familyName) limit = 4;

            const canonicalMoves = entry.moves.slice(0, limit);
            const chess = new Chess();
            try {
                for (const m of canonicalMoves) chess.move(m);
            } catch (e) {
                continue;
            }

            systems.set(systemId, {
                id: systemId,
                familyId: familyId,
                name: systemName,
                ecoCodes: [entry.eco],
                type: determineType(entry.opening, entry.variation),
                canonicalMoves: canonicalMoves,
                fen: chess.fen()
            });
            family.systems.push(systemId);
        } else {
            const system = systems.get(systemId)!;
            if (!system.ecoCodes.includes(entry.eco)) system.ecoCodes.push(entry.eco);
        }
    }

    const systemsList = Array.from(systems.values());
    const familiesList = Array.from(families.values());

    console.log(`Generated ${familiesList.length} families and ${systemsList.length} systems.`);

    const cacheDir = path.join(process.cwd(), "ui", "public", "data", "openings");
    fs.mkdirSync(cacheDir, { recursive: true });

    fs.writeFileSync(path.join(cacheDir, "opening_families.json"), JSON.stringify(familiesList, null, 2));
    fs.writeFileSync(path.join(cacheDir, "opening_systems.json"), JSON.stringify(systemsList, null, 2));

    const seeds = systemsList.map(s => ({
        id: s.id,
        fen: s.fen,
        moves: s.canonicalMoves
    }));
    fs.writeFileSync(path.join(cacheDir, "opening_seeds.json"), JSON.stringify(seeds, null, 2));
}

main().catch(console.error);

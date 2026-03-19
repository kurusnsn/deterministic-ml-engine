import OpeningTrainer from "@/components/OpeningTrainer";
import { Skeleton } from "@/components/ui/skeleton";
import { ForcingLine, Opening, OpeningLinesResponse } from "@/types/openings";
import { openings } from "@/data/openings";
import { generateForcingLinesWithOpening, loadCachedLines } from "@/lib/forcing/generator";
import { getOpeningStartFen, getOpeningMoves } from "@/lib/opening/openingService";
import {
    loadOpeningSystemSync,
    deriveOrientation,
    createDefaultLines,
} from "@/lib/opening/systemUtils";
import fs from "fs";
import path from "path";

interface OpeningLinesWithFen extends OpeningLinesResponse {
    startFen?: string;
    openingMoves?: string[];
    orientation?: "white" | "black";
}

interface OpeningSeedEntry {
    id: string;
    fen?: string;
    moves?: string[];
}

function loadOpeningSeedSync(id: string): { fen?: string; openingMoves?: string[] } | null {
    try {
        const filePath = path.join(process.cwd(), "public", "data", "openings", "opening_seeds.json");

        if (!fs.existsSync(filePath)) {
            return null;
        }

        const content = fs.readFileSync(filePath, "utf8");
        const seeds: OpeningSeedEntry[] = JSON.parse(content);
        const seed = seeds.find((entry) => entry.id === id);
        if (!seed) {
            return null;
        }

        return {
            fen: seed.fen,
            openingMoves: Array.isArray(seed.moves) ? seed.moves : undefined,
        };
    } catch {
        return null;
    }
}

// Try to get lines using the OLD system (openings.ts)
async function getOpeningLinesLegacy(id: string): Promise<OpeningLinesWithFen | null> {
    try {
        const startFen = getOpeningStartFen(id);
        const openingMoves = getOpeningMoves(id);

        // Get the opening config to check its source
        const openingConfig = openings.find((o) => o.id === id);
        if (!openingConfig) return null; // Not found in legacy system

        const isEcoOpening = openingConfig?.source === "eco";

        // Try to load cached lines first
        let cached = loadCachedLines(id);
        if (!cached) {
            cached = loadCachedLines(id.replace(/[^a-z0-9-]/gi, ""));
        }

        if (cached) {
            return {
                opening: cached.name ?? cached.opening ?? id,
                lines: cached.lines ?? [],
                generatedAt: cached.generatedAt,
                startFen,
                openingMoves,
                orientation: openingConfig.color,
            };
        }

        // For ECO openings, only use cached lines
        if (isEcoOpening) {
            console.error(`No ECO lines found for opening: ${id}`);
            return null;
        }

        // For gambit openings, generate forcing lines
        const { opening, lines } = await generateForcingLinesWithOpening(id);
        return {
            opening: opening.name ?? id,
            lines,
            startFen: opening.fen ?? startFen,
            openingMoves: opening.openingMoves ?? openingMoves,
            orientation: openingConfig.color,
        };
    } catch {
        return null;
    }
}

// Get lines using the NEW system (opening_systems.json)
// Lines should be pre-generated using: npx tsx scripts/generate-gambit-lines.ts
function getOpeningLinesFromSystem(id: string): OpeningLinesWithFen | null {
    try {
        const system = loadOpeningSystemSync(id);
        if (!system) return null;

        const orientation = deriveOrientation(system.canonicalMoves);

        // Try to load cached lines by system ID or family ID
        let cached = loadCachedLines(system.id);
        if (!cached) {
            cached = loadCachedLines(system.familyId);
        }

        if (cached) {
            return {
                opening: system.name,
                lines: cached.lines ?? [],
                generatedAt: cached.generatedAt,
                startFen: system.fen,
                openingMoves: system.canonicalMoves,
                orientation,
            };
        }

        // No cached lines - create default line from canonical moves
        // For gambits, run: npx tsx scripts/generate-gambit-lines.ts
        const defaultLines = createDefaultLines(system);
        return {
            opening: system.name,
            lines: defaultLines,
            startFen: system.fen,
            openingMoves: system.canonicalMoves,
            orientation,
        };
    } catch {
        return null;
    }
}

// Load lines from the new ECO-based opening_lines/*.json files
function getOpeningLinesFromEcoFiles(id: string): OpeningLinesWithFen | null {
    try {
        const filePath = path.join(process.cwd(), 'public', 'data', 'openings', 'opening_lines', `${id}.json`);

        if (!fs.existsSync(filePath)) return null;

        const content = fs.readFileSync(filePath, 'utf8');
        const lineData = JSON.parse(content);

        // Convert the line format to ForcingLine format
        const lines: ForcingLine[] = (lineData.lines || []).map((line: { id: string; name: string; moves: string[]; eco?: string }) => ({
            id: line.id,
            name: line.name,
            moves: line.moves,
            description: line.eco ? `ECO: ${line.eco}` : undefined,
        }));
        const seed = loadOpeningSeedSync(id);
        const seedOrientation = seed?.openingMoves && seed.openingMoves.length > 0
            ? deriveOrientation(seed.openingMoves)
            : undefined;

        return {
            opening: lineData.opening,
            lines,
            generatedAt: lineData.generatedAt,
            startFen: seed?.fen,
            openingMoves: seed?.openingMoves,
            orientation: lineData.perspective || seedOrientation || "white",
        };
    } catch {
        return null;
    }
}


// Load lines directly from opening-db/ for gambit-only openings not in other registries
function getOpeningLinesFromCache(id: string): OpeningLinesWithFen | null {
    try {
        const cached = loadCachedLines(id);
        if (!cached) return null;

        const seed = loadOpeningSeedSync(id);
        const seedOrientation = seed?.openingMoves && seed.openingMoves.length > 0
            ? deriveOrientation(seed.openingMoves)
            : undefined;
        const forcingSide = cached.lines?.[0]?.metadata?.forcingSide;
        return {
            opening: cached.name ?? cached.opening ?? id,
            lines: cached.lines ?? [],
            generatedAt: cached.generatedAt,
            startFen: seed?.fen,
            openingMoves: seed?.openingMoves,
            orientation: forcingSide ?? seedOrientation ?? "white",
        };
    } catch {
        return null;
    }
}

// Combined function: try legacy first, then ECO lines, then system fallback
async function getOpeningLines(id: string): Promise<OpeningLinesWithFen | null> {
    // Try legacy system first (for backward compatibility with Stafford etc.)
    const legacyResult = await getOpeningLinesLegacy(id);
    if (legacyResult) return legacyResult;

    // Try loading from new ECO-based line files
    const ecoResult = await getOpeningLinesFromEcoFiles(id);
    if (ecoResult) return ecoResult;

    // Try opening_systems.json-based loading
    const systemResult = getOpeningLinesFromSystem(id);
    if (systemResult) return systemResult;

    // Final fallback: load directly from opening-db/ cache (gambit-specific openings)
    return getOpeningLinesFromCache(id);
}


export default async function TrainerPage({ params }: { params: Promise<{ id: string }> }) {
    // Await params as required by Next.js 15
    const { id: openingId } = await params;

    const linesPayload = await getOpeningLines(openingId);

    const lines: ForcingLine[] = linesPayload?.lines ?? [];
    const openingName = linesPayload?.opening ?? openingId;

    // Use orientation from payload, or fall back to legacy lookup, or default to white
    const openingMeta: Opening | undefined = openings.find((o) => o.id === openingId);
    const orientation = linesPayload?.orientation ?? openingMeta?.color ?? "white";

    const startFen = linesPayload?.startFen;
    const openingMoves = linesPayload?.openingMoves;
    const pageHeading = <h1 className="sr-only">Opening Trainer</h1>;

    if (!linesPayload) {
        return (
            <div className="p-8">
                {pageHeading}
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    return (
        <>
            {pageHeading}
            <OpeningTrainer
                openingId={openingId}
                openingName={openingName}
                lines={lines}
                orientation={orientation}
                startFen={startFen}
                openingMoves={openingMoves}
            />
        </>
    );
}

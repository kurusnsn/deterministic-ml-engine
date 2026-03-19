/**
 * Pre-generate forcing lines for all gambits in opening_systems.json
 * Run with: npx tsx scripts/generate-gambit-lines.ts
 */

import fs from "fs";
import path from "path";
import { OpeningSystem } from "../src/types/openings";
import { generateForcingLinesFromRoot } from "../src/lib/forcing/generator";
import { OpeningRoot } from "../src/lib/opening/openingService";

const SYSTEMS_PATH = path.join(process.cwd(), "public/data/openings/opening_systems.json");
const CACHE_DIR = path.join(process.cwd(), "opening-db");

function isGambitSystem(system: OpeningSystem): boolean {
    return (
        system.type === "forcing" ||
        system.name.toLowerCase().includes("gambit") ||
        system.name.toLowerCase().includes("trap")
    );
}

function systemToOpeningRoot(system: OpeningSystem): OpeningRoot {
    return {
        id: system.id,
        name: system.name,
        eco: system.ecoCodes[0],
        fen: system.fen,
        openingMoves: system.canonicalMoves,
    };
}

function normalizeIdForCache(id: string): string {
    return id.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cacheExists(id: string): boolean {
    const normalizedFile = path.join(CACHE_DIR, `${normalizeIdForCache(id)}.json`);
    const originalFile = path.join(CACHE_DIR, `${id.toLowerCase()}.json`);
    return fs.existsSync(normalizedFile) || fs.existsSync(originalFile);
}

async function main() {
    // Load all systems
    const systemsData = fs.readFileSync(SYSTEMS_PATH, "utf-8");
    const systems: OpeningSystem[] = JSON.parse(systemsData);

    // Filter for gambits
    const gambits = systems.filter(isGambitSystem);
    console.log(`Found ${gambits.length} gambits out of ${systems.length} total openings`);

    // Filter out already cached
    const uncached = gambits.filter((g) => !cacheExists(g.id));
    console.log(`${uncached.length} gambits need line generation (${gambits.length - uncached.length} already cached)`);

    if (uncached.length === 0) {
        console.log("All gambits already have cached lines!");
        return;
    }

    // Ensure cache dir exists
    fs.mkdirSync(CACHE_DIR, { recursive: true });

    let success = 0;
    let failed = 0;

    for (let i = 0; i < uncached.length; i++) {
        const system = uncached[i];
        console.log(`\n[${i + 1}/${uncached.length}] Generating lines for: ${system.name}`);

        try {
            const openingRoot = systemToOpeningRoot(system);
            const { lines, generatedAt } = await generateForcingLinesFromRoot(openingRoot);

            console.log(`  ✓ Generated ${lines.length} forcing lines`);
            success++;

            // Add delay to respect rate limits
            if (i < uncached.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        } catch (error) {
            console.error(`  ✗ Failed: ${error}`);
            failed++;
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Success: ${success}`);
    console.log(`Failed: ${failed}`);
}

main().catch(console.error);

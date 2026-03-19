import { OpeningSystem, ForcingLine } from "@/types/openings";
import { OpeningRoot } from "./openingService";

// Cache for loaded systems
let systemsCache: OpeningSystem[] | null = null;

/**
 * Load all opening systems from JSON (with caching)
 */
export async function loadAllSystems(): Promise<OpeningSystem[]> {
    if (systemsCache) return systemsCache;

    try {
        // In server context, read from filesystem
        if (typeof window === "undefined") {
            const fs = await import("fs");
            const path = await import("path");
            const filePath = path.join(process.cwd(), "public/data/openings/opening_systems.json");
            const data = fs.readFileSync(filePath, "utf-8");
            systemsCache = JSON.parse(data);
            return systemsCache!;
        }

        // In client context, fetch from URL
        const response = await fetch("/data/openings/opening_systems.json");
        systemsCache = await response.json();
        return systemsCache!;
    } catch (error) {
        console.error("Failed to load opening systems:", error);
        return [];
    }
}

/**
 * Load a specific opening system by ID
 */
export async function loadOpeningSystem(id: string): Promise<OpeningSystem | null> {
    const systems = await loadAllSystems();
    return systems.find((s) => s.id === id) ?? null;
}

/**
 * Derive board orientation from canonical moves
 * Odd number of moves = White made last move = White's opening system
 * Even number of moves = Black made last move = Black's opening system
 */
export function deriveOrientation(canonicalMoves: string[]): "white" | "black" {
    // If no moves, default to white
    if (!canonicalMoves || canonicalMoves.length === 0) return "white";

    // Odd moves = White's system (White plays the defining move)
    // Even moves = Black's system (Black plays the defining move as response)
    return canonicalMoves.length % 2 === 1 ? "white" : "black";
}

/**
 * Create default training lines from canonical moves when no cached lines exist
 * This allows users to at least practice the main line
 */
export function createDefaultLines(system: OpeningSystem): ForcingLine[] {
    const orientation = deriveOrientation(system.canonicalMoves);

    return [
        {
            id: `${system.id}-main`,
            name: `${system.name} - Main Line`,
            moves: system.canonicalMoves,
            description: `Learn the main line of the ${system.name}`,
            metadata: {
                mistake_move_index: 0,
                punishment_move_index: 1,
                forcingSide: orientation,
                source: "canonical",
                type: system.type === "forcing" ? "forcing" : "forcing",
            },
        },
    ];
}

/**
 * Synchronous version of loadOpeningSystem for server components
 * Reads directly from filesystem
 */
export function loadOpeningSystemSync(id: string): OpeningSystem | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require("fs");
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const path = require("path");
        const filePath = path.join(process.cwd(), "public/data/openings/opening_systems.json");
        const data = fs.readFileSync(filePath, "utf-8");
        const systems: OpeningSystem[] = JSON.parse(data);
        return systems.find((s) => s.id === id) ?? null;
    } catch (error) {
        console.error("Failed to load opening system:", error);
        return null;
    }
}

/**
 * Check if an opening system is a gambit that should use the forcing line builder
 */
export function isGambitSystem(system: OpeningSystem): boolean {
    return (
        system.type === "forcing" ||
        system.name.toLowerCase().includes("gambit") ||
        system.name.toLowerCase().includes("trap")
    );
}

/**
 * Convert OpeningSystem to OpeningRoot format for the gambit builder
 */
export function systemToOpeningRoot(system: OpeningSystem): OpeningRoot {
    return {
        id: system.id,
        name: system.name,
        eco: system.ecoCodes[0],
        fen: system.fen,
        openingMoves: system.canonicalMoves,
    };
}

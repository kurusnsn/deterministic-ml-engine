import fs from "fs";
import path from "path";
import type { OpeningSystem } from "../src/types/openings";
import { getPositionSample } from "../src/lib/opening/openingService";

const localPath = path.join(process.cwd(), "public", "data", "openings", "opening_systems.json");
const fallbackPath = path.join(process.cwd(), "ui", "public", "data", "openings", "opening_systems.json");
const systemsPath = fs.existsSync(localPath) ? localPath : fallbackPath;

if (!fs.existsSync(systemsPath)) {
  console.error(`Opening systems file not found at: ${systemsPath}`);
  process.exit(1);
}

async function main() {
  const raw = fs.readFileSync(systemsPath, "utf8");
  const systems = JSON.parse(raw) as OpeningSystem[];
  const total = systems.length;
  const fenCache = new Map<string, number>();

  for (const [index, system] of systems.entries()) {
    if (!system.fen) {
      system.popularity = system.popularity ?? 0;
      console.warn(`[${index + 1}/${total}] Missing FEN for ${system.id}, keeping popularity ${system.popularity}`);
      continue;
    }

    if (fenCache.has(system.fen)) {
      system.popularity = fenCache.get(system.fen)!;
      continue;
    }

    try {
      console.log(`[${index + 1}/${total}] Fetching popularity for ${system.id}`);
      const sample = await getPositionSample(system.fen);
      system.popularity = sample;
      fenCache.set(system.fen, sample);
    } catch (error) {
      system.popularity = system.popularity ?? 0;
      console.error(`[${index + 1}/${total}] Failed to fetch ${system.id}`, error);
    }
  }

  fs.writeFileSync(systemsPath, JSON.stringify(systems, null, 2));
  console.log(`Updated opening popularity in ${systemsPath}`);
}

main().catch((error) => {
  console.error("Unhandled error while updating opening popularity", error);
  process.exit(1);
});

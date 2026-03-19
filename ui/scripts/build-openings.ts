import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { generateForcingLinesWithOpening } = require("../src/lib/forcing/generator.ts");

// Build one opening at a time to avoid rate limiting
// Uncomment the opening you want to build:
const openings = [
  // "italian",
  // "sicilian",
  "stafford",
  // "london",
  // "queens-gambit"
];

const normalizeIdForCache = (openingId: string) => openingId.toLowerCase().replace(/[^a-z0-9]/g, "");
const CACHE_DIR = fs.existsSync(path.join(process.cwd(), "opening-db"))
  ? path.join(process.cwd(), "opening-db")
  : path.join(process.cwd(), "ui", "opening-db");

async function buildAll() {
  for (const id of openings) {
    try {
      console.log(`Building: ${id}`);
      const { opening, lines, generatedAt } = await generateForcingLinesWithOpening(id);
      const payload = {
        id,
        name: opening.name ?? id,
        opening: opening.name ?? id,
        generatedAt: generatedAt ?? new Date().toISOString(),
        lines,
      };

      const filePath = path.join(CACHE_DIR, `${normalizeIdForCache(id)}.json`);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
      console.log(`✅ Wrote ${filePath}`);
    } catch (error) {
      console.error(`❌ Failed to build ${id}`, error);
    }
  }
}

buildAll().catch((error) => {
  console.error("Unhandled error while building openings", error);
  process.exit(1);
});

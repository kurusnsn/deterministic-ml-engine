/**
 * ECO Hierarchy Parser - Handles the "Inconsistent Parent" Problem
 *
 * This script parses eco.pgn to generate a structured JSON list of "Opening Courses"
 * with intelligent promotion of significant variations (gambits, attacks, counter-attacks)
 * to their own parent nodes.
 *
 * Usage: npx tsx src/scripts/eco-hierarchy-parser.ts [path-to-eco.pgn]
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
  plyCount: number;
}

interface OpeningCourse {
  courseName: string;
  eco: string;
  rootMoves: string;
  variations: CourseVariation[];
}

interface CourseVariation {
  name: string;
  moves: string;
}

interface GroupedEntry {
  eco: string;
  opening: string;
  entries: ECOEntry[];
}

// ========================
// Configuration
// ========================

// Keywords that trigger promotion to parent node
const PROMOTION_KEYWORDS = [
  "gambit",
  "counter-attack",
  "counter-gambit",
  "attack",
  "countergambit",
  "counterattack",
];

// Shallow ply range for promotion consideration (moves 3-5)
const SHALLOW_PLY_MIN = 5; // After move 3 (1.e4 e5 2.Nf3 Nc6 3.d4 = 5 plies)
const SHALLOW_PLY_MAX = 10; // After move 5

// ========================
// PGN Parser
// ========================

function parseECOPgn(pgnContent: string): ECOEntry[] {
  const entries: ECOEntry[] = [];

  // Remove initial comment block
  const cleanedContent = pgnContent.replace(/^\s*\{[\s\S]*?\}\s*/, "");

  // Split into individual games/entries
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

    // Clean up moves - remove result markers, annotations, and *
    const movesText = movesSection
      .replace(/\s*(\*|1-0|0-1|1\/2-1\/2)\s*$/, "")
      .replace(/\{[^}]*\}/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\$\d+/g, "")
      .replace(/\*/g, "") // Remove asterisks
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
      plyCount: moves.length,
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
    .filter((t) => t.length > 0);

  const chess = new Chess();

  for (const token of tokens) {
    // Skip non-move tokens
    if (
      !token.match(
        /^[KQRBNP]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?$|^O-O(-O)?[+#]?$/
      )
    ) {
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

// ========================
// Promotion Logic
// ========================

/**
 * Determines if a variation should be promoted to its own parent node
 */
function shouldPromoteVariation(entry: ECOEntry): boolean {
  if (!entry.variation) return false;

  const variationLower = entry.variation.toLowerCase();

  // Check if variation contains promotion keywords
  const hasPromotionKeyword = PROMOTION_KEYWORDS.some((keyword) =>
    variationLower.includes(keyword)
  );

  if (!hasPromotionKeyword) return false;

  // Check if the variation introduces a unique move sequence at shallow ply
  // This means the variation should have between 5-10 plies (moves 3-5)
  const isShallowPly =
    entry.plyCount >= SHALLOW_PLY_MIN && entry.plyCount <= SHALLOW_PLY_MAX;

  return isShallowPly;
}

/**
 * Gets the course name for an entry (either promoted variation or opening name)
 */
function getCourseName(entry: ECOEntry, isPromoted: boolean): string {
  if (isPromoted && entry.variation) {
    // Capitalize first letter of each word
    return entry.variation
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
  return entry.opening;
}

/**
 * Normalizes opening names to detect parent-child relationships
 * E.g., "Evans gambit declined, Lange variation" -> "Evans gambit declined"
 */
function normalizeOpeningName(openingName: string): string {
  // Check if the opening name contains a comma (indicating a sub-variation)
  const commaIndex = openingName.indexOf(',');
  
  if (commaIndex !== -1) {
    // Return the part before the comma as the parent opening
    return openingName.substring(0, commaIndex).trim();
  }
  
  return openingName;
}

/**
 * Extracts the variation name from an opening name if it contains one
 * E.g., "Evans gambit declined, Lange variation" -> "Lange variation"
 */
function extractVariationFromOpening(openingName: string): string | undefined {
  const commaIndex = openingName.indexOf(',');
  
  if (commaIndex !== -1) {
    return openingName.substring(commaIndex + 1).trim();
  }
  
  return undefined;
}

// ========================
// Grouping & Hierarchy
// ========================

/**
 * Groups entries by ECO code and opening name, handling promotions
 */
function groupAndPromoteEntries(entries: ECOEntry[]): Map<string, GroupedEntry> {
  const groups = new Map<string, GroupedEntry>();

  // First pass: identify promoted variations
  const promotedVariations = new Set<string>();
  const promotedEntries: ECOEntry[] = [];

  for (const entry of entries) {
    if (shouldPromoteVariation(entry)) {
      const promotedKey = `${entry.eco}:${entry.variation}`;
      promotedVariations.add(promotedKey);
      promotedEntries.push(entry);
    }
  }

  // Second pass: group entries
  for (const entry of entries) {
    let groupKey: string;
    let courseName: string;
    
    // Normalize the opening name to detect parent-child relationships
    const normalizedOpening = normalizeOpeningName(entry.opening);
    const extractedVariation = extractVariationFromOpening(entry.opening);

    // Check if this entry should be promoted
    if (entry.variation && promotedVariations.has(`${entry.eco}:${entry.variation}`)) {
      // This is a promoted variation - create its own parent
      groupKey = `${entry.eco}:${entry.variation}`;
      courseName = getCourseName(entry, true);
    } else {
      // Regular grouping by ECO + Normalized Opening
      // This will group "Evans gambit declined, Lange variation" under "Evans gambit declined"
      groupKey = `${entry.eco}:${normalizedOpening}`;
      courseName = normalizedOpening;
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        eco: entry.eco,
        opening: courseName,
        entries: [],
      });
    }

    // Create a modified entry with the extracted variation if present
    const modifiedEntry = { ...entry };
    if (extractedVariation && !entry.variation) {
      // If the variation was embedded in the opening name, move it to the variation field
      modifiedEntry.variation = extractedVariation;
    }

    groups.get(groupKey)!.entries.push(modifiedEntry);
  }

  return groups;
}

/**
 * Finds the shortest move sequence (root moves) for a group
 */
function findShortestMoves(entries: ECOEntry[]): string {
  if (entries.length === 0) return "";

  // Sort by move count (ascending)
  const sorted = [...entries].sort((a, b) => a.plyCount - b.plyCount);
  const shortest = sorted[0];

  // Convert moves array to standard notation string
  return formatMovesAsString(shortest.moves);
}

/**
 * Formats moves array as a readable string (1. e4 e5 2. Nf3 Nc6 ...)
 */
function formatMovesAsString(moves: string[]): string {
  const formatted: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) {
      // White's move
      formatted.push(`${Math.floor(i / 2) + 1}. ${moves[i]}`);
    } else {
      // Black's move
      formatted.push(moves[i]);
    }
  }
  return formatted.join(" ");
}

/**
 * Deduplicates variations - removes promoted variations from their original parent
 */
function deduplicateVariations(
  groups: Map<string, GroupedEntry>,
  promotedKeys: Set<string>
): Map<string, GroupedEntry> {
  const deduplicated = new Map<string, GroupedEntry>();

  for (const [key, group] of groups) {
    // Filter out entries that were promoted to their own parent
    const filteredEntries = group.entries.filter((entry) => {
      if (!entry.variation) return true;

      const promotedKey = `${entry.eco}:${entry.variation}`;
      // Keep this entry only if it's not promoted OR if this IS the promoted group
      return !promotedKeys.has(promotedKey) || key === promotedKey;
    });

    if (filteredEntries.length > 0) {
      deduplicated.set(key, {
        ...group,
        entries: filteredEntries,
      });
    }
  }

  return deduplicated;
}

// ========================
// Course Generation
// ========================

/**
 * Generates the final course structure
 */
function generateCourses(groups: Map<string, GroupedEntry>): OpeningCourse[] {
  const courses: OpeningCourse[] = [];

  for (const [key, group] of groups) {
    // Find the shortest move sequence as root moves
    const rootMoves = findShortestMoves(group.entries);

    // Get the root move sequence for comparison
    const rootMoveArray = group.entries.find(
      (e) => formatMovesAsString(e.moves) === rootMoves
    )?.moves || [];

    // Build variations (excluding the root line)
    const variations: CourseVariation[] = [];
    const seenMoves = new Set<string>();
    seenMoves.add(rootMoves);

    for (const entry of group.entries) {
      const movesStr = formatMovesAsString(entry.moves);

      // Skip if this is the root line or already seen
      if (seenMoves.has(movesStr)) continue;
      seenMoves.add(movesStr);

      // Determine variation name
      let variationName = entry.variation || "Main line";

      // If the variation was extracted from the opening name, just use it directly
      // (no need to include the full opening name since we're already grouped properly)
      
      variations.push({
        name: variationName,
        moves: movesStr,
      });
    }

    courses.push({
      courseName: group.opening,
      eco: group.eco,
      rootMoves,
      variations,
    });
  }

  // Sort courses by ECO code
  courses.sort((a, b) => a.eco.localeCompare(b.eco));

  return courses;
}

/**
 * Merges hierarchical courses where one is a direct continuation of another
 * E.g., "Polish" (1.b4 Nh6) should be merged into "Polish (Sokolsky)" (1.b4)
 */
function mergeHierarchicalCourses(courses: OpeningCourse[]): OpeningCourse[] {
  const merged: OpeningCourse[] = [];
  const toSkip = new Set<number>();

  for (let i = 0; i < courses.length; i++) {
    if (toSkip.has(i)) continue;

    const parent = courses[i];
    const parentMoves = parseMoveString(parent.rootMoves);

    // Find all courses that are direct continuations of this parent
    const children: OpeningCourse[] = [];

    for (let j = 0; j < courses.length; j++) {
      if (i === j || toSkip.has(j)) continue;

      const child = courses[j];

      // Check if child is a direct continuation of parent
      if (
        child.eco === parent.eco && // Same ECO code
        isDirectContinuation(parentMoves, parseMoveString(child.rootMoves))
      ) {
        children.push(child);
        toSkip.add(j);
      }
    }

    // Merge children into parent as variations
    if (children.length > 0) {
      const mergedVariations = [...parent.variations];

      for (const child of children) {
        // Add the child's root line as a variation
        mergedVariations.push({
          name: child.courseName,
          moves: child.rootMoves,
        });

        // Add all of the child's variations
        for (const variation of child.variations) {
          mergedVariations.push(variation);
        }
      }

      merged.push({
        ...parent,
        variations: mergedVariations,
      });
    } else {
      merged.push(parent);
    }
  }

  return merged;
}

/**
 * Checks if childMoves is a direct continuation of parentMoves
 * E.g., [b4, Nh6] is a direct continuation of [b4]
 */
function isDirectContinuation(parentMoves: string[], childMoves: string[]): boolean {
  // Child must have more moves than parent
  if (childMoves.length <= parentMoves.length) return false;

  // All parent moves must match the beginning of child moves
  for (let i = 0; i < parentMoves.length; i++) {
    if (parentMoves[i] !== childMoves[i]) return false;
  }

  return true;
}

/**
 * Parses a formatted move string back into an array
 * E.g., "1. b4 Nh6" -> ["b4", "Nh6"]
 */
function parseMoveString(movesStr: string): string[] {
  return movesStr
    .replace(/\d+\.\s*/g, "")
    .split(/\s+/)
    .filter((m) => m.length > 0);
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
    console.error(`Please provide the path to eco.pgn as an argument.`);
    process.exit(1);
  }

  const pgnContent = fs.readFileSync(pgnPath, "utf-8");
  console.log(`Parsing ${pgnContent.length} bytes...`);

  // Step 1: Parse all entries
  const entries = parseECOPgn(pgnContent);
  console.log(`✓ Parsed ${entries.length} ECO entries`);

  // Step 2: Group and promote entries
  const groups = groupAndPromoteEntries(entries);
  console.log(`✓ Grouped into ${groups.size} opening courses (with promotions)`);

  // Step 3: Identify promoted variations for deduplication
  const promotedKeys = new Set<string>();
  for (const entry of entries) {
    if (shouldPromoteVariation(entry) && entry.variation) {
      promotedKeys.add(`${entry.eco}:${entry.variation}`);
    }
  }
  console.log(`✓ Promoted ${promotedKeys.size} variations to parent nodes`);

  // Step 4: Deduplicate
  const deduplicated = deduplicateVariations(groups, promotedKeys);
  console.log(`✓ Deduplicated variations`);

  // Step 5: Generate courses
  const courses = generateCourses(deduplicated);
  console.log(`✓ Generated ${courses.length} opening courses`);

  // Step 6: Merge hierarchical courses
  const mergedCourses = mergeHierarchicalCourses(courses);
  console.log(`✓ Merged hierarchical courses (${courses.length} → ${mergedCourses.length})`);

  // Output JSON
  const outputPath = path.join(process.cwd(), "opening-courses.json");
  fs.writeFileSync(outputPath, JSON.stringify(mergedCourses, null, 2));
  console.log(`\n✓ Written to: ${outputPath}`);

  // Show sample output
  console.log("\n=== Sample Output (first 3 courses) ===\n");
  console.log(JSON.stringify(mergedCourses.slice(0, 3), null, 2));

  // Show promoted examples
  console.log("\n=== Promoted Variations Examples ===\n");
  const promotedCourses = mergedCourses.filter((c) =>
    PROMOTION_KEYWORDS.some((kw) => c.courseName.toLowerCase().includes(kw))
  );
  console.log(JSON.stringify(promotedCourses.slice(0, 5), null, 2));

  console.log(`\n✓ Done! Full output saved to ${outputPath}`);
}

main().catch(console.error);

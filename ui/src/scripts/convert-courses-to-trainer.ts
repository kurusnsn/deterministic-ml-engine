/**
 * Opening Courses to Trainer Converter
 * 
 * Converts the opening-courses.json output from eco-hierarchy-parser.ts
 * into a format suitable for the opening trainer UI.
 * 
 * Usage: npx tsx src/scripts/convert-courses-to-trainer.ts
 */

import * as fs from "fs";
import * as path from "path";
import { Chess } from "chess.js";

// ========================
// Types
// ========================

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

interface TrainerOpening {
  id: string;
  name: string;
  eco: string;
  description: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  color: "white" | "black";
  isGambit: boolean;
  rootMoves: string[];
  fen: string;
  variationCount: number;
}

// ========================
// Configuration
// ========================

// Determine difficulty based on ECO code and characteristics
function determineDifficulty(course: OpeningCourse): "Beginner" | "Intermediate" | "Advanced" {
  const eco = course.eco;
  const name = course.courseName.toLowerCase();
  
  // Beginner openings
  if (
    name.includes("italian") ||
    name.includes("london") ||
    eco.startsWith("C5") && name.includes("italian")
  ) {
    return "Beginner";
  }
  
  // Advanced openings
  if (
    name.includes("sicilian") ||
    name.includes("king's indian") ||
    name.includes("nimzo") ||
    name.includes("grunfeld") ||
    eco.startsWith("B") && parseInt(eco.substring(1)) >= 20 && parseInt(eco.substring(1)) <= 99 // Sicilian range
  ) {
    return "Advanced";
  }
  
  // Default to Intermediate
  return "Intermediate";
}

// Determine color based on first move
function determineColor(rootMoves: string): "white" | "black" {
  const moves = parseMoveString(rootMoves);
  
  if (moves.length === 0) return "white";
  
  // If the opening starts with 1.e4, 1.d4, 1.c4, 1.Nf3, etc., it's a white opening
  // If it starts with a black response (odd number of moves), it's a black opening
  
  // Check if it's a response to white's first move
  const firstMove = moves[0].toLowerCase();
  
  // Common white openings
  if (
    firstMove === "e4" ||
    firstMove === "d4" ||
    firstMove === "c4" ||
    firstMove === "nf3" ||
    firstMove === "g3" ||
    firstMove === "b3" ||
    firstMove === "f4"
  ) {
    // If there are only 1-2 moves, it's white's opening
    if (moves.length <= 2) return "white";
    
    // If there are 3+ moves, check if it's a specific black defense
    if (moves.length >= 2) {
      const secondMove = moves[1].toLowerCase();
      // Common black responses
      if (
        secondMove === "c5" || // Sicilian
        secondMove === "e6" || // French
        secondMove === "c6" || // Caro-Kann
        secondMove === "nf6" || // Various defenses
        secondMove === "d5" // Various defenses
      ) {
        // If the sequence is longer, it might be a white system against black's defense
        return moves.length <= 3 ? "black" : "white";
      }
    }
    
    return "white";
  }
  
  return "white"; // Default
}

// Parse move string into array
function parseMoveString(movesStr: string): string[] {
  const moves: string[] = [];
  
  // Remove move numbers and split
  const tokens = movesStr
    .replace(/\d+\.\s*/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 0);
  
  return tokens;
}

// Convert move string to move array for chess.js
function convertToMoveArray(movesStr: string): string[] {
  const chess = new Chess();
  const moves: string[] = [];
  
  const tokens = parseMoveString(movesStr);
  
  for (const token of tokens) {
    try {
      const result = chess.move(token, { strict: false });
      if (result) {
        moves.push(result.san);
      }
    } catch {
      break;
    }
  }
  
  return moves;
}

// Compute FEN from moves
function computeFen(moves: string[]): string {
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

// Generate a slug ID from course name
function generateId(courseName: string): string {
  return courseName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Generate description
function generateDescription(course: OpeningCourse): string {
  const isGambit = course.courseName.toLowerCase().includes("gambit");
  const isAttack = course.courseName.toLowerCase().includes("attack");
  const isDefense = course.courseName.toLowerCase().includes("defense") || 
                    course.courseName.toLowerCase().includes("defence");
  
  if (isGambit) {
    return `A tactical gambit from the ${course.eco} family, sacrificing material for initiative.`;
  } else if (isAttack) {
    return `An aggressive attacking system from the ${course.eco} family.`;
  } else if (isDefense) {
    return `A solid defensive system from the ${course.eco} family.`;
  } else {
    return `A theoretical opening from the ${course.eco} family.`;
  }
}

// ========================
// Conversion
// ========================

function convertCoursesToTrainer(courses: OpeningCourse[]): TrainerOpening[] {
  const trainerOpenings: TrainerOpening[] = [];
  
  for (const course of courses) {
    const rootMoves = convertToMoveArray(course.rootMoves);
    
    if (rootMoves.length === 0) continue;
    
    const fen = computeFen(rootMoves);
    const isGambit = course.courseName.toLowerCase().includes("gambit");
    const color = determineColor(course.rootMoves);
    const difficulty = determineDifficulty(course);
    const id = generateId(course.courseName);
    const description = generateDescription(course);
    
    trainerOpenings.push({
      id,
      name: course.courseName,
      eco: course.eco,
      description,
      difficulty,
      color,
      isGambit,
      rootMoves,
      fen,
      variationCount: course.variations.length,
    });
  }
  
  return trainerOpenings;
}

// ========================
// Filtering & Grouping
// ========================

function filterSignificantOpenings(openings: TrainerOpening[]): TrainerOpening[] {
  // Filter criteria:
  // 1. Has at least 1 variation OR is a well-known opening
  // 2. Not too obscure (ECO codes A00 are often very rare)
  
  return openings.filter((opening) => {
    // Always include if it has variations
    if (opening.variationCount > 0) return true;
    
    // Include well-known openings even without variations
    const wellKnown = [
      "italian",
      "sicilian",
      "ruy-lopez",
      "french",
      "caro-kann",
      "queens-gambit",
      "kings-indian",
      "london",
      "scotch",
      "vienna",
      "english",
      "reti",
    ];
    
    if (wellKnown.some((name) => opening.id.includes(name))) {
      return true;
    }
    
    // Exclude very obscure A00 openings without variations
    if (opening.eco === "A00" && opening.variationCount === 0) {
      return false;
    }
    
    return true;
  });
}

// Group by ECO family
function groupByEcoFamily(openings: TrainerOpening[]): Record<string, TrainerOpening[]> {
  const groups: Record<string, TrainerOpening[]> = {
    "Flank Openings (A00-A39)": [],
    "English Opening (A10-A39)": [],
    "Semi-Open Games (B00-B99)": [],
    "Open Games (C00-C99)": [],
    "Closed Games (D00-D99)": [],
    "Indian Defenses (E00-E99)": [],
  };
  
  for (const opening of openings) {
    const ecoNum = parseInt(opening.eco.substring(1));
    const ecoLetter = opening.eco.charAt(0);
    
    if (ecoLetter === "A") {
      if (ecoNum >= 10 && ecoNum <= 39) {
        groups["English Opening (A10-A39)"].push(opening);
      } else {
        groups["Flank Openings (A00-A39)"].push(opening);
      }
    } else if (ecoLetter === "B") {
      groups["Semi-Open Games (B00-B99)"].push(opening);
    } else if (ecoLetter === "C") {
      groups["Open Games (C00-C99)"].push(opening);
    } else if (ecoLetter === "D") {
      groups["Closed Games (D00-D99)"].push(opening);
    } else if (ecoLetter === "E") {
      groups["Indian Defenses (E00-E99)"].push(opening);
    }
  }
  
  return groups;
}

// ========================
// Main
// ========================

async function main() {
  const coursesPath = path.join(process.cwd(), "opening-courses.json");
  
  console.log(`Reading opening courses from: ${coursesPath}`);
  
  if (!fs.existsSync(coursesPath)) {
    console.error(`File not found: ${coursesPath}`);
    console.error(`Please run eco-hierarchy-parser.ts first.`);
    process.exit(1);
  }
  
  const coursesContent = fs.readFileSync(coursesPath, "utf-8");
  const courses: OpeningCourse[] = JSON.parse(coursesContent);
  
  console.log(`Loaded ${courses.length} opening courses`);
  
  // Convert to trainer format
  const trainerOpenings = convertCoursesToTrainer(courses);
  console.log(`✓ Converted ${trainerOpenings.length} courses to trainer format`);
  
  // Filter significant openings
  const filtered = filterSignificantOpenings(trainerOpenings);
  console.log(`✓ Filtered to ${filtered.length} significant openings`);
  
  // Group by ECO family
  const grouped = groupByEcoFamily(filtered);
  
  // Write output
  const outputPath = path.join(process.cwd(), "trainer-openings.json");
  fs.writeFileSync(outputPath, JSON.stringify(filtered, null, 2));
  console.log(`\n✓ Written to: ${outputPath}`);
  
  // Write grouped output
  const groupedPath = path.join(process.cwd(), "trainer-openings-grouped.json");
  fs.writeFileSync(groupedPath, JSON.stringify(grouped, null, 2));
  console.log(`✓ Written grouped to: ${groupedPath}`);
  
  // Statistics
  console.log("\n=== Statistics ===");
  console.log(`Total openings: ${filtered.length}`);
  console.log(`\nBy difficulty:`);
  console.log(`  Beginner: ${filtered.filter((o) => o.difficulty === "Beginner").length}`);
  console.log(`  Intermediate: ${filtered.filter((o) => o.difficulty === "Intermediate").length}`);
  console.log(`  Advanced: ${filtered.filter((o) => o.difficulty === "Advanced").length}`);
  console.log(`\nBy color:`);
  console.log(`  White: ${filtered.filter((o) => o.color === "white").length}`);
  console.log(`  Black: ${filtered.filter((o) => o.color === "black").length}`);
  console.log(`\nGambits: ${filtered.filter((o) => o.isGambit).length}`);
  
  console.log("\n=== By ECO Family ===");
  for (const [family, openings] of Object.entries(grouped)) {
    if (openings.length > 0) {
      console.log(`${family}: ${openings.length} openings`);
    }
  }
  
  // Show sample
  console.log("\n=== Sample Openings ===");
  console.log(JSON.stringify(filtered.slice(0, 3), null, 2));
}

main().catch(console.error);

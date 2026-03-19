import fs from "fs";
import path from "path";
import { Chess } from "chess.js";
import Bottleneck from "bottleneck";
import {
  DEFAULT_START_FEN,
  OpeningMove,
  OpeningRoot,
  getMoves,
  getOpeningRoot,
} from "@/lib/opening/openingService";

export interface LineNode {
  move: string;
  san: string;
  uci?: string;
  fen: string;
  gameCount: number;
  winrate: number;
  depth: number;
  stopReason?: string;
}

export interface ForcingLineMetadata {
  mistake_move_index: number;
  punishment_move_index: number;
  gameCounts: number[];
  winrates: number[];
  forcingSide: "white" | "black";
  source: "lichess-db";
  type: "forcing";
}

export interface ForcingLine {
  id: string;
  name: string;
  moves: string[];
  metadata: ForcingLineMetadata;
}

export interface DebugPosition {
  fen: string;
  toMove: "w" | "b";
  moves: MoveStats[];
  stopReason?: string;
}

export interface DebugPayload {
  opening: OpeningRoot;
  positions: DebugPosition[];
  lines: ForcingLine[];
  generatedAt?: string;
}

interface MoveStats {
  san: string;
  uci: string;
  gameCount: number;
  whiteWinrate: number;
  blackWinrate: number;
  nextFen?: string;
}

interface GenerationContext {
  openingId: string;
  opening: OpeningRoot;
  forcingSide: "white" | "black";
  lineBudget: number;
  lines: ForcingLine[];
  debug?: DebugPosition[];
  visited: Set<string>;
}

export interface CachedOpeningLines {
  id: string;
  name: string;
  opening: string;
  generatedAt: string;
  lines: ForcingLine[];
}

// Filtering thresholds
const MIN_GAME_COUNT = 1000;
const MIN_FORCING_WINRATE = 55.0; // 55%
const STABLE_WINRATE_LOW = 45.0; // 45%
const STABLE_WINRATE_HIGH = 55.0; // 55%
const MAX_LINE_PLY = 14;
const SEARCH_PLY = 10;

// Rate limiting with Bottleneck
const explorerLimiter = new Bottleneck({
  minTime: 60, // ~16 rps
  maxConcurrent: 1,
});

const moveCache = new Map<string, OpeningMove[]>();
const CACHE_DIR = fs.existsSync(path.join(process.cwd(), "opening-db"))
  ? path.join(process.cwd(), "opening-db")
  : path.join(process.cwd(), "ui", "opening-db");

const safe = <T>(value: T | undefined | null): T | null =>
  value === undefined ? null : (value as T | null);
const safeNumber = (value: number | undefined | null): number => (typeof value === "number" ? value : 0);
const moveLabel = (move: OpeningMove): string =>
  move.san || move.uci || moveMoveToString(move) || "??";
const moveMoveToString = (move: OpeningMove): string => {
  if (move.san) return move.san;
  if (move.uci) return move.uci;
  return "";
};

const normalizeIdForCache = (openingId: string) => openingId.toLowerCase().replace(/[^a-z0-9]/g, "");
const cacheFilePath = (openingId: string) =>
  path.join(CACHE_DIR, `${normalizeIdForCache(openingId)}.json`);

export function loadCachedLines(openingId: string): CachedOpeningLines | null {
  try {
    // Try normalized path first (e.g., "ruylopez.json")
    const normalizedFile = cacheFilePath(openingId);
    if (fs.existsSync(normalizedFile)) {
      const raw = fs.readFileSync(normalizedFile, "utf8");
      return JSON.parse(raw) as CachedOpeningLines;
    }

    // Also try with original ID (preserving hyphens for ECO files like "ruy-lopez.json")
    const originalFile = path.join(CACHE_DIR, `${openingId.toLowerCase()}.json`);
    if (fs.existsSync(originalFile)) {
      const raw = fs.readFileSync(originalFile, "utf8");
      return JSON.parse(raw) as CachedOpeningLines;
    }

    return null;
  } catch (error) {
    console.error("Failed to read opening cache", { openingId, error });
    return null;
  }
}

function writeCachedLines(payload: CachedOpeningLines) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFilePath(payload.id), JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error("Failed to write opening cache", { openingId: payload.id, error });
  }
}

export async function generateForcingLines(openingId: string): Promise<ForcingLine[]> {
  const { lines } = await runGenerator(openingId, false);
  return lines;
}

export async function generateForcingLinesWithOpening(openingId: string): Promise<{
  opening: OpeningRoot;
  lines: ForcingLine[];
  generatedAt?: string;
}> {
  const payload = await runGenerator(openingId, false);
  return {
    opening: payload.opening,
    lines: payload.lines,
    generatedAt: payload.generatedAt,
  };
}

/**
 * Generate forcing lines from an OpeningRoot directly (for new system openings)
 * This allows generating lines for openings not in OPENING_DEFINITIONS
 */
export async function generateForcingLinesFromRoot(opening: OpeningRoot): Promise<{
  opening: OpeningRoot;
  lines: ForcingLine[];
  generatedAt?: string;
}> {
  // Check cache first
  const cached = loadCachedLines(opening.id);
  if (cached) {
    return {
      opening: {
        ...opening,
        name: cached.name ?? cached.opening ?? opening.name,
      },
      lines: cached.lines ?? [],
      generatedAt: cached.generatedAt,
    };
  }

  // Determine forcing side based on opening name/id and moves
  const forcingSide = determineForcingSide(opening.id, opening);
  const ctx: GenerationContext = {
    openingId: opening.id,
    opening,
    forcingSide,
    lineBudget: targetLineBudget(opening.id),
    lines: [],
    debug: undefined,
    visited: new Set<string>(),
  };

  await explorePosition(opening.fen, [], 0, ctx);

  const generatedAt = new Date().toISOString();

  // Cache the results
  writeCachedLines({
    id: opening.id,
    name: opening.name ?? opening.id,
    opening: opening.name ?? opening.id,
    generatedAt,
    lines: ctx.lines,
  });

  return {
    opening,
    lines: ctx.lines,
    generatedAt,
  };
}

export async function generateDebug(openingId: string): Promise<DebugPayload> {
  return runGenerator(openingId, true);
}

async function runGenerator(openingId: string, collectDebug: boolean): Promise<DebugPayload> {
  if (!collectDebug) {
    const cached = loadCachedLines(openingId);
    if (cached) {
      const cachedOpening: OpeningRoot = {
        id: openingId,
        name: cached.name ?? cached.opening ?? openingId,
        fen: DEFAULT_START_FEN,
      };
      return {
        opening: cachedOpening,
        positions: [],
        lines: cached.lines ?? [],
        generatedAt: cached.generatedAt,
      };
    }
  }

  const opening = await getOpeningRoot(openingId);
  if (opening.moves) {
    moveCache.set(opening.fen, opening.moves);
  }

  const forcingSide = determineForcingSide(openingId, opening);
  const ctx: GenerationContext = {
    openingId,
    opening,
    forcingSide,
    lineBudget: targetLineBudget(openingId),
    lines: [],
    debug: collectDebug ? [] : undefined,
    visited: new Set<string>(),
  };

  await explorePosition(opening.fen, [], 0, ctx);

  const generatedAt = new Date().toISOString();
  if (!collectDebug) {
    writeCachedLines({
      id: openingId,
      name: opening.name ?? openingId,
      opening: opening.name ?? openingId,
      generatedAt,
      lines: ctx.lines,
    });
  }

  return {
    opening,
    positions: ctx.debug ?? [],
    lines: ctx.lines,
    generatedAt,
  };
}

function determineForcingSide(openingId: string, opening?: OpeningRoot): "white" | "black" {
  const normalized = openingId.toLowerCase();

  // Black forcing openings (explicit list)
  if (normalized.includes("stafford")) return "black";
  if (normalized.includes("englund")) return "black";
  if (normalized.includes("shilling")) return "black";
  if (normalized.includes("queenstraps")) return "black";
  if (normalized.includes("italian-traps")) return "black";
  if (normalized.includes("sicilian")) return "black";
  if (normalized.includes("caro-kann")) return "black";
  if (normalized.includes("french")) return "black";
  if (normalized.includes("alekhine")) return "black";
  if (normalized.includes("scandinavian")) return "black";
  if (normalized.includes("pirc")) return "black";
  if (normalized.includes("modern")) return "black";
  if (normalized.includes("philidor")) return "black";
  if (normalized.includes("petrov")) return "black";

  // White forcing openings (explicit list)
  if (normalized.includes("vienna")) return "white";
  if (normalized.includes("danish")) return "white";
  if (normalized.includes("goring")) return "white";
  if (normalized.includes("evans")) return "white";
  if (normalized.includes("kings-gambit")) return "white";
  if (normalized.includes("smith-morra")) return "white";
  if (normalized.includes("queens-gambit")) return "white";

  // If we have opening moves, derive from them
  // Odd number of moves = White made last move = White's gambit
  // Even number of moves = Black made last move = Black's gambit
  if (opening?.openingMoves && opening.openingMoves.length > 0) {
    return opening.openingMoves.length % 2 === 1 ? "white" : "black";
  }

  // Default: assume white is forcing (for most gambits)
  return "white";
}

async function explorePosition(
  fen: string,
  prefix: LineNode[],
  ply: number,
  ctx: GenerationContext,
): Promise<void> {
  // Walk the tree along popular continuations to surface forcing opportunities
  if (ply >= SEARCH_PLY || ctx.lines.length >= ctx.lineBudget) {
    return;
  }

  if (ctx.visited.has(fen)) {
    return;
  }
  ctx.visited.add(fen);

  const moves = await loadMovesWithStats(fen, ctx);
  if (moves.length === 0) {
    if (ctx.debug) {
      const isWhiteToMove = parseActiveColor(fen) === "w";
      ctx.debug.push({ fen, toMove: isWhiteToMove ? "w" : "b", moves: [], stopReason: "no_moves" });
    }
    return;
  }

  const isWhiteToMove = parseActiveColor(fen) === "w";

  // Find moves that meet our filtering criteria
  const forcingMoves = moves.filter(move =>
    move.gameCount >= MIN_GAME_COUNT &&
    getWinrateForSide(move, ctx.forcingSide) >= MIN_FORCING_WINRATE
  );

  // Capture forcing opportunities from this node
  for (const move of forcingMoves) {
    if (!move.nextFen || ctx.lines.length >= ctx.lineBudget) {
      continue;
    }

    const label = move.san;
    const winrate = getWinrateForSide(move, ctx.forcingSide);

    const mistakeNode: LineNode = {
      move: label,
      san: label,
      uci: move.uci,
      fen: move.nextFen,
      gameCount: move.gameCount,
      winrate: winrate,
      depth: prefix.length,
    };

    const line = await buildForcingLine(prefix, mistakeNode, ctx);
    if (line) {
      ctx.lines.push(line);
    }

    if (ctx.lines.length >= ctx.lineBudget) {
      return;
    }
  }

  // Keep following the most popular moves to surface deeper opportunities
  const continuations = moves
    .filter(move => move.gameCount >= MIN_GAME_COUNT)
    .sort((a, b) => b.gameCount - a.gameCount)
    .slice(0, 2);

  for (const move of continuations) {
    if (!move.nextFen) continue;
    const label = move.san;
    const winrate = getWinrateForSide(move, ctx.forcingSide);

    const node: LineNode = {
      move: label,
      san: label,
      uci: move.uci,
      fen: move.nextFen,
      gameCount: move.gameCount,
      winrate: winrate,
      depth: prefix.length,
    };

    await explorePosition(move.nextFen, [...prefix, node], ply + 1, ctx);
    if (ctx.lines.length >= ctx.lineBudget) {
      return;
    }
  }
}

async function buildForcingLine(
  prefix: LineNode[],
  mistakeNode: LineNode,
  ctx: GenerationContext,
): Promise<ForcingLine | null> {
  // After identifying a promising move, find the best continuation
  const punisherPosition = mistakeNode.fen;
  const moves = await loadMovesWithStats(punisherPosition, ctx);

  if (moves.length === 0) {
    return null;
  }

  // Sort by game count and winrate for forcing side
  const sortedMoves = moves
    .filter(move => move.gameCount >= MIN_GAME_COUNT)
    .sort((a, b) => {
      const aWinrate = getWinrateForSide(a, ctx.forcingSide);
      const bWinrate = getWinrateForSide(b, ctx.forcingSide);
      return bWinrate - aWinrate;
    });

  const bestMove = sortedMoves[0];
  if (!bestMove || !bestMove.nextFen) {
    return null;
  }

  const bestWinrate = getWinrateForSide(bestMove, ctx.forcingSide);

  // Check if this is forcing enough
  if (bestWinrate < MIN_FORCING_WINRATE) {
    return null;
  }

  const punishmentLabel = bestMove.san;
  const punishmentNode: LineNode = {
    move: punishmentLabel,
    san: punishmentLabel,
    uci: bestMove.uci,
    fen: bestMove.nextFen,
    gameCount: bestMove.gameCount,
    winrate: bestWinrate,
    depth: prefix.length + 1,
  };

  const continuation = await expandLine(
    punishmentNode.fen,
    prefix.length + 2,
    ctx,
  );

  const nodes = [...prefix, mistakeNode, punishmentNode, ...continuation];
  const mistakeIndex = prefix.length;
  const punishmentIndex = mistakeIndex + 1;

  const gameCounts = nodes.map(node => node.gameCount);
  const winrates = nodes.map(node => node.winrate);

  return {
    id: buildLineId(ctx.openingId, nodes),
    name: buildLineName(ctx.opening.name, nodes),
    moves: nodes.map((node) => node.move),
    metadata: {
      mistake_move_index: mistakeIndex,
      punishment_move_index: punishmentIndex,
      gameCounts,
      winrates,
      forcingSide: ctx.forcingSide,
      source: "lichess-db",
      type: "forcing",
    },
  };
}

export async function expandLine(
  fen: string,
  depth: number,
  ctx: GenerationContext,
): Promise<LineNode[]> {
  // Extend a single branch while maintaining advantage
  if (depth >= MAX_LINE_PLY) {
    return [];
  }

  const moves = await loadMovesWithStats(fen, ctx);
  if (moves.length === 0) {
    return [];
  }

  // Sort by game count and winrate
  const sortedMoves = moves
    .filter(move => move.gameCount >= MIN_GAME_COUNT)
    .sort((a, b) => {
      const aWinrate = getWinrateForSide(a, ctx.forcingSide);
      const bWinrate = getWinrateForSide(b, ctx.forcingSide);
      return bWinrate - aWinrate;
    });

  const bestMove = sortedMoves[0];
  if (!bestMove || !bestMove.nextFen) {
    return [];
  }

  const winrate = getWinrateForSide(bestMove, ctx.forcingSide);

  // Stop if winrate stabilizes (falls into neutral range)
  if (winrate >= STABLE_WINRATE_LOW && winrate <= STABLE_WINRATE_HIGH) {
    return [];
  }

  // Stop if we don't have enough data
  if (bestMove.gameCount < MIN_GAME_COUNT) {
    return [];
  }

  const label = bestMove.san;
  const node: LineNode = {
    move: label,
    san: label,
    uci: bestMove.uci,
    fen: bestMove.nextFen,
    gameCount: bestMove.gameCount,
    winrate: winrate,
    depth,
  };

  if (depth + 1 >= MAX_LINE_PLY) {
    node.stopReason = "depth_limit";
    return [node];
  }

  const tail = await expandLine(bestMove.nextFen, depth + 1, ctx);

  // If we've stabilized, mark it
  if (tail.length === 0 && winrate >= STABLE_WINRATE_LOW && winrate <= STABLE_WINRATE_HIGH) {
    node.stopReason = "stable_winrate";
  }

  return [node, ...tail];
}

function getWinrateForSide(move: MoveStats, forcingSide: "white" | "black"): number {
  return forcingSide === "white" ? move.whiteWinrate : move.blackWinrate;
}

function targetLineBudget(openingId: string): number {
  const normalized = openingId.toLowerCase();
  if (normalized.includes("stafford")) return 70;
  if (normalized.includes("sicilian")) return 40;
  if (normalized.includes("italian")) return 20;
  if (normalized.includes("englund") || normalized.includes("shilling")) return 40;
  if (normalized.includes("petrov") || normalized.includes("petroff")) return 35;
  if (normalized.includes("london") || normalized.includes("quiet")) return 12;
  return 25;
}

async function loadMovesWithStats(fen: string, ctx?: GenerationContext): Promise<MoveStats[]> {
  const moves = await loadMoves(fen);

  return moves.map(move => {
    const gameCount = move.frequency; // frequency is total games (already calculated in openingService)
    // OpeningMove.winrate is white's winrate from 0-1, convert to percentage
    const whiteWinrate = move.winrate * 100;
    const blackWinrate = (1 - move.winrate) * 100;

    return {
      san: move.san,
      uci: move.uci,
      gameCount,
      whiteWinrate,
      blackWinrate,
      nextFen: move.nextFen,
    };
  });
}

async function loadMoves(fen: string): Promise<OpeningMove[]> {
  if (moveCache.has(fen)) {
    return moveCache.get(fen)!;
  }

  // Wrap in rate limiter
  const moves = await explorerLimiter.schedule(() => getMoves(fen));
  moveCache.set(fen, moves);
  return moves;
}

function parseActiveColor(fen: string): "w" | "b" {
  const parts = fen.split(" ");
  return parts[1] === "b" ? "b" : "w";
}

function buildLineId(openingId: string, nodes: LineNode[]): string {
  const stem = nodes
    .map((node) => node.move.replace(/[^\w]+/g, "-").toLowerCase())
    .slice(0, 6)
    .join("-");
  const suffix = Math.abs(hashString(nodes.map((node) => node.move).join("-"))).toString(36);
  return `${openingId}-${stem}-${suffix}`;
}

function buildLineName(openingName: string, nodes: LineNode[]): string {
  const tag = nodes[0]?.move.replace(/[?!]/g, "") ?? "line";
  return `${openingName}: ${tag} Forcing Line`;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

import * as ort from "onnxruntime-web";
import { Chess, Square } from "chess.js";

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === 'true';

let session: ort.InferenceSession | null = null;
let moveList: string[] = [];
let isLoading = false;
let loadingPromise: Promise<void> | null = null;

/**
 * Check if Maia is ready to play.
 */
export function isMaiaReady(): boolean {
  return session !== null && moveList.length > 0;
}

/**
 * Check if Maia is currently loading.
 */
export function isMaiaLoading(): boolean {
  return isLoading;
}

/**
 * Initialize Maia ONNX session + load move list.
 * Returns a promise that resolves when Maia is ready.
 * Safe to call multiple times - will return existing promise if already loading.
 */
export async function initMaia(onProgress?: (loaded: number, total: number) => void): Promise<void> {
  // Already loaded
  if (session && moveList.length > 0) {
    return;
  }

  // Already loading - return existing promise
  if (loadingPromise) {
    return loadingPromise;
  }

  isLoading = true;

  loadingPromise = (async () => {
    try {
      if (DEBUG) console.log("Loading Maia ONNX model...");

      // Set ONNX log level to suppress warnings (3 = Error only, 4 = Fatal only)
      ort.env.logLevel = 'error';

      const MODEL_URL = "/maia2-rapid.onnx";
      const CACHE_NAME = "maia-model-cache-v1";

      let modelBuffer: ArrayBuffer;

      // Try to get from cache first
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(MODEL_URL);

      if (cachedResponse) {
        if (DEBUG) console.log("Loading Maia from cache...");
        // Load from cache (instant)
        modelBuffer = await cachedResponse.arrayBuffer();
        onProgress?.(modelBuffer.byteLength, modelBuffer.byteLength);
      } else {
        if (DEBUG) console.log("Downloading Maia model...");
        // Fetch with progress tracking
        const modelResponse = await fetch(MODEL_URL);
        const contentLength = modelResponse.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 93249030;

        if (modelResponse.body) {
          const reader = modelResponse.body.getReader();
          const chunks: Uint8Array[] = [];
          let loaded = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            onProgress?.(loaded, total);
          }

          // Combine chunks into single ArrayBuffer
          const buffer = new Uint8Array(loaded);
          let offset = 0;
          for (const chunk of chunks) {
            buffer.set(chunk, offset);
            offset += chunk.length;
          }
          modelBuffer = buffer.buffer;

          // Cache for next time
          try {
            const responseToCache = new Response(buffer, {
              headers: { 'Content-Type': 'application/octet-stream' }
            });
            await cache.put(MODEL_URL, responseToCache);
            if (DEBUG) console.log("Maia model cached for future use");
          } catch (cacheError) {
            console.warn("Failed to cache Maia model:", cacheError);
          }
        } else {
          // Fallback if streaming not supported
          const response = await fetch(MODEL_URL);
          modelBuffer = await response.arrayBuffer();
        }
      }

      session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: ["webgpu", "wasm"],
        logSeverityLevel: 3,
      });

      if (DEBUG) console.log("Maia model loaded");
      if (DEBUG) console.log("Input names:", session.inputNames);
      if (DEBUG) console.log("Output names:", session.outputNames);

      const resp = await fetch("/uci_labels.json");
      moveList = await resp.json();
      if (DEBUG) console.log(` Loaded ${moveList.length} moves from uci_labels.json`);
    } finally {
      isLoading = false;
    }
  })();

  return loadingPromise;
}

/**
 * Map Elo (1100/1500/1900) to category index Maia-2 expects.
 * Buckets: <1100 = 0, 1100–1199 = 1, …, >=2000 = 10.
 */
function mapEloToCategory(elo: number): number {
  let category;
  if (elo < 1100) category = 0;
  else if (elo >= 2000) category = 10;
  else category = Math.floor((elo - 1100) / 100) + 1;

  if (DEBUG) console.log(`ELO ${elo} mapped to category ${category}`);
  return category;
}

/**
 * Mirror a chess position for black-to-move positions.
 */
function mirrorPosition(fen: string): string {
  const parts = fen.split(" ");
  const board = parts[0];
  const turn = parts[1];
  const castling = parts[2];
  const enPassant = parts[3];
  const halfmove = parts[4];
  const fullmove = parts[5];

  // Flip ranks
  const ranks = board.split("/");
  const flippedRanks = ranks.reverse();

  // Swap colors
  const swappedRanks = flippedRanks.map((rank) =>
    rank
      .split("")
      .map((c) =>
        c >= "A" && c <= "Z"
          ? c.toLowerCase()
          : c >= "a" && c <= "z"
            ? c.toUpperCase()
            : c
      )
      .join("")
  );

  const newBoard = swappedRanks.join("/");

  // Flip turn
  const newTurn = turn === "w" ? "b" : "w";

  // Mirror castling rights
  let newCastling = "";
  if (castling.includes("k")) newCastling += "K";
  if (castling.includes("q")) newCastling += "Q";
  if (castling.includes("K")) newCastling += "k";
  if (castling.includes("Q")) newCastling += "q";
  if (newCastling === "") newCastling = "-";

  // Mirror en passant
  let newEnPassant = "-";
  if (enPassant !== "-") {
    const file = enPassant[0];
    const rank = parseInt(enPassant[1], 10);
    const newRank = 9 - rank;
    newEnPassant = file + newRank;
  }

  return `${newBoard} ${newTurn} ${newCastling} ${newEnPassant} ${halfmove} ${fullmove}`;
}

/**
 * Mirror a UCI move (when we mirrored the board).
 */
function mirrorMove(moveUci: string): string {
  if (moveUci.length < 4) return moveUci;
  const fromFile = moveUci[0];
  const fromRank = parseInt(moveUci[1]);
  const toFile = moveUci[2];
  const toRank = parseInt(moveUci[3]);
  const promo = moveUci.length > 4 ? moveUci[4] : "";
  return `${fromFile}${9 - fromRank}${toFile}${9 - toRank}${promo}`;
}

/**
 * Encode a FEN string into a [1, 18, 8, 8] tensor for Maia-2.
 */
function fenToTensor(fen: string): ort.Tensor {
  const isBlackToMove = fen.split(" ")[1] === "b";
  let workingFen = fen;

  if (isBlackToMove) {
    workingFen = mirrorPosition(fen);
    if (DEBUG) console.log(" Mirrored FEN for Black:", workingFen);
  }

  if (DEBUG) console.log(" Encoding FEN:", fen, "→ Working FEN:", workingFen);

  const planes = new Float32Array(18 * 8 * 8);
  const game = new Chess(workingFen);

  // Channels 0-5: WHITE pieces, Channels 6-11: BLACK pieces
  const pieceTypeToIndex: Record<string, number> = {
    P: 0,
    N: 1,
    B: 2,
    R: 3,
    Q: 4,
    K: 5, // WHITE pieces (0-5)
    p: 6,
    n: 7,
    b: 8,
    r: 9,
    q: 10,
    k: 11, // BLACK pieces (6-11)
  };

  //iterate through all 64 squares
  for (let square = 0; square < 64; square++) {
    const rank = Math.floor(square / 8); // 0-7 (rank 1-8)
    const file = square % 8; // 0-7 (files a-h)

    // Convert to algebraic notation
    const algebraic = String.fromCharCode(97 + file) + (rank + 1);
    const piece = game.get(algebraic as Square);

    if (piece) {
      const pieceKey =
        piece.color === "w" ? piece.type.toUpperCase() : piece.type;
      const planeIndex = pieceTypeToIndex[pieceKey];

      if (planeIndex !== undefined) {
        const tensorIndex = planeIndex * 64 + rank * 8 + file;
        planes[tensorIndex] = 1.0;
      }
    }
  }

  // Turn plane: 1 for WHITE to move (after mirroring, always WHITE)
  const turnPlaneStart = 12 * 64;
  for (let i = turnPlaneStart; i < turnPlaneStart + 64; i++) {
    planes[i] = 1.0;
  }

  // Castling rights channels (13-16)
  const fenParts = workingFen.split(" ");
  const castlingRights = fenParts[2] || "";

  // White kingside castling (13)
  if (castlingRights.includes("K")) {
    for (let i = 13 * 64; i < 14 * 64; i++) {
      planes[i] = 1.0;
    }
  }

  // White queenside castling (14)
  if (castlingRights.includes("Q")) {
    for (let i = 14 * 64; i < 15 * 64; i++) {
      planes[i] = 1.0;
    }
  }

  // Black kingside castling (15)
  if (castlingRights.includes("k")) {
    for (let i = 15 * 64; i < 16 * 64; i++) {
      planes[i] = 1.0;
    }
  }

  // Black queenside castling (16)
  if (castlingRights.includes("q")) {
    for (let i = 16 * 64; i < 17 * 64; i++) {
      planes[i] = 1.0;
    }
  }

  // En passant target square (17)
  const epSquare = fenParts[3];
  if (epSquare && epSquare !== "-") {
    const file = epSquare.charCodeAt(0) - "a".charCodeAt(0);
    const rank = parseInt(epSquare[1], 10) - 1;
    const tensorIndex = 17 * 64 + rank * 8 + file;
    planes[tensorIndex] = 1.0;
  }

  // Debug output
  if (DEBUG) console.log(" Turn:", game.turn());
  if (DEBUG) console.log(
    " WHITE pawns (channel 0, rank 2):",
    Array.from(planes.slice(8, 16))
  );
  if (DEBUG) console.log(
    " BLACK pawns (channel 6, rank 7):",
    Array.from(planes.slice(6 * 64 + 6 * 8, 6 * 64 + 7 * 8))
  );
  if (DEBUG) console.log(
    " Turn plane (always 1 after mirroring):",
    Array.from(planes.slice(12 * 64, 12 * 64 + 8))
  );

  return new ort.Tensor("float32", planes, [1, 18, 8, 8]);
}

/**
 * Sample from a probability distribution using temperature scaling.
 * @param probs - Array of probabilities
 * @param temperature - Temperature parameter (0 = deterministic, higher = more random)
 * @returns Selected index
 */
function sampleWithTemperature(probs: number[], temperature: number): number {
  if (temperature === 0 || probs.length === 0) {
    // Deterministic: return argmax
    let maxIdx = 0;
    let maxProb = probs[0];
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > maxProb) {
        maxProb = probs[i];
        maxIdx = i;
      }
    }
    return maxIdx;
  }

  // Apply temperature scaling
  const scaledProbs = probs.map(p => Math.pow(p, 1 / temperature));

  // Normalize
  const sum = scaledProbs.reduce((a, b) => a + b, 0);
  const normalized = scaledProbs.map(p => p / sum);

  // Sample using cumulative distribution
  const rand = Math.random();
  let cumulative = 0;
  for (let i = 0; i < normalized.length; i++) {
    cumulative += normalized[i];
    if (rand < cumulative) {
      return i;
    }
  }

  // Fallback (shouldn't happen due to floating point)
  return normalized.length - 1;
}

/**
 * Get Maia's move given a FEN + Elo setting.
 * @param fen - Chess position in FEN notation
 * @param elo - ELO rating (1100, 1500, or 1900)
 * @param temperature - Temperature for move selection (default: 0.8)
 *                      0.0 = deterministic (always best move)
 *                      1.0 = sample proportionally to probabilities
 *                      >1.0 = more random/exploratory
 */
export async function getMaiaMove(
  fen: string,
  elo: number,
  temperature: number = 0.8
): Promise<string | null> {
  if (!session) throw new Error("Maia not initialized");
  if (moveList.length === 0) throw new Error("Move list not loaded");

  const isBlackToMove = fen.split(" ")[1] === "b";

  try {
    const inputTensor = fenToTensor(fen);

    const cat = mapEloToCategory(elo);
    const eloSelf = new ort.Tensor("int64", BigInt64Array.from([BigInt(cat)]), [
      1,
    ]);
    const eloOppo = new ort.Tensor("int64", BigInt64Array.from([BigInt(cat)]), [
      1,
    ]);

    const results = await session.run({
      boards: inputTensor,
      elos_self: eloSelf,
      elos_oppo: eloOppo,
    });

    const probs = results["policy"].data as Float32Array;

    // Get legal moves
    const game = new Chess(fen);
    let legal = game
      .moves({ verbose: true })
      .map((m) => m.from + m.to + (m.promotion || ""));

    // Mirror legal moves if position was mirrored
    if (isBlackToMove) {
      legal = legal.map(mirrorMove);
    }

    // Build array of legal move probabilities
    const legalMoveIndices: number[] = [];
    const legalMoveProbs: number[] = [];

    for (let i = 0; i < probs.length; i++) {
      const move = moveList[i];
      if (legal.includes(move)) {
        legalMoveIndices.push(i);
        legalMoveProbs.push(probs[i]);
      }
    }

    if (legalMoveIndices.length === 0) {
      if (DEBUG) console.error("No legal moves found!");
      return null;
    }

    // Sample move using temperature
    const selectedIdx = sampleWithTemperature(legalMoveProbs, temperature);
    let bestMove = moveList[legalMoveIndices[selectedIdx]];
    const selectedProb = legalMoveProbs[selectedIdx];

    // Mirror move back 
    if (bestMove && isBlackToMove) {
      bestMove = mirrorMove(bestMove);
    }

    if (DEBUG) console.log(" Maia chosen move:", bestMove, "prob:", selectedProb.toFixed(4), "temp:", temperature);
    return bestMove;
  } catch (error) {
    if (DEBUG) console.error("Error in getMaiaMove:", error);
    return null;
  }
}

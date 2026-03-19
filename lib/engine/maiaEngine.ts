import * as ort from "onnxruntime-web";
import { Chess, Square } from "chess.js";

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === 'true';

let session: ort.InferenceSession | null = null;
let moveList: string[] = [];

/**
 * Initialize Maia ONNX session + load move list.
 */
export async function initMaia() {
  if (!session) {
    if (DEBUG) console.log("Loading Maia ONNX model...");

    // Set ONNX log level to suppress warnings (3 = Error only, 4 = Fatal only)
    ort.env.logLevel = 'error';

    session = await ort.InferenceSession.create("/maia2-rapid.onnx", {
      executionProviders: ["webgpu", "wasm"], // fallback if WebGPU not available
      logSeverityLevel: 3, // suppress warning-level ORT logs in the console
    });
    if (DEBUG) console.log("Maia model loaded");
    if (DEBUG) console.log("Input names:", session.inputNames);
    if (DEBUG) console.log("Output names:", session.outputNames);

    const resp = await fetch("/uci_labels.json");
    moveList = await resp.json();
    if (DEBUG) console.log(` Loaded ${moveList.length} moves from uci_labels.json`);
  }
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
 * Get Maia's move given a FEN + Elo setting.
 */
export async function getMaiaMove(
  fen: string,
  elo: number
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

    // Find best legal move
    let bestMove: string | null = null;
    let bestProb = -Infinity;

    for (let i = 0; i < probs.length; i++) {
      const move = moveList[i];
      if (legal.includes(move) && probs[i] > bestProb) {
        bestMove = move;
        bestProb = probs[i];
      }
    }

    // Mirror move back 
    if (bestMove && isBlackToMove) {
      bestMove = mirrorMove(bestMove);
    }

    if (DEBUG) console.log(" Maia chosen move:", bestMove, "prob:", bestProb.toFixed(4));
    return bestMove;
  } catch (error) {
    if (DEBUG) console.error("Error in getMaiaMove:", error);
    return null;
  }
}

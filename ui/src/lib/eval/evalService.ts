const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "/api/gateway";

export async function evaluate(fen: string): Promise<{ score: number; bestMove?: string }> {
  // Use the gateway which proxies to stockfish and provides ECO data
  const res = await fetch(`${GATEWAY_URL}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ fen, depth: 12, multipv: 1 }),
  });

  if (!res.ok) {
    throw new Error(`Eval service responded with ${res.status} for fen ${fen}`);
  }

  const payload = await res.json();

  // Gateway returns { stockfish: { ... }, eco: { ... } }
  const sfResult = payload?.stockfish;

  if (sfResult?.error) {
    throw new Error(`Stockfish error: ${sfResult.error}`);
  }

  // Extract score from Stockfish response
  const bestScore = sfResult?.best_score;

  if (typeof bestScore !== "number" || Number.isNaN(bestScore)) {
    throw new Error("Eval service returned an invalid payload");
  }

  // Get best move from first analysis entry if available
  const bestMove = sfResult?.analysis?.[0]?.move;

  // Convert centipawns to pawns (divide by 100)
  return {
    score: bestScore / 100,
    bestMove: bestMove
  };
}

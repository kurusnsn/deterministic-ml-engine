const API_URL = (process.env.NEXT_PUBLIC_PUZZLE_API_URL || "/api/gateway").replace(/\/$/, "");
const PUZZLE_BASE = API_URL.endsWith("/api/gateway")
  ? `${API_URL}/puzzles`
  : `${API_URL}/puzzle`;

function extractErrorMessage(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value) return null;

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => extractErrorMessage(item))
      .filter((part): part is string => Boolean(part && part.trim()));
    return parts.length > 0 ? parts.join("; ") : null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const nested = [
      record.detail,
      record.message,
      record.error,
      record.msg,
    ];
    for (const entry of nested) {
      const message = extractErrorMessage(entry);
      if (message) return message;
    }

    const serialized = JSON.stringify(record);
    return serialized && serialized !== "{}" ? serialized : null;
  }

  return null;
}

async function getResponseErrorMessage(res: Response, fallback: string): Promise<string> {
  let payload: unknown = null;
  const contentType = res.headers.get("content-type")?.toLowerCase() || "";

  if (contentType.includes("application/json")) {
    payload = await res.json().catch(() => null);
  } else {
    const text = await res.text().catch(() => "");
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
  }

  return (
    extractErrorMessage(payload) ||
    `${fallback}${res.status ? ` (HTTP ${res.status})` : ""}`
  );
}

export type PuzzleMode = "theme" | "repertoire" | "random";

export type PuzzleResponse = {
  id: string;
  fen: string;
  moves: string[];
  rating?: number;
  rating_deviation?: number;
  popularity?: number;
  nb_plays?: number;
  themes?: string[];
  game_url?: string;
  opening_tags?: string[];
  eco?: string;
  opening?: string;
  variation?: string;
};

export type PuzzleSubmitPayload = {
  user_id: string;
  puzzle_id: string;
  correct: boolean;
  time_spent: number;
};

export type PuzzleSubmitResponse = {
  new_rating: number;
  delta: number;
};

export type PuzzleUserResponse = {
  user_id: string;
  rating: number;
  puzzles_done: number;
  streak: number;
};

export async function getNextPuzzle(mode: PuzzleMode, rating: number, filters?: { themes?: string[]; ecos?: string[]; user_id?: string }) {
  const params = new URLSearchParams({
    mode,
    rating: rating.toString(),
  });

  if (filters?.user_id) {
    params.append("user_id", filters.user_id);
  }

  if (mode === "theme" && filters?.themes) {
    filters.themes.forEach((theme) => params.append("themes", theme));
  }

  if (mode === "repertoire" && filters?.ecos) {
    filters.ecos.forEach((eco) => params.append("ecos", eco));
  }

  const res = await fetch(`${PUZZLE_BASE}/next?${params.toString()}`, {
    cache: "no-cache",
  });
  if (!res.ok) {
    throw new Error(await getResponseErrorMessage(res, "Failed to fetch puzzle"));
  }
  return (await res.json()) as PuzzleResponse;
}

export async function submitPuzzleResult(data: PuzzleSubmitPayload) {
  const res = await fetch(`${PUZZLE_BASE}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(await getResponseErrorMessage(res, "Failed to submit puzzle result"));
  }
  return (await res.json()) as PuzzleSubmitResponse;
}

export async function getUserRating(user_id: string) {
  const res = await fetch(`${PUZZLE_BASE}/user/${user_id}`, {
    cache: "no-cache",
  });
  if (!res.ok) {
    throw new Error(await getResponseErrorMessage(res, "Failed to fetch puzzle user stats"));
  }
  return (await res.json()) as PuzzleUserResponse;
}

export async function getPuzzleById(puzzle_id: string): Promise<PuzzleResponse> {
  const res = await fetch(`${PUZZLE_BASE}/${puzzle_id}`, {
    cache: "no-cache",
  });
  if (!res.ok) {
    throw new Error(await getResponseErrorMessage(res, "Puzzle not found"));
  }
  return (await res.json()) as PuzzleResponse;
}

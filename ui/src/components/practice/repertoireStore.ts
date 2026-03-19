export type Line = string[]; // SAN moves sequence, e.g., ["e4","e5","Nf3"]
export interface OpeningRef { eco?: string | null; name: string }

export interface Repertoire {
  id: string; // uuid-ish
  name: string;
  side: "white" | "black";
  lines: Line[];
  createdAt: number;
  openings?: OpeningRef[]; // optional list of chosen openings (by name/ECO)
}

const KEY = "practice.repertoires";

function normalizeSide(side: unknown): "white" | "black" {
  return side === "black" ? "black" : "white";
}

function loadAll(): Repertoire[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];

    return arr.map((item: any) => ({
      id: item?.id ?? "",
      name: item?.name ?? "Unnamed Repertoire",
      side: normalizeSide(item?.side),
      lines: Array.isArray(item?.lines) ? item.lines : [],
      createdAt: item?.createdAt ?? Date.now(),
      openings: Array.isArray(item?.openings) ? item.openings : undefined,
    }));
  } catch {
    return [];
  }
}

function saveAll(items: Repertoire[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function listRepertoires(): Repertoire[] {
  return loadAll();
}

export function getRepertoire(id: string): Repertoire | undefined {
  return loadAll().find((r) => r.id === id);
}

export function createRepertoire(input: Omit<Repertoire, "id" | "createdAt">): Repertoire {
  const rep: Repertoire = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
    createdAt: Date.now(),
    ...input,
  };
  const all = loadAll();
  all.push(rep);
  saveAll(all);
  return rep;
}

export function updateRepertoire(rep: Repertoire) {
  const all = loadAll();
  const idx = all.findIndex((r) => r.id === rep.id);
  if (idx >= 0) {
    all[idx] = rep;
    saveAll(all);
  }
}

export function removeRepertoire(id: string) {
  const all = loadAll().filter((r) => r.id !== id);
  saveAll(all);
}

export function appendToRepertoire(id: string, newLines: string[][], newOpenings?: OpeningRef[]) {
  const all = loadAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx >= 0) {
    const rep = all[idx];
    // Merge lines - avoid duplicates
    const existingLinesSet = new Set(rep.lines.map(line => line.join("|")));
    const linesToAdd = newLines.filter(line => !existingLinesSet.has(line.join("|")));
    rep.lines = [...rep.lines, ...linesToAdd];

    // Merge openings if provided
    if (newOpenings && newOpenings.length > 0) {
      const existingOpeningsSet = new Set(rep.openings?.map(o => o.name) || []);
      const openingsToAdd = newOpenings.filter(o => !existingOpeningsSet.has(o.name));
      rep.openings = [...(rep.openings || []), ...openingsToAdd];
    }

    all[idx] = rep;
    saveAll(all);
    return rep;
  }
  return null;
}

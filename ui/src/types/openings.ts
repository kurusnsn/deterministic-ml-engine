export interface Opening {
  id: string;
  name: string;
  description: string;
  difficulty?: "Beginner" | "Intermediate" | "Advanced";
  color?: "white" | "black";
  /** Source of the opening data: "eco" for ECO-imported, "gambit" for gambit builder */
  source?: "eco" | "gambit";
}

export interface OpeningSystem {
  id: string;
  familyId: string;
  name: string;
  ecoCodes: string[];
  type: "forcing" | "neutral" | "semi-forcing";
  canonicalMoves: string[];
  fen: string;
  perspective?: "white" | "black";
  lineCount?: number;
  popularity?: number;
  /** Average winrate for the forcing side (0–100). Only present for Lichess-sourced entries. */
  avgWinrate?: number;
  /** Data origin — "opening-db" for entries from the local opening-db/ cache */
  source?: "opening-db" | string;
}


export interface OpeningFamily {
  id: string;
  name: string;
  ecoCodes: string[];
  systems: string[]; // system IDs
}

export interface ForcingLineMetadata {
  mistake_move_index: number;
  punishment_move_index: number;
  eval_start?: number;
  eval_end?: number;
  gameCounts?: number[];
  winrates?: number[];
  forcingSide?: "white" | "black";
  source?: "lichess-db" | string;
  type: "forcing" | "trap";
}

export interface ForcingLine {
  id: string;
  name: string;
  moves: string[];
  description?: string;
  metadata?: ForcingLineMetadata;
}

export interface OpeningsResponse {
  openings: Opening[];
}

export interface OpeningLinesResponse {
  opening: string;
  lines: ForcingLine[];
  generatedAt?: string;
}

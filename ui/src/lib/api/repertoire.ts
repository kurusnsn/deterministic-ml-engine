// API functions for repertoire analysis

import { RepertoireReport, RepertoireAnalysisRequest, SavedReport, OpeningStats, SaveRepertoireRequest, SavedRepertoire, GameAnalysisResponse } from '@/types/repertoire';
import { getClientAuthHeaders } from '@/lib/auth';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway';

// Helper function to get auth headers (works without login by using session cookie)
export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  return getClientAuthHeaders();
};

// Generate new repertoire analysis
export async function generateRepertoireAnalysis(
  request: RepertoireAnalysisRequest
): Promise<RepertoireReport> {
  const response = await fetch(`${GATEWAY_URL}/analysis/repertoire`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let errorText = '';
    try {
      const errorData = await response.json();
      errorText = errorData.detail || errorData.message || JSON.stringify(errorData);
    } catch {
      errorText = await response.text().catch(() => 'Unknown error');
    }

    throw new Error(errorText || `HTTP ${response.status} - ${response.statusText}`);
  }

  return response.json();
}

// Get saved repertoire reports list
export async function getSavedReports(players?: string[], limit: number = 50, offset: number = 0): Promise<SavedReport[]> {
  const params = new URLSearchParams();
  if (players && players.length > 0) {
    params.append('players', players.join(','));
  }
  params.append('limit', limit.toString());
  params.append('offset', offset.toString());

  const url = `${GATEWAY_URL}/analysis/reports?${params}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.reports || [];
}

// Get specific saved report
export async function getSavedReport(reportId: string, lite: boolean = false): Promise<RepertoireReport> {
  const url = lite
    ? `${GATEWAY_URL}/analysis/reports/${reportId}?lite=true`
    : `${GATEWAY_URL}/analysis/reports/${reportId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// Get heavy fields for lazy loading (engine_analysis, generated_puzzles, weak_lines, charts_additional)
export async function getReportHeavyFields(
  reportId: string,
  fields: string[] = ['engine_analysis', 'generated_puzzles', 'weak_lines', 'charts_additional']
): Promise<Partial<RepertoireReport>> {
  const fieldsParam = fields.join(',');
  const response = await fetch(`${GATEWAY_URL}/analysis/reports/${reportId}/heavy?fields=${fieldsParam}`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}


// Save repertoire report
export async function saveRepertoireReport(
  report: RepertoireReport,
  name: string,
  sourceUsernames?: string[],
  timeControl?: string
): Promise<SavedReport> {
  const response = await fetch(`${GATEWAY_URL}/analysis/reports`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      name,
      report_data: report,
      source_usernames: sourceUsernames || [],
      time_control: timeControl,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// Delete saved report
export async function deleteSavedReport(reportId: string): Promise<void> {
  const response = await fetch(`${GATEWAY_URL}/analysis/reports/${reportId}`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
}

// Get basic opening statistics
export async function getOpeningStatistics(
  color?: 'white' | 'black',
  minGames: number = 3
): Promise<{ openings: OpeningStats[]; total_games: number; white_games: number; black_games: number }> {
  const params = new URLSearchParams({
    min_games: minGames.toString(),
  });

  if (color) {
    params.append('color', color);
  }

  const response = await fetch(`${GATEWAY_URL}/analysis/openings?${params}`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// Saved Puzzles API
export interface SavedPuzzle {
  id: string; // DB ID
  puzzle_id: string;
  fen: string;
  side_to_move: 'white' | 'black';
  best_move: string;
  mistake_move: string;
  theme: string[];
  mistake_type: string;
  eco?: string;
  move_number?: number;
  source_report_id?: string;
  source_report_name?: string;
  time_control?: string;
  repertoire_type?: string;
  created_at?: string;
}

export interface SavedPuzzlesResponse {
  puzzles: SavedPuzzle[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export async function getSavedPuzzles(limit = 50, offset = 0): Promise<SavedPuzzlesResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
  });
  const response = await fetch(`${GATEWAY_URL}/profile/puzzles?${params}`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  // Map backend 'themes' to frontend 'theme'
  const puzzles = data.puzzles.map((p: any) => ({
    ...p,
    theme: p.themes || [],
    eco: p.eco || p.eco_code,
  }));
  return {
    puzzles,
    total: data.total ?? puzzles.length,
    limit: data.limit ?? limit,
    offset: data.offset ?? offset,
    has_more: data.has_more ?? false,
  };
}

export async function deleteSavedPuzzle(puzzleDbId: string): Promise<void> {
  const response = await fetch(`${GATEWAY_URL}/profile/puzzles/${puzzleDbId}`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

export async function saveRepertoire(data: SaveRepertoireRequest): Promise<SavedRepertoire> {
  const response = await fetch(`${GATEWAY_URL}/repertoires`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

// Game Analysis API (Accuracy & Elo Estimation)
export interface AnalyzeGameRequest {
  pgn: string;
  white_elo?: number;
  black_elo?: number;
  depth?: number;
}

export async function analyzeGame(request: AnalyzeGameRequest): Promise<GameAnalysisResponse> {
  const response = await fetch(`${GATEWAY_URL}/analysis/game`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      pgn: request.pgn,
      white_elo: request.white_elo,
      black_elo: request.black_elo,
      depth: request.depth || 12,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

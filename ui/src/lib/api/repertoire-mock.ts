// Mock API handlers for local development

import { RepertoireReport, RepertoireAnalysisRequest, SavedReport, OpeningStats, RepertoireGroup } from '@/types/repertoire';

const mockReportStore = new Map<string, RepertoireReport>();

// Mock data for development
const createMockOpeningStats = (
  eco: string,
  name: string,
  color: "white" | "black",
  games: number,
  winrate: number,
  frequency: number
): OpeningStats => ({
  eco_code: eco,
  opening_name: name,
  color,
  games_count: games,
  wins: Math.round(games * winrate),
  losses: Math.round(games * (1 - winrate) * 0.7),
  draws: Math.round(games * (1 - winrate) * 0.3),
  winrate,
  frequency,
  avg_time_seconds: 300 + Math.random() * 200,
  median_time_seconds: 280 + Math.random() * 180,
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const createRng = (seed: number) => {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

const getRequestKey = (request?: Partial<RepertoireAnalysisRequest>): string => {
  if (!request) return 'anonymous';
  const usernames = request.usernames?.map((name) => name.trim()).filter(Boolean);
  if (usernames && usernames.length > 0) return usernames.join(',');
  const importUsername = request.import_request?.username?.trim();
  if (importUsername) return importUsername;
  if (request.user_id) return request.user_id;
  if (request.session_id) return request.session_id;
  return 'anonymous';
};

const seededShuffle = <T,>(items: T[], rng: () => number): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const tweakOpening = (opening: OpeningStats, rng: () => number): OpeningStats => {
  const gamesDelta = Math.round((rng() - 0.5) * 8);
  const gamesCount = Math.max(1, opening.games_count + gamesDelta);
  const winrate = clamp(opening.winrate + (rng() - 0.5) * 0.12, 0.2, 0.8);
  const wins = Math.round(gamesCount * winrate);
  const remaining = Math.max(0, gamesCount - wins);
  const losses = Math.round(remaining * 0.7);
  const draws = Math.max(0, remaining - losses);
  const frequency = clamp(opening.frequency + (rng() - 0.5) * 0.1, 0.02, 0.5);
  const avgTime = Math.max(60, Math.round((opening.avg_time_seconds ?? 300) + (rng() - 0.5) * 60));
  const medianTime = Math.max(50, Math.round((opening.median_time_seconds ?? 280) + (rng() - 0.5) * 50));

  return {
    ...opening,
    games_count: gamesCount,
    winrate: Number(winrate.toFixed(2)),
    wins,
    losses,
    draws,
    frequency: Number(frequency.toFixed(2)),
    avg_time_seconds: avgTime,
    median_time_seconds: medianTime,
  };
};

const rebuildGroup = (group: RepertoireGroup, rng: () => number): RepertoireGroup => {
  const openings = seededShuffle(group.openings, rng).map((opening) => tweakOpening(opening, rng));
  const totalGames = openings.reduce((sum, opening) => sum + opening.games_count, 0);
  const weightedWinrate = totalGames
    ? openings.reduce((sum, opening) => sum + opening.winrate * opening.games_count, 0) / totalGames
    : group.avg_winrate;

  return {
    ...group,
    openings,
    total_games: totalGames,
    avg_winrate: Number(weightedWinrate.toFixed(2)),
  };
};

const rebuildRepertoire = (repertoire: Record<string, RepertoireGroup>, rng: () => number) =>
  Object.entries(repertoire).reduce((acc, [key, group]) => {
    acc[key] = rebuildGroup(group, rng);
    return acc;
  }, {} as Record<string, RepertoireGroup>);

const buildInsights = (openings: OpeningStats[]) => {
  if (openings.length === 0) return [];
  const sorted = [...openings].sort((a, b) => a.winrate - b.winrate);
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];
  const insights = [];

  if (weakest) {
    insights.push({
      type: "warning",
      message: `Your ${weakest.opening_name} (${weakest.eco_code}) needs work - ${weakest.games_count} games at ${(weakest.winrate * 100).toFixed(0)}% winrate.`,
      opening_eco: weakest.eco_code,
      priority: "high",
    });
  }

  if (strongest) {
    insights.push({
      type: "strength",
      message: `Your ${strongest.opening_name} (${strongest.eco_code}) is a strength - ${strongest.games_count} games at ${(strongest.winrate * 100).toFixed(0)}% winrate.`,
      opening_eco: strongest.eco_code,
      priority: "medium",
    });
  }

  return insights;
};

export const buildMockRepertoireReport = (request?: Partial<RepertoireAnalysisRequest>): RepertoireReport => {
  const key = getRequestKey(request);
  const seed = hashString(key);
  const rng = createRng(seed);
  const report = JSON.parse(JSON.stringify(mockRepertoireReport)) as RepertoireReport;
  const now = new Date().toISOString();

  report.id = `mock-report-${seed.toString(36)}-${Date.now()}`;
  report.user_id = key || report.user_id;
  report.analysis_date = now;
  report.created_at = now;
  report.updated_at = now;
  if (request?.import_request?.time_control) {
    report.time_control_filter = request.import_request.time_control;
  }

  const whiteRepertoire = rebuildRepertoire(report.white_repertoire, rng);
  const blackRepertoire = rebuildRepertoire(report.black_repertoire, rng);

  report.white_repertoire = whiteRepertoire;
  report.black_repertoire = blackRepertoire;

  const allOpenings = [
    ...Object.values(whiteRepertoire).flatMap((group) => group.openings),
    ...Object.values(blackRepertoire).flatMap((group) => group.openings),
  ];

  const whiteGames = Object.values(whiteRepertoire).reduce((sum, group) => sum + group.total_games, 0);
  const blackGames = Object.values(blackRepertoire).reduce((sum, group) => sum + group.total_games, 0);
  const totalGames = whiteGames + blackGames;

  const overallWinrate = totalGames
    ? allOpenings.reduce((sum, opening) => sum + opening.winrate * opening.games_count, 0) / totalGames
    : report.overall_winrate;

  report.white_games = whiteGames;
  report.black_games = blackGames;
  report.total_games = totalGames || report.total_games;
  report.overall_winrate = Number(overallWinrate.toFixed(2));
  report.insights = buildInsights(allOpenings);

  const reportLabel =
    request?.usernames && request.usernames.length > 0
      ? request.usernames.join(', ')
      : request?.import_request?.username;
  if (reportLabel) {
    report.name = `${reportLabel} Repertoire`;
  }

  return report;
};

export const mockRepertoireReport: RepertoireReport = {
  id: "mock-report-1",
  user_id: "user123",
  name: "Current Repertoire Analysis",
  total_games: 125,
  white_games: 63,
  black_games: 62,
  analysis_date: new Date().toISOString(),
  overall_winrate: 0.54,
  white_repertoire: {
    core: {
      category: "core",
      description: "Your main white openings - played frequently with solid results",
      total_games: 25,
      avg_winrate: 0.62,
      openings: [
        createMockOpeningStats("E10", "Queen's Pawn Opening", "white", 12, 0.67, 0.19),
        createMockOpeningStats("C50", "Italian Game", "white", 8, 0.56, 0.13),
        createMockOpeningStats("A10", "English Opening", "white", 5, 0.70, 0.08),
      ],
    },
    repair: {
      category: "repair",
      description: "Frequently played but struggling - needs immediate attention",
      total_games: 15,
      avg_winrate: 0.33,
      openings: [
        createMockOpeningStats("D20", "Queen's Gambit Accepted", "white", 10, 0.30, 0.16),
        createMockOpeningStats("B10", "Caro-Kann Defense", "white", 5, 0.40, 0.08),
      ],
    },
    expansion: {
      category: "expansion",
      description: "Rarely played but successful - consider expanding usage",
      total_games: 4,
      avg_winrate: 0.75,
      openings: [
        createMockOpeningStats("A00", "Uncommon Opening", "white", 4, 0.75, 0.06),
      ],
    },
    developing: {
      category: "developing",
      description: "Moderate frequency with mixed results",
      total_games: 8,
      avg_winrate: 0.50,
      openings: [
        createMockOpeningStats("E70", "King's Indian Defense", "white", 8, 0.50, 0.13),
      ],
    },
  },
  black_repertoire: {
    core: {
      category: "core",
      description: "Your main black openings - played frequently with solid results",
      total_games: 18,
      avg_winrate: 0.56,
      openings: [
        createMockOpeningStats("C00", "French Defense", "black", 10, 0.60, 0.16),
        createMockOpeningStats("B50", "Sicilian Defense", "black", 8, 0.50, 0.13),
      ],
    },
    repair: {
      category: "repair",
      description: "Frequently played but struggling - needs immediate attention",
      total_games: 12,
      avg_winrate: 0.33,
      openings: [
        createMockOpeningStats("B20", "Sicilian Defense", "black", 12, 0.33, 0.19),
      ],
    },
    expansion: {
      category: "expansion",
      description: "Rarely played but successful - consider expanding usage",
      total_games: 3,
      avg_winrate: 0.67,
      openings: [
        createMockOpeningStats("A40", "Queen's Pawn Game", "black", 3, 0.67, 0.05),
      ],
    },
  },
  insights: [
    {
      type: "warning",
      message: "Your Sicilian Defense (B20) as black needs work - 12 games with 33% winrate (19% of games)",
      opening_eco: "B20",
      priority: "high",
    },
    {
      type: "warning",
      message: "Your Queen's Gambit Accepted (D20) as white needs work - 10 games with 30% winrate (16% of games)",
      opening_eco: "D20",
      priority: "high",
    },
    {
      type: "suggestion",
      message: "Consider playing more English Opening (A10) as white - 70% winrate in 5 games",
      opening_eco: "A10",
      priority: "medium",
    },
    {
      type: "strength",
      message: "Your Queen's Pawn Opening (E10) as white is solid - 12 games with 67% winrate (19% of games)",
      opening_eco: "E10",
      priority: "medium",
    },
  ],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const mockSavedReports: SavedReport[] = [
  {
    id: "report-1",
    name: "December Analysis",
    created_at: "2024-12-01T10:00:00Z",
    updated_at: "2024-12-01T10:00:00Z",
    total_games: 125,
    overall_winrate: 0.54,
    preview_openings: ["E10", "B20", "C50", "C00"],
  },
  {
    id: "report-2",
    name: "Post-Tournament Review",
    created_at: "2024-11-15T14:30:00Z",
    updated_at: "2024-11-15T14:30:00Z",
    total_games: 89,
    overall_winrate: 0.48,
    preview_openings: ["D20", "B50", "A10"],
  },
  {
    id: "report-3",
    name: "Summer Training Results",
    created_at: "2024-08-20T09:15:00Z",
    updated_at: "2024-08-20T09:15:00Z",
    total_games: 156,
    overall_winrate: 0.61,
    preview_openings: ["E10", "C00", "B10", "A40"],
  },
];

const buildPreviewOpenings = (report: RepertoireReport) => [
  ...Object.values(report.white_repertoire).flatMap(group =>
    group.openings.slice(0, 2).map(o => o.eco_code)
  ),
  ...Object.values(report.black_repertoire).flatMap(group =>
    group.openings.slice(0, 2).map(o => o.eco_code)
  ),
].slice(0, 4);

export const saveMockReport = (report: RepertoireReport, name: string): SavedReport => {
  const now = new Date().toISOString();
  const id = `report-${Date.now()}`;
  const savedReport: SavedReport = {
    id,
    name,
    created_at: now,
    updated_at: now,
    total_games: report.total_games,
    overall_winrate: report.overall_winrate,
    preview_openings: buildPreviewOpenings(report),
  };

  const storedReport = {
    ...report,
    id,
    name,
    created_at: now,
    updated_at: now,
  };

  mockReportStore.set(id, JSON.parse(JSON.stringify(storedReport)));
  mockSavedReports.unshift(savedReport);
  return savedReport;
};

export const getMockReportById = (reportId: string): RepertoireReport | undefined => {
  const stored = mockReportStore.get(reportId);
  return stored ? (JSON.parse(JSON.stringify(stored)) as RepertoireReport) : undefined;
};

// Mock API functions with delays to simulate network
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const mockAPI = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generateRepertoireAnalysis(_request: RepertoireAnalysisRequest): Promise<RepertoireReport> {
    await delay(1500); // Simulate API call delay

    // Simulate potential errors
    if (Math.random() < 0.1) {
      throw new Error("Insufficient data for analysis. Need at least 3 games with opening information.");
    }

    return buildMockRepertoireReport(_request);
  },

  async getSavedReports(): Promise<SavedReport[]> {
    await delay(800);
    return [...mockSavedReports];
  },

  async getSavedReport(reportId: string, _lite: boolean = false): Promise<RepertoireReport> {
    await delay(600);

    const stored = getMockReportById(reportId);
    if (stored) return stored;

    const savedMeta = mockSavedReports.find(r => r.id === reportId);
    const fallback = buildMockRepertoireReport({
      usernames: savedMeta?.name ? [savedMeta.name] : undefined,
    });

    fallback.id = reportId;
    if (savedMeta?.name) {
      fallback.name = savedMeta.name;
    }

    return fallback;
  },

  async getReportHeavyFields(_reportId: string): Promise<Partial<RepertoireReport>> {
    await delay(400);
    // Return empty heavy fields for mock
    return {
      engine_analysis: undefined,
      generated_puzzles: undefined,
      weak_lines: undefined,
      charts_additional: undefined,
    };
  },

  async saveRepertoireReport(report: RepertoireReport, name: string): Promise<SavedReport> {
    await delay(1000);

    return saveMockReport(report, name);
  },

  async deleteSavedReport(reportId: string): Promise<void> {
    await delay(500);

    const index = mockSavedReports.findIndex(r => r.id === reportId);
    if (index > -1) {
      mockSavedReports.splice(index, 1);
    }
  },

  async getOpeningStatistics(color?: 'white' | 'black', minGames: number = 3) {
    await delay(400);

    const allOpenings = [
      ...Object.values(mockRepertoireReport.white_repertoire).flatMap(group => group.openings),
      ...Object.values(mockRepertoireReport.black_repertoire).flatMap(group => group.openings),
    ];

    const filteredOpenings = color
      ? allOpenings.filter(o => o.color === color)
      : allOpenings;

    return {
      openings: filteredOpenings.filter(o => o.games_count >= minGames),
      total_games: mockRepertoireReport.total_games,
      white_games: mockRepertoireReport.white_games,
      black_games: mockRepertoireReport.black_games,
    };
  },
};

// Flag to enable/disable mock API
export const USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API === 'true';

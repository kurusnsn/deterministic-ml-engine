import { http, HttpResponse, delay } from 'msw'
import { buildMockRepertoireReport, getMockReportById, mockSavedReports, saveMockReport } from '@/lib/api/repertoire-mock'

const API_BASE = process.env.NEXT_PUBLIC_GATEWAY_URL ?? '/api/gateway'

const mockStudies = {
  studies: [
    {
      id: 1,
      name: 'Mock Italian Game Prep',
      pgn: '[Event "Mock"]\n1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5',
      pgn_preview: '[Event "Mock"]\n1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5',
      current_fen: 'r1bqk1nr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 4',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
}

const mockGames = {
  items: [
    {
      id: 101,
      provider: 'lichess',
      source: 'lichess',
      source_id: 'abc123',
      perf: 'blitz',
      time_control: '180+0',
      result: 'win',
      rated: true,
      opponent_username: 'SharpOpponent',
      opening_eco: 'C50',
      opening_name: 'Italian Game',
      url: 'https://lichess.org/abc123',
      site: 'lichess.org',
      start_time: new Date(Date.now() - 3600_000).toISOString(),
      end_time: new Date(Date.now() - 3500_000).toISOString(),
      created_at: new Date(Date.now() - 3400_000).toISOString(),
      pgn: '[Event "Mock"]\n1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3',
      digest: 'digest-abc123',
    },
    {
      id: 101,
      provider: 'lichess',
      source: 'lichess',
      source_id: 'abc123',
      perf: 'blitz',
      time_control: '180+0',
      result: 'win',
      rated: true,
      opponent_username: 'SharpOpponent',
      opening_eco: 'C50',
      opening_name: 'Italian Game',
      url: 'https://lichess.org/abc123',
      site: 'lichess.org',
      start_time: new Date(Date.now() - 3600_000).toISOString(),
      end_time: new Date(Date.now() - 3500_000).toISOString(),
      created_at: new Date(Date.now() - 3400_000).toISOString(),
      pgn: '[Event "Mock"]\n1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3',
      digest: 'digest-abc123',
    },
    {
      id: 102,
      provider: 'chess.com',
      source: 'chess.com',
      source_id: 'live-456',
      perf: 'rapid',
      time_control: '600+5',
      result: 'loss',
      rated: true,
      opponent_username: 'SolidPlayer',
      opening_eco: 'B12',
      opening_name: 'Caro-Kann Defense',
      url: 'https://www.chess.com/game/live/live-456',
      site: 'chess.com',
      start_time: new Date(Date.now() - 7200_000).toISOString(),
      end_time: new Date(Date.now() - 7000_000).toISOString(),
      created_at: new Date(Date.now() - 6900_000).toISOString(),
      pgn: '[Event "Mock"]\n1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Bf5',
      digest: 'digest-456',
    },
  ],
  limit: 100,
  offset: 0,
}

const mockRepertoires = [
  {
    id: 'rep-1',
    name: 'White Core Lines',
    eco_codes: ['C50', 'E60'],
    openings: [
      { eco: 'C50', name: 'Italian Game', color: 'white', games_count: 25, winrate: 0.6, frequency: 0.2 },
      { eco: 'E60', name: 'King’s Indian', color: 'white', games_count: 10, winrate: 0.55, frequency: 0.1 },
    ],
    source_report_id: 'report-1',
    favorite: true,
    created_at: new Date(Date.now() - 604800000).toISOString(),
    updated_at: new Date().toISOString(),
    category: 'core',
    total_games: 35,
    avg_winrate: 0.58,
    color: 'white',
  },
  {
    id: 'rep-2',
    name: 'Black Counterplay',
    eco_codes: ['B12', 'C00'],
    openings: [
      { eco: 'B12', name: 'Caro-Kann', color: 'black', games_count: 15, winrate: 0.45, frequency: 0.15 },
      { eco: 'C00', name: 'French Defense', color: 'black', games_count: 12, winrate: 0.5, frequency: 0.12 },
    ],
    source_report_id: null,
    favorite: false,
    created_at: new Date(Date.now() - 259200000).toISOString(),
    updated_at: new Date().toISOString(),
    category: 'repair',
    total_games: 27,
    avg_winrate: 0.48,
    color: 'black',
  },
]

const mockStockfishAnalysis = [
  {
    move: 'e4',
    uci: 'e2e4',
    score: 34,
    pv: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
    pv_uci: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'],
    classification: 'Good',
  },
  {
    move: 'd4',
    uci: 'd2d4',
    score: 18,
    pv: ['d4', 'd5', 'c4', 'c6'],
    pv_uci: ['d2d4', 'd7d5', 'c2c4', 'c7c6'],
    classification: 'Playable',
  },
  {
    move: 'Nc3',
    uci: 'b1c3',
    score: 12,
    pv: ['Nc3', 'Nf6', 'Nf3', 'd6'],
    pv_uci: ['b1c3', 'g8f6', 'g1f3', 'd7d6'],
    classification: 'Interesting',
  },
]

const mockAnalysisResponse = {
  stockfish: {
    analysis: mockStockfishAnalysis,
  },
  eco: {
    eco: 'C50',
    name: 'Italian Game',
  },
}

const mockLlmResponse = {
  ...mockAnalysisResponse,
  llm: {
    choices: [
      {
        message: {
          content:
            'Main line continues 4.c3 preparing d4. Alternative is 4.b4!? (Evans Gambit) which sacrifices a pawn for rapid development. If you face 3...Nf6, consider the Two Knights Defence main line with 4.Ng5.',
        },
      },
    ],
  },
}

export const handlers = [
  http.get(`${API_BASE}/studies`, async () => {
    await delay(200)
    return HttpResponse.json(mockStudies)
  }),
  http.post(`${API_BASE}/studies`, async () => {
    await delay(150)
    return HttpResponse.json({ success: true, study_id: Date.now(), created_at: new Date().toISOString() })
  }),
  http.delete(`${API_BASE}/studies/:id`, async () => {
    await delay(120)
    return HttpResponse.json({ success: true, deleted_id: 1 })
  }),

  http.get(`${API_BASE}/games`, async () => {
    await delay(200)
    return HttpResponse.json(mockGames)
  }),
  http.get(`${API_BASE}/games/:id/pgn`, ({ params }) => {
    const match = mockGames.items.find((g) => String(g.id) === String(params.id))
    return HttpResponse.json({ pgn: match?.pgn || '' })
  }),

  http.get(`${API_BASE}/repertoires`, async () => {
    await delay(150)
    return HttpResponse.json(mockRepertoires)
  }),
  http.delete(`${API_BASE}/repertoires/:id`, async () => {
    await delay(150)
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API_BASE}/analysis/reports`, async () => {
    await delay(150)
    return HttpResponse.json({ reports: mockSavedReports })
  }),
  http.post(`${API_BASE}/analysis/reports`, async ({ request }) => {
    await delay(150)
    const body = await request.json().catch(() => ({}))
    const report = (body?.report_data ?? buildMockRepertoireReport(body)) as any
    const name = body?.name || report?.name || 'Repertoire Analysis'
    const saved = saveMockReport(report, name)
    return HttpResponse.json(saved)
  }),
  http.get(`${API_BASE}/analysis/reports/:id`, async ({ params }) => {
    await delay(150)
    const reportId = String(params.id)
    const stored = getMockReportById(reportId)
    if (stored) {
      return HttpResponse.json(stored)
    }
    const fallback = buildMockRepertoireReport({ user_id: reportId })
    fallback.id = reportId
    return HttpResponse.json(fallback)
  }),
  http.get(`${API_BASE}/analysis/reports/:id/heavy`, async () => {
    await delay(150)
    return HttpResponse.json({
      engine_analysis: undefined,
      generated_puzzles: undefined,
      weak_lines: undefined,
      charts_additional: undefined,
    })
  }),

  http.post(`${API_BASE}/analysis/repertoire`, async ({ request }) => {
    await delay(500)
    const body = await request.json().catch(() => ({}))
    const report = buildMockRepertoireReport(body)
    return HttpResponse.json(report)
  }),
  http.post(`${API_BASE}/analysis/repertoire/stream`, async ({ request }) => {
    await delay(500)
    const body = await request.json().catch(() => ({}))
    const report = buildMockRepertoireReport(body)
    const streamPayload = (
      'data: ' +
      JSON.stringify({ type: 'progress', status: 'analyzing', message: 'Crunching 200 games...' }) +
      '\n\n' +
      'data: ' +
      JSON.stringify({ type: 'complete', result: report }) +
      '\n\n'
    )
    return new HttpResponse(streamPayload, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      },
    })
  }),

  http.post(`${API_BASE}/analyze`, async () => {
    await delay(300)
    return HttpResponse.json(mockAnalysisResponse)
  }),

  http.post(`${API_BASE}/chess/analyze_with_llm`, async () => {
    await delay(600)
    return HttpResponse.json(mockLlmResponse)
  }),
]

import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'

/**
 * Test Utilities for Chess Broadcasting System
 * 
 * Provides:
 * - Custom render function with providers
 * - Mock data factories
 * - Common test helpers
 */

// Wrapper with any providers needed (theme, query client, etc.)
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <>{children}</>
  )
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options })

// Re-export everything
export * from '@testing-library/react'
export { customRender as render }

// ============================================
// Mock Data Factories
// ============================================

export const createMockTournament = (overrides = {}) => ({
  id: 't1',
  name: 'Spring Championship 2025',
  description: 'The annual spring championship featuring top grandmasters from around the world.',
  status: 'Live' as const,
  rounds: 9,
  startDate: '2025-04-01',
  endDate: '2025-04-10',
  location: 'New York, USA',
  timeControl: '90+30',
  ...overrides,
})

export const createMockPlayer = (overrides = {}) => ({
  id: 'p1',
  name: 'Magnus Carlsen',
  title: 'GM',
  rating: 2830,
  country: 'NO',
  score: 4.5,
  ...overrides,
})

export const createMockGame = (overrides = {}) => ({
  id: 'g1',
  round: 1,
  white: createMockPlayer(),
  black: createMockPlayer({ id: 'p2', name: 'Hikaru Nakamura', rating: 2789, country: 'US' }),
  result: '1/2-1/2' as const,
  status: 'Finished' as const,
  moves: 45,
  pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  ...overrides,
})

export const createMockMove = (num: number, white: string, black: string) => ({
  num,
  white,
  black,
})

export const createMockChatMessage = (overrides = {}) => ({
  id: 'c1',
  user: 'ChessFan123',
  message: 'What a move by Magnus!',
  time: '10:32',
  moderated: false,
  ...overrides,
})

export const createMockCommentary = (overrides = {}) => ({
  summary: 'White has a slight space advantage in the center, but Black\'s position is solid.',
  explanation: '15...Re8 prepares to meet Bg3 with Bf8, reinforcing the kingside.',
  alternatives: ['15...b4 was also possible', '15...c5!? complicates the center'],
  critical: 'The next few moves will determine if White can maintain the initiative.',
  ...overrides,
})

export const createMockStanding = (rank: number, player = createMockPlayer()) => ({
  rank,
  ...player,
  tiebreak: (Math.random() * 10).toFixed(2),
})

// ============================================
// Mock API Responses
// ============================================

export const mockTournamentListResponse = () => ({
  tournaments: [
    createMockTournament(),
    createMockTournament({ id: 't2', name: 'Candidates Tournament 2025', status: 'Upcoming' }),
    createMockTournament({ id: 't3', name: 'Blitz Bonanza', status: 'Finished' }),
  ],
})

export const mockStandingsResponse = () => ({
  standings: [
    createMockStanding(1, createMockPlayer()),
    createMockStanding(2, createMockPlayer({ id: 'p2', name: 'Hikaru Nakamura', score: 4.0 })),
    createMockStanding(3, createMockPlayer({ id: 'p3', name: 'Fabiano Caruana', score: 3.5 })),
  ],
})

export const mockPlayersResponse = () => ({
  players: [
    createMockPlayer(),
    createMockPlayer({ id: 'p2', name: 'Hikaru Nakamura', rating: 2789 }),
    createMockPlayer({ id: 'p3', name: 'Fabiano Caruana', rating: 2804 }),
  ],
})

export const mockGamesResponse = () => ({
  games: [
    createMockGame(),
    createMockGame({ id: 'g2', result: '1-0', status: 'Finished' }),
    createMockGame({ id: 'g3', result: '*', status: 'Live' }),
  ],
})

export const mockChatMessagesResponse = () => ({
  messages: [
    createMockChatMessage(),
    createMockChatMessage({ id: 'c2', user: 'GrandmasterFlash', message: 'I think Black is slightly better here.' }),
    createMockChatMessage({ id: 'c3', user: 'RookLifter', message: 'Is this still theory?' }),
  ],
})

// ============================================
// Mock SSE/WebSocket Helpers
// ============================================

export const createMockSSE = () => {
  const listeners: { [key: string]: ((event: { data: string }) => void)[] } = {}
  
  return {
    addEventListener: (type: string, callback: (event: { data: string }) => void) => {
      if (!listeners[type]) listeners[type] = []
      listeners[type].push(callback)
    },
    removeEventListener: (type: string, callback: (event: { data: string }) => void) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter(cb => cb !== callback)
      }
    },
    close: () => {},
    // Helper to emit events in tests
    emit: (type: string, data: unknown) => {
      if (listeners[type]) {
        listeners[type].forEach(cb => cb({ data: JSON.stringify(data) }))
      }
    },
  }
}

export const createMockWebSocket = () => {
  const listeners: { [key: string]: ((event: { data: string }) => void)[] } = {}
  
  return {
    addEventListener: (type: string, callback: (event: { data: string }) => void) => {
      if (!listeners[type]) listeners[type] = []
      listeners[type].push(callback)
    },
    removeEventListener: (type: string, callback: (event: { data: string }) => void) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter(cb => cb !== callback)
      }
    },
    send: (data: string) => console.log('WS send:', data),
    close: () => {},
    // Helper to emit events in tests
    emit: (type: string, data: unknown) => {
      if (listeners[type]) {
        listeners[type].forEach(cb => cb({ data: JSON.stringify(data) }))
      }
    },
  }
}

// ============================================
// Wait Helpers
// ============================================

export const waitForLoadingToFinish = () =>
  new Promise(resolve => setTimeout(resolve, 0))




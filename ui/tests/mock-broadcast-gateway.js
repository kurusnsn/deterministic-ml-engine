/**
 * Mock Gateway Server for Broadcast/Tournament API Endpoints
 * 
 * Extends the existing mock-gateway.js with tournament-specific endpoints.
 * Run with: node tests/mock-broadcast-gateway.js
 * 
 * This mock supports:
 * - GET /api/tournaments - List tournaments
 * - GET /api/tournaments/:id - Tournament detail
 * - GET /api/tournaments/:id/rounds - Tournament rounds
 * - GET /api/tournaments/:id/rounds/:round - Round pairings
 * - GET /api/tournaments/:id/standings - Standings
 * - GET /api/tournaments/:id/players - Players
 * - GET /api/tournaments/:id/games - All games
 * - GET /api/tournaments/:id/games/:gameId - Game detail
 * - SSE /api/tournaments/:id/games/:gameId/stream - Live game stream
 * - POST /api/chat/message - Send chat message
 * - GET /api/chat/messages/:gameId - Get chat messages
 * - POST /api/commentary/explain - Get move explanation
 */

const http = require('http')
const { EventEmitter } = require('events')

const port = parseInt(process.env.PORT || '5556', 10)

// Mock Data
const MOCK_TOURNAMENTS = [
  {
    id: 't1',
    name: 'Spring Championship 2025',
    description: 'The annual spring championship featuring top grandmasters from around the world.',
    status: 'Live',
    rounds: 9,
    startDate: '2025-04-01',
    endDate: '2025-04-10',
    location: 'New York, USA',
    timeControl: '90+30',
  },
  {
    id: 't2',
    name: 'Candidates Tournament 2025',
    description: 'Who will challenge the World Champion? The ultimate test of strategy and endurance.',
    status: 'Upcoming',
    rounds: 14,
    startDate: '2025-06-15',
    endDate: '2025-07-05',
    location: 'Toronto, Canada',
    timeControl: '120+60',
  },
]

const MOCK_PLAYERS = [
  { id: 'p1', name: 'Magnus Carlsen', title: 'GM', rating: 2830, country: 'NO', score: 4.5 },
  { id: 'p2', name: 'Hikaru Nakamura', title: 'GM', rating: 2789, country: 'US', score: 4.0 },
  { id: 'p3', name: 'Fabiano Caruana', title: 'GM', rating: 2804, country: 'US', score: 3.5 },
  { id: 'p4', name: 'Ding Liren', title: 'GM', rating: 2762, country: 'CN', score: 3.0 },
]

const MOCK_GAMES = [
  {
    id: 'g1',
    round: 1,
    white: MOCK_PLAYERS[0],
    black: MOCK_PLAYERS[1],
    result: '1/2-1/2',
    status: 'Finished',
    moves: 45,
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  },
  {
    id: 'g2',
    round: 1,
    white: MOCK_PLAYERS[2],
    black: MOCK_PLAYERS[3],
    result: '1-0',
    status: 'Finished',
    moves: 32,
    pgn: '1. d4 Nf6 2. c4 e6 3. Nc3 Bb4',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  },
  {
    id: 'g3',
    round: 5,
    white: MOCK_PLAYERS[0],
    black: MOCK_PLAYERS[2],
    result: '*',
    status: 'Live',
    moves: 24,
    whiteTime: '1:04:32',
    blackTime: '0:58:15',
    currentMove: 'e4',
    pgn: '1. e4 e5 2. Nf3 Nc6',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
  },
]

const MOCK_CHAT_MESSAGES = [
  { id: 'c1', user: 'ChessFan123', message: 'What a move by Magnus!', time: '10:32', moderated: false },
  { id: 'c2', user: 'GrandmasterFlash', message: 'I think Black is slightly better here.', time: '10:33', moderated: false },
  { id: 'c3', user: 'RookLifter', message: 'Is this still theory?', time: '10:34', moderated: false },
]

const MOCK_COMMENTARY = {
  summary: 'White has a slight space advantage in the center, but Black\'s position is solid.',
  explanation: '15...Re8 prepares to meet Bg3 with Bf8, reinforcing the kingside.',
  alternatives: ['15...b4 was also possible', '15...c5!? complicates the center'],
  critical: 'The next few moves will determine if White can maintain the initiative.',
}

// SSE Event Emitter for live game simulation
const gameEvents = new EventEmitter()

// Simulate live moves every 10 seconds for testing
let moveCounter = 0
setInterval(() => {
  moveCounter++
  gameEvents.emit('move', {
    type: 'move',
    gameId: 'g3',
    move: { 
      san: moveCounter % 2 === 0 ? 'Bb5' : 'a6',
      fen: 'mock-fen',
      eval: 0.45,
      clock: { white: '1:03:00', black: '0:57:00' }
    },
    moveNumber: Math.floor(moveCounter / 2) + 25,
    timestamp: new Date().toISOString(),
  })
}, 10000)

function parseUrl(url) {
  const [path, queryString] = url.split('?')
  const query = {}
  if (queryString) {
    queryString.split('&').forEach(param => {
      const [key, value] = param.split('=')
      query[key] = decodeURIComponent(value)
    })
  }
  return { path, query }
}

const server = http.createServer((req, res) => {
  const { method, url } = req
  const { path, query } = parseUrl(url)
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-session-id')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS,PATCH')
  
  if (method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  // Tournament endpoints
  if (path === '/api/tournaments' && method === 'GET') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ tournaments: MOCK_TOURNAMENTS }))
  }

  if (path.match(/^\/api\/tournaments\/[^/]+$/) && method === 'GET') {
    const id = path.split('/')[3]
    const tournament = MOCK_TOURNAMENTS.find(t => t.id === id) || MOCK_TOURNAMENTS[0]
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify(tournament))
  }

  if (path.match(/^\/api\/tournaments\/[^/]+\/rounds$/) && method === 'GET') {
    const rounds = Array.from({ length: 9 }, (_, i) => ({
      round: i + 1,
      date: `2025-04-0${i + 1}`,
      status: i < 5 ? 'Finished' : i === 5 ? 'Live' : 'Upcoming',
    }))
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ rounds }))
  }

  if (path.match(/^\/api\/tournaments\/[^/]+\/rounds\/\d+$/) && method === 'GET') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ games: MOCK_GAMES }))
  }

  if (path.match(/^\/api\/tournaments\/[^/]+\/standings$/) && method === 'GET') {
    const standings = MOCK_PLAYERS.map((p, i) => ({
      rank: i + 1,
      ...p,
      tiebreak: (Math.random() * 10).toFixed(2),
    }))
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ standings }))
  }

  if (path.match(/^\/api\/tournaments\/[^/]+\/players$/) && method === 'GET') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ players: MOCK_PLAYERS }))
  }

  if (path.match(/^\/api\/tournaments\/[^/]+\/games$/) && method === 'GET') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ games: MOCK_GAMES }))
  }

  if (path.match(/^\/api\/tournaments\/[^/]+\/games\/[^/]+$/) && method === 'GET') {
    const gameId = path.split('/').pop()
    const game = MOCK_GAMES.find(g => g.id === gameId) || MOCK_GAMES[0]
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify(game))
  }

  // SSE endpoint for live game streaming
  if (path.match(/^\/api\/tournaments\/[^/]+\/games\/[^/]+\/stream$/) && method === 'GET') {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    
    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }
    
    // Send initial state
    sendEvent({ type: 'connected', gameId: 'g3' })
    
    const moveHandler = (data) => sendEvent(data)
    gameEvents.on('move', moveHandler)
    
    req.on('close', () => {
      gameEvents.off('move', moveHandler)
    })
    
    return
  }

  // Chat endpoints
  if (path.match(/^\/api\/chat\/messages\/[^/]+$/) && method === 'GET') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ messages: MOCK_CHAT_MESSAGES }))
  }

  if (path === '/api/chat/message' && method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      const data = JSON.parse(body)
      const newMessage = {
        id: `c${MOCK_CHAT_MESSAGES.length + 1}`,
        user: data.user || 'Anonymous',
        message: data.message,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        moderated: false,
      }
      
      // Simple moderation - check for bad words
      const badWords = ['badword', 'toxic']
      if (badWords.some(word => data.message.toLowerCase().includes(word))) {
        newMessage.moderated = true
        newMessage.message = '[Message removed by moderator]'
      }
      
      MOCK_CHAT_MESSAGES.push(newMessage)
      
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify(newMessage))
    })
    return
  }

  // Commentary endpoints
  if (path === '/api/commentary/explain' && method === 'POST') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify(MOCK_COMMENTARY))
  }

  if (path === '/api/commentary/bestline' && method === 'POST') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({
      line: '1. Bxf6 Qxf6 2. Nd5 Qd8 3. c4',
      eval: '+0.8',
      depth: 25,
    }))
  }

  if (path === '/api/commentary/mistake' && method === 'POST') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({
      explanation: 'The move allows tactical complications that favor the opponent.',
      betterMove: 'Bf4',
      evalDiff: '-0.5',
    }))
  }

  // Fallback
  res.statusCode = 404
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(port, () => {
  console.log(`[mock-broadcast-gateway] listening on http://localhost:${port}`)
  console.log('Available endpoints:')
  console.log('  GET  /api/tournaments')
  console.log('  GET  /api/tournaments/:id')
  console.log('  GET  /api/tournaments/:id/rounds')
  console.log('  GET  /api/tournaments/:id/rounds/:round')
  console.log('  GET  /api/tournaments/:id/standings')
  console.log('  GET  /api/tournaments/:id/players')
  console.log('  GET  /api/tournaments/:id/games')
  console.log('  GET  /api/tournaments/:id/games/:gameId')
  console.log('  GET  /api/tournaments/:id/games/:gameId/stream (SSE)')
  console.log('  GET  /api/chat/messages/:gameId')
  console.log('  POST /api/chat/message')
  console.log('  POST /api/commentary/explain')
  console.log('  POST /api/commentary/bestline')
  console.log('  POST /api/commentary/mistake')
})




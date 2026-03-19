const http = require('http')

const port = parseInt(process.env.PORT || '5555', 10)

const server = http.createServer((req, res) => {
  const { method, url } = req
  // Basic CORS for dev
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-session-id')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS,PATCH')
  if (method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  if (url === '/studies' && method === 'GET') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ studies: [] }))
  }

  if (url && url.startsWith('/studies/') && method === 'DELETE') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ success: true, deleted_id: 1 }))
  }

  if (url && url.startsWith('/games') && method === 'GET') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ items: [], limit: 100, offset: 0 }))
  }

  if (url && url.startsWith('/repertoires')) {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify([]))
  }

  res.statusCode = 200
  res.end('{}')
})

server.listen(port, () => {
  console.log(`[mock-gateway] listening on http://localhost:${port}`)
})


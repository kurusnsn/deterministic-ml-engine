import { test, expect } from '@playwright/test'

test('Profile games list deduplicates duplicate entries', async ({ page, context }) => {
  const sessionId = 'pw-dedup-games'
  await context.addCookies([
    { name: 'session_id', value: sessionId, domain: 'localhost', path: '/' },
  ])

  const duplicateGame = {
    id: 101,
    provider: 'lichess',
    source: 'lichess',
    source_id: 'abc123',
    perf: 'blitz',
    time_control: '180+0',
    result: 'win',
    rated: true,
    opponent_username: 'Opponent',
    opening_eco: 'C20',
    opening_name: 'King Pawn Game',
    url: 'https://lichess.org/abc123',
    site: 'lichess.org',
    start_time: new Date().toISOString(),
    end_time: null,
    created_at: new Date().toISOString(),
    pgn: '[White "Player"] [Black "Opponent"] 1.e4 e5 2.Nf3 Nc6',
    digest: 'digest-value',
  }

  await page.route('**/games?**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [duplicateGame, duplicateGame], limit: 100, offset: 0 }),
    })
  })

  const emptyJson = JSON.stringify({ studies: [] })
  await page.route('**/studies?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: emptyJson }))
  await page.route('**/studies', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: emptyJson }))
  await page.route('**/repertoires', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route('**/reports', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))

  await page.goto('/profile')

  const rows = page.locator('table tbody tr')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Opponent')
})


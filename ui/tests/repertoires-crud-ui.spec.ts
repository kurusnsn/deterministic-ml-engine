import { test, expect } from '@playwright/test'

test('Repertoires: create via API, delete via UI, and confirm removal', async ({ page, context, request }) => {
  const sessionId = 'pw-repertoire-flow'
  await context.addCookies([
    { name: 'session_id', value: sessionId, domain: 'localhost', path: '/' },
  ])

  const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8010'
  const repName = 'Playwright Repertoire Flow'

  // Seed a repertoire via the API to simulate prior saved data
  const createResp = await request.post(`${gateway}/repertoires`, {
    headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
    data: {
      name: repName,
      eco_codes: ['C00', 'C01'],
      openings: [{ eco: 'C00', name: 'French Defense', color: 'black' }],
      source_report_id: null,
    },
  })
  expect(createResp.ok()).toBeTruthy()

  await page.goto('/profile')

  const card = page.locator('div.group', { hasText: repName }).first()
  await expect(card).toBeVisible()

  await card.locator('button').last().click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()

  await expect(page.getByText(repName)).toHaveCount(0)
})

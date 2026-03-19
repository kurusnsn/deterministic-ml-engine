import { test, expect } from '@playwright/test'

test('Profile shows import call-to-action when no games are available', async ({ page, context }) => {
  const sessionId = 'pw-empty-games'
  await context.addCookies([
    { name: 'session_id', value: sessionId, domain: 'localhost', path: '/' },
  ])

  await page.route('**/games?**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], limit: 100, offset: 0 }),
    })
  })

  const emptyJson = JSON.stringify({ studies: [] })
  await page.route('**/studies?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: emptyJson }))
  await page.route('**/studies', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: emptyJson }))
  await page.route('**/repertoires', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route('**/reports', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))

  await page.goto('/profile')

  await expect(page.getByText('No games imported yet')).toBeVisible()
  const link = page.getByRole('link', { name: 'Click here to import' })
  await expect(link).toBeVisible()

  await Promise.all([
    page.waitForURL(/\/import/),
    link.click(),
  ])
})


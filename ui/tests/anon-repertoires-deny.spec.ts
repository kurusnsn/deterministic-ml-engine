import { test, expect } from '@playwright/test'

// Negative scenario mirroring Saved Analysis: force 401 from /repertoires
// and verify the UI shows the appropriate error banner.

test('shows auth error when repertoires return 401', async ({ page, context }) => {
  await context.addCookies([
    { name: 'session_id', value: 'playwright-dev-session', domain: 'localhost', path: '/' },
  ])

  await page.route('**/repertoires', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detail: 'Not authenticated' }),
      })
    }
    return route.continue()
  })

  await page.goto('/profile')

  await expect(page.locator('h2:text-is("Repertoire Analysis")')).toBeVisible()

  // Hook formats: "Failed to fetch repertoires: Unauthorized"
  await expect(page.getByText('Failed to fetch repertoires', { exact: false })).toBeVisible({ timeout: 12000 })
})

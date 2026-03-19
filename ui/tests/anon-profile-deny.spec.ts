import { test, expect } from '@playwright/test'

// Negative scenario: simulate ALLOW_ANON_STUDIES=false by forcing the studies
// endpoint to return 401 and ensure the UI shows the auth error.

test('shows auth error when studies return 401', async ({ page, context }) => {
  await context.addCookies([
    { name: 'session_id', value: 'playwright-dev-session', domain: 'localhost', path: '/' },
  ])

  // Intercept the studies endpoint and force a 401 response
  await page.route('**/studies', async (route) => {
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

  await expect(page.getByRole('heading', { name: 'Saved Analysis' })).toBeVisible()
  await expect(page.getByText('{"detail":"Not authenticated"}')).toBeVisible()
})


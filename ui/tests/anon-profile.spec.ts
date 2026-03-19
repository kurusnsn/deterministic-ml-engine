import { test, expect } from '@playwright/test'

// This test verifies that in dev mode, when ALLOW_ANON_STUDIES=true on the gateway
// and a session_id cookie is present, the /profile page does not show an auth error.

test('anonymous session can view Saved Analysis without auth error', async ({ page, context }) => {
  // Seed a session cookie that the middleware and UI will forward to the gateway
  await context.addCookies([
    {
      name: 'session_id',
      value: 'playwright-dev-session',
      domain: 'localhost',
      path: '/',
    },
  ])

  await page.goto('/profile')

  // Saved Analysis section should render
  await expect(page.getByRole('heading', { name: 'Saved Analysis' })).toBeVisible()

  // Error banner for auth should NOT be visible
  await expect(page.getByText('Not authenticated').first()).toHaveCount(0)
  await expect(page.getByText('Failed to load studies').first()).toHaveCount(0)
  await expect(page.getByText('Auth required').first()).toHaveCount(0)
})

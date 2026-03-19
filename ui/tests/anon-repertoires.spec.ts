import { test, expect } from '@playwright/test'

test('anonymous session can view Repertoires section without auth error', async ({ page, context }) => {
  await context.addCookies([
    { name: 'session_id', value: 'playwright-dev-session', domain: 'localhost', path: '/' },
  ])

  await page.goto('/profile')

  // Section heading visible (use stricter selector to avoid strict-mode conflicts)
  await expect(page.locator('h2:text-is("Repertoire Analysis")')).toBeVisible()

  // No auth error banners for repertoires
  await expect(page.getByText('Failed to fetch repertoires').first()).toHaveCount(0)
  await expect(page.getByText('Not authenticated').first()).toHaveCount(0)
  await expect(page.getByText('Unauthorized').first()).toHaveCount(0)

  // Empty-state is acceptable
  await expect(page.getByText('No saved repertoires yet')).toBeVisible()
})

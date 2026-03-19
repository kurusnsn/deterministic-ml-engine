import { test, expect } from '@playwright/test'

test('Saved Analysis: user can save study on analyze page and delete from profile', async ({ page, context }) => {
  const sessionId = 'pw-analyze-flow'
  await context.addCookies([
    { name: 'session_id', value: sessionId, domain: 'localhost', path: '/' },
  ])

  // 1. Visit analyze page and open the save dialog
  await page.goto('/analyze')
  await page.getByRole('button', { name: 'Save Study' }).click()

  const studyName = 'Playwright Full Flow'
  await page.fill('#study-name', studyName)
  await page.getByRole('button', { name: 'Save Study' }).click()

  // 2. Go to profile and verify study appears
  await page.goto('/profile')
  const card = page.locator('div.bg-white.rounded-lg', { hasText: studyName }).first()
  await expect(card).toBeVisible()

  // 3. Delete via UI and ensure it disappears
  await card.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(studyName)).toHaveCount(0)
})

import { test, expect } from '@playwright/test'

/**
 * E2E Tests: Tournament Round Page (/tournaments/[id]/rounds/[round])
 * 
 * Tests the round pairings display including:
 * - Game pairings list
 * - Player names and ratings
 * - Game results and status
 * - Live game indicators
 * - Navigation to board view
 */

test.describe('Tournament Round - Pairings Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/rounds/1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('displays round header with round number', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Round 1 Pairing/ })).toBeVisible()
  })

  test('shows Previous and Next Round navigation buttons', async ({ page }) => {
    // Previous round button (might be truncated)
    await expect(page.getByRole('button', { name: /Previou.*Round/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next Round' })).toBeVisible()
  })

  test('Previous Round button is disabled on round 1', async ({ page }) => {
    const prevButton = page.getByRole('button', { name: /Previou.*Round/ })
    await expect(prevButton).toBeDisabled()
  })

  test('displays player names in pairings', async ({ page }) => {
    // Player names should be visible
    await expect(page.getByText('Magnus Carlsen')).toBeVisible()
    await expect(page.getByText('Hikaru Nakamura')).toBeVisible()
  })

  test('displays player ratings', async ({ page }) => {
    await expect(page.getByText('2830')).toBeVisible()
    await expect(page.getByText('2789')).toBeVisible()
  })

  test('displays game results', async ({ page }) => {
    // Results like 1-0, 0-1, 1/2-1/2, *
    await expect(page.getByText('1/2-1/2')).toBeVisible()
  })

  test('displays move count for games', async ({ page }) => {
    await expect(page.getByText(/\d+ moves/)).toBeVisible()
  })
})

test.describe('Tournament Round - Live Game Indicators', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/rounds/1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('shows LIVE badge for ongoing games', async ({ page }) => {
    // Live badge
    await expect(page.getByText('LIVE')).toBeVisible()
  })

  test('shows "Watch Live" button for live games', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Watch Live' })).toBeVisible()
  })

  test('shows "View Game" button for finished games', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'View Game' })).toBeVisible()
  })
})

test.describe('Tournament Round - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/rounds/1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('clicking View Game navigates to board page', async ({ page }) => {
    await page.getByRole('button', { name: 'View Game' }).first().click()
    
    await expect(page).toHaveURL(/\/tournaments\/t1\/rounds\/1\/board\/g\d+/)
  })

  test('clicking Watch Live navigates to board page', async ({ page }) => {
    await page.getByRole('button', { name: 'Watch Live' }).first().click()
    
    await expect(page).toHaveURL(/\/tournaments\/t1\/rounds\/1\/board\/g\d+/)
  })

  test('Next Round button is enabled', async ({ page }) => {
    const nextButton = page.getByRole('button', { name: 'Next Round' })
    await expect(nextButton).toBeEnabled()
  })
})

test.describe('Tournament Round - Player Information', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/rounds/1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('displays player titles (GM)', async ({ page }) => {
    // GM titles should be visible
    await expect(page.getByText('GM').first()).toBeVisible()
  })

  test('displays multiple game pairings', async ({ page }) => {
    // Should have View Game or Watch Live buttons for multiple games
    const viewGameButtons = page.getByRole('button', { name: 'View Game' })
    const watchLiveButtons = page.getByRole('button', { name: 'Watch Live' })
    
    const viewCount = await viewGameButtons.count()
    const watchCount = await watchLiveButtons.count()
    
    expect(viewCount + watchCount).toBeGreaterThanOrEqual(2)
  })
})

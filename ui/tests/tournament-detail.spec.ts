import { test, expect } from '@playwright/test'

/**
 * E2E Tests: Tournament Detail Page (/tournaments/[id])
 * 
 * Tests the tournament detail layout and navigation including:
 * - Header card with tournament info
 * - Tab navigation (Overview, Round, Standing, Player, Game)
 * - Tab content switching
 * - Share and Follow buttons
 */

test.describe('Tournament Detail - Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('displays tournament header with name and description', async ({ page }) => {
    // Tournament name should be visible
    await expect(page.getByText('Spring Championship 2025')).toBeVisible()

    // Description should be visible
    await expect(page.getByText('The annual spring championship')).toBeVisible()
  })

  test('displays tournament metadata (dates, location, time control)', async ({ page }) => {
    // Check date range
    await expect(page.getByText(/2025-04-01/)).toBeVisible()
    await expect(page.getByText(/2025-04-10/)).toBeVisible()

    // Check location
    await expect(page.getByText('New York, USA')).toBeVisible()

    // Check time control and rounds
    await expect(page.getByText(/90\+30/)).toBeVisible()
    await expect(page.getByText(/9 Rounds/)).toBeVisible()
  })

  test('displays Share and Follow Event buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Share' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Follow Event' })).toBeVisible()
  })

  test('renders all navigation tabs', async ({ page }) => {
    // Note: Tab names might be truncated (Round instead of Rounds, etc.)
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Round/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Standing/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Player/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Game/ })).toBeVisible()
  })
})

test.describe('Tournament Detail - Tab Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('Overview tab shows top players and recent games', async ({ page }) => {
    // Should show Top Players section
    await expect(page.getByText('Top Players')).toBeVisible()
    
    // Should show Recent Games section
    await expect(page.getByText('Recent Games')).toBeVisible()
  })

  test('navigates to Round tab and shows round content', async ({ page }) => {
    await page.getByRole('tab', { name: /Round/ }).click()
    
    await expect(page).toHaveURL(/\/tournaments\/t1\/rounds\/1/)
    await expect(page.getByText(/Round.*Pairings/)).toBeVisible()
  })

  test('navigates to Standing tab and shows standings table', async ({ page }) => {
    await page.getByRole('tab', { name: /Standing/ }).click()
    
    await expect(page).toHaveURL(/\/tournaments\/t1\/standings/)
    await expect(page.getByText('Standings')).toBeVisible()
  })

  test('navigates to Player tab and shows player cards', async ({ page }) => {
    await page.getByRole('tab', { name: /Player/ }).click()
    
    await expect(page).toHaveURL(/\/tournaments\/t1\/players/)
    await expect(page.getByText('Participants')).toBeVisible()
    
    // Check for player names
    await expect(page.getByText('Magnus Carlsen')).toBeVisible()
  })

  test('navigates to Game tab and shows games table', async ({ page }) => {
    await page.getByRole('tab', { name: /Game/ }).click()
    
    await expect(page).toHaveURL(/\/tournaments\/t1\/games/)
    await expect(page.getByText('All Games')).toBeVisible()
  })
})

test.describe('Tournament Detail - Overview Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('displays Top Players with player names and scores', async ({ page }) => {
    // Top Players section
    await expect(page.getByText('Top Players')).toBeVisible()
    
    // Player names should be visible
    await expect(page.getByText('Magnus Carlsen')).toBeVisible()
    await expect(page.getByText('Hikaru Nakamura')).toBeVisible()
  })

  test('displays Recent Games with results', async ({ page }) => {
    await expect(page.getByText('Recent Games')).toBeVisible()
    
    // Should show game results
    await expect(page.getByText('1/2-1/2')).toBeVisible()
  })

  test('shows player ratings in Top Players section', async ({ page }) => {
    // Check that ratings are displayed
    await expect(page.getByText('2830')).toBeVisible()
    await expect(page.getByText('2789')).toBeVisible()
  })
})

import { test, expect } from '@playwright/test'

/**
 * E2E Tests: Tournament List Page (/tournaments)
 * 
 * Tests the main tournament listing page functionality including:
 * - Tournament card rendering
 * - Status badges (Live, Upcoming, Finished)
 * - Navigation to tournament detail pages
 * - Responsive layout
 */

test.describe('Tournament List Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments')
    // Close any modal/dialog that might appear
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('renders page header with title and description', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Tournaments' })).toBeVisible()
    await expect(page.getByText('Follow the latest chess tournaments')).toBeVisible()
  })

  test('renders tournament cards with View Tournament buttons', async ({ page }) => {
    // Should display View Tournament buttons
    const viewButtons = page.getByRole('button', { name: 'View Tournament' })
    await expect(viewButtons.first()).toBeVisible()

    // Check for tournament name
    await expect(page.getByText('Spring Championship 2025')).toBeVisible()
  })

  test('displays all three tournaments', async ({ page }) => {
    // We expect 3 mock tournaments
    const viewButtons = page.getByRole('button', { name: 'View Tournament' })
    await expect(viewButtons).toHaveCount(3)
    
    // Verify tournament names
    await expect(page.getByText('Spring Championship 2025')).toBeVisible()
    await expect(page.getByText('Candidates Tournament 2025')).toBeVisible()
    await expect(page.getByText('Blitz Bonanza')).toBeVisible()
  })

  test('displays tournament metadata (dates, location, time control)', async ({ page }) => {
    // Check for location
    await expect(page.getByText('New York, USA')).toBeVisible()
    await expect(page.getByText('Toronto, Canada')).toBeVisible()
    await expect(page.getByText('Online')).toBeVisible()

    // Check for time control and rounds text
    await expect(page.getByText(/9 Rounds/)).toBeVisible()
    await expect(page.getByText(/14 Rounds/)).toBeVisible()
  })

  test('navigates to tournament detail page on View Tournament click', async ({ page }) => {
    // Click the first "View Tournament" button
    await page.getByRole('button', { name: 'View Tournament' }).first().click()

    // Should navigate to tournament detail page
    await expect(page).toHaveURL(/\/tournaments\/t\d+/)
  })

  test('displays status badges for tournaments', async ({ page }) => {
    // Check for Live badge
    await expect(page.getByText('Live').first()).toBeVisible()
    
    // Check for Upcoming badge
    await expect(page.getByText('Upcoming').first()).toBeVisible()
    
    // Check for Finished badge
    await expect(page.getByText('Finished').first()).toBeVisible()
  })

  test('responsive grid layout - shows grid container', async ({ page }) => {
    // Set viewport to large screen
    await page.setViewportSize({ width: 1280, height: 800 })
    
    // The grid container should be visible
    const mainContent = page.locator('main')
    await expect(mainContent).toBeVisible()
    
    // All 3 tournament buttons should be visible
    const buttons = page.getByRole('button', { name: 'View Tournament' })
    await expect(buttons).toHaveCount(3)
  })

  test('responsive grid layout - mobile shows cards stacked', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    
    // Cards should still be visible
    await expect(page.getByText('Spring Championship 2025')).toBeVisible()
    
    // All 3 View Tournament buttons should still work
    const buttons = page.getByRole('button', { name: 'View Tournament' })
    await expect(buttons).toHaveCount(3)
  })
})

test.describe('Tournament List - Interaction Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('all View Tournament buttons are clickable and enabled', async ({ page }) => {
    const buttons = page.getByRole('button', { name: 'View Tournament' })
    const count = await buttons.count()
    
    expect(count).toBe(3)
    
    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i)
      await expect(button).toBeEnabled()
    }
  })

  test('clicking View Tournament navigates to correct tournament', async ({ page }) => {
    // Click first tournament
    await page.getByRole('button', { name: 'View Tournament' }).first().click()
    await expect(page).toHaveURL(/\/tournaments\/t1/)
    
    // Go back
    await page.goBack()
    await page.waitForTimeout(300)
    
    // Click second tournament  
    await page.getByRole('button', { name: 'View Tournament' }).nth(1).click()
    await expect(page).toHaveURL(/\/tournaments\/t2/)
  })
})

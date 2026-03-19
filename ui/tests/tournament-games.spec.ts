import { test, expect } from '@playwright/test'

/**
 * E2E Tests: Tournament Games Page (/tournaments/[id]/games)
 * 
 * Tests the all games listing including:
 * - Games table display
 * - Player information
 * - Results display
 * - Navigation to game view
 */

test.describe('Tournament Games - Page Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/games')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('displays navigation tabs', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Game/ })).toBeVisible()
  })

  test('displays games table with rows', async ({ page }) => {
    const table = page.getByRole('table')
    await expect(table).toBeVisible()
  })

  test('displays View buttons for games', async ({ page }) => {
    const viewButtons = page.getByRole('button', { name: 'View' })
    await expect(viewButtons.first()).toBeVisible()
  })
})

test.describe('Tournament Games - Game Data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/games')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('displays player names', async ({ page }) => {
    // Player names in table (might be truncated like "Magnu Carl en")
    await expect(page.getByText(/Magnus|Magnu/)).toBeVisible()
    await expect(page.getByText(/Hikaru|Nakamura/)).toBeVisible()
  })

  test('displays player ratings', async ({ page }) => {
    await expect(page.getByText('2830')).toBeVisible()
    await expect(page.getByText('2789')).toBeVisible()
  })

  test('displays game results', async ({ page }) => {
    // Results like 1-0, 0-1, 1/2-1/2, *
    await expect(page.getByText('1/2-1/2').first()).toBeVisible()
    await expect(page.getByText('1-0').first()).toBeVisible()
  })

  test('displays round numbers', async ({ page }) => {
    await expect(page.getByText(/Round 1/)).toBeVisible()
  })

  test('displays move counts', async ({ page }) => {
    await expect(page.getByText('45')).toBeVisible()
    await expect(page.getByText('32')).toBeVisible()
  })
})

test.describe('Tournament Games - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/games')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('View button navigates to board page', async ({ page }) => {
    await page.getByRole('button', { name: 'View' }).first().click()
    
    await expect(page).toHaveURL(/\/tournaments\/t1\/rounds\/\d+\/board\/g\d+/)
  })

  test('multiple View buttons are present', async ({ page }) => {
    const viewButtons = page.getByRole('button', { name: 'View' })
    const count = await viewButtons.count()
    expect(count).toBeGreaterThan(5)
  })
})

test.describe('Tournament Games - Multiple Rounds', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/games')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('displays games from multiple rounds', async ({ page }) => {
    // Should show games from different rounds
    await expect(page.getByText('Round 1').first()).toBeVisible()
    await expect(page.getByText('Round 2').first()).toBeVisible()
  })
})

test.describe('Tournament Games - Responsive', () => {
  test('table is visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/tournaments/t1/games')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // Table should be visible
    await expect(page.getByRole('table')).toBeVisible()
    
    // View buttons should work
    const viewButtons = page.getByRole('button', { name: 'View' })
    await expect(viewButtons.first()).toBeVisible()
  })
})

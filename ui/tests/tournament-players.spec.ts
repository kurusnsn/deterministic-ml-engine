import { test, expect } from '@playwright/test'

/**
 * E2E Tests: Tournament Players Page (/tournaments/[id]/players)
 * 
 * Tests the participants display including:
 * - Player card grid
 * - Player information display
 * - Search functionality
 */

test.describe('Tournament Players - Page Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/players')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('displays Participant heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Participant' })).toBeVisible()
  })

  test('displays search input', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: 'Search player...' })).toBeVisible()
  })

  test('displays sort button', async ({ page }) => {
    // There should be a button for sorting
    const buttons = page.getByRole('button')
    const count = await buttons.count()
    expect(count).toBeGreaterThan(3) // At least share, follow, toggle theme, sort
  })
})

test.describe('Tournament Players - Player Cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/players')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('displays player names', async ({ page }) => {
    await expect(page.getByText('Magnus Carlsen')).toBeVisible()
    await expect(page.getByText('Hikaru Nakamura')).toBeVisible()
    await expect(page.getByText('Fabiano Caruana')).toBeVisible()
  })

  test('displays player ratings', async ({ page }) => {
    await expect(page.getByText('2830')).toBeVisible()
    await expect(page.getByText('2789')).toBeVisible()
    await expect(page.getByText('2804')).toBeVisible()
  })

  test('displays player titles', async ({ page }) => {
    const gmText = page.getByText('GM')
    await expect(gmText.first()).toBeVisible()
  })

  test('displays country codes', async ({ page }) => {
    // Federation codes like NO, US, CN
    await expect(page.getByText('NO')).toBeVisible()
    await expect(page.getByText('US').first()).toBeVisible()
  })
})

test.describe('Tournament Players - Search Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/players')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('search input can receive text', async ({ page }) => {
    const searchInput = page.getByRole('textbox', { name: 'Search player...' })
    await searchInput.fill('Magnus')
    await expect(searchInput).toHaveValue('Magnus')
  })

  test('search input is focusable', async ({ page }) => {
    const searchInput = page.getByRole('textbox', { name: 'Search player...' })
    await searchInput.focus()
    await expect(searchInput).toBeFocused()
  })
})

test.describe('Tournament Players - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/players')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('can navigate to standings tab', async ({ page }) => {
    await page.getByRole('tab', { name: /Standing/ }).click()
    await expect(page).toHaveURL(/\/tournaments\/t1\/standings/)
  })

  test('can navigate to games tab', async ({ page }) => {
    await page.getByRole('tab', { name: /Game/ }).click()
    await expect(page).toHaveURL(/\/tournaments\/t1\/games/)
  })
})

test.describe('Tournament Players - Responsive', () => {
  test('displays player cards on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/tournaments/t1/players')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    await expect(page.getByRole('heading', { name: 'Participant' })).toBeVisible()
    await expect(page.getByText('Magnus Carlsen')).toBeVisible()
  })
})

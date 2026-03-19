import { test, expect } from '@playwright/test'

/**
 * E2E Tests: Live Game Page Functionality
 * 
 * Tests real-time features for:
 * - Board page components
 * - Chat interactions
 * - Commentary interactions
 * - Clock display
 */

test.describe('Live Game Page - Components', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/rounds/1/board/g3')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('page loads with key UI elements', async ({ page }) => {
    // Chat input displays
    await expect(page.getByRole('textbox', { name: 'Say something...' }).first()).toBeVisible()
    
    // Commentary buttons exist
    await expect(page.getByRole('button', { name: 'Explain Move' })).toBeVisible()
    
    // Progress bars for clocks
    const progressBars = page.getByRole('progressbar')
    await expect(progressBars.first()).toBeVisible()
  })

  test('navigation tabs are present', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Chat' }).first()).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Note' }).first()).toBeVisible()
  })
})

test.describe('Chat Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/rounds/1/board/g1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('chat input accepts user typing', async ({ page }) => {
    const chatInput = page.getByRole('textbox', { name: 'Say something...' }).first()
    await chatInput.fill('This is a test message')
    
    await expect(chatInput).toHaveValue('This is a test message')
  })

  test('chat tab can be switched', async ({ page }) => {
    // Switch to Note tab
    await page.getByRole('tab', { name: 'Note' }).first().click()
    
    // Switch back to Chat
    await page.getByRole('tab', { name: 'Chat' }).first().click()
    
    // Chat input should be visible
    await expect(page.getByRole('textbox', { name: 'Say something...' }).first()).toBeVisible()
  })
})

test.describe('Commentary Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/rounds/1/board/g1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('Explain Move button is interactive', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Explain Move' })
    await expect(button).toBeEnabled()
    
    // Click and verify button responds
    await button.click()
    await expect(button).toBeVisible()
  })

  test('Best Line button is interactive', async ({ page }) => {
    const button = page.getByRole('button', { name: /Be.*Line/ })
    await expect(button).toBeEnabled()
    
    await button.click()
    await expect(button).toBeVisible()
  })

  test('Why Mistake button is interactive', async ({ page }) => {
    const button = page.getByRole('button', { name: /Why.*take/ })
    await expect(button).toBeEnabled()
    
    await button.click()
    await expect(button).toBeVisible()
  })
})

test.describe('Player Info Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/rounds/1/board/g1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('displays player names', async ({ page }) => {
    await expect(page.getByText('Magnus Carlsen')).toBeVisible()
    await expect(page.getByText('Hikaru Nakamura')).toBeVisible()
  })

  test('displays player ratings', async ({ page }) => {
    await expect(page.getByText('2830')).toBeVisible()
    await expect(page.getByText('2789')).toBeVisible()
  })
})

test.describe('Multi-Device Testing', () => {
  test('tablet viewport shows proper layout', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/tournaments/t1/rounds/1/board/g1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // Key elements should still be visible
    await expect(page.getByRole('button', { name: 'Explain Move' })).toBeVisible()
  })

  test('mobile viewport shows key elements', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/tournaments/t1/rounds/1/board/g1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // Should still have chat input
    await expect(page.getByRole('textbox', { name: 'Say something...' }).first()).toBeVisible()
  })

  test('ultra-wide viewport works', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/tournaments/t1/rounds/1/board/g1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // All key elements should be visible
    await expect(page.getByRole('button', { name: 'Explain Move' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Say something...' }).first()).toBeVisible()
  })
})

test.describe('Navigation from Board Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/rounds/1/board/g1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('can navigate to other tabs from board page', async ({ page }) => {
    // Navigate to Standing tab
    await page.getByRole('tab', { name: /Standing/ }).click()
    await expect(page).toHaveURL(/\/tournaments\/t1\/standings/)
    
    // Navigate back to Round tab
    await page.getByRole('tab', { name: /Round/ }).click()
    await expect(page).toHaveURL(/\/tournaments\/t1\/rounds\/1/)
  })
})

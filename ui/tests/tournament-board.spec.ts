import { test, expect } from '@playwright/test'

/**
 * E2E Tests: Tournament Board Page (/tournaments/[id]/rounds/[round]/board/[gameId])
 * 
 * Tests the live game broadcasting view including:
 * - Chessboard display
 * - Clock cards showing time and players
 * - Move list navigation
 * - AI Commentary panel
 * - Chat functionality in sidebar
 * - Navigation controls
 */

test.describe('Tournament Board - Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/rounds/1/board/g1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })

  test('displays Chat and Note tabs', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Chat' }).first()).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Note' }).first()).toBeVisible()
  })

  test('displays commentary action buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Explain Move' })).toBeVisible()
  })

  test('displays chat input field', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: 'Say something...' }).first()).toBeVisible()
  })

  test('displays Best Line button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Be.*Line/ })).toBeVisible()
  })

  test('displays Why Mistake button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Why.*take/ })).toBeVisible()
  })

  test('displays progress bars for player clocks', async ({ page }) => {
    const progressBars = page.getByRole('progressbar')
    await expect(progressBars.first()).toBeVisible()
  })
})

test.describe('Tournament Board - Tab Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/rounds/1/board/g1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('has multiple navigation buttons', async ({ page }) => {
    const buttons = page.getByRole('button')
    const count = await buttons.count()
    expect(count).toBeGreaterThan(10)
  })

  test('can switch to Note tab', async ({ page }) => {
    const noteTab = page.getByRole('tab', { name: 'Note' }).first()
    await noteTab.click()
    await expect(noteTab).toBeVisible()
  })
})

test.describe('Tournament Board - Chat Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/rounds/1/board/g1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('chat input accepts text', async ({ page }) => {
    const chatInput = page.getByRole('textbox', { name: 'Say something...' }).first()
    await chatInput.fill('Hello from test')
    await expect(chatInput).toHaveValue('Hello from test')
  })

  test('has send button next to chat input', async ({ page }) => {
    // There should be a button near the chat input
    const chatInputContainer = page.locator('div').filter({ has: page.getByRole('textbox', { name: 'Say something...' }) })
    const sendButton = chatInputContainer.getByRole('button').first()
    await expect(sendButton).toBeVisible()
  })
})

test.describe('Tournament Board - Commentary', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/rounds/1/board/g1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('Explain Move button is clickable', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Explain Move' })
    await expect(button).toBeEnabled()
    await button.click()
    await expect(button).toBeVisible()
  })

  test('Best Line button is clickable', async ({ page }) => {
    const button = page.getByRole('button', { name: /Be.*Line/ })
    await expect(button).toBeEnabled()
    await button.click()
    await expect(button).toBeVisible()
  })

  test('Why Mistake button is clickable', async ({ page }) => {
    const button = page.getByRole('button', { name: /Why.*take/ })
    await expect(button).toBeEnabled()
    await button.click()
    await expect(button).toBeVisible()
  })
})

test.describe('Tournament Board - Player Info', () => {
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

test.describe('Tournament Board - Responsive', () => {
  test('works on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/tournaments/t1/rounds/1/board/g1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // Key elements should still be visible
    await expect(page.getByRole('button', { name: 'Explain Move' })).toBeVisible()
  })

  test('works on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/tournaments/t1/rounds/1/board/g1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // Should still have chat input
    await expect(page.getByRole('textbox', { name: 'Say something...' }).first()).toBeVisible()
  })
})

import { test, expect } from '@playwright/test'

/**
 * E2E Scenario Tests: Complete User Flows
 * 
 * These tests validate full user journeys through the broadcasting system:
 * - Tournament → Round → Board navigation
 * - Tab navigation
 * - Commentary interactions
 */

test.describe('E2E Scenario A: Tournament → Round → Board', () => {
  test('complete navigation flow from tournament list to game board', async ({ page }) => {
    // Step 1: Visit /tournaments
    await page.goto('/tournaments')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    await expect(page.getByRole('heading', { name: 'Tournaments' })).toBeVisible()

    // Step 2: Click a tournament card (Spring Championship)
    await page.getByRole('button', { name: 'View Tournament' }).first().click()

    // Step 3: Verify landing on tournament detail page
    await expect(page).toHaveURL(/\/tournaments\/t\d+/)
    await expect(page.getByText('Spring Championship 2025')).toBeVisible()

    // Step 4: Navigate to Round tab
    await page.getByRole('tab', { name: /Round/ }).click()
    await expect(page).toHaveURL(/\/tournaments\/t\d+\/rounds\/1/)
    await expect(page.getByText(/Round.*Pairing/)).toBeVisible()

    // Step 5: Verify player names are displayed
    await expect(page.getByText('Magnus Carlsen').first()).toBeVisible()

    // Step 6: Click a game to view board
    await page.getByRole('button', { name: /View Game|Watch Live/ }).first().click()

    // Step 7: Verify board page loads with key components
    await expect(page).toHaveURL(/\/tournaments\/t\d+\/rounds\/\d+\/board\/g\d+/)
    
    // Verify chat input
    await expect(page.getByRole('textbox', { name: 'Say something...' }).first()).toBeVisible()
    
    // Verify commentary buttons
    await expect(page.getByRole('button', { name: 'Explain Move' })).toBeVisible()
  })

  test('navigation preserves tournament context across tabs', async ({ page }) => {
    await page.goto('/tournaments/t1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // Navigate through tabs
    const tabs = [/Round/, /Standing/, /Player/, /Game/, 'Overview']
    
    for (const tabName of tabs) {
      await page.getByRole('tab', { name: tabName }).click()
      await page.waitForTimeout(200)
      
      // Tournament name should remain visible
      await expect(page.getByText('Spring Championship 2025')).toBeVisible()
    }
  })
})

test.describe('E2E Scenario B: Standings & Player Pages', () => {
  test('load standings and verify player data', async ({ page }) => {
    await page.goto('/tournaments/t1/standings')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // Verify standings heading
    await expect(page.getByRole('heading', { name: 'Standing' })).toBeVisible()
    
    // Verify first place player
    await expect(page.getByText('#1')).toBeVisible()
    await expect(page.getByText('Magnus Carlsen')).toBeVisible()
    await expect(page.getByText('4.5')).toBeVisible()
  })

  test('navigate between players and standings pages', async ({ page }) => {
    await page.goto('/tournaments/t1/standings')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // Switch to Player tab
    await page.getByRole('tab', { name: /Player/ }).click()
    
    await expect(page).toHaveURL(/\/tournaments\/t1\/players/)
    await expect(page.getByRole('heading', { name: 'Participant' })).toBeVisible()
    
    // Switch back to Standing
    await page.getByRole('tab', { name: /Standing/ }).click()
    
    await expect(page).toHaveURL(/\/tournaments\/t1\/standings/)
  })
})

test.describe('E2E Scenario C: Games List Navigation', () => {
  test('navigate from games list to specific game board', async ({ page }) => {
    await page.goto('/tournaments/t1/games')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // Verify games table
    await expect(page.getByRole('table')).toBeVisible()
    
    // Click View on first game
    await page.getByRole('button', { name: 'View' }).first().click()
    
    // Should navigate to board page
    await expect(page).toHaveURL(/\/tournaments\/t1\/rounds\/\d+\/board\/g\d+/)
  })
})

test.describe('E2E Scenario D: Board Page Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/rounds/1/board/g1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('switch between Chat and Note tabs in sidebar', async ({ page }) => {
    // Verify Chat tab content (input field)
    await expect(page.getByRole('textbox', { name: 'Say something...' }).first()).toBeVisible()
    
    // Switch to Note tab
    await page.getByRole('tab', { name: 'Note' }).first().click()
    
    // Switch back to Chat
    await page.getByRole('tab', { name: 'Chat' }).first().click()
    
    // Chat input should be visible again
    await expect(page.getByRole('textbox', { name: 'Say something...' }).first()).toBeVisible()
  })

  test('chat input accepts text input', async ({ page }) => {
    const chatInput = page.getByRole('textbox', { name: 'Say something...' }).first()
    await chatInput.fill('Great game!')
    
    await expect(chatInput).toHaveValue('Great game!')
  })
})

test.describe('E2E Scenario E: Commentary Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/t1/rounds/1/board/g1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('commentary action buttons are clickable', async ({ page }) => {
    const explainButton = page.getByRole('button', { name: 'Explain Move' })
    const bestLineButton = page.getByRole('button', { name: /Be.*Line/ })
    const whyMistakeButton = page.getByRole('button', { name: /Why.*take/ })
    
    await expect(explainButton).toBeEnabled()
    await expect(bestLineButton).toBeEnabled()
    await expect(whyMistakeButton).toBeEnabled()
    
    // Click Explain Move
    await explainButton.click()
    await expect(explainButton).toBeVisible()
  })
})

test.describe('E2E Scenario F: Mobile Responsiveness', () => {
  test('tournament list is usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/tournaments')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // Tournament name should be visible
    await expect(page.getByText('Spring Championship 2025')).toBeVisible()
    
    // View Tournament buttons should be visible
    const viewButtons = page.getByRole('button', { name: 'View Tournament' })
    await expect(viewButtons.first()).toBeVisible()
  })

  test('board page works on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/tournaments/t1/rounds/1/board/g1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // Key elements should be visible
    await expect(page.getByRole('textbox', { name: 'Say something...' }).first()).toBeVisible()
  })

  test('standings page works on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/tournaments/t1/standings')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // Heading should be visible
    await expect(page.getByRole('heading', { name: 'Standing' })).toBeVisible()
    
    // Content should be accessible
    await expect(page.getByText('Magnus Carlsen')).toBeVisible()
  })
})

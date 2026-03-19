import { test, expect } from '@playwright/test'

test.describe('ChessBoard Layout Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analyze')
    // Wait for board to be loaded
    await page.waitForSelector('[class*="chessboard"]', { timeout: 5000 })
  })

  test('Board and right panel are positioned side-by-side', async ({ page }) => {
    // Get the board container and right panel
    const boardContainer = page.locator('div.relative.bg-white').first()
    const rightPanel = page.locator('aside.bg-white.shadow.rounded')

    await expect(boardContainer).toBeVisible()
    await expect(rightPanel).toBeVisible()

    // Get bounding boxes
    const boardBox = await boardContainer.boundingBox()
    const panelBox = await rightPanel.boundingBox()

    expect(boardBox).not.toBeNull()
    expect(panelBox).not.toBeNull()

    if (boardBox && panelBox) {
      // Panel should be to the right of the board (panel.x > board.x + board.width)
      expect(panelBox.x).toBeGreaterThan(boardBox.x)

      // They should be on approximately the same vertical level (allowing some tolerance)
      expect(Math.abs(boardBox.y - panelBox.y)).toBeLessThan(50)
    }
  })

  test('Control buttons are directly below the board', async ({ page }) => {
    // Find the control buttons by their text
    const undoButton = page.getByRole('button', { name: 'Undo' })
    const resetButton = page.getByRole('button', { name: 'Reset' })
    const startButton = page.getByRole('button', { name: 'Start' })
    const endButton = page.getByRole('button', { name: 'End' })
    const flipButton = page.getByRole('button', { name: 'Flip' })
    const saveStudyButton = page.getByRole('button', { name: 'Save Study' })

    await expect(undoButton).toBeVisible()
    await expect(resetButton).toBeVisible()
    await expect(startButton).toBeVisible()
    await expect(endButton).toBeVisible()
    await expect(flipButton).toBeVisible()
    await expect(saveStudyButton).toBeVisible()

    // Get the board and buttons positions
    const boardContainer = page.locator('div.relative.bg-white').first()
    const boardBox = await boardContainer.boundingBox()
    const undoBox = await undoButton.boundingBox()

    expect(boardBox).not.toBeNull()
    expect(undoBox).not.toBeNull()

    if (boardBox && undoBox) {
      // Buttons should be below the board (button.y > board.y + board.height)
      expect(undoBox.y).toBeGreaterThan(boardBox.y + boardBox.height)

      // Buttons should be roughly aligned with the left edge of the board
      expect(Math.abs(undoBox.x - boardBox.x)).toBeLessThan(100)
    }
  })

  test('PGN section is below the control buttons', async ({ page }) => {
    const pgnHeading = page.getByRole('heading', { name: 'PGN' })
    await expect(pgnHeading).toBeVisible()

    const undoButton = page.getByRole('button', { name: 'Undo' })
    const pgnBox = await pgnHeading.boundingBox()
    const undoBox = await undoButton.boundingBox()

    expect(pgnBox).not.toBeNull()
    expect(undoBox).not.toBeNull()

    if (pgnBox && undoBox) {
      // PGN should be below the control buttons
      expect(pgnBox.y).toBeGreaterThan(undoBox.y)
    }
  })

  test('FEN section is below the PGN section', async ({ page }) => {
    const pgnHeading = page.getByRole('heading', { name: 'PGN' })
    const fenHeading = page.getByRole('heading', { name: 'FEN' })

    await expect(pgnHeading).toBeVisible()
    await expect(fenHeading).toBeVisible()

    const pgnBox = await pgnHeading.boundingBox()
    const fenBox = await fenHeading.boundingBox()

    expect(pgnBox).not.toBeNull()
    expect(fenBox).not.toBeNull()

    if (pgnBox && fenBox) {
      // FEN should be below PGN
      expect(fenBox.y).toBeGreaterThan(pgnBox.y)
    }
  })

  test('Move History panel is in the right panel', async ({ page }) => {
    const moveHistoryTab = page.getByRole('button', { name: 'Move History' })
    const rightPanel = page.locator('aside.bg-white.shadow.rounded')

    await expect(moveHistoryTab).toBeVisible()
    await expect(rightPanel).toBeVisible()

    // Check that Move History tab is inside the right panel
    const tabBox = await moveHistoryTab.boundingBox()
    const panelBox = await rightPanel.boundingBox()

    expect(tabBox).not.toBeNull()
    expect(panelBox).not.toBeNull()

    if (tabBox && panelBox) {
      // Tab should be inside the panel
      expect(tabBox.x).toBeGreaterThanOrEqual(panelBox.x)
      expect(tabBox.x + tabBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width)
      expect(tabBox.y).toBeGreaterThanOrEqual(panelBox.y)
    }
  })

  test('Opening Book panel is below the right panel', async ({ page }) => {
    const openingTheoryHeading = page.getByText('Opening Theory')
    const rightPanel = page.locator('aside.bg-white.shadow.rounded')

    // Opening book might not be immediately visible, so we check if it exists in the DOM
    const openingBookExists = await openingTheoryHeading.count() > 0

    if (openingBookExists) {
      const openingBox = await openingTheoryHeading.boundingBox()
      const panelBox = await rightPanel.boundingBox()

      expect(panelBox).not.toBeNull()

      if (openingBox && panelBox) {
        // Opening Book should be below the right panel
        expect(openingBox.y).toBeGreaterThan(panelBox.y + panelBox.height - 100)
      }
    }
  })

  test('Board to panel width ratio is maintained', async ({ page }) => {
    const boardContainer = page.locator('div.relative.bg-white').first()
    const rightPanel = page.locator('aside.bg-white.shadow.rounded')

    const boardBox = await boardContainer.boundingBox()
    const panelBox = await rightPanel.boundingBox()

    expect(boardBox).not.toBeNull()
    expect(panelBox).not.toBeNull()

    if (boardBox && panelBox) {
      const ratio = boardBox.width / panelBox.width
      // The ratio should be approximately 1.46 (allowing 10% tolerance)
      expect(ratio).toBeGreaterThan(1.3)
      expect(ratio).toBeLessThan(1.6)
    }
  })

  test('Total width is approximately 90% of viewport', async ({ page }) => {
    const container = page.locator('div.flex.flex-col.items-start').first()

    const containerBox = await container.boundingBox()
    const viewportSize = page.viewportSize()

    expect(containerBox).not.toBeNull()
    expect(viewportSize).not.toBeNull()

    if (containerBox && viewportSize) {
      const widthPercentage = (containerBox.width / viewportSize.width) * 100
      // Should be approximately 90% (allowing some tolerance)
      expect(widthPercentage).toBeGreaterThan(85)
      expect(widthPercentage).toBeLessThan(95)
    }
  })

  test('Control buttons are NOT in the Move History tab content', async ({ page }) => {
    // Click on Move History tab to ensure it's active
    await page.getByRole('button', { name: 'Move History' }).click()

    // Get the tab content area
    const tabContent = page.locator('div.flex-1.overflow-y-auto').first()

    // Check that control buttons are NOT inside the tab content
    const undoInTab = tabContent.getByRole('button', { name: 'Undo' })
    const resetInTab = tabContent.getByRole('button', { name: 'Reset' })

    await expect(undoInTab).toHaveCount(0)
    await expect(resetInTab).toHaveCount(0)
  })
})

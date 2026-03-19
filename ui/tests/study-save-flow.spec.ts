import { test, expect } from '@playwright/test';

test.describe('Study Save and Display Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    // Set up session ID in localStorage
    await context.addInitScript(() => {
      localStorage.setItem('session-id', '00000000-0000-0000-0000-000000000001');
    });
  });

  test('should save a study and display it on profile page', async ({ page }) => {
    console.log('[TEST] 🎬 Starting study save and display test...');

    // Step 1: Go to analyze page
    console.log('[TEST] Step 1: Navigate to analyze page');
    await page.goto('http://localhost:3006/analyze');
    await page.waitForLoadState('networkidle');

    // Step 2: Wait for the board to load
    console.log('[TEST] Step 2: Wait for chessboard to load');
    await expect(page.locator('.chessboard')).toBeVisible({ timeout: 10000 });

    // Step 3: Make a few moves to create content
    console.log('[TEST] Step 3: Make moves on the board');
    // Click on e2 pawn
    await page.locator('[data-square="e2"]').click();
    await page.waitForTimeout(500);
    // Click on e4
    await page.locator('[data-square="e4"]').click();
    await page.waitForTimeout(500);

    // Step 4: Open save dialog
    console.log('[TEST] Step 4: Open save dialog');
    const saveButton = page.getByRole('button', { name: /save/i });
    await expect(saveButton).toBeVisible({ timeout: 5000 });
    await saveButton.click();

    // Step 5: Enter study name
    console.log('[TEST] Step 5: Enter study name');
    const nameInput = page.locator('input[placeholder*="name" i], input[type="text"]').first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });

    const testStudyName = `Test Study ${Date.now()}`;
    console.log(`[TEST] Study name: ${testStudyName}`);
    await nameInput.fill(testStudyName);

    // Step 6: Click confirm/save button in dialog
    console.log('[TEST] Step 6: Click save button in dialog');
    const confirmButton = page.getByRole('button', { name: /save|confirm|ok/i }).last();
    await confirmButton.click();

    // Step 7: Wait for success message
    console.log('[TEST] Step 7: Wait for save confirmation');
    await page.waitForTimeout(2000);

    // Step 8: Navigate to profile page
    console.log('[TEST] Step 8: Navigate to profile page');
    await page.goto('http://localhost:3006/profile');
    await page.waitForLoadState('networkidle');

    // Step 9: Wait for studies to load
    console.log('[TEST] Step 9: Wait for studies section to load');
    await page.waitForTimeout(3000);

    // Step 10: Check if the study appears
    console.log('[TEST] Step 10: Verify study appears on profile page');

    // Look for the study by name
    const studyCard = page.locator(`text="${testStudyName}"`);

    // Take a screenshot for debugging
    await page.screenshot({ path: 'test-results/study-save-flow.png', fullPage: true });

    // Check if study is visible
    const isVisible = await studyCard.isVisible().catch(() => false);
    console.log(`[TEST] Study visible: ${isVisible}`);

    if (!isVisible) {
      // Debug: Log all visible text content
      const bodyText = await page.locator('body').textContent();
      console.log('[TEST] Page content:', bodyText?.substring(0, 500));

      // Count how many studies are shown
      const studyCards = page.locator('[data-testid="study-card"], .study-card, article').filter({
        hasText: /study/i
      });
      const count = await studyCards.count();
      console.log(`[TEST] Number of study cards found: ${count}`);
    }

    expect(isVisible).toBe(true);
    console.log('[TEST] ✅ Test completed successfully!');
  });

  test('should verify study persistence across page reloads', async ({ page }) => {
    console.log('[TEST] 🎬 Starting study persistence test...');

    const testStudyName = `Persistence Test ${Date.now()}`;

    // Step 1: Create and save a study
    console.log('[TEST] Step 1: Create and save a study');
    await page.goto('http://localhost:3006/analyze');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.chessboard')).toBeVisible({ timeout: 10000 });

    // Make a move
    await page.locator('[data-square="e2"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-square="e4"]').click();
    await page.waitForTimeout(500);

    // Save the study
    const saveButton = page.getByRole('button', { name: /save/i });
    await saveButton.click();
    const nameInput = page.locator('input[placeholder*="name" i], input[type="text"]').first();
    await nameInput.fill(testStudyName);
    const confirmButton = page.getByRole('button', { name: /save|confirm|ok/i }).last();
    await confirmButton.click();
    await page.waitForTimeout(2000);

    // Step 2: Go to profile
    console.log('[TEST] Step 2: Navigate to profile');
    await page.goto('http://localhost:3006/profile');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Step 3: Verify study is there
    console.log('[TEST] Step 3: Verify study appears');
    const studyCard1 = page.locator(`text="${testStudyName}"`);
    await expect(studyCard1).toBeVisible({ timeout: 5000 });

    // Step 4: Reload the page
    console.log('[TEST] Step 4: Reload the page');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Step 5: Verify study is still there after reload
    console.log('[TEST] Step 5: Verify study persists after reload');
    const studyCard2 = page.locator(`text="${testStudyName}"`);
    await expect(studyCard2).toBeVisible({ timeout: 5000 });

    console.log('[TEST] ✅ Persistence test completed successfully!');
  });
});

import { test, expect } from '@playwright/test';

test.describe('Activity Heatmap', () => {
  test('should load activity heatmap and track study save activity', async ({ page }) => {
    // Navigate to analyze page
    await page.goto('http://localhost:3006/analyze');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Wait a bit for session ID to be initialized
    await page.waitForTimeout(1000);

    // Check that session ID was created in localStorage
    const sessionId = await page.evaluate(() => localStorage.getItem('session-id'));
    expect(sessionId).toBeTruthy();
    console.log('Session ID created:', sessionId);

    // Make some moves to have something to save
    // Click on e2 square (assuming it's white to move)
    await page.click('[data-square="e2"]');
    await page.click('[data-square="e4"]');

    // Wait for move to register
    await page.waitForTimeout(500);

    // Look for the Save button
    const saveButton = page.locator('button:has-text("Save")').first();
    await expect(saveButton).toBeVisible({ timeout: 5000 });

    // Click save button
    await saveButton.click();

    // Wait for save dialog
    await expect(page.locator('text=Save Analysis Study')).toBeVisible({ timeout: 5000 });

    // Find the submit button in the dialog
    const submitButton = page.locator('button[type="submit"]:has-text("Save Study")');
    await expect(submitButton).toBeVisible();

    // Click to save
    await submitButton.click();

    // Wait for save to complete (either success alert or dialog close)
    await page.waitForTimeout(2000);

    // Navigate to profile page
    await page.goto('http://localhost:3006/profile');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Wait for activity heatmap to appear
    const activitySection = page.locator('text=Activity').first();
    await expect(activitySection).toBeVisible({ timeout: 10000 });

    // Check that loading indicator is NOT present (should have loaded)
    const loadingText = page.locator('text=Loading...').first();

    // Wait up to 5 seconds for loading to disappear
    await expect(loadingText).toBeHidden({ timeout: 5000 });

    // Verify heatmap is rendered (look for the grid)
    const heatmapGrid = page.locator('.flex.gap-\\[2px\\]').first();
    await expect(heatmapGrid).toBeVisible({ timeout: 5000 });

    // Verify we have at least one activity square
    const activitySquares = page.locator('.h-3.w-3.rounded-sm');
    const count = await activitySquares.count();
    console.log(`Found ${count} activity squares in heatmap`);
    expect(count).toBeGreaterThan(0);

    // Look for a square with activity (non-gray background)
    const activeSquare = page.locator('.h-3.w-3.rounded-sm.bg-emerald-200, .h-3.w-3.rounded-sm.bg-emerald-300, .h-3.w-3.rounded-sm.bg-emerald-500, .h-3.w-3.rounded-sm.bg-emerald-700').first();
    await expect(activeSquare).toBeVisible({ timeout: 5000 });

    console.log('✅ Activity heatmap loaded successfully with activity data!');
  });

  test('should show activity after importing a game', async ({ page }) => {
    // Navigate to profile
    await page.goto('http://localhost:3006/profile');
    await page.waitForLoadState('networkidle');

    // Get initial activity count
    const sessionId = await page.evaluate(() => localStorage.getItem('session-id'));
    console.log('Session ID:', sessionId);

    // Navigate to import page
    await page.goto('http://localhost:3006/import');
    await page.waitForLoadState('networkidle');

    // Wait for upload option
    await page.waitForTimeout(1000);

    // Click on Upload option
    const uploadButton = page.locator('text=Upload PGN File').or(page.locator('button:has-text("Upload")')).first();
    if (await uploadButton.isVisible()) {
      await uploadButton.click();
    } else {
      // If already on upload page, just continue
      await page.goto('http://localhost:3006/openingtree');
      await page.waitForLoadState('networkidle');
    }

    // Enter a PGN
    const pgnTextarea = page.locator('textarea[placeholder*="PGN"], textarea[placeholder*="pgn"], textarea').first();
    await expect(pgnTextarea).toBeVisible({ timeout: 5000 });

    await pgnTextarea.fill('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');

    // Click import/upload button
    const importButton = page.locator('button:has-text("Import"), button:has-text("Upload")').first();
    await expect(importButton).toBeVisible();
    await importButton.click();

    // Wait for import to complete
    await page.waitForTimeout(2000);

    // Go back to profile
    await page.goto('http://localhost:3006/profile');
    await page.waitForLoadState('networkidle');

    // Wait for activity heatmap
    await expect(page.locator('text=Activity').first()).toBeVisible({ timeout: 10000 });

    // Check loading is gone
    await expect(page.locator('text=Loading...').first()).toBeHidden({ timeout: 5000 });

    // Verify heatmap shows activity
    const activeSquare = page.locator('.bg-emerald-200, .bg-emerald-300, .bg-emerald-500, .bg-emerald-700').first();
    await expect(activeSquare).toBeVisible({ timeout: 5000 });

    console.log('✅ Game import activity tracked successfully!');
  });
});

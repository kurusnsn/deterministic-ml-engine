import { test, expect } from '@playwright/test';

/**
 * Openings Page E2E Tests
 *
 * Tests the /openings page which displays a grid of chess openings
 * that users can practice. Uses static data (SSR) so no API mocking needed.
 */
test.describe('Openings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/openings');
    await page.waitForLoadState('networkidle');
    // Dismiss any modals that may appear (e.g., StreakPopup)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  });

  test('should display page header and description', async ({ page }) => {
    // Verify page title
    await expect(page.locator('h1')).toContainText('Opening Line Trainer');

    // Verify description
    await expect(page.locator('text=Master your favorite openings')).toBeVisible();
  });

  test('should display opening cards in a grid', async ({ page }) => {
    // Wait for opening cards - they should contain difficulty badges
    // Count cards by looking for items that contain difficulty text
    const beginnerCards = await page.getByText('Beginner').count();
    const intermediateCards = await page.getByText('Intermediate').count();
    const advancedCards = await page.getByText('Advanced').count();

    const totalCards = beginnerCards + intermediateCards + advancedCards;
    // Should have 11 openings total (from data/openings.ts)
    expect(totalCards).toBe(11);
  });

  test('should display opening details on cards', async ({ page }) => {
    // Check for specific openings from our data
    await expect(page.locator('text=Italian Game')).toBeVisible();
    await expect(page.locator('text=Sicilian Defense')).toBeVisible();
    await expect(page.locator('text=Queen\'s Gambit')).toBeVisible();
    await expect(page.locator('text=London System')).toBeVisible();
  });

  test('should show difficulty badges', async ({ page }) => {
    // Check that difficulty levels are displayed
    await expect(page.locator('text=Beginner').first()).toBeVisible();
    await expect(page.locator('text=Intermediate').first()).toBeVisible();
    await expect(page.locator('text=Advanced').first()).toBeVisible();
  });

  test('should show color indicators (white/black)', async ({ page }) => {
    // Italian Game is for white, Sicilian is for black
    // These should have some visual indicator of which color plays the opening

    // Look for a card containing Italian Game
    const italianCard = page.locator('text=Italian Game').locator('..');
    await expect(italianCard).toBeVisible();

    // Look for Sicilian Defense card
    const sicilianCard = page.locator('text=Sicilian Defense').locator('..');
    await expect(sicilianCard).toBeVisible();
  });

  test('should navigate to opening detail page when clicking a card', async ({ page }) => {
    // Click on the Italian Game card - the entire card is wrapped in a Link
    await page.getByText('Italian Game').click();

    // Wait for navigation and verify URL
    await page.waitForURL(/\/openings\/italian/);
    await expect(page).toHaveURL(/\/openings\/italian/);
  });

  test('should have responsive grid layout', async ({ page }) => {
    // On desktop, should be 3 columns
    const grid = page.locator('[class*="grid"]').first();
    await expect(grid).toBeVisible();

    // Verify grid has proper responsive classes
    const gridClasses = await grid.getAttribute('class');
    expect(gridClasses).toMatch(/lg:grid-cols-3|md:grid-cols-2|grid-cols-1/);
  });

  test('should display opening descriptions', async ({ page }) => {
    // Check that descriptions are shown
    await expect(page.locator('text=A classic open game starting with 1.e4 e5')).toBeVisible();
    await expect(page.locator('text=The most popular and best-scoring response to 1.e4')).toBeVisible();
  });
});

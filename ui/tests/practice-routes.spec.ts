import { test, expect } from '@playwright/test';

/**
 * E2E Tests: Practice Page Routes Refactor
 *
 * Tests for the new practice page route structure:
 * - /practice redirects to /practice/play-maia
 * - /practice/play-maia renders the Maia panel
 * - /practice/repertoire renders the Repertoire panel
 * - /practice/custom renders the Custom panel
 * - Navbar shows Practice dropdown with 3 submenu links
 * - Layout is consistent across all routes
 */

test.describe('Practice Routes', () => {
    test('/practice redirects to /practice/play-maia', async ({ page }) => {
        await page.goto('/practice');

        // Should redirect to play-maia
        await expect(page).toHaveURL(/\/practice\/play-maia/);
    });

    test('/practice/play-maia renders Maia panel', async ({ page }) => {
        await page.goto('/practice/play-maia');

        // Should show Maia panel content
        await expect(page.getByText('Practice vs Maia')).toBeVisible();
        await expect(page.getByText('Play against a human-like neural network')).toBeVisible();

        // Should show Maia configuration options
        await expect(page.getByText('Maia level')).toBeVisible();
        await expect(page.getByText('Time Control')).toBeVisible();
        await expect(page.getByRole('button', { name: /Start Game/i })).toBeVisible();
    });

    test('/practice/repertoire renders Repertoire panel', async ({ page }) => {
        await page.goto('/practice/repertoire');

        // Should show Repertoire panel content
        await expect(page.getByText('Practice Repertoire')).toBeVisible();
        await expect(page.getByText('Train your saved opening repertoires')).toBeVisible();
    });

    test('/practice/custom renders Custom panel', async ({ page }) => {
        await page.goto('/practice/custom');

        // Should show Custom panel content
        await expect(page.getByText('Custom Practice')).toBeVisible();
        await expect(page.getByText('Search and select specific openings')).toBeVisible();

        // Should show search input
        await expect(page.getByPlaceholder('e.g., Sicilian Defense')).toBeVisible();
    });
});

test.describe('Practice Layout Consistency', () => {
    const routes = [
        '/practice/play-maia',
        '/practice/repertoire',
        '/practice/custom',
    ];

    for (const route of routes) {
        test(`${route} has consistent layout with board and controls`, async ({ page }) => {
            await page.goto(route);

            // Wait for page to load
            await page.waitForTimeout(1000);

            // Chessboard should be present
            const chessboard = page.locator('[class*="chessboard"], [data-testid="chessboard"]').first();
            await expect(chessboard).toBeVisible({ timeout: 10000 });

            // Navigation controls should be present
            await expect(page.getByRole('button').filter({ has: page.locator('svg') }).first()).toBeVisible();
        });
    }
});

test.describe('Navbar Practice Submenu', () => {
    test('Desktop navbar shows Practice dropdown with 3 submenu items', async ({ page }) => {
        // Use a wide viewport for desktop
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.goto('/practice/play-maia');

        // Find and click the Practice trigger
        const practiceButton = page.getByRole('button', { name: 'Practice' });
        await expect(practiceButton).toBeVisible();
        await practiceButton.click();

        // Wait for dropdown to appear
        await page.waitForTimeout(500);

        // Check submenu items
        await expect(page.getByRole('link', { name: 'Play Maia' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Practice Repertoire' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Custom Openings' })).toBeVisible();
    });

    test('Desktop navbar submenu links navigate correctly', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.goto('/');

        // Open Practice dropdown
        const practiceButton = page.getByRole('button', { name: 'Practice' });
        await practiceButton.click();
        await page.waitForTimeout(300);

        // Click Play Maia link
        await page.getByRole('link', { name: 'Play Maia' }).click();
        await expect(page).toHaveURL(/\/practice\/play-maia/);

        // Navigate to Repertoire
        await practiceButton.click();
        await page.waitForTimeout(300);
        await page.getByRole('link', { name: 'Practice Repertoire' }).click();
        await expect(page).toHaveURL(/\/practice\/repertoire/);

        // Navigate to Custom
        await practiceButton.click();
        await page.waitForTimeout(300);
        await page.getByRole('link', { name: 'Custom Openings' }).click();
        await expect(page).toHaveURL(/\/practice\/custom/);
    });

    test('Mobile nav shows Practice section with expandable items', async ({ page }) => {
        // Use mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/practice/play-maia');

        // Open mobile menu
        const menuButton = page.getByRole('button', { name: /toggle menu/i });
        await expect(menuButton).toBeVisible();
        await menuButton.click();

        // Wait for sheet to open
        await page.waitForTimeout(500);

        // Find Practice section
        const practiceSection = page.getByRole('button', { name: /Practice/i }).first();
        await expect(practiceSection).toBeVisible();

        // Click to expand
        await practiceSection.click();
        await page.waitForTimeout(300);

        // Check submenu items
        await expect(page.getByRole('link', { name: 'Play Maia' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Practice Repertoire' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Custom Openings' })).toBeVisible();
    });
});

test.describe('Practice Smoke Tests', () => {
    test('Play Maia game can be started', async ({ page, context }) => {
        const sessionId = 'pw-practice-routes-test';
        await context.addCookies([
            { name: 'session_id', value: sessionId, domain: 'localhost', path: '/' },
        ]);

        await page.goto('/practice/play-maia');
        await page.waitForTimeout(2000);

        // Click Start Game button
        const startButton = page.getByRole('button', { name: /Start Game/i });
        await expect(startButton).toBeVisible();
        await startButton.click();

        // Wait for game to start - timer should appear
        await page.waitForTimeout(3000);

        // Should show game in progress (Maia panel changes to active state)
        await expect(page.getByText(/Game in progress|Resign Game/)).toBeVisible({ timeout: 10000 });
    });

    test('Deep linking works for all routes', async ({ page }) => {
        // Test that direct navigation to each route works after page refresh

        // Play Maia
        await page.goto('/practice/play-maia');
        await page.reload();
        await expect(page.getByText('Practice vs Maia')).toBeVisible();

        // Repertoire
        await page.goto('/practice/repertoire');
        await page.reload();
        await expect(page.getByText('Practice Repertoire')).toBeVisible();

        // Custom
        await page.goto('/practice/custom');
        await page.reload();
        await expect(page.getByText('Custom Practice')).toBeVisible();
    });
});

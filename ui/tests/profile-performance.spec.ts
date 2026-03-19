import { test, expect } from '@playwright/test';

/**
 * Profile Page Performance Test
 * 
 * Asserts that the profile page loads and renders completely within 500ms.
 * The profile-ready indicator must only appear when all critical data is rendered.
 */

const LOAD_BUDGET_MS = 500;

test.describe('Profile Page Performance', () => {
    test('loads within time budget', async ({ page }) => {
        const startTime = Date.now();

        // Navigate to profile
        await page.goto('/profile');

        // Wait for the profile-ready indicator (added to profile page)
        await page.waitForSelector('[data-testid="profile-ready"]', { timeout: 5000 });

        const elapsed = Date.now() - startTime;

        console.log(`\n=== Profile Page Load Time ===`);
        console.log(`Elapsed: ${elapsed}ms (budget: ${LOAD_BUDGET_MS}ms)`);

        // ASSERTION: Must load within budget
        expect(elapsed).toBeLessThan(LOAD_BUDGET_MS);
    });

    test('no fallback fetches on mount', async ({ page }) => {
        const fallbackRequests: string[] = [];

        // Intercept network requests
        page.on('request', request => {
            const url = request.url();

            // These endpoints should NOT be called on mount if aggregated data works
            const fallbackEndpoints = [
                '/api/me/ratings/game',
                '/api/me/ratings/puzzle',
                '/api/me/trainer/summary',
            ];

            for (const endpoint of fallbackEndpoints) {
                if (url.includes(endpoint)) {
                    fallbackRequests.push(url);
                }
            }
        });

        await page.goto('/profile');

        // Wait for page to settle
        await page.waitForTimeout(1000);

        console.log(`\n=== Fallback Fetch Check ===`);
        console.log(`Fallback requests detected: ${fallbackRequests.length}`);
        fallbackRequests.forEach(url => console.log(`  - ${url}`));

        // ASSERTION: No fallback fetches on initial mount
        expect(fallbackRequests).toHaveLength(0);
    });

    test('renders rating charts from aggregated data', async ({ page }) => {
        await page.goto('/profile');

        // Charts should render (may show empty state or data)
        await expect(page.locator('[data-testid="game-rating-chart"]').or(
            page.locator('text=Game Rating')
        )).toBeVisible({ timeout: 3000 });

        await expect(page.locator('[data-testid="puzzle-rating-chart"]').or(
            page.locator('text=Puzzle Rating')
        )).toBeVisible({ timeout: 3000 });
    });
});

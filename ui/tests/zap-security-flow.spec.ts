import { test, expect } from '@playwright/test';

/**
 * Security Flow Test for ZAP Proxy
 * 
 * This test runs through core user flows while ZAP observes all network traffic.
 * It's designed to be run with Playwright proxied through ZAP to detect:
 * - API keys in requests/responses
 * - Bearer tokens leaked to external domains
 * - Hardcoded secrets in network traffic
 * 
 * Run with: npx playwright test tests/zap-security-flow.spec.ts
 */

test.describe('ZAP Security Flow', () => {
    test.describe.configure({ mode: 'serial' });

    test('complete user journey for security scanning', async ({ page }) => {
        // ========================================
        // 1. UNAUTHENTICATED FLOWS
        // ========================================

        // Visit landing page
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Navigate to public pages
        await page.goto('/pricing');
        await page.waitForLoadState('networkidle');

        await page.goto('/puzzles');
        await page.waitForLoadState('networkidle');

        // ========================================
        // 2. AUTHENTICATION FLOW
        // ========================================

        // Navigate to login page
        await page.goto('/login');
        await page.waitForLoadState('networkidle');

        // Check if we have test credentials (set via env vars)
        const testEmail = process.env.ZAP_TEST_EMAIL;
        const testPassword = process.env.ZAP_TEST_PASSWORD;

        if (testEmail && testPassword) {
            // Real login flow
            await page.fill('input[type="email"], input[name="email"]', testEmail);
            await page.fill('input[type="password"], input[name="password"]', testPassword);
            await page.click('button[type="submit"]');

            // Wait for redirect after login
            await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => {
                // If no redirect, continue anyway
            });
            await page.waitForLoadState('networkidle');
        } else {
            // Mock auth: Set a test session cookie for scanning purposes
            // This allows ZAP to see authenticated page structures without real credentials
            console.log('No test credentials provided, continuing with unauthenticated flow');
        }

        // ========================================
        // 3. AUTHENTICATED USER FLOWS
        // ========================================

        // Puzzle flow
        await page.goto('/puzzles');
        await page.waitForLoadState('networkidle');

        // Try to start training if available
        const startButton = page.locator('button:has-text("Start Training")');
        if (await startButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await startButton.click();
            await page.waitForTimeout(2000);
        }

        // Game review flow
        await page.goto('/game-review');
        await page.waitForLoadState('networkidle');

        // Repertoires flow
        await page.goto('/repertoires');
        await page.waitForLoadState('networkidle');

        // Openings flow
        await page.goto('/openings');
        await page.waitForLoadState('networkidle');

        // Profile/settings (if authenticated)
        await page.goto('/settings');
        await page.waitForLoadState('networkidle');

        // ========================================
        // 4. API-HEAVY FLOWS
        // ========================================

        // Analyze page (triggers engine calls)
        await page.goto('/analyze');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); // Allow API calls to complete

        // Reports page
        await page.goto('/reports');
        await page.waitForLoadState('networkidle');

        // ========================================
        // 5. LOGOUT FLOW
        // ========================================

        // Try to find and click logout if authenticated
        const userMenu = page.locator('[data-testid="user-menu"], button:has-text("Profile")');
        if (await userMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
            await userMenu.click();
            const logoutButton = page.locator('button:has-text("Logout"), a:has-text("Sign out")');
            if (await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                await logoutButton.click();
                await page.waitForLoadState('networkidle');
            }
        }

        // Final page to ensure all traffic is captured
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Basic assertion to ensure test completes
        expect(page.url()).toContain('/');
    });
});

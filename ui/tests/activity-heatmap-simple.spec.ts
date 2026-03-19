import { test, expect } from '@playwright/test';

test.describe('Activity Heatmap Loading', () => {
  test('should load activity heatmap without infinite loading', async ({ page, context }) => {
    // Enable console logging
    page.on('console', msg => {
      console.log(`[BROWSER ${msg.type()}]:`, msg.text());
    });

    // Log network requests
    page.on('request', request => {
      if (request.url().includes('activities/heatmap')) {
        console.log('→ Request:', request.method(), request.url());
      }
    });

    page.on('response', response => {
      if (response.url().includes('activities/heatmap')) {
        console.log('← Response:', response.status(), response.url());
      }
    });

    // Navigate to profile page
    console.log('Navigating to profile page...');
    await page.goto('http://localhost:3006/profile');

    // Wait for page to load
    await page.waitForLoadState('networkidle');
    console.log('Page loaded');

    // Wait a bit for components to initialize
    await page.waitForTimeout(2000);

    // Check localStorage for session ID
    const sessionId = await page.evaluate(() => localStorage.getItem('session-id'));
    console.log('Session ID:', sessionId);

    // Find the Activity heading
    const activityHeading = page.locator('text=Activity').first();
    await expect(activityHeading).toBeVisible({ timeout: 10000 });
    console.log('Activity section found');

    // Wait for network to be idle after initial load
    await page.waitForTimeout(3000);

    // Check if loading text is present
    const loadingIndicator = page.locator('text=Loading...').first();
    const isLoading = await loadingIndicator.isVisible().catch(() => false);
    console.log('Is loading indicator visible?', isLoading);

    if (isLoading) {
      console.log('❌ Loading indicator is still visible - this is the bug!');

      // Wait a bit more to see if it disappears
      await page.waitForTimeout(5000);
      const stillLoading = await loadingIndicator.isVisible().catch(() => false);

      if (stillLoading) {
        console.log('❌ Still loading after 5 seconds - infinite loading confirmed!');

        // Take a screenshot
        await page.screenshot({ path: 'activity-heatmap-loading-bug.png' });

        // Check network tab for any errors
        const errors = await page.evaluate(() => {
          return (window as any).__errors || [];
        });
        console.log('Client errors:', errors);

        throw new Error('Activity heatmap stuck in loading state');
      }
    }

    // Check that heatmap grid is visible
    const heatmapGrid = page.locator('.flex.items-start.gap-2.min-w-fit').first();
    const gridVisible = await heatmapGrid.isVisible().catch(() => false);
    console.log('Is heatmap grid visible?', gridVisible);

    if (gridVisible) {
      console.log('✅ Heatmap loaded successfully!');

      // Count activity squares
      const squares = page.locator('.h-3.w-3.rounded-sm');
      const count = await squares.count();
      console.log(`Found ${count} activity squares`);

      expect(count).toBeGreaterThan(0);
    } else {
      console.log('❌ Heatmap grid not visible');
      await page.screenshot({ path: 'activity-heatmap-no-grid.png' });
    }
  });

  test('should make successful API call to activities/heatmap', async ({ page }) => {
    let activityRequestMade = false;
    let activityResponseStatus = 0;
    let activityResponseBody: any = null;

    // Intercept the activities/heatmap request
    page.on('response', async (response) => {
      if (response.url().includes('/activities/heatmap')) {
        activityRequestMade = true;
        activityResponseStatus = response.status();
        try {
          activityResponseBody = await response.json();
          console.log('Activity heatmap response:', JSON.stringify(activityResponseBody, null, 2));
        } catch (e) {
          console.error('Failed to parse response:', e);
        }
      }
    });

    // Navigate to profile
    await page.goto('http://localhost:3006/profile');
    await page.waitForLoadState('networkidle');

    // Wait for the request to be made
    await page.waitForTimeout(5000);

    console.log('Activity request made:', activityRequestMade);
    console.log('Activity response status:', activityResponseStatus);
    console.log('Activity response body:', activityResponseBody);

    // Verify request was made
    expect(activityRequestMade).toBe(true);

    // Verify response was successful
    expect(activityResponseStatus).toBe(200);

    // Verify response has data property
    expect(activityResponseBody).toHaveProperty('data');
    expect(activityResponseBody).toHaveProperty('weeks');

    console.log('✅ API call successful!');
  });
});

import { test, expect } from '@playwright/test';

/**
 * Pricing & Subscription E2E Tests
 *
 * Tests the /pricing page which displays subscription plans
 * and handles Stripe checkout integration.
 *
 * API routes mocked:
 * - GET /subscriptions/status
 * - POST /subscriptions/create-checkout
 * - POST /subscriptions/create-portal
 */
test.describe('Pricing Page', () => {
  test.describe('Unauthenticated User', () => {
    test.beforeEach(async ({ page }) => {
      // Mock subscription status - returns not subscribed for unauthenticated
      await page.route('**/subscriptions/status', async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            is_active: false,
            plan: null,
            billing_cycle: null,
            trial_ends_at: null,
            current_period_end: null,
            cancel_at_period_end: false,
          },
        });
      });

      await page.goto('/pricing');
      await page.waitForLoadState('networkidle');
    });

    test('should display page header', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Choose Your Plan');
      await expect(page.locator('text=New accounts get 7 days of full access')).toBeVisible();
    });

    test('should display basic and plus pricing cards', async ({ page }) => {
      await expect(page.locator('text=Basic')).toBeVisible();
      await expect(page.locator('text=$1.99')).toBeVisible();
      await expect(page.locator('text=Plus')).toBeVisible();
      await expect(page.locator('text=$3.49')).toBeVisible();
      await expect(page.locator('text=/month').first()).toBeVisible();
    });

    test('should display savings badge on annual toggle', async ({ page }) => {
      await expect(page.locator('text=Save 20%')).toBeVisible();
    });

    test('should display feature lists', async ({ page }) => {
      await expect(page.locator('text=Unlimited game review')).toBeVisible();
      await expect(page.locator('text=AI move explanations')).toBeVisible();
      await expect(page.locator('text=Priority support')).toBeVisible();
    });

    test('should show Subscribe buttons', async ({ page }) => {
      const subscribeButtons = page.locator('button:has-text("Subscribe")');
      await expect(subscribeButtons).toHaveCount(2);
    });

    test('should redirect to login when clicking subscribe without auth', async ({ page }) => {
      // Click the first subscribe button
      await page.click('button:has-text("Subscribe")');

      // Should redirect to login with return URL
      await expect(page).toHaveURL(/\/login\?returnTo=.*pricing/);
    });
  });

  test.describe('Authenticated User - Not Subscribed', () => {
    test.beforeEach(async ({ page }) => {
      // Mock subscription status - not subscribed
      await page.route('**/subscriptions/status', async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            is_active: false,
            plan: null,
            billing_cycle: null,
            trial_ends_at: null,
            current_period_end: null,
            cancel_at_period_end: false,
          },
        });
      });

      // Mock Supabase auth session
      await page.addInitScript(() => {
        window.localStorage.setItem('session-id', 'test-session-id');
      });

      await page.goto('/pricing');
      await page.waitForLoadState('networkidle');
    });

    test('should initiate checkout when clicking subscribe', async ({ page }) => {
      // Mock checkout creation
      await page.route('**/subscriptions/create-checkout', async (route) => {
        const request = route.request();
        const body = JSON.parse(request.postData() || '{}');

        await route.fulfill({
          status: 200,
          json: {
            checkout_url: `https://checkout.stripe.com/test?plan=${body.plan}&cycle=${body.billing_cycle}`,
            session_id: 'cs_test_123',
          },
        });
      });

      // Track navigation
      const [request] = await Promise.all([
        page.waitForRequest('**/subscriptions/create-checkout'),
        page.click('button:has-text("Subscribe")'),
      ]);

      // Verify the request was made
      expect(request.method()).toBe('POST');
      const body = JSON.parse(request.postData() || '{}');
      expect(body.plan).toBeTruthy();
      expect(body.billing_cycle).toBeTruthy();
    });
  });

  test.describe('Subscribed User - Monthly Plan', () => {
    test.beforeEach(async ({ page }) => {
      // Mock subscription status - active monthly
      await page.route('**/subscriptions/status', async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            is_active: true,
            plan: 'basic',
            billing_cycle: 'monthly',
            trial_ends_at: null,
            current_period_end: '2025-02-01T00:00:00Z',
            cancel_at_period_end: false,
          },
        });
      });

      await page.goto('/pricing');
      await page.waitForLoadState('networkidle');
    });

    test('should show subscription status banner', async ({ page }) => {
      await expect(page.locator('text=You\'re currently subscribed')).toBeVisible();
      await expect(page.locator('text=Basic')).toBeVisible();
      await expect(page.locator('text=monthly')).toBeVisible();
    });

    test('should show Manage Subscription button', async ({ page }) => {
      await expect(page.locator('button:has-text("Manage Subscription")')).toBeVisible();
    });

    test('should show Current Plan on monthly button', async ({ page }) => {
      await expect(page.locator('button:has-text("Current Plan")')).toBeVisible();
    });

    test('should disable monthly subscribe button', async ({ page }) => {
      const monthlyButton = page.locator('button:has-text("Current Plan")');
      await expect(monthlyButton).toBeDisabled();
    });

    test('should open customer portal when clicking manage', async ({ page }) => {
      // Mock portal creation
      await page.route('**/subscriptions/create-portal', async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            portal_url: 'https://billing.stripe.com/test-portal',
          },
        });
      });

      const [request] = await Promise.all([
        page.waitForRequest('**/subscriptions/create-portal'),
        page.click('button:has-text("Manage Subscription")'),
      ]);

      expect(request.method()).toBe('POST');
    });
  });

  test.describe('Subscribed User - Canceling', () => {
    test.beforeEach(async ({ page }) => {
      // Mock subscription status - canceling at period end
      await page.route('**/subscriptions/status', async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            is_active: true,
            plan: 'plus',
            billing_cycle: 'annual',
            trial_ends_at: null,
            current_period_end: '2025-12-01T00:00:00Z',
            cancel_at_period_end: true,
          },
        });
      });

      await page.goto('/pricing');
      await page.waitForLoadState('networkidle');
    });

    test('should show cancellation notice', async ({ page }) => {
      await expect(page.locator('text=Cancels at period end')).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle subscription status API error gracefully', async ({ page }) => {
      // Mock subscription status - error
      await page.route('**/subscriptions/status', async (route) => {
        await route.fulfill({
          status: 500,
          json: { detail: 'Internal server error' },
        });
      });

      await page.goto('/pricing');
      await page.waitForLoadState('networkidle');

      // Should still show the pricing page (treats error as not subscribed)
      await expect(page.locator('h1')).toContainText('Choose Your Plan');
      await expect(page.locator('button:has-text("Subscribe")')).toBeVisible();
    });
  });
});

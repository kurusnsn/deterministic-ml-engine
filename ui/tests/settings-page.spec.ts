import { test, expect } from '@playwright/test';

/**
 * Settings Page E2E Tests
 *
 * Tests the /settings page which allows users to manage preferences.
 * Currently settings are local state only (not persisted to backend).
 */
test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    // Dismiss any modals that may appear (e.g., StreakPopup)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  });

  test('should display page header', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Settings');
    await expect(page.locator('text=Manage your account preferences')).toBeVisible();
  });

  test.describe('Sound Settings', () => {
    test('should display sound settings card', async ({ page }) => {
      await expect(page.locator('text=Sound').first()).toBeVisible();
      await expect(page.locator('text=Control sound effects and audio feedback')).toBeVisible();
    });

    test('should have sound effects toggle', async ({ page }) => {
      await expect(page.getByText('Sound Effects', { exact: true })).toBeVisible();
      await expect(page.getByText('Play sounds for moves and game events')).toBeVisible();

      // Toggle should be visible and enabled by default
      const toggle = page.locator('#sound-effects');
      await expect(toggle).toBeVisible();
      await expect(toggle).toBeChecked();
    });

    test('should toggle sound effects on and off', async ({ page }) => {
      const toggle = page.locator('#sound-effects');

      // Initially on (data-state="checked")
      await expect(toggle).toHaveAttribute('data-state', 'checked');

      // Focus and press Space to toggle off
      await toggle.focus();
      await page.keyboard.press('Space');
      await expect(toggle).toHaveAttribute('data-state', 'unchecked');

      // Press Space to toggle on
      await page.keyboard.press('Space');
      await expect(toggle).toHaveAttribute('data-state', 'checked');
    });
  });

  test.describe('Notification Settings', () => {
    test('should display notifications card', async ({ page }) => {
      await expect(page.getByText('Notifications', { exact: true })).toBeVisible();
      await expect(page.getByText('Configure how you receive notifications')).toBeVisible();
    });

    test('should have email notifications toggle', async ({ page }) => {
      await expect(page.getByText('Email Notifications', { exact: true })).toBeVisible();
      await expect(page.getByText('Receive updates about your account')).toBeVisible();

      const toggle = page.locator('#email-notifications');
      await expect(toggle).toBeVisible();
      await expect(toggle).toBeChecked();
    });

    test('should toggle email notifications', async ({ page }) => {
      const toggle = page.locator('#email-notifications');

      await expect(toggle).toHaveAttribute('data-state', 'checked');
      // Focus and press Space to toggle
      await toggle.focus();
      await page.keyboard.press('Space');
      await expect(toggle).toHaveAttribute('data-state', 'unchecked');
    });
  });

  test.describe('Appearance Settings', () => {
    test('should display appearance card', async ({ page }) => {
      await expect(page.locator('text=Appearance')).toBeVisible();
      await expect(page.locator('text=Customize how ChessVector looks')).toBeVisible();
    });

    test('should have dark mode toggle', async ({ page }) => {
      await expect(page.getByText('Dark Mode', { exact: true })).toBeVisible();
      await expect(page.getByText('Use dark theme across the application')).toBeVisible();

      const toggle = page.locator('#dark-mode');
      await expect(toggle).toBeVisible();
      // Dark mode is off by default
      await expect(toggle).not.toBeChecked();
    });

    test('should toggle dark mode', async ({ page }) => {
      const toggle = page.locator('#dark-mode');

      await expect(toggle).toHaveAttribute('data-state', 'unchecked');
      // Focus and press Space to toggle
      await toggle.focus();
      await page.keyboard.press('Space');
      await expect(toggle).toHaveAttribute('data-state', 'checked');
    });
  });

  test.describe('Account Settings', () => {
    test('should display account card', async ({ page }) => {
      await expect(page.locator('text=Account').first()).toBeVisible();
      await expect(page.locator('text=Manage your account security and data')).toBeVisible();
    });

    test('should have change password button', async ({ page }) => {
      await expect(page.getByText('Change Password', { exact: true })).toBeVisible();
      await expect(page.getByText('Update your account password')).toBeVisible();

      const changeButton = page.locator('button:has-text("Change")').first();
      await expect(changeButton).toBeVisible();
      await expect(changeButton).toBeEnabled();
    });

    test('should have delete account button with warning styling', async ({ page }) => {
      await expect(page.getByText('Delete Account', { exact: true })).toBeVisible();
      await expect(page.getByText('Permanently delete your account and all data')).toBeVisible();

      const deleteButton = page.locator('button:has-text("Delete")').first();
      await expect(deleteButton).toBeVisible();

      // Should have destructive/red styling
      const buttonClass = await deleteButton.getAttribute('class');
      expect(buttonClass).toMatch(/destructive|red/);
    });
  });

  test.describe('Layout and Structure', () => {
    test('should have four settings cards', async ({ page }) => {
      // There are 4 cards: Sound, Notifications, Appearance, Account
      const cards = page.locator('[class*="card"]');
      await expect(cards).toHaveCount(4);
    });

    test('should display settings icons', async ({ page }) => {
      // Each card has an icon (Volume2, Bell, Palette, Shield)
      // Lucide icons render as SVG elements with lucide class
      const icons = page.locator('svg.lucide');

      // Should have at least 4 icons (one per card header)
      const count = await icons.count();
      expect(count).toBeGreaterThanOrEqual(4);
    });
  });
});

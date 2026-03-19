import { test, expect } from "@playwright/test";
import {
  collectPerformanceMetrics,
  markPerformance,
  measurePerformance,
  PERFORMANCE_BUDGETS,
} from "../utils/performance";

test.describe("Critical Path Performance", () => {
  test.describe.configure({ mode: "serial" });

  test("Homepage loads within budget", async ({ page }) => {
    await markPerformance(page, "navigation-start");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await markPerformance(page, "navigation-end");

    const metrics = await collectPerformanceMetrics(page);
    const navDuration = await measurePerformance(
      page,
      "homepage-load",
      "navigation-start",
      "navigation-end"
    );

    console.log("[Perf] Homepage metrics:", JSON.stringify(metrics, null, 2));

    // Assert Core Web Vitals
    if (metrics.lcp !== null) {
      expect(metrics.lcp).toBeLessThan(PERFORMANCE_BUDGETS.LCP_MS);
    }
    if (metrics.fcp !== null) {
      expect(metrics.fcp).toBeLessThan(PERFORMANCE_BUDGETS.FCP_MS);
    }
    expect(metrics.cls).toBeLessThan(PERFORMANCE_BUDGETS.CLS);

    // Assert load time
    expect(navDuration).toBeLessThan(PERFORMANCE_BUDGETS.HOME_LOAD_MS);

    // Assert main thread health
    expect(metrics.longTasks).toBeLessThan(PERFORMANCE_BUDGETS.LONG_TASKS_MAX);
  });

  test("Analyze page loads within budget", async ({ page }) => {
    await page.goto("/analyze");
    await page.waitForLoadState("networkidle");

    const metrics = await collectPerformanceMetrics(page);

    console.log(
      "[Perf] Analyze page metrics:",
      JSON.stringify(metrics, null, 2)
    );

    // Analyze page has more assets, so use specific budget
    expect(metrics.loadComplete).toBeLessThan(PERFORMANCE_BUDGETS.ANALYZE_LOAD_MS);

    if (metrics.lcp !== null) {
      expect(metrics.lcp).toBeLessThan(PERFORMANCE_BUDGETS.LCP_MS);
    }
    expect(metrics.cls).toBeLessThan(PERFORMANCE_BUDGETS.CLS);
  });

  test("Profile page loads within budget", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    const metrics = await collectPerformanceMetrics(page);

    console.log(
      "[Perf] Profile page metrics:",
      JSON.stringify(metrics, null, 2)
    );

    expect(metrics.loadComplete).toBeLessThan(PERFORMANCE_BUDGETS.PROFILE_LOAD_MS);

    if (metrics.lcp !== null) {
      expect(metrics.lcp).toBeLessThan(PERFORMANCE_BUDGETS.LCP_MS);
    }
  });

  test("Puzzles page loads within budget", async ({ page }) => {
    await page.goto("/puzzles");
    await page.waitForLoadState("networkidle");

    const metrics = await collectPerformanceMetrics(page);

    console.log(
      "[Perf] Puzzles page metrics:",
      JSON.stringify(metrics, null, 2)
    );

    expect(metrics.loadComplete).toBeLessThan(PERFORMANCE_BUDGETS.PUZZLES_LOAD_MS);

    if (metrics.lcp !== null) {
      expect(metrics.lcp).toBeLessThan(PERFORMANCE_BUDGETS.LCP_MS);
    }
  });

  test("Openings page loads within budget", async ({ page }) => {
    await page.goto("/openings");
    await page.waitForLoadState("networkidle");

    const metrics = await collectPerformanceMetrics(page);

    console.log(
      "[Perf] Openings page metrics:",
      JSON.stringify(metrics, null, 2)
    );

    expect(metrics.loadComplete).toBeLessThan(PERFORMANCE_BUDGETS.OPENINGS_LOAD_MS);

    if (metrics.lcp !== null) {
      expect(metrics.lcp).toBeLessThan(PERFORMANCE_BUDGETS.LCP_MS);
    }
  });

  test("Client-side navigation is fast", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await markPerformance(page, "nav-start");

    // Click on a navigation link
    const analyzeLink = page.locator('a[href="/analyze"]').first();
    if (await analyzeLink.isVisible()) {
      await analyzeLink.click();
      await page.waitForLoadState("networkidle");
    } else {
      // Skip if link not found (may be behind auth)
      test.skip();
      return;
    }

    await markPerformance(page, "nav-end");

    const navDuration = await measurePerformance(
      page,
      "client-navigation",
      "nav-start",
      "nav-end"
    );

    console.log(`[Perf] Client-side navigation: ${navDuration}ms`);

    expect(navDuration).toBeLessThan(PERFORMANCE_BUDGETS.NAVIGATION_MS);
  });
});

test.describe("Memory Health", () => {
  test("No excessive memory usage on page load", async ({ page }) => {
    await page.goto("/analyze");
    await page.waitForLoadState("networkidle");

    const metrics = await collectPerformanceMetrics(page);

    if (metrics.jsHeapSize !== null) {
      const heapMB = metrics.jsHeapSize / (1024 * 1024);
      console.log(`[Perf] JS Heap size: ${heapMB.toFixed(2)} MB`);

      expect(heapMB).toBeLessThan(PERFORMANCE_BUDGETS.JS_HEAP_MB);
    }
  });

  test("No memory leak after repeated interactions", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Get initial heap size
    const initialMetrics = await collectPerformanceMetrics(page);
    const initialHeap = initialMetrics.jsHeapSize;

    // Perform 5 navigation cycles
    for (let i = 0; i < 5; i++) {
      const analyzeLink = page.locator('a[href="/analyze"]').first();
      if (await analyzeLink.isVisible()) {
        await analyzeLink.click();
        await page.waitForLoadState("networkidle");
      }

      const homeLink = page.locator('a[href="/"]').first();
      if (await homeLink.isVisible()) {
        await homeLink.click();
        await page.waitForLoadState("networkidle");
      }
    }

    // Force garbage collection if available
    await page.evaluate(() => {
      if ((window as unknown as { gc?: () => void }).gc) {
        (window as unknown as { gc: () => void }).gc();
      }
    });

    await page.waitForTimeout(500);

    // Get final heap size
    const finalMetrics = await collectPerformanceMetrics(page);
    const finalHeap = finalMetrics.jsHeapSize;

    if (initialHeap !== null && finalHeap !== null) {
      const heapGrowth = (finalHeap - initialHeap) / (1024 * 1024);
      console.log(
        `[Perf] Heap growth after interactions: ${heapGrowth.toFixed(2)} MB`
      );

      // Allow some heap growth, but not excessive (50 MB max growth)
      expect(heapGrowth).toBeLessThan(50);
    }
  });
});

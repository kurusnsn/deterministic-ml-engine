import { Page } from "@playwright/test";

export interface PerformanceMetrics {
  lcp: number | null;
  fcp: number | null;
  ttfb: number | null;
  cls: number | null;
  domContentLoaded: number;
  loadComplete: number;
  longTasks: number;
  jsHeapSize: number | null;
}

/**
 * Collect Core Web Vitals and performance metrics from a page.
 */
export async function collectPerformanceMetrics(
  page: Page
): Promise<PerformanceMetrics> {
  // Wait for metrics to stabilize
  await page.waitForTimeout(1000);

  const metrics = await page.evaluate(() => {
    const entries = performance.getEntriesByType(
      "navigation"
    ) as PerformanceNavigationTiming[];
    const nav = entries[0];

    // Get paint timings
    const paintEntries = performance.getEntriesByType("paint");
    const fcp = paintEntries.find((e) => e.name === "first-contentful-paint");

    // Get LCP
    let lcp: number | null = null;
    const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
    if (lcpEntries.length > 0) {
      lcp = (
        lcpEntries[lcpEntries.length - 1] as PerformanceEntry & {
          startTime: number;
        }
      ).startTime;
    }

    // Get CLS
    let cls = 0;
    const layoutShiftEntries = performance.getEntriesByType(
      "layout-shift"
    ) as (PerformanceEntry & { value: number; hadRecentInput: boolean })[];
    for (const entry of layoutShiftEntries) {
      if (!entry.hadRecentInput) {
        cls += entry.value;
      }
    }

    // Count long tasks
    const longTaskEntries = performance.getEntriesByType("longtask");

    // Get JS heap size (Chrome only)
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const jsHeapSize = memory ? memory.usedJSHeapSize : null;

    return {
      lcp,
      fcp: fcp ? fcp.startTime : null,
      ttfb: nav ? nav.responseStart - nav.requestStart : null,
      cls,
      domContentLoaded: nav ? nav.domContentLoadedEventEnd : 0,
      loadComplete: nav ? nav.loadEventEnd : 0,
      longTasks: longTaskEntries.length,
      jsHeapSize,
    };
  });

  return metrics;
}

/**
 * Mark a performance timeline point.
 */
export async function markPerformance(page: Page, name: string): Promise<void> {
  await page.evaluate((markName) => {
    performance.mark(markName);
  }, name);
}

/**
 * Measure between two performance marks.
 */
export async function measurePerformance(
  page: Page,
  name: string,
  startMark: string,
  endMark: string
): Promise<number> {
  return page.evaluate(
    ({ name, startMark, endMark }) => {
      performance.measure(name, startMark, endMark);
      const measures = performance.getEntriesByName(name, "measure");
      return measures.length > 0 ? measures[0].duration : -1;
    },
    { name, startMark, endMark }
  );
}

/**
 * Performance budgets for regression detection.
 */
export const PERFORMANCE_BUDGETS = {
  // Core Web Vitals
  LCP_MS: 2500,
  FCP_MS: 1800,
  CLS: 0.1,

  // Page-specific load times
  ANALYZE_LOAD_MS: 5000,
  PROFILE_LOAD_MS: 3000,
  PUZZLES_LOAD_MS: 3000,
  OPENINGS_LOAD_MS: 3000,
  HOME_LOAD_MS: 3000,

  // Interaction budgets
  CHESSBOARD_MOVE_MS: 200,
  NAVIGATION_MS: 1000,

  // Resource budgets
  JS_HEAP_MB: 100,
  LONG_TASKS_MAX: 10,
};

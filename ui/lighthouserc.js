module.exports = {
  ci: {
    collect: {
      // Build and serve the app
      startServerCommand: "npm run build && npm run start",
      startServerReadyPattern: "ready on",
      startServerReadyTimeout: 60000,

      // URLs to test - critical user journeys
      url: [
        "http://localhost:3000/",
        "http://localhost:3000/analyze",
        "http://localhost:3000/profile",
        "http://localhost:3000/puzzles",
        "http://localhost:3000/openings",
      ],

      // Run 3 times for statistical significance
      numberOfRuns: 3,

      // Chrome settings
      settings: {
        preset: "desktop",
        chromeFlags: "--no-sandbox --disable-gpu --headless",
        throttlingMethod: "devtools",
        // Use devtools throttling for consistent CI results
        throttling: {
          rttMs: 40,
          throughputKbps: 10 * 1024,
          cpuSlowdownMultiplier: 1,
        },
      },
    },

    assert: {
      // Regression detection budgets
      assertions: {
        // Core Web Vitals - fail on regressions
        "first-contentful-paint": ["error", { maxNumericValue: 2000 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 3000 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 300 }],
        interactive: ["error", { maxNumericValue: 4000 }],

        // Performance score - warn only (don't block on minor issues)
        "categories:performance": ["warn", { minScore: 0.8 }],

        // Accessibility - error on major issues
        "categories:accessibility": ["error", { minScore: 0.9 }],

        // Resource budgets
        "resource-summary:script:size": ["warn", { maxNumericValue: 500000 }],
        "resource-summary:total:size": ["warn", { maxNumericValue: 2000000 }],
      },
    },

    upload: {
      // Use temporary public storage for CI
      target: "temporary-public-storage",
    },
  },
};

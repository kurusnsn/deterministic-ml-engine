import { defineConfig, devices } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * Get the port from .port file or use default
 * The .port file is created by the dev-with-port.js script
 */
function getPort(): number {
  const portFile = path.join(__dirname, ".port");
  const minPort = parseInt(process.env.PORT_START || "3100", 10);
  const maxPort = parseInt(process.env.PORT_END || "3199", 10);
  try {
    if (fs.existsSync(portFile)) {
      const port = parseInt(fs.readFileSync(portFile, "utf8").trim(), 10);
      if (!isNaN(port) && port >= minPort && port <= maxPort) {
        return port;
      }
    }
  } catch {
    // Fall through to default
  }
  // Default port if .port file doesn't exist
  return 3109;
}

const port = getPort();
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    env: {
      NEXT_PUBLIC_GATEWAY_URL: "http://localhost:8010",
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key-for-ci",
      CI: "true",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ["**/performance/**"],
    },
    {
      name: "performance",
      testDir: "./tests/performance",
      use: {
        ...devices["Desktop Chrome"],
        // Enable performance API with precise memory info
        launchOptions: {
          args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
        },
      },
      // Run performance tests serially to avoid interference
      fullyParallel: false,
    },
  ],
});

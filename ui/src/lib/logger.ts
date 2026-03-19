/**
 * Centralized Logger Utility
 *
 * 🚫 RULE: Direct console.* usage outside this file is forbidden.
 *
 * This project uses a multi-layer approach to ensure console logs never leak to production:
 *
 * 1. **Logger utility** (this file) - Environment-aware wrapper
 * 2. **Build-time removal** (next.config.ts) - Compiler strips console in prod
 * 3. **ESLint enforcement** (eslint.config.mjs) - CI-blocking rule
 * 4. **Runtime kill-switch** (src/app/layout.tsx) - Catches 3rd-party libs
 *
 * Usage:
 * ```typescript
 * import { logger } from "@/lib/logger";
 *
 * logger.log("Debug info");         // Silent in production
 * logger.info("Informational");     // Silent in production
 * logger.warn("Warning");           // Silent in production
 * logger.error("Error message");    // Always visible (for monitoring)
 * ```
 *
 * Verification:
 * - ✅ console.log appears in local dev and staging
 * - ❌ console.log removed from prod bundle
 * - ✅ console.error still visible in prod
 * - ❌ CI fails if console.log is used in prod code
 */

const isProd = process.env.NODE_ENV === "production";

type LogArgs = Parameters<typeof console.log>;

export const logger = {
    log: (...args: LogArgs) => {
        if (!isProd) console.log(...args);
    },
    info: (...args: LogArgs) => {
        if (!isProd) console.info(...args);
    },
    warn: (...args: LogArgs) => {
        if (!isProd) console.warn(...args);
    },
    error: (...args: LogArgs) => {
        console.error(...args); // always allowed
    },
};

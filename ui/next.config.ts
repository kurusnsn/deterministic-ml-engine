import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */

// Gateway URL for rewrites - use K8s service name in prod, localhost in dev
const GATEWAY_INTERNAL_URL =
  process.env.GATEWAY_INTERNAL_URL || "http://localhost:8010";

const distDir = process.env.NEXT_DIST_DIR || ".next";
const distDirWatchIgnore = distDir.replace(/^\.?\//, "");

const nextConfig = {
  distDir,
  outputFileTracingRoot: __dirname,
  output: "standalone",
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error"] }
        : false,
  },
  eslint: {
    // Disable ESLint during builds (warnings won't block production)
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Disable TypeScript checking during builds (for performance testing)
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: "/analyze",
        destination: `${GATEWAY_INTERNAL_URL}/analyze`,
      },
      // Dev proxies to gateway for convenience/fallback
      {
        source: "/eco/:path*",
        destination: `${GATEWAY_INTERNAL_URL}/eco/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
    ];
  },
  webpack: (config: any, { dev }: { dev: boolean }) => {
    if (dev) {
      const rawPollInterval = process.env.WEBPACK_WATCH_POLL;
      const pollInterval =
        rawPollInterval != null && rawPollInterval !== ""
          ? Number(rawPollInterval)
          : null;
      const ignored = [
        "**/.git/**",
        "**/.next/**",
        "**/.next-dev/**",
        "**/.next-dev*/**",
        "**/.next.bak*/**",
        `**/${distDirWatchIgnore}/**`,
        "**/node_modules/**",
        "**/test-results/**",
        "**/opening-db/**",
        "**/public/data/openings/opening_lines/**",
      ];

      config.watchOptions = {
        ...(config.watchOptions || {}),
        aggregateTimeout: 300,
        ignored,
      };
      if (pollInterval != null && Number.isFinite(pollInterval)) {
        config.watchOptions.poll = pollInterval;
      }
    }

    // Pin howler into a stable named vendor chunk so its URL never
    // changes across rebuilds, preventing ChunkLoadError after HMR.
    config.optimization = config.optimization || {};
    config.optimization.splitChunks = config.optimization.splitChunks || {};
    config.optimization.splitChunks.cacheGroups = {
      ...(config.optimization.splitChunks.cacheGroups || {}),
      howler: {
        test: /[\\/]node_modules[\\/]howler[\\/]/,
        name: 'vendor-howler',
        chunks: 'all',
        priority: 30,
        enforce: true,
      },
    };

    return config;
  },
};

// Only wrap with Sentry if DSN is configured
const sentryEnabled = !!process.env.NEXT_PUBLIC_SENTRY_DSN || !!process.env.SENTRY_DSN;

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
    // Sentry build options
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,

    // Upload source maps only in CI
    disableSourceMapUpload: process.env.CI !== "true",

    // Hide source maps from production
    hideSourceMaps: true,

    // Automatically tree-shake Sentry logger statements
    disableLogger: true,
  })
  : nextConfig;
// Build trigger Mon Jan 12 17:22:44 CET 2026

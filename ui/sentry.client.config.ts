import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_DEPLOYMENT_ENV || "development",
    release: process.env.NEXT_PUBLIC_APP_VERSION || "unknown",

    // Performance monitoring - 10% sample rate
    tracesSampleRate: 0.1,
    enableTracing: true,

    // Don't send PII
    sendDefaultPii: false,

    // Browser-specific integrations
    integrations: [
      Sentry.browserTracingIntegration({
        enableInp: true,
      }),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Session replay sample rates (expensive, keep low)
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 0.1,

    // Filter out noisy errors
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      /^Non-Error promise rejection captured/,
    ],

    beforeSend(event) {
      // Add route tag to all events
      if (typeof window !== "undefined") {
        event.tags = {
          ...event.tags,
          route: window.location.pathname,
        };
      }
      return event;
    },
  });
}

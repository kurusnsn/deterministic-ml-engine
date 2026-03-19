"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { onCLS, onINP, onLCP, onFCP, onTTFB, type Metric } from "web-vitals";
import * as Sentry from "@sentry/nextjs";

function sendToSentry(metric: Metric) {
  const { name, value, rating } = metric;

  // Report as a custom measurement
  Sentry.setMeasurement(name, value, name === "CLS" ? "" : "millisecond");

  // Also capture as span data for detailed tracing
  const transaction = Sentry.getActiveSpan();
  if (transaction) {
    Sentry.setTag(`web_vitals.${name}`, value.toFixed(2));
    Sentry.setTag(`web_vitals.${name}_rating`, rating);
  }

  // Log to console in development
  if (process.env.NODE_ENV === "development") {
    console.log(`[Web Vitals] ${name}: ${value.toFixed(2)} (${rating})`);
  }
}

export function WebVitalsReporter() {
  const pathname = usePathname();

  useEffect(() => {
    // Set route context for Sentry
    Sentry.setTag("route", pathname);
    Sentry.setTag(
      "app_version",
      process.env.NEXT_PUBLIC_APP_VERSION || "unknown"
    );

    // Register Web Vitals observers
    onCLS(sendToSentry);
    onINP(sendToSentry);
    onLCP(sendToSentry);
    onFCP(sendToSentry);
    onTTFB(sendToSentry);
  }, [pathname]);

  return null;
}

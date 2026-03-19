'use client';

import { useEffect, useRef, useCallback } from 'react';
import posthog from 'posthog-js';
import { useSession } from 'next-auth/react';
import { hasAnalyticsConsent, ConsentPreferences } from '@/lib/cookieConsent';

// PostHog configuration
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.posthog.com';

// Check if PostHog is configured
const isPostHogConfigured = (): boolean => {
  return !!POSTHOG_KEY && POSTHOG_KEY !== 'undefined';
};

/**
 * Initialize PostHog with privacy-respecting defaults
 */
function initPostHog(): boolean {
  if (!isPostHogConfigured() || typeof window === 'undefined') {
    return false;
  }

  // Don't reinitialize if already initialized
  if (posthog.__loaded) {
    return true;
  }

  posthog.init(POSTHOG_KEY!, {
    api_host: POSTHOG_HOST,
    // Privacy settings
    persistence: 'localStorage+cookie',
    autocapture: false, // We'll manually capture events
    capture_pageview: false, // We'll handle this manually for SPA
    capture_pageleave: false,
    disable_session_recording: true, // No session replay as requested
    disable_scroll_properties: true,
    // Respect Do Not Track
    respect_dnt: true,
    // Don't send IP to PostHog
    ip: false,
    // Mask sensitive data
    mask_all_text: false,
    mask_all_element_attributes: false,
  });

  return true;
}

/**
 * PostHog Provider Component
 * Handles initialization, user identification, and consent management
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const isInitializedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  // Initialize or shut down PostHog based on consent
  const handleConsentChange = useCallback((hasConsent: boolean) => {
    if (hasConsent) {
      const success = initPostHog();
      if (success) {
        isInitializedRef.current = true;
        // Re-identify user if we have a session
        if (session?.user?.id && lastUserIdRef.current !== session.user.id) {
          posthog.identify(session.user.id);
          lastUserIdRef.current = session.user.id;
        }
      }
    } else if (isInitializedRef.current) {
      // User revoked consent - reset PostHog
      posthog.opt_out_capturing();
      posthog.reset();
      isInitializedRef.current = false;
      lastUserIdRef.current = null;
    }
  }, [session?.user?.id]);

  // Check consent and initialize on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !isPostHogConfigured()) return;

    const hasConsent = hasAnalyticsConsent();
    handleConsentChange(hasConsent);

    // Listen for consent changes
    const handleConsentUpdate = (event: CustomEvent<ConsentPreferences>) => {
      handleConsentChange(event.detail.analytics);
    };

    window.addEventListener('cookieConsentUpdate', handleConsentUpdate as EventListener);

    return () => {
      window.removeEventListener('cookieConsentUpdate', handleConsentUpdate as EventListener);
    };
  }, [handleConsentChange]);

  // Identify user when session changes
  useEffect(() => {
    if (!isInitializedRef.current || !hasAnalyticsConsent()) return;

    const userId = session?.user?.id;

    if (userId && lastUserIdRef.current !== userId) {
      // Identify with just the user ID - no PII
      posthog.identify(userId);
      lastUserIdRef.current = userId;
    } else if (!userId && lastUserIdRef.current) {
      // User logged out
      posthog.reset();
      lastUserIdRef.current = null;
    }
  }, [session?.user?.id]);

  return <>{children}</>;
}

/**
 * Track an analytics event
 * Only sends if user has consented to analytics
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>
): void {
  if (typeof window === 'undefined' || !isPostHogConfigured()) return;

  // Check consent before tracking
  if (!hasAnalyticsConsent()) return;

  // Ensure PostHog is initialized
  if (!posthog.__loaded) {
    const success = initPostHog();
    if (!success) return;
  }

  posthog.capture(eventName, properties);
}

/**
 * Hook for tracking events with automatic consent checking
 */
export function usePostHog() {
  const track = useCallback((eventName: string, properties?: Record<string, unknown>) => {
    trackEvent(eventName, properties);
  }, []);

  const identify = useCallback((userId: string) => {
    if (typeof window === 'undefined' || !isPostHogConfigured()) return;
    if (!hasAnalyticsConsent() || !posthog.__loaded) return;

    posthog.identify(userId);
  }, []);

  const reset = useCallback(() => {
    if (typeof window === 'undefined' || !posthog.__loaded) return;

    posthog.reset();
  }, []);

  return { track, identify, reset };
}

// Event name constants for type safety
export const AnalyticsEvents = {
  SIGNUP_COMPLETED: 'signup_completed',
  REPORT_GENERATED: 'report_generated',
  ANALYZE_VIEWED: 'analyze_viewed',
  SUBSCRIPTION_STARTED: 'subscription_started',
  SUBSCRIPTION_FAILED: 'subscription_failed',
} as const;

export type AnalyticsEventName = typeof AnalyticsEvents[keyof typeof AnalyticsEvents];
// PostHog integration 1768001168

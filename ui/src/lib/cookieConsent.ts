// Cookie consent management
// Strictly necessary: auth, payment, session - always enabled
// Analytics: PostHog - requires user consent

const CONSENT_COOKIE_NAME = 'cookie_consent';
const CONSENT_VERSION = '1'; // Bump this to re-prompt users if policy changes

export type ConsentPreferences = {
  necessary: true; // Always true, cannot be disabled
  analytics: boolean;
  version: string;
  timestamp: string;
};

const DEFAULT_PREFERENCES: ConsentPreferences = {
  necessary: true,
  analytics: false,
  version: CONSENT_VERSION,
  timestamp: new Date().toISOString(),
};

/**
 * Get current consent preferences from cookie
 */
export function getConsentPreferences(): ConsentPreferences | null {
  if (typeof document === 'undefined') return null;

  const cookie = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${CONSENT_COOKIE_NAME}=`));

  if (!cookie) return null;

  try {
    const value = decodeURIComponent(cookie.split('=')[1]);
    const preferences = JSON.parse(value) as ConsentPreferences;

    // Check if consent version matches current version
    if (preferences.version !== CONSENT_VERSION) {
      return null; // Re-prompt for consent
    }

    return preferences;
  } catch {
    return null;
  }
}

/**
 * Save consent preferences to cookie
 * Cookie expires in 1 year
 */
export function saveConsentPreferences(preferences: Partial<ConsentPreferences>): ConsentPreferences {
  const fullPreferences: ConsentPreferences = {
    necessary: true, // Always true
    analytics: preferences.analytics ?? false,
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString(),
  };

  if (typeof document !== 'undefined') {
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);

    const cookieValue = encodeURIComponent(JSON.stringify(fullPreferences));
    document.cookie = `${CONSENT_COOKIE_NAME}=${cookieValue}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
  }

  return fullPreferences;
}

/**
 * Check if user has made a consent choice
 */
export function hasConsentChoice(): boolean {
  return getConsentPreferences() !== null;
}

/**
 * Check if analytics consent is granted
 */
export function hasAnalyticsConsent(): boolean {
  const preferences = getConsentPreferences();
  return preferences?.analytics ?? false;
}

/**
 * Accept all cookies
 */
export function acceptAllCookies(): ConsentPreferences {
  return saveConsentPreferences({ analytics: true });
}

/**
 * Accept only necessary cookies (reject analytics)
 */
export function acceptNecessaryOnly(): ConsentPreferences {
  return saveConsentPreferences({ analytics: false });
}

/**
 * Revoke analytics consent
 */
export function revokeAnalyticsConsent(): ConsentPreferences {
  return saveConsentPreferences({ analytics: false });
}

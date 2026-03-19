import { create } from 'zustand';
import {
  ConsentPreferences,
  getConsentPreferences,
  saveConsentPreferences,
  hasConsentChoice,
} from '@/lib/cookieConsent';

interface CookieConsentState {
  preferences: ConsentPreferences | null;
  showBanner: boolean;
  isInitialized: boolean;

  // Actions
  initialize: () => void;
  acceptAll: () => void;
  acceptNecessaryOnly: () => void;
  updatePreferences: (preferences: Partial<ConsentPreferences>) => void;
  openSettings: () => void;
}

export const useCookieConsentStore = create<CookieConsentState>((set, get) => ({
  preferences: null,
  showBanner: false,
  isInitialized: false,

  initialize: () => {
    if (typeof window === 'undefined') return;

    const existingPreferences = getConsentPreferences();
    const needsConsent = !hasConsentChoice();

    set({
      preferences: existingPreferences,
      showBanner: needsConsent,
      isInitialized: true,
    });
  },

  acceptAll: () => {
    const preferences = saveConsentPreferences({ analytics: true });
    set({
      preferences,
      showBanner: false,
    });

    // Dispatch custom event for PostHog to pick up
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cookieConsentUpdate', { detail: preferences }));
    }
  },

  acceptNecessaryOnly: () => {
    const preferences = saveConsentPreferences({ analytics: false });
    set({
      preferences,
      showBanner: false,
    });

    // Dispatch custom event for PostHog to pick up
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cookieConsentUpdate', { detail: preferences }));
    }
  },

  updatePreferences: (newPreferences: Partial<ConsentPreferences>) => {
    const current = get().preferences;
    const preferences = saveConsentPreferences({
      ...current,
      ...newPreferences,
    });
    set({
      preferences,
      showBanner: false,
    });

    // Dispatch custom event for PostHog to pick up
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cookieConsentUpdate', { detail: preferences }));
    }
  },

  openSettings: () => {
    set({ showBanner: true });
  },
}));

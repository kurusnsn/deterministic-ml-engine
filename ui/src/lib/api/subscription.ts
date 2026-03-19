// API client for subscription management

import { getSessionId } from '@/lib/session';
import { getClientAuthHeaders } from '@/lib/auth';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway';

// Types
export type PlanId = 'basic' | 'plus';
export type BillingCycle = 'monthly' | 'annual';

export interface SubscriptionStatus {
  is_active: boolean;
  plan: PlanId | null;
  billing_cycle: BillingCycle | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  status?: string; // e.g. 'active', 'past_due', 'canceled', 'trialing'
}

export interface CheckoutResponse {
  checkout_url: string;
  session_id: string;
}

export interface PortalResponse {
  portal_url: string;
}

function getMockSubscriptionStatus(): SubscriptionStatus | null {
  const mockAuthEnabled =
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_MOCK_AUTH_ENABLED === 'true';

  if (!mockAuthEnabled || typeof window === 'undefined') {
    return null;
  }

  const token = localStorage.getItem('auth-token');
  if (!token) {
    return null;
  }

  const rawPlan = (process.env.NEXT_PUBLIC_MOCK_SUBSCRIPTION_PLAN || 'free').toLowerCase();
  const plan: PlanId | null = rawPlan === 'plus' ? 'plus' : rawPlan === 'basic' ? 'basic' : null;
  const isActive = !!plan;
  const billingCycle: BillingCycle | null = isActive ? 'monthly' : null;

  return {
    is_active: isActive,
    plan,
    billing_cycle: billingCycle,
    trial_ends_at: null,
    current_period_end: isActive ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
    cancel_at_period_end: false,
  };
}

// Pricing configuration - easy to update later
export const PRICING = {
  basic: {
    id: 'basic',
    name: 'Basic',
    description: 'Core analysis features for steady improvement.',
    monthly: {
      price: 1.99,
      currency: 'USD',
      interval: 'month',
    },
    annual: {
      price: 19.1,
      currency: 'USD',
      interval: 'year',
      savings: '20%',
    },
    features: [
      'Unlimited game review',
      'Essential engine analysis',
      'Opening explorer',
      'Cloud storage for 200 games',
    ],
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    description: 'Deeper AI insights and advanced tooling.',
    monthly: {
      price: 3.49,
      currency: 'USD',
      interval: 'month',
    },
    annual: {
      price: 33.5,
      currency: 'USD',
      interval: 'year',
      savings: '20%',
    },
    features: [
      'Everything in Basic',
      'AI move explanations',
      'Advanced performance reports',
      'Unlimited cloud storage',
      'Priority support',
    ],
  },
} as const;

// Helper to get auth headers
const getAuthHeaders = (accessToken?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const sessionId =
    (typeof localStorage !== 'undefined' ? localStorage.getItem('session-id') : null) ||
    getSessionId();
  if (sessionId) {
    headers['x-session-id'] = sessionId;
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // Note: Auth is handled server-side by the gateway proxy — no token needed in client code
  return headers;
};

const buildReturnUrl = (path: string): string | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return new URL(path, window.location.origin).toString();
};

/**
 * Get current subscription status
 */
export async function getSubscriptionStatus(accessToken?: string): Promise<SubscriptionStatus> {
  const mockStatus = getMockSubscriptionStatus();
  if (mockStatus) {
    return mockStatus;
  }

  const headers = accessToken
    ? getAuthHeaders(accessToken)
    : await getClientAuthHeaders({ includeContentType: true, includeSessionId: true });

  const response = await fetch(`${GATEWAY_URL}/subscriptions/status`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      return {
        is_active: false,
        plan: null,
        billing_cycle: null,
        trial_ends_at: null,
        current_period_end: null,
        cancel_at_period_end: false,
      };
    }
    throw new Error('Failed to fetch subscription status');
  }

  return response.json();
}

/**
 * Create a checkout session and redirect to Stripe
 */
export async function createCheckoutSession(
  plan: PlanId,
  billingCycle: BillingCycle,
  options?: {
    successUrl?: string;
    cancelUrl?: string;
    accessToken?: string;
  }
): Promise<CheckoutResponse> {
  const headers = options?.accessToken
    ? getAuthHeaders(options.accessToken)
    : await getClientAuthHeaders({ includeContentType: true, includeSessionId: true });
  const successUrl = options?.successUrl ?? buildReturnUrl('/subscription/success');
  const cancelUrl = options?.cancelUrl ?? buildReturnUrl('/pricing');

  const response = await fetch(`${GATEWAY_URL}/subscriptions/create-checkout`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      plan,
      billing_cycle: billingCycle,
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to create checkout' }));
    const errorText =
      typeof error === 'string'
        ? error
        : typeof error?.detail === 'string'
          ? error.detail
          : error?.detail
            ? JSON.stringify(error.detail)
            : typeof error?.message === 'string'
              ? error.message
              : null;
    throw new Error(errorText || 'Failed to create checkout session');
  }

  return response.json();
}

/**
 * Redirect to Stripe checkout
 */
export async function redirectToCheckout(
  plan: PlanId,
  billingCycle: BillingCycle,
  accessToken?: string
): Promise<void> {
  const { checkout_url } = await createCheckoutSession(plan, billingCycle, { accessToken });
  window.location.href = checkout_url;
}

/**
 * Create customer portal session and redirect
 */
export async function redirectToCustomerPortal(accessToken?: string): Promise<void> {
  const headers = accessToken
    ? getAuthHeaders(accessToken)
    : await getClientAuthHeaders({ includeContentType: true, includeSessionId: true });

  const response = await fetch(`${GATEWAY_URL}/subscriptions/create-portal`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to open portal' }));
    throw new Error(error.detail || 'Failed to open customer portal');
  }

  const { portal_url } = await response.json();
  window.location.href = portal_url;
}

/**
 * Check if user is on trial
 */
export function isOnTrial(status: SubscriptionStatus): boolean {
  if (!status.trial_ends_at) return false;
  return new Date(status.trial_ends_at) > new Date();
}

/**
 * Get days remaining in trial
 */
export function getTrialDaysRemaining(status: SubscriptionStatus): number {
  if (!status.trial_ends_at) return 0;
  const trialEnd = new Date(status.trial_ends_at);
  const now = new Date();
  const diffTime = trialEnd.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Format price for display
 */
export function formatPrice(price: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(price);
}

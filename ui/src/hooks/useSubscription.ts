import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  getSubscriptionStatus,
  SubscriptionStatus,
  isOnTrial,
  getTrialDaysRemaining,
  PlanId,
  BillingCycle,
} from '@/lib/api/subscription';

interface UseSubscriptionResult {
  status: SubscriptionStatus | null;
  loading: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  plan: PlanId | null;
  billingCycle: BillingCycle | null;
  // Convenience helpers
  isActive: boolean;
  isPremium: boolean;
  isOnTrial: boolean;
  trialDaysRemaining: number;
}

/**
 * Hook for checking user's subscription status.
 * Use this throughout the app to gate premium features.
 */
export function useSubscription(): UseSubscriptionResult {
  const { data: session } = useSession();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Auth is attached server-side by the gateway proxy — no token needed here
      const data = await getSubscriptionStatus(undefined);
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to fetch subscription'));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus, session?.user?.id]);

  const isActiveSubscription = status?.is_active ?? false;
  const onTrial = status ? isOnTrial(status) : false;
  const trialDays = status ? getTrialDaysRemaining(status) : 0;

  return {
    status,
    loading,
    isLoading: loading,
    error,
    refetch: fetchStatus,
    plan: status?.plan ?? null,
    billingCycle: status?.billing_cycle ?? null,
    isActive: isActiveSubscription,
    isPremium: isActiveSubscription || onTrial,
    isOnTrial: onTrial,
    trialDaysRemaining: trialDays,
  };
}

/**
 * Simple premium feature gate.
 * Returns true if user has active subscription (including trial).
 */
export function usePremiumAccess(): boolean {
  const { isActive, isOnTrial, loading } = useSubscription();
  // Return false while loading to prevent flash of premium content
  if (loading) return false;
  return isActive || isOnTrial;
}

'use client';

import { Badge } from '@/components/ui/badge';
import { useSubscription } from '@/hooks/useSubscription';
import { Crown, Sparkles, Zap } from 'lucide-react';

/**
 * Displays the user's subscription plan as a small badge.
 * - Free (gray) - no active subscription
 * - Basic (blue) - active basic subscription
 * - Plus (gold/amber) - active plus subscription
 * - Trial (green) - on trial with days remaining
 */
export function PlanBadge() {
    const { status, loading, isActive, isOnTrial, trialDaysRemaining } = useSubscription();

    if (loading) {
        return null; // Don't show anything while loading
    }

    // Trial takes precedence - show trial badge with days remaining
    if (isOnTrial) {
        return (
            <Badge
                variant="outline"
                className="bg-zinc-500/10 text-zinc-500 border-zinc-500/30 text-[10px] px-1.5 py-0 font-medium"
            >
                Trial {trialDaysRemaining > 0 && `(${trialDaysRemaining}d)`}
            </Badge>
        );
    }

    // Active subscription - show Basic or Plus based on plan
    if (isActive && status?.plan) {
        if (status.plan === 'plus') {
            return (
                <Badge
                    variant="outline"
                    className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px] px-1.5 py-0 font-medium"
                >
                    <Crown className="w-2.5 h-2.5 mr-0.5" />
                    Plus
                </Badge>
            );
        }

        // Basic plan
        return (
            <Badge
                variant="outline"
                className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-[10px] px-1.5 py-0 font-medium"
            >
                <Zap className="w-2.5 h-2.5 mr-0.5" />
                Basic
            </Badge>
        );
    }

    // No active subscription - Free user
    return (
        <Badge
            variant="outline"
            className="bg-zinc-500/10 text-zinc-500 border-zinc-500/30 text-[10px] px-1.5 py-0 font-medium"
        >
            Free
        </Badge>
    );
}

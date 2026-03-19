"use client";

import { useHomeData } from "@/hooks/useHomeData";
import { hasAnyLinkedAccounts } from "@/lib/api/home";
import { OnboardingHero } from "./components/OnboardingHero";
import { TrainingHero } from "./components/TrainingHero";
import { FeatureTiles } from "./components/FeatureTiles";
import { RecentActivity } from "./components/RecentActivity";
import { DashboardSkeleton } from "./components/DashboardSkeleton";
import { DashboardError } from "./components/DashboardError";
import { LandingFooter } from "@/components/landing";

/**
 * Main Home Dashboard component for authenticated users.
 * Displays different hero sections based on whether accounts are linked,
 * feature tiles for quick access, and recent activity.
 */
export function HomeDashboard() {
    const { data, isLoading, error, refetch } = useHomeData();

    if (isLoading) {
        return <DashboardSkeleton />;
    }

    if (error || !data) {
        return <DashboardError onRetry={refetch} />;
    }

    const hasLinkedAccounts = hasAnyLinkedAccounts(data);

    return (
        <div className="flex flex-col min-h-[calc(100vh-4rem)]">
            <div className="container mx-auto p-4 space-y-8 flex-1">
                {/* Hero Section - changes based on linked accounts state */}
                {hasLinkedAccounts ? (
                    <TrainingHero data={data} />
                ) : (
                    <OnboardingHero />
                )}

                {/* Feature Tiles Grid */}
                <FeatureTiles data={data} />

                {/* Recent Activity Section */}
                <RecentActivity data={data} />
            </div>

            <LandingFooter />
        </div>
    );
}

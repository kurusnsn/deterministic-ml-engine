// React Query hook for home dashboard data

import { useQuery } from '@tanstack/react-query';
import { fetchHomeData, HomeData } from '@/lib/api/home';

// Query keys for caching
export const homeKeys = {
    all: ['home'] as const,
    dashboard: () => [...homeKeys.all, 'dashboard'] as const,
};

/**
 * Hook to fetch home dashboard data.
 * Returns linked accounts, latest report, recent games, and trainer summary.
 */
export function useHomeData() {
    return useQuery<HomeData, Error>({
        queryKey: homeKeys.dashboard(),
        queryFn: fetchHomeData,
        staleTime: 2 * 60 * 1000, // 2 minutes
        retry: 2,
        refetchOnWindowFocus: false,
    });
}

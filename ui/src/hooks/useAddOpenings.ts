/**
 * React Query hooks for Add Opening feature.
 * Provides data fetching and mutations for importing openings into repertoire buckets.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSessionId } from '@/lib/session';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway';

// Types
export interface CatalogOpening {
    eco: string;
    name: string;
}

export interface RepertoireOpeningForImport {
    eco_code: string;
    color: 'white' | 'black';
    note?: string | null;
}

export interface AddOpeningsResult {
    added: number;
    duplicates: number;
    errors?: string[];
}

// Helper to build headers
function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    const sid = getSessionId();
    if (sid) headers['x-session-id'] = sid;
    return headers;
}

/**
 * Search the ECO opening catalog.
 * @param query - Search term (opening name, ECO code)
 * @param side - Optional filter by side (white/black)
 */
export function useOpeningCatalogSearch(query: string, side?: string) {
    return useQuery({
        queryKey: ['opening-catalog-search', query, side],
        queryFn: async () => {
            if (!query.trim()) return { openings: [], count: 0 };

            const params = new URLSearchParams({ q: query });
            if (side) params.set('side', side);

            const headers = buildHeaders();
            const response = await fetch(
                `${GATEWAY_URL}/api/opening-catalog/search?${params.toString()}`,
                { headers }
            );

            if (!response.ok) {
                throw new Error('Failed to search opening catalog');
            }

            return response.json() as Promise<{ openings: CatalogOpening[]; count: number }>;
        },
        enabled: query.trim().length >= 2,
        staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    });
}

/**
 * Get openings from a repertoire for import selection.
 */
export function useOpeningsForImport(repertoireId: string | null) {
    return useQuery({
        queryKey: ['repertoire-openings-for-import', repertoireId],
        queryFn: async () => {
            if (!repertoireId) return { openings: [] };

            const headers = buildHeaders();
            const response = await fetch(
                `${GATEWAY_URL}/api/repertoires/${repertoireId}/openings-for-import`,
                { headers }
            );

            if (!response.ok) {
                throw new Error('Failed to get openings for import');
            }

            return response.json() as Promise<{ openings: RepertoireOpeningForImport[] }>;
        },
        enabled: !!repertoireId,
    });
}

/**
 * Add openings from another repertoire to the target repertoire.
 */
export function useAddOpeningsFromRepertoire() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            targetRepertoireId,
            sourceRepertoireId,
            ecoCodes,
        }: {
            targetRepertoireId: string;
            sourceRepertoireId: string;
            ecoCodes: string[];
        }) => {
            const headers = buildHeaders();
            const response = await fetch(
                `${GATEWAY_URL}/api/repertoires/${targetRepertoireId}/add-openings-from-repertoire`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        source_repertoire_id: sourceRepertoireId,
                        eco_codes: ecoCodes,
                    }),
                }
            );

            if (!response.ok) {
                throw new Error('Failed to add openings from repertoire');
            }

            return response.json() as Promise<AddOpeningsResult>;
        },
        onSuccess: () => {
            // Invalidate repertoires query to refresh the list
            queryClient.invalidateQueries({ queryKey: ['repertoires'] });
        },
    });
}

/**
 * Add openings from the ECO catalog to a repertoire.
 */
export function useAddOpeningsFromCatalog() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            targetRepertoireId,
            openings,
        }: {
            targetRepertoireId: string;
            openings: { eco: string; name: string; color: string }[];
        }) => {
            const headers = buildHeaders();
            const response = await fetch(
                `${GATEWAY_URL}/api/repertoires/${targetRepertoireId}/add-openings-from-catalog`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ openings }),
                }
            );

            if (!response.ok) {
                throw new Error('Failed to add openings from catalog');
            }

            return response.json() as Promise<AddOpeningsResult>;
        },
        onSuccess: () => {
            // Invalidate repertoires query to refresh the list
            queryClient.invalidateQueries({ queryKey: ['repertoires'] });
        },
    });
}

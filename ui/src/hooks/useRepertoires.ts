import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SavedRepertoire, SuggestedRepertoire, SaveRepertoireRequest, UpdateRepertoireRequest, RepertoireStatsResponse } from '@/types/repertoire';
import { getClientAuthHeaders } from '@/lib/auth';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway';

// Helper to get auth headers
const getAuthHeaders = () => getClientAuthHeaders();

// API functions
const repertoireApi = {
  // Get all saved repertoires
  async getAllRepertoires(): Promise<SavedRepertoire[]> {
    const response = await fetch(`${GATEWAY_URL}/repertoires`, {
      headers: await getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch repertoires: ${response.statusText}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : data.repertoires || [];
  },

  // Get a specific repertoire
  async getRepertoire(id: string): Promise<SavedRepertoire> {
    const response = await fetch(`${GATEWAY_URL}/repertoires/${id}`, {
      headers: await getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch repertoire: ${response.statusText}`);
    }
    return response.json();
  },

  // Save a new repertoire
  async saveRepertoire(request: SaveRepertoireRequest): Promise<SavedRepertoire> {
    const response = await fetch(`${GATEWAY_URL}/repertoires`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Failed to save repertoire: ${errorData}`);
    }
    return response.json();
  },

  // Update an existing repertoire
  async updateRepertoire(request: UpdateRepertoireRequest): Promise<SavedRepertoire> {
    const response = await fetch(`${GATEWAY_URL}/repertoires/${request.id}`, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Failed to update repertoire: ${errorData}`);
    }
    return response.json();
  },

  // Delete a repertoire
  async deleteRepertoire(id: string): Promise<void> {
    const response = await fetch(`${GATEWAY_URL}/repertoires/${id}`, {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to delete repertoire: ${response.statusText}`);
    }
  },

  // Toggle favorite status
  async toggleFavorite(id: string, favorite: boolean): Promise<SavedRepertoire> {
    return this.updateRepertoire({ id, favorite });
  },

  // Get repertoire stats
  async getRepertoireStats(): Promise<RepertoireStatsResponse> {
    const response = await fetch(`${GATEWAY_URL}/repertoires/stats`, {
      headers: await getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch repertoire stats: ${response.statusText}`);
    }
    return response.json();
  },
};

// React Query hooks
export function useSavedRepertoires() {
  return useQuery({
    queryKey: ['repertoires'],
    queryFn: repertoireApi.getAllRepertoires,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useRepertoire(id: string) {
  return useQuery({
    queryKey: ['repertoire', id],
    queryFn: () => repertoireApi.getRepertoire(id),
    enabled: !!id,
  });
}

export function useRepertoireStats() {
  return useQuery({
    queryKey: ['repertoire-stats'],
    queryFn: repertoireApi.getRepertoireStats,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useSaveRepertoire() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: repertoireApi.saveRepertoire,
    onSuccess: () => {
      // Invalidate and refetch repertoires list
      queryClient.invalidateQueries({ queryKey: ['repertoires'] });
      queryClient.invalidateQueries({ queryKey: ['repertoire-stats'] });
    },
  });
}

export function useUpdateRepertoire() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: repertoireApi.updateRepertoire,
    onSuccess: (data) => {
      // Update the specific repertoire in cache
      queryClient.setQueryData(['repertoire', data.id], data);
      // Invalidate the list to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['repertoires'] });
      queryClient.invalidateQueries({ queryKey: ['repertoire-stats'] });
    },
  });
}

export function useDeleteRepertoire() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: repertoireApi.deleteRepertoire,
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: ['repertoire', deletedId] });
      // Invalidate list
      queryClient.invalidateQueries({ queryKey: ['repertoires'] });
      queryClient.invalidateQueries({ queryKey: ['repertoire-stats'] });
    },
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) =>
      repertoireApi.toggleFavorite(id, favorite),
    onSuccess: (data) => {
      // Update both the specific repertoire and the list
      queryClient.setQueryData(['repertoire', data.id], data);
      queryClient.invalidateQueries({ queryKey: ['repertoires'] });
    },
  });
}

// Utility hook for saving suggested repertoires
export function useSaveSuggestedRepertoire() {
  const saveRepertoire = useSaveRepertoire();

  const saveSuggested = async (suggested: SuggestedRepertoire): Promise<SavedRepertoire> => {
    const request: SaveRepertoireRequest = {
      name: suggested.name,
      eco_codes: suggested.eco_codes,
      openings: suggested.openings,
      ...(suggested.source_report_id && { source_report_id: suggested.source_report_id }),
      category: suggested.category,
      color: suggested.color,
    };

    return saveRepertoire.mutateAsync(request);
  };

  return {
    ...saveRepertoire,
    saveSuggested,
  };
}

// Local state hook for client-side filtering and sorting
export function useRepertoireFilters() {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [colorFilter, setColorFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'winrate' | 'games'>('created');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const applyFilters = (repertoires: SavedRepertoire[]) => {
    const filtered = repertoires.filter(rep => {
      const matchesSearch = !searchTerm ||
        rep.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rep.eco_codes.some(eco => eco.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCategory = categoryFilter === 'all' || rep.category === categoryFilter;
      const matchesColor = colorFilter === 'all' || rep.color === colorFilter || rep.color === 'both';
      const matchesFavorite = !showFavoritesOnly || rep.favorite;

      return matchesSearch && matchesCategory && matchesColor && matchesFavorite;
    });

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'winrate':
          return b.avg_winrate - a.avg_winrate;
        case 'games':
          return b.total_games - a.total_games;
        case 'created':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return filtered;
  };

  const resetFilters = () => {
    setSearchTerm('');
    setCategoryFilter('all');
    setColorFilter('all');
    setSortBy('created');
    setShowFavoritesOnly(false);
  };

  return {
    filters: {
      searchTerm,
      categoryFilter,
      colorFilter,
      sortBy,
      showFavoritesOnly,
    },
    setters: {
      setSearchTerm,
      setCategoryFilter,
      setColorFilter,
      setSortBy,
      setShowFavoritesOnly,
    },
    applyFilters,
    resetFilters,
  };
}

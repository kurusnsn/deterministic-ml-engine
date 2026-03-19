// React Query hooks for repertoire analysis

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RepertoireReport, RepertoireAnalysisRequest, SavedReport } from '@/types/repertoire';
import { USE_MOCK_API, mockAPI } from '@/lib/api/repertoire-mock';
import * as realAPI from '@/lib/api/repertoire';

// Choose API based on environment
const api = USE_MOCK_API ? mockAPI : realAPI;

// Query keys for caching
export const repertoireKeys = {
  all: ['repertoire'] as const,
  reports: () => [...repertoireKeys.all, 'reports'] as const,
  report: (id: string) => [...repertoireKeys.all, 'report', id] as const,
  analysis: (params: RepertoireAnalysisRequest) => [...repertoireKeys.all, 'analysis', params] as const,
  openings: (color?: string, minGames?: number) => [...repertoireKeys.all, 'openings', color, minGames] as const,
};

// Generate new repertoire analysis
export function useGenerateAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: RepertoireAnalysisRequest) => api.generateRepertoireAnalysis(request),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: repertoireKeys.all });
    },
  });
}

// Get saved reports list
export function useSavedReports() {
  return useQuery({
    queryKey: repertoireKeys.reports(),
    queryFn: () => api.getSavedReports(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Get specific saved report (supports lite mode for fast initial load)
export function useSavedReport(reportId: string, enabled: boolean = true, lite: boolean = false) {
  return useQuery({
    queryKey: [...repertoireKeys.report(reportId), lite ? 'lite' : 'full'],
    queryFn: () => api.getSavedReport(reportId, lite),
    enabled: enabled && !!reportId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Lazy load heavy fields for a report (engine_analysis, generated_puzzles, etc.)
export function useReportHeavyFields(reportId: string, enabled: boolean = false) {
  return useQuery({
    queryKey: [...repertoireKeys.report(reportId), 'heavy'],
    queryFn: () => api.getReportHeavyFields(reportId),
    enabled: enabled && !!reportId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}


// Save repertoire report
export function useSaveReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ report, name, sourceUsernames, timeControl }: { report: RepertoireReport; name: string; sourceUsernames?: string[]; timeControl?: string }) =>
      api.saveRepertoireReport(report, name, sourceUsernames, timeControl),
    onSuccess: (newReport) => {
      // Add to saved reports cache
      queryClient.setQueryData(repertoireKeys.reports(), (old: SavedReport[] = []) => [
        newReport,
        ...old,
      ]);
      // Invalidate reports query to refetch
      queryClient.invalidateQueries({ queryKey: repertoireKeys.reports() });
    },
  });
}

// Delete saved report
export function useDeleteReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reportId: string) => api.deleteSavedReport(reportId),
    onSuccess: (_, reportId) => {
      // Remove from saved reports cache
      queryClient.setQueryData(repertoireKeys.reports(), (old: SavedReport[] = []) =>
        old.filter(report => report.id !== reportId)
      );
      // Remove cached report
      queryClient.removeQueries({ queryKey: repertoireKeys.report(reportId) });
    },
  });
}

// Get opening statistics
export function useOpeningStatistics(color?: 'white' | 'black', minGames: number = 3) {
  return useQuery({
    queryKey: repertoireKeys.openings(color, minGames),
    queryFn: () => api.getOpeningStatistics(color, minGames),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Custom hook for current analysis state
export function useCurrentAnalysis() {
  const queryClient = useQueryClient();

  const setCurrentAnalysis = (report: RepertoireReport) => {
    queryClient.setQueryData(['current-analysis'], report);
  };

  const getCurrentAnalysis = (): RepertoireReport | undefined => {
    return queryClient.getQueryData(['current-analysis']);
  };

  const clearCurrentAnalysis = () => {
    queryClient.removeQueries({ queryKey: ['current-analysis'] });
  };

  return {
    setCurrentAnalysis,
    getCurrentAnalysis,
    clearCurrentAnalysis,
    currentAnalysis: queryClient.getQueryData(['current-analysis']) as RepertoireReport | undefined,
  };
}
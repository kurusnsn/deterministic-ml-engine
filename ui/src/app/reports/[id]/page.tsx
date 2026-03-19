"use client";

import { useParams, useRouter } from 'next/navigation';
import { useSavedReport } from '@/hooks/useRepertoire';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, BarChart3, Download, FileText, Printer, ChevronDown, Loader2, History } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import RepertoireReport from '@/components/repertoire/RepertoireReport';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useGlobalLoader } from '@/hooks/useGlobalLoader';
import { SuggestedRepertoire, RepertoireReport as ReportType } from '@/types/repertoire';
import { createRepertoire } from '@/lib/api/repertoires';
import { exportReportAsCSV, exportReportAsHTML, exportReportAsJSON, printReport } from '@/lib/exportUtils';
import { trackEvent, AnalyticsEvents } from '@/components/PostHogProvider';

const SummaryTile = ({ label, value, accent }: { label: string; value: string | number; accent: string }) => (
  <div className="text-center border rounded-lg p-3 sm:p-4">
    <div className={cn('text-xl sm:text-2xl font-bold', accent)}>{value}</div>
    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{label}</div>
  </div>
);

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params?.id as string;

  // Direct loading - report should be fully pre-computed at generation time
  const { data, isLoading, error } = useSavedReport(reportId, true);
  const [localReport, setLocalReport] = useState<ReportType | null>(null);
  const [isSavingRepertoire, setIsSavingRepertoire] = useState(false);
  const { setLoading: setGlobalLoading } = useGlobalLoader();
  const hasTrackedView = useRef(false);

  // Turn off global loader when page is loaded
  useEffect(() => {
    if (!isLoading) {
      setGlobalLoading(false);
    }
  }, [isLoading, setGlobalLoading]);

  useEffect(() => {
    if (data) {
      setLocalReport(data);

      // Track analyze view (only once per page load)
      if (!hasTrackedView.current) {
        trackEvent(AnalyticsEvents.ANALYZE_VIEWED, {
          report_id: reportId,
          total_games: data.total_games,
        });
        hasTrackedView.current = true;
      }
    }
  }, [data, reportId]);

  // Calculate derived stats
  const totalOpenings = useMemo(() => {
    if (!localReport) return 0;
    return Object.values({ ...localReport.white_repertoire, ...localReport.black_repertoire })
      .reduce((sum, group) => sum + group.openings.length, 0);
  }, [localReport]);

  const insightsCount = useMemo(() => {
    return localReport?.insights?.length ?? 0;
  }, [localReport]);

  const handleSaveRepertoire = async (rep: SuggestedRepertoire) => {
    if (!localReport) return;
    setIsSavingRepertoire(true);
    try {
      const targetType = rep.target_bucket_type ?? 'core';
      const repColor = rep.color ?? 'both';

      const openingsPayload = rep.openings.map(o => ({
        eco_code: o.eco,
        color: o.color,
      }));
      const puzzlesPayload = (rep.puzzles || []).map(p => ({
        puzzle_id: p.puzzle_id,
        eco_code: p.eco_code,
        move_number: p.move_number,
        mistake_type: p.mistake_type,
        source_report_id: p.source_report_id,
      }));

      await createRepertoire({
        name: rep.name || `${targetType} repertoire`,
        type: targetType,
        color: repColor,
        openings: openingsPayload,
        puzzles: puzzlesPayload,
      });
    } finally {
      setIsSavingRepertoire(false);
    }
  };

  if (!reportId) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Missing report identifier.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 sm:gap-3">
            <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7" />
            Repertoire Report
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Detailed analysis, charts, and suggested repertoires based on your imported games.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            const params = new URLSearchParams();
            // Pass the report ID so the upload page can filter to only games from this report
            if (reportId) {
              params.set('reportId', reportId);
            }
            params.set('tab', 'list');
            router.push(`/openingtree?${params.toString()}`);
          }}>
            <History className="w-4 h-4 mr-2" />
            View in Opening Explorer
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push('/reports')}>
            ← Back
          </Button>
        </div>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500 dark:text-gray-400">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading report...
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load report. Please try refreshing.
          </AlertDescription>
        </Alert>
      )}

      {!isLoading && localReport && (
        <div className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-xl sm:text-2xl font-semibold">
                  {localReport.name || 'Repertoire Analysis'}
                </CardTitle>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {localReport.total_games} games analyzed • {(localReport.overall_winrate * 100).toFixed(1)}% overall winrate
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Generated on {new Date(localReport.analysis_date || localReport.updated_at || Date.now()).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {localReport.time_control_filter && (
                  <Badge variant="secondary" className="text-sm capitalize">
                    {localReport.time_control_filter}
                  </Badge>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Export
                      <ChevronDown className="w-4 h-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => exportReportAsCSV(localReport, [])}>
                      <FileText className="w-4 h-4 mr-2" />
                      Export as CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportReportAsJSON(localReport, [])}>
                      <Download className="w-4 h-4 mr-2" />
                      Export as JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportReportAsHTML(localReport, [])}>
                      <Download className="w-4 h-4 mr-2" />
                      Export as HTML
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => printReport(localReport, [])}>
                      <Printer className="w-4 h-4 mr-2" />
                      Print Report
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <SummaryTile label="White Games" value={localReport.white_games} accent="text-blue-600" />
                <SummaryTile label="Black Games" value={localReport.black_games} accent="text-purple-600" />
                <SummaryTile label="Total Openings" value={totalOpenings} accent="text-emerald-600" />
                <SummaryTile label="Insights" value={insightsCount} accent="text-orange-600" />
              </div>
            </CardContent>
          </Card>

          <RepertoireReport
            report={localReport}
            onSaveRepertoire={handleSaveRepertoire}
            isSaving={isSavingRepertoire}
          />
        </div>
      )}
    </div>
  );
}

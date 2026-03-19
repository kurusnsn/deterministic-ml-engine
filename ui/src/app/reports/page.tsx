"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// Import diagnostics for console access (window.chessdiag)
import '@/lib/diagnostics';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LogoSpinner } from '@/components/ui/LogoSpinner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  FileText,
  Calendar,
  TrendingUp,
  TrendingDown,
  MoreVertical,
  Download,
  Trash2,
  Search,
  Filter,
  RefreshCw,
  BarChart3,
  Zap,
  Gamepad2,
  AlertCircle,
  CheckCircle,
  Shield
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useSavedReports, useDeleteReport, useGenerateAnalysis, useSaveReport } from '@/hooks/useRepertoire';
import { RepertoireAnalysisRequest } from '@/types/repertoire';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGlobalLoader } from '@/hooks/useGlobalLoader';
import { getClientAuthHeaders } from '@/lib/auth';
import { trackEvent, AnalyticsEvents } from '@/components/PostHogProvider';

export default function ReportsPage() {
  const router = useRouter();
  const { setLoading: setGlobalLoading } = useGlobalLoader();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'winrate' | 'games'>('date');

  // Multi-account filtering state
  const [linkedAccounts, setLinkedAccounts] = useState<{ platform: string; username: string }[]>([]);
  const [availableUsernames, setAvailableUsernames] = useState<string[]>([]);
  const [showOnlyMyGames, setShowOnlyMyGames] = useState(false);
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(new Set());

  // Current analysis state
  // Authentication status
  const [isUsingTempSession, setIsUsingTempSession] = useState(false);

  // Smart import state (embedded instead of modal)
  const [importStep, setImportStep] = useState<'setup' | 'importing'>('setup');
  const [importPlatform, setImportPlatform] = useState<'lichess.org' | 'chess.com'>('lichess.org');
  const [importUsername, setImportUsername] = useState('');
  const [importTimeControl, setImportTimeControl] = useState<string>('blitz');
  const [importIsRated, setImportIsRated] = useState<boolean | null>(true);
  const [importMaxGames, setImportMaxGames] = useState(100);
  const [importDateRange, setImportDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [importProgress, setImportProgress] = useState({
    existing_games: 0,
    newly_imported: 0,
    total_processed: 0,
    status: 'starting',
    message: '',
    error: null as string | null
  });
  const [importError, setImportError] = useState<string | null>(null);
  const [lastSavedReportId, setLastSavedReportId] = useState<string | null>(null);


  const { data: savedReports, isLoading, error, refetch } = useSavedReports();
  const deleteReportMutation = useDeleteReport();
  const generateAnalysisMutation = useGenerateAnalysis();
  const saveReportMutation = useSaveReport();
  const scrollToSection = (id: string) => {
    if (typeof window === 'undefined') return;
    const section = document.getElementById(id);
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const generateAutoReportName = (usernames: string[], analysisDate?: string) => {
    const baseName = usernames.length > 0
      ? `${usernames.join(', ')} Repertoire`
      : 'Repertoire Analysis';
    let formattedDate = '';
    try {
      formattedDate = new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(analysisDate ? new Date(analysisDate) : new Date());
    } catch (error) {
      formattedDate = new Date().toLocaleString();
    }
    return `${baseName} — ${formattedDate}`;
  };

  const autoSaveReport = async (
    report: any,
    sourceUsernames: string[],
    defaultName: string,
    timeControl?: string
  ) => {
    try {
      setImportProgress(prev => ({
        ...prev,
        status: 'analyzing',
        message: 'Saving report...',
        error: null
      }));

      const savedReport = await saveReportMutation.mutateAsync({
        report,
        name: defaultName,
        sourceUsernames: sourceUsernames.length > 0 ? sourceUsernames : undefined,
        timeControl
      });

      setImportProgress(prev => ({
        ...prev,
        status: 'completed',
        message: `Report saved as "${savedReport.name}"`,
        error: null,
        existing_games: report.existing_games_count ?? prev.existing_games,
        newly_imported: report.newly_imported_count ?? prev.newly_imported,
        total_processed: report.total_games ?? prev.total_processed
      }));
      if (savedReport?.id) {
        setLastSavedReportId(savedReport.id);
      }

      // Track report generation
      trackEvent(AnalyticsEvents.REPORT_GENERATED, {
        total_games: report.total_games,
        platform: importPlatform,
        time_control: timeControl,
      });
    } catch (error) {
      console.error('Auto-save failed:', error);
      setImportError('Report generated but auto-save failed. Please try saving manually.');
      setImportProgress(prev => ({
        ...prev,
        status: 'completed',
        message: 'Report saved locally. Manual save required.',
      }));
      setLastSavedReportId(null);
    }
  };

  // Filter and sort reports
  const filteredReports = savedReports
    ?.filter(report =>
      report.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    ?.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'winrate':
          return b.overall_winrate - a.overall_winrate;
        case 'games':
          return b.total_games - a.total_games;
        case 'date':
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    }) || [];

  const handleDeleteReport = async (reportId: string) => {
    try {
      await deleteReportMutation.mutateAsync(reportId);
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Failed to delete report:', error);
    }
  };


  // Handle saving current analysis
  // Handle smart import success
  const handleSmartImportSuccess = (
    report: any,
    importSummary?: string,
    options: { autoSave?: boolean } = {}
  ) => {
    const { autoSave = true } = options;
    const sourceUsernames = selectedUsernames.size > 0
      ? Array.from(selectedUsernames)
      : [];
    const importUsernameSnapshot = importUsername.trim();
    if (sourceUsernames.length === 0 && importUsernameSnapshot) {
      sourceUsernames.push(importUsernameSnapshot);
    }
    const autoReportName = generateAutoReportName(sourceUsernames, report.analysis_date);

    // Reset import state
    setImportStep('setup');
    setImportUsername('');
    setImportTimeControl('all');
    setImportIsRated(true);
    setImportMaxGames(100);
    setImportDateRange({ startDate: '', endDate: '' });
    setImportProgress({
      existing_games: 0,
      newly_imported: 0,
      total_processed: 0,
      status: 'starting',
      message: '',
      error: null
    });
    setImportError(null);

    // Show import summary in a notification or toast if available
    if (importSummary) {
      console.log('Import completed:', importSummary);
    }

    if (autoSave) {
      autoSaveReport(report, sourceUsernames, autoReportName, importTimeControl);
    }
  };

  // Handle start import (extracted from SmartImportDialog)
  const handleStartImport = async () => {
    if (!importUsername.trim()) {
      setImportError('Username is required');
      return;
    }

    setImportStep('importing');
    setImportError(null);
    setLastSavedReportId(null);

    try {
      const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway';

      // Prepare the request
      const importRequest: any = {
        platform: importPlatform,
        username: importUsername.trim(),
        max_games: importMaxGames
      };

      if (importTimeControl && importTimeControl !== 'all') {
        importRequest.time_control = importTimeControl;
      }

      if (importIsRated !== null) {
        importRequest.rated = importIsRated;
      }

      const requestBody: any = {
        min_games: 1,
        min_games_threshold: 1,
        import_request: importRequest,
        force_import: false
      };
      requestBody.usernames = [importRequest.username];

      // Add date range if specified
      if (importDateRange.startDate || importDateRange.endDate) {
        requestBody.date_range = {};
        if (importDateRange.startDate) {
          requestBody.date_range.start_date = new Date(importDateRange.startDate).toISOString();
        }
        if (importDateRange.endDate) {
          requestBody.date_range.end_date = new Date(importDateRange.endDate).toISOString();
        }
      }

      // Get auth headers
      const headers = await getAuthHeaders();
      const sessionId = headers['x-session-id'] || getValidSessionId();
      headers['x-session-id'] = sessionId;
      const importStartedAtMs = Date.now();

      // Start streaming request
      const response = await fetch(`${GATEWAY_URL}/analysis/repertoire/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Failed to start streaming response');
      }

      let buffer = '';
      let sawCompletedProgress = false;
      let handledCompleteEvent = false;

      const processBuffer = () => {
        let lineEnd;
        while ((lineEnd = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, lineEnd).trim();
          buffer = buffer.slice(lineEnd + 1);

          if (!line.startsWith('data: ')) continue;

          try {
            const data: any = JSON.parse(line.slice(6));

            if (data.type === 'progress') {
              setImportProgress({
                existing_games: data.existing_games,
                newly_imported: data.newly_imported,
                total_processed: data.total_processed,
                status: data.status,
                message: data.message,
                error: data.error
              });
              if (data.status === 'completed') {
                sawCompletedProgress = true;
              }
            } else if (data.type === 'complete') {
              handledCompleteEvent = true;
              handleSmartImportSuccess(data.result, data.result.import_summary);
              return true;
            } else if (data.type === 'error') {
              throw new Error(data.message);
            }
          } catch (parseError) {
            console.warn('Failed to parse streaming data:', line);
          }
        }

        return false;
      };

      while (true) {
        const { value, done } = await reader.read();

        if (value) {
          buffer += decoder.decode(value, { stream: !done });
          if (processBuffer()) return;
        }

        if (done) {
          const remainder = decoder.decode();
          if (remainder) {
            buffer += remainder;
            if (processBuffer()) return;
          }
          break;
        }
      }

      if (!handledCompleteEvent && sawCompletedProgress) {
        try {
          const headersForFetch = await getAuthHeaders();
          if (sessionId) {
            headersForFetch['x-session-id'] = sessionId;
          }

          const fallbackUsernames = selectedUsernames.size > 0
            ? Array.from(selectedUsernames)
            : (importUsername.trim() ? [importUsername.trim()] : []);

          const normalizedUsernames = fallbackUsernames.map((name) => name.toLowerCase());
          const minCreatedAtMs = importStartedAtMs - 60_000;
          let recoveredReport = false;

          for (let attempt = 0; attempt < 20 && !recoveredReport; attempt += 1) {
            const latestResp = await fetch(`${GATEWAY_URL}/analysis/reports?limit=10`, {
              headers: headersForFetch
            });

            if (latestResp.ok) {
              const latestData = await latestResp.json();
              const reports = Array.isArray(latestData.reports) ? latestData.reports : [];
              const latestReportMeta = reports.find((report: any) => {
                const sourceUsernames = Array.isArray(report?.source_usernames)
                  ? report.source_usernames.map((name: string) => String(name).toLowerCase())
                  : [];
                const usernameMatch = normalizedUsernames.length === 0
                  || normalizedUsernames.some((name) => sourceUsernames.includes(name));

                if (!usernameMatch) return false;

                if (!report?.created_at) return true;
                const createdAtMs = Date.parse(report.created_at);
                return Number.isNaN(createdAtMs) || createdAtMs >= minCreatedAtMs;
              });

              if (latestReportMeta?.id) {
                const reportResp = await fetch(`${GATEWAY_URL}/analysis/reports/${latestReportMeta.id}`, {
                  headers: headersForFetch
                });
                if (reportResp.ok) {
                  const fullReport = await reportResp.json();
                  handledCompleteEvent = true;
                  recoveredReport = true;
                  handleSmartImportSuccess(fullReport, latestReportMeta.import_summary, { autoSave: false });
                  break;
                }
              }
            }

            if (attempt < 19) {
              await new Promise((resolve) => setTimeout(resolve, 3000));
            }
          }

          if (!recoveredReport) {
            const fallbackStreamPayload: any = {
              min_games: 1,
              min_games_threshold: 1,
              force_import: false,
              session_id: sessionId,
            };

            if (fallbackUsernames.length > 0) {
              fallbackStreamPayload.usernames = fallbackUsernames;
            }

            if (importDateRange.startDate || importDateRange.endDate) {
              fallbackStreamPayload.date_range = {};
              if (importDateRange.startDate) {
                fallbackStreamPayload.date_range.start_date = new Date(importDateRange.startDate).toISOString();
              }
              if (importDateRange.endDate) {
                fallbackStreamPayload.date_range.end_date = new Date(importDateRange.endDate).toISOString();
              }
            }

            const fallbackStreamResp = await fetch(`${GATEWAY_URL}/analysis/repertoire/stream`, {
              method: 'POST',
              headers: headersForFetch,
              body: JSON.stringify(fallbackStreamPayload)
            });

            if (fallbackStreamResp.ok && fallbackStreamResp.body) {
              const fallbackReader = fallbackStreamResp.body.getReader();
              const fallbackDecoder = new TextDecoder();
              let fallbackBuffer = '';

              while (!recoveredReport) {
                const { value, done } = await fallbackReader.read();

                if (value) {
                  fallbackBuffer += fallbackDecoder.decode(value, { stream: !done });
                  let fallbackLineEnd;
                  while ((fallbackLineEnd = fallbackBuffer.indexOf('\n')) >= 0) {
                    const fallbackLine = fallbackBuffer.slice(0, fallbackLineEnd).trim();
                    fallbackBuffer = fallbackBuffer.slice(fallbackLineEnd + 1);
                    if (!fallbackLine.startsWith('data: ')) continue;

                    try {
                      const fallbackData: any = JSON.parse(fallbackLine.slice(6));
                      if (fallbackData.type === 'complete' && fallbackData.result) {
                        handledCompleteEvent = true;
                        recoveredReport = true;
                        handleSmartImportSuccess(
                          fallbackData.result,
                          fallbackData.result.import_summary,
                          { autoSave: false }
                        );
                        break;
                      }
                    } catch {
                      // Ignore malformed stream chunks and keep reading.
                    }
                  }
                }

                if (done) {
                  break;
                }
              }
            }
          }

          if (!recoveredReport) {
            console.warn('Import stream completed without complete event, and fallback recovery did not find a report');
          }
        } catch (fallbackError) {
          console.warn('Fallback report fetch failed:', fallbackError);
        }
      }

      if (!handledCompleteEvent) {
        setImportStep('setup');
      }

    } catch (error: any) {
      setImportError(error.message || 'Import failed');
      setImportProgress(prev => ({
        ...prev,
        status: 'error',
        message: 'Import failed',
        error: error.message
      }));
    }
  };

  // Get progress percentage for import progress bar
  const getImportProgressPercentage = () => {
    if (importProgress.status === 'completed') return 100;
    if (importProgress.status === 'error') return 0;

    // Rough progress estimation based on status
    switch (importProgress.status) {
      case 'starting': return 5;
      case 'checking': return 20;
      case 'importing': return 60;
      case 'analyzing': return 90;
      default: return 10;
    }
  };

  // Derive total processed games (existing + new) for display
  const getTotalProcessed = () => {
    const { total_processed = 0, existing_games = 0, newly_imported = 0 } = importProgress;
    return total_processed || existing_games + newly_imported;
  };

  // Build a simple status message
  const getStatusMessage = () => {
    return importProgress.message || importProgress.status;
  };

  // Check if the import username is a linked account
  const isImportLinkedAccount = linkedAccounts.some(acc =>
    acc.platform === importPlatform && acc.username.toLowerCase() === importUsername.toLowerCase()
  );

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const isValidUuid = (value: string | null): value is string =>
    !!value && uuidPattern.test(value);

  // Helper function to generate a UUID session ID that the backend accepts
  const generateTempSessionId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    // Fallback for environments without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  // Helper function to validate and fix session ID format
  const getValidSessionId = () => {
    if (typeof window === 'undefined') return '';

    let sessionId = localStorage.getItem('session-id');

    // Handle legacy 'temp-' prefixed session IDs
    if (sessionId?.startsWith('temp-')) {
      const candidate = sessionId.slice(5);
      if (isValidUuid(candidate)) {
        sessionId = candidate;
        localStorage.setItem('session-id', sessionId);
      } else {
        sessionId = null;
      }
    }

    // Generate new session ID if invalid
    if (!isValidUuid(sessionId)) {
      sessionId = generateTempSessionId();
      localStorage.setItem('session-id', sessionId);
    }

    // Clean up old temp flag - no longer needed since backend handles auth separation
    localStorage.removeItem('session-id-temp');
    setIsUsingTempSession(false);

    return sessionId;
  };

  const getAuthHeaders = async () => {
    const headers = await getClientAuthHeaders();
    if (!headers['x-session-id']) {
      headers['x-session-id'] = getValidSessionId();
    }
    return headers;
  };

  // Auto-fill username effect (extracted from SmartImportDialog)
  useEffect(() => {
    if (linkedAccounts.length > 0 && !importUsername && importStep === 'setup') {
      const matchingAccount = linkedAccounts.find(acc => acc.platform === importPlatform);
      if (matchingAccount) {
        setImportUsername(matchingAccount.username);
      }
    }
  }, [importPlatform, linkedAccounts, importUsername, importStep]);

  // Load linked accounts and available usernames
  const loadAccountsAndUsernames = async () => {
    try {
      const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway';

      // Get linked accounts (with error handling)
      try {
        const response = await fetch(`${GATEWAY_URL}/profile/linked-accounts`, {
          headers: await getAuthHeaders()
        });
        if (response.ok) {
          const data = await response.json();
          setLinkedAccounts(data.accounts || []);
          setShowOnlyMyGames(data.show_only_my_games || false);

          // If show_only_my_games is enabled, pre-select linked usernames
          const linkedUsernames = (data.accounts || []).map((acc: any) => acc.username);
          if (data.show_only_my_games) {
            setSelectedUsernames(new Set(linkedUsernames));
          }
        } else {
          console.warn('Failed to load linked accounts:', response.status);
        }
      } catch (accountsError) {
        console.warn('Linked accounts endpoint not available:', accountsError);
        // Continue with empty accounts - this is not a critical error
      }

      // Get all available usernames from saved reports (with error handling)
      try {
        const reportsResponse = await fetch(`${GATEWAY_URL}/analysis/reports/usernames`, {
          headers: await getAuthHeaders()
        });
        if (reportsResponse.ok) {
          const reportsData = await reportsResponse.json();
          setAvailableUsernames(reportsData.usernames || []);
        } else {
          console.warn('Failed to load usernames:', reportsResponse.status);
        }
      } catch (usernamesError) {
        console.warn('Reports usernames endpoint not available:', usernamesError);
        // Continue with empty usernames - this is not a critical error
      }
    } catch (error) {
      console.error('Failed to load accounts and usernames:', error);
      // Set default empty states so the UI still works
      setLinkedAccounts([]);
      setAvailableUsernames([]);
    }
  };

  const toggleUsername = (username: string) => {
    setSelectedUsernames(prev => {
      const newSet = new Set(prev);
      if (newSet.has(username)) {
        newSet.delete(username);
      } else {
        newSet.add(username);
      }
      return newSet;
    });
  };

  const selectAllLinkedAccounts = () => {
    const linkedUsernames = linkedAccounts.map(acc => acc.username);
    setSelectedUsernames(new Set(linkedUsernames));
  };

  const clearAllSelections = () => {
    setSelectedUsernames(new Set());
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getWinrateColor = (winrate: number) => {
    if (winrate >= 0.6) return 'text-green-600';
    if (winrate >= 0.5) return 'text-blue-600';
    if (winrate >= 0.4) return 'text-orange-600';
    return 'text-red-600';
  };

  // Clean up invalid session ID and load accounts on component mount
  useEffect(() => {
    // Validate and fix session ID on page load
    getValidSessionId();
    loadAccountsAndUsernames();
  }, []);

  return (
    <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-8 sm:mb-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Repertoire Reports</h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
                Analyze your opening repertoire, generate personalized puzzles, and practice your weak lines
              </p>
            </div>
          </div>
          {/* Top-right action removed to declutter */}
        </div>
      </div>

      <div className="space-y-8 sm:space-y-12">
        <section id="import-section" className="space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-3">
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Import & Analyze
            </h2>
            {importStep === 'importing' && (
              <Badge variant="outline" className="capitalize">
                {importProgress.status}
              </Badge>
            )}
          </div>

          <Card>
            <CardContent className="space-y-4 p-4 sm:p-6">
              {importStep === 'setup' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="platform" id="import-platform-label">Platform</Label>
                    <Select value={importPlatform} onValueChange={(value: any) => setImportPlatform(value)}>
                      <SelectTrigger id="platform" aria-labelledby="import-platform-label">
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lichess.org">Lichess</SelectItem>
                        <SelectItem value="chess.com">Chess.com</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="username" id="import-username-label">Username</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="username"
                        aria-labelledby="import-username-label"
                        value={importUsername}
                        onChange={(e) => setImportUsername(e.target.value)}
                        placeholder="Enter username"
                      />
                      {isImportLinkedAccount && (
                        <Badge variant="default" className="text-xs">
                          My Account
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="import-time-control" id="import-time-control-label">Time Control</Label>
                      <Select value={importTimeControl} onValueChange={setImportTimeControl}>
                        <SelectTrigger id="import-time-control" aria-labelledby="import-time-control-label">
                          <SelectValue placeholder="Select time control" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bullet">Bullet</SelectItem>
                          <SelectItem value="blitz">Blitz</SelectItem>
                          <SelectItem value="rapid">Rapid</SelectItem>
                          <SelectItem value="classical">Classical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="import-max-games" id="import-max-games-label">Max Games</Label>
                      <Input
                        id="import-max-games"
                        type="number"
                        aria-labelledby="import-max-games-label"
                        value={importMaxGames}
                        onChange={(e) => setImportMaxGames(Number(e.target.value))}
                        min={1}
                        max={1000}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="import-from-date" id="import-from-date-label">From Date</Label>
                      <div className="flex gap-2">
                        <Input
                          id="import-from-date"
                          type="date"
                          aria-labelledby="import-from-date-label"
                          value={importDateRange.startDate}
                          onChange={(e) => setImportDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          title="Big Bang (Since 2010)"
                          aria-label="Set start date to 2010-01-01"
                          onClick={() => setImportDateRange(prev => ({ ...prev, startDate: '2010-01-01' }))}
                        >
                          <span className="text-xs font-bold">BB</span>
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="import-to-date" id="import-to-date-label">To Date</Label>
                      <div className="flex gap-2">
                        <Input
                          id="import-to-date"
                          type="date"
                          aria-labelledby="import-to-date-label"
                          value={importDateRange.endDate}
                          max={new Date().toISOString().split('T')[0]}
                          onChange={(e) => setImportDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          title="Today"
                          aria-label="Set end date to today"
                          onClick={() => setImportDateRange(prev => ({ ...prev, endDate: new Date().toISOString().split('T')[0] }))}
                        >
                          <Calendar className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {importError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{importError}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex justify-end pt-4">
                    <Button data-testid="start-import-btn" onClick={handleStartImport} disabled={!importUsername.trim()}>
                      <Gamepad2 className="w-4 h-4 mr-2" />
                      Start Import & Analysis
                    </Button>
                  </div>
                </div>
              )}

              {importStep === 'importing' && (
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      {importProgress.status === 'completed' ? (
                        <CheckCircle className="w-5 h-5 text-foreground" />
                      ) : importProgress.status === 'error' ? (
                        <AlertCircle className="w-5 h-5 text-destructive" />
                      ) : (
                        <LogoSpinner size="sm" />
                      )}
                      <span className="font-medium capitalize">{importProgress.status}</span>
                    </div>
                  </div>

                  <Progress value={getImportProgressPercentage()} className="w-full" />

                  {(importProgress.existing_games > 0 || importProgress.newly_imported > 0 || getTotalProcessed() > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                      <div className="bg-muted p-3 rounded-lg">
                        <div className="text-xl sm:text-2xl font-bold text-foreground">{importProgress.existing_games}</div>
                        <div className="text-xs text-muted-foreground">Existing Games</div>
                      </div>
                      <div className="bg-muted p-3 rounded-lg">
                        <div className="text-xl sm:text-2xl font-bold text-foreground">{importProgress.newly_imported}</div>
                        <div className="text-xs text-muted-foreground">Newly Imported</div>
                      </div>
                      <div className="bg-muted p-3 rounded-lg">
                        <div className="text-xl sm:text-2xl font-bold text-foreground">{getTotalProcessed()}</div>
                        <div className="text-xs text-muted-foreground">Games Analyzed</div>
                      </div>
                    </div>
                  )}

                  {importProgress.error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{importProgress.error}</AlertDescription>
                    </Alert>
                  )}

                  {importProgress.status === 'completed' && lastSavedReportId && (
                    <div className="flex justify-end">
                      <Button onClick={() => {
                        setGlobalLoading(true);
                        router.push(`/reports/${lastSavedReportId}`);
                      }}>
                        View Detailed Report
                      </Button>
                    </div>
                  )}

                  {importProgress.status === 'error' && (
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => setImportStep('setup')}>
                        Try Again
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </section>


        <section id="saved-reports" className="space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-3">
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Saved Reports
            </h2>
          </div>


          {/* Search and Filter Controls */}
          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                {/* Search and Sort Row */}
                <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <Label htmlFor="report-search" id="report-search-label" className="sr-only">
                      Search reports
                    </Label>
                    <Search className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <Input
                      id="report-search"
                      aria-labelledby="report-search-label"
                      placeholder="Search reports..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="report-sort" id="report-sort-label" className="whitespace-nowrap">Sort:</Label>
                    <Select value={sortBy} onValueChange={(value) => setSortBy(value as any)}>
                      <SelectTrigger id="report-sort" className="w-32 h-8" aria-labelledby="report-sort-label">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="name">Name</SelectItem>
                        <SelectItem value="winrate">Winrate</SelectItem>
                        <SelectItem value="games">Games</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetch()} aria-label="Refresh reports">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>

                {/* Username Filtering Row */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <Label className="text-sm font-medium">Filter by Players</Label>
                      <Badge variant="outline" className="text-xs">
                        {selectedUsernames.size} selected
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={selectAllLinkedAccounts}
                        disabled={linkedAccounts.length === 0}
                        className="text-xs"
                      >
                        My Accounts
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAllSelections}
                        className="text-xs"
                      >
                        Clear All
                      </Button>
                    </div>
                  </div>

                  {/* Username Selection Grid */}
                  <div className="max-h-32 overflow-y-auto border rounded-lg p-2">
                    {availableUsernames.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {availableUsernames.map((username) => {
                          const isLinked = linkedAccounts.some(acc => acc.username === username);
                          return (
                            <div key={username} className="flex items-center space-x-2">
                              <Checkbox
                                id={`user-${username}`}
                                checked={selectedUsernames.has(username)}
                                onCheckedChange={() => toggleUsername(username)}
                              />
                              <label
                                htmlFor={`user-${username}`}
                                className={`text-xs cursor-pointer flex items-center gap-1 ${isLinked ? 'font-medium' : ''
                                  }`}
                              >
                                {username}
                                {isLinked && (
                                  <Badge variant="secondary" className="text-xs px-1 py-0">
                                    My
                                  </Badge>
                                )}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                        No usernames available. Import some games to see player options.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reports List */}
          <AnimatePresence>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-4">
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded mb-4 w-2/3"></div>
                      <div className="flex justify-between">
                        <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : error ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-red-500">Failed to load reports</p>
                  <Button variant="outline" onClick={() => refetch()} className="mt-4">
                    Try Again
                  </Button>
                </CardContent>
              </Card>
            ) : filteredReports.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-300 mb-2">No Reports Found</h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    {searchTerm ? 'No reports match your search.' : 'Create your first repertoire analysis to get started.'}
                  </p>
                  {!searchTerm && (
                    <Button onClick={() => scrollToSection('import-section')}>
                      Import Games & Generate Report
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredReports.map((report) => (
                  <motion.div
                    key={report.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => {
                        setGlobalLoading(true);
                        router.push(`/reports/${report.id}`);
                      }}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg mb-1">{report.name}</CardTitle>
                            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                              <Calendar className="w-3 h-3" />
                              {formatDate(report.updated_at)}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="p-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                                <Download className="w-4 h-4 mr-2" />
                                Export
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmId(report.id);
                                }}
                                className="text-red-600"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          {/* Account Info */}
                          {report.source_usernames && report.source_usernames.length > 0 && (
                            <div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Players:</div>
                              <div className="flex flex-wrap gap-1">
                                {report.source_usernames.slice(0, 3).map((username) => {
                                  const isLinked = linkedAccounts.some(acc => acc.username === username);
                                  return (
                                    <Badge
                                      key={username}
                                      variant={isLinked ? "default" : "outline"}
                                      className="text-xs"
                                    >
                                      {username}
                                      {isLinked && " (My)"}
                                    </Badge>
                                  );
                                })}
                                {report.source_usernames.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{report.source_usernames.length - 3}
                                  </Badge>
                                )}
                                {report.is_multi_account && (
                                  <Badge variant="secondary" className="text-xs">
                                    Multi-account
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Stats */}
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <div className="font-semibold text-gray-900 dark:text-gray-100">{report.total_games}</div>
                              <div className="text-gray-500 dark:text-gray-400">Games</div>
                            </div>
                            <div>
                              <div className={`font-semibold ${getWinrateColor(report.overall_winrate)}`}>
                                {(report.overall_winrate * 100).toFixed(1)}%
                              </div>
                              <div className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                {report.overall_winrate >= 0.5 ? (
                                  <TrendingUp className="w-3 h-3" />
                                ) : (
                                  <TrendingDown className="w-3 h-3" />
                                )}
                                Winrate
                              </div>
                            </div>
                          </div>

                          {/* Opening Preview */}
                          <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Top Openings:</div>
                            <div className="flex flex-wrap gap-1">
                              {report.preview_openings?.slice(0, 3).map((eco, idx) => (
                                <Badge key={`${eco}-${idx}`} variant="outline" className="text-xs">
                                  {eco}
                                </Badge>
                              ))}
                              {(report.preview_openings?.length || 0) > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{(report.preview_openings?.length || 0) - 3}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </section>

      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this report? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDeleteReport(deleteConfirmId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


    </div>
  );
}

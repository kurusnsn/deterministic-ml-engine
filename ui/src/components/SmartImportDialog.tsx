"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, CheckCircle, Loader2, Calendar, User, Gamepad2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { ImportRequest, ImportProgress, StreamingMessage } from '@/types/repertoire';
import { getClientAuthHeaders } from '@/lib/auth';

interface SmartImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (report: any, importSummary?: string) => void;
  linkedAccounts: {platform: string; username: string}[];
}

export default function SmartImportDialog({
  isOpen,
  onClose,
  onSuccess,
  linkedAccounts
}: SmartImportDialogProps) {
  const [step, setStep] = useState<'setup' | 'importing'>('setup');
  const [platform, setPlatform] = useState<'lichess.org' | 'chess.com'>('lichess.org');
  const [username, setUsername] = useState('');
  const [timeControl, setTimeControl] = useState<string>('all');
  const [isRated, setIsRated] = useState<boolean | null>(null);
  const [maxGames, setMaxGames] = useState(100);
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });

  // Progress tracking
  const [progress, setProgress] = useState<ImportProgress>({
    existing_games: 0,
    newly_imported: 0,
    total_processed: 0,
    status: 'starting',
    message: '',
  });
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setStep('setup');
      setUsername('');
      setTimeControl('all');
      setIsRated(null);
      setMaxGames(100);
      setDateRange({ startDate: '', endDate: '' });
      setProgress({
        existing_games: 0,
        newly_imported: 0,
        total_processed: 0,
        status: 'starting',
        message: '',
      });
      setError(null);
    }
  }, [isOpen]);

  // Auto-fill username if user has linked accounts
  useEffect(() => {
    if (linkedAccounts.length > 0 && !username) {
      const matchingAccount = linkedAccounts.find(acc => acc.platform === platform);
      if (matchingAccount) {
        setUsername(matchingAccount.username);
      }
    }
  }, [platform, linkedAccounts, username]);

  const handleStartImport = async () => {
    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    setStep('importing');
    setError(null);

    try {
      const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway';

      // Prepare the request
      const importRequest: ImportRequest = {
        platform,
        username: username.trim(),
        max_games: maxGames
      };

      if (timeControl && timeControl !== 'all') {
        importRequest.time_control = timeControl;
      }

      if (isRated !== null) {
        importRequest.rated = isRated;
      }

      const requestBody = {
        min_games: 3,
        min_games_threshold: 10,
        import_request: importRequest,
        force_import: false,
        usernames: [importRequest.username]
      };

      // Add date range if specified
      if (dateRange.startDate || dateRange.endDate) {
        requestBody.date_range = {};
        if (dateRange.startDate) {
          requestBody.date_range.start_date = new Date(dateRange.startDate).toISOString();
        }
        if (dateRange.endDate) {
          requestBody.date_range.end_date = new Date(dateRange.endDate).toISOString();
        }
      }

      // Get auth headers
      const headers = await getClientAuthHeaders();

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

      const processBuffer = () => {
        let lineEnd;
        while ((lineEnd = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, lineEnd).trim();
          buffer = buffer.slice(lineEnd + 1);

          if (!line.startsWith('data: ')) continue;

          try {
            const data: StreamingMessage = JSON.parse(line.slice(6));

            if (data.type === 'progress') {
              setProgress({
                existing_games: data.existing_games,
                newly_imported: data.newly_imported,
                total_processed: data.total_processed,
                status: data.status as any,
                message: data.message,
                error: data.error
              });
            } else if (data.type === 'complete') {
              onSuccess(data.result, data.result.import_summary);
              onClose();
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

    } catch (error: any) {
      setError(error.message || 'Import failed');
      setProgress(prev => ({
        ...prev,
        status: 'error',
        message: 'Import failed',
        error: error.message
      }));
    }
  };

  const getProgressPercentage = () => {
    if (progress.status === 'completed') return 100;
    if (progress.status === 'error') return 0;

    // Rough progress estimation based on status
    switch (progress.status) {
      case 'starting': return 5;
      case 'checking': return 20;
      case 'importing': return 60;
      case 'analyzing': return 90;
      default: return 10;
    }
  };

  const isLinkedAccount = linkedAccounts.some(acc =>
    acc.platform === platform && acc.username.toLowerCase() === username.toLowerCase()
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gamepad2 className="w-5 h-5" />
            Smart Import & Analysis
          </DialogTitle>
        </DialogHeader>

        {step === 'setup' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="platform" id="platform-label">Platform</Label>
              <Select value={platform} onValueChange={(value: any) => setPlatform(value)}>
                <SelectTrigger id="platform" aria-labelledby="platform-label">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lichess.org">Lichess</SelectItem>
                  <SelectItem value="chess.com">Chess.com</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" id="username-label">Username</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="username"
                  aria-labelledby="username-label"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                />
                {isLinkedAccount && (
                  <Badge variant="default" className="text-xs">
                    My Account
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="time-control" id="time-control-label">Time Control</Label>
                <Select value={timeControl} onValueChange={setTimeControl}>
                  <SelectTrigger id="time-control" aria-labelledby="time-control-label">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All time controls</SelectItem>
                    <SelectItem value="bullet">Bullet</SelectItem>
                    <SelectItem value="blitz">Blitz</SelectItem>
                    <SelectItem value="rapid">Rapid</SelectItem>
                    <SelectItem value="classical">Classical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-games" id="max-games-label">Max Games</Label>
                <Input
                  id="max-games"
                  type="number"
                  aria-labelledby="max-games-label"
                  value={maxGames}
                  onChange={(e) => setMaxGames(Number(e.target.value))}
                  min={1}
                  max={1000}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="rated">Rated games only</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">All</span>
                <Switch
                  checked={isRated === true}
                  onCheckedChange={(checked) => setIsRated(checked ? true : null)}
                />
                <span className="text-sm text-muted-foreground">Rated</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="from-date" id="from-date-label">From Date</Label>
                <Input
                  id="from-date"
                  type="date"
                  aria-labelledby="from-date-label"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to-date" id="to-date-label">To Date</Label>
                <Input
                  id="to-date"
                  type="date"
                  aria-labelledby="to-date-label"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleStartImport} disabled={!username.trim()}>
                Start Import & Analysis
              </Button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                {progress.status === 'completed' ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : progress.status === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                )}
                <span className="font-medium capitalize">{progress.status}</span>
              </div>
              <p className="text-sm text-muted-foreground">{progress.message}</p>
            </div>

            <Progress value={getProgressPercentage()} className="w-full" />

            {(progress.existing_games > 0 || progress.newly_imported > 0) && (
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="bg-muted p-3 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{progress.existing_games}</div>
                  <div className="text-xs text-muted-foreground">Existing Games</div>
                </div>
                <div className="bg-muted p-3 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{progress.newly_imported}</div>
                  <div className="text-xs text-muted-foreground">Newly Imported</div>
                </div>
              </div>
            )}

            {progress.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{progress.error}</AlertDescription>
              </Alert>
            )}

            {progress.status === 'error' && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
                <Button onClick={() => setStep('setup')}>
                  Try Again
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

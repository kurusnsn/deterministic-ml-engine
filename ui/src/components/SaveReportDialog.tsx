"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { RepertoireReport } from '@/types/repertoire';
import { Save, Loader2 } from 'lucide-react';

interface SaveReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
  report?: RepertoireReport;
  sourceUsernames?: string[];
  linkedAccounts?: {platform: string; username: string}[];
  isSaving?: boolean;
}

export default function SaveReportDialog({
  isOpen,
  onClose,
  onSave,
  report,
  sourceUsernames = [],
  linkedAccounts = [],
  isSaving = false
}: SaveReportDialogProps) {
  const [reportName, setReportName] = useState('');
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!reportName.trim()) {
      setError('Report name is required');
      return;
    }

    try {
      setError('');
      await onSave(reportName.trim());
      setReportName('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save report');
    }
  };

  const handleClose = () => {
    setReportName('');
    setError('');
    onClose();
  };

  // Generate default name based on current date and source usernames
  const generateDefaultName = () => {
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    if (sourceUsernames.length === 0) {
      return `Repertoire Analysis - ${date}`;
    } else if (sourceUsernames.length === 1) {
      return `${sourceUsernames[0]} - ${date}`;
    } else {
      return `Multi-account Analysis - ${date}`;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="w-5 h-5" />
            Save Report
          </DialogTitle>
          <DialogDescription>
            Save this repertoire analysis for future reference.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Report Summary */}
          {report && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-600 mb-2">Report Summary:</div>
              <div className="flex items-center justify-between text-sm">
                <span>{report.total_games} games analyzed</span>
                <span className="font-medium">
                  {(report.overall_winrate * 100).toFixed(1)}% winrate
                </span>
              </div>
            </div>
          )}

          {/* Source Accounts */}
          {sourceUsernames.length > 0 && (
            <div>
              <Label className="text-sm font-medium">Source Accounts:</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {sourceUsernames.map((username) => {
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
                {sourceUsernames.length > 1 && (
                  <Badge variant="secondary" className="text-xs">
                    Multi-account
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Report Name Input */}
          <div className="space-y-2">
            <Label htmlFor="report-name" id="report-name-label">Report Name</Label>
            <div className="flex gap-2">
              <Input
                id="report-name"
                aria-labelledby="report-name-label"
                aria-describedby={error ? "report-name-error" : undefined}
                aria-invalid={Boolean(error)}
                placeholder="Enter report name..."
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isSaving) {
                    handleSave();
                  }
                }}
                disabled={isSaving}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReportName(generateDefaultName())}
                disabled={isSaving}
              >
                Auto
              </Button>
            </div>
            {error && (
              <p id="report-name-error" role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !reportName.trim()}
            className="flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

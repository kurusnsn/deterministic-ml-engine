"use client";

import { useState, useEffect } from "react";
import { LogoSpinner } from "@/components/ui/LogoSpinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, X } from "lucide-react";

interface SaveStudyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<{ success: boolean; message: string }>;
  defaultName?: string;
  isLoading?: boolean;
}

export default function SaveStudyDialog({
  isOpen,
  onClose,
  onSave,
  defaultName = "",
  isLoading = false
}: SaveStudyDialogProps) {
  const [name, setName] = useState(defaultName);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSaveResult(null);
      setName(defaultName);
    }
  }, [isOpen, defaultName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim() || defaultName || "Unnamed Study";
    const result = await onSave(finalName);
    setSaveResult(result);
    if (result.success) {
      setName("");
    }
  };

  const handleClose = () => {
    setName("");
    setSaveResult(null);
    onClose();
  };

  // Show success/error result in modal
  if (saveResult) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-xl [&>button]:hidden">
          <div className="flex flex-col items-center py-6">
            {saveResult.success ? (
              <>
                <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
                  <Check className="w-6 h-6 text-neutral-900 dark:text-neutral-100" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                  Study Saved
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center mb-6">
                  {saveResult.message}
                </p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
                  <X className="w-6 h-6 text-neutral-900 dark:text-neutral-100" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                  Save Failed
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center mb-6">
                  {saveResult.message}
                </p>
              </>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2 text-sm font-medium text-white bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 rounded-md hover:bg-neutral-800 dark:hover:bg-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-700 dark:focus:ring-neutral-300"
            >
              {saveResult.success ? "Done" : "Try Again"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-xl [&>button]:hidden">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Save Analysis Study
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="study-name" id="study-name-label" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Study Name
            </label>
            <input
              id="study-name"
              aria-labelledby="study-name-label"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={defaultName || "Enter study name..."}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:border-neutral-500"
              disabled={isLoading}
              autoFocus
              aria-describedby="study-name-help"
            />
            <p id="study-name-help" className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Leave empty to use default name: "{defaultName || "Unnamed Study"}"
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 rounded-md hover:bg-neutral-800 dark:hover:bg-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading && (
                <LogoSpinner size="sm" className="text-white dark:text-neutral-900" />
              )}
              Save Study
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { LogoSpinner } from "@/components/ui/LogoSpinner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Study {
  id: number;
  name: string;
  pgn?: string;
  pgn_preview?: string;
  current_fen: string;
  current_path: string;
  move_tree: any;
  messages: Record<string, any[]>;
  created_at: string;
  updated_at: string;
}

interface StudyCardProps {
  study: Study;
  onDelete?: (id: number) => void;
}

export default function StudyCard({ study, onDelete }: StudyCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const getPreviewMoves = (pgn: string): string => {
    if (!pgn || pgn.trim().length === 0) {
      return "Starting position";
    }

    // Remove PGN headers (lines like [Event "?"] [Site "?"] etc.)
    // PGN headers are in the format [Tag "Value"]
    let movesOnly = pgn
      .replace(/\[[\w]+\s+"[^"]*"\]\s*/g, "") // Remove all header tags
      .trim();

    // If nothing left after removing headers, show starting position
    if (!movesOnly || movesOnly.length === 0 || movesOnly === "*") {
      return "Starting position";
    }

    // Remove result markers like "1-0", "0-1", "1/2-1/2", "*"
    movesOnly = movesOnly
      .replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/g, "")
      .trim();

    if (!movesOnly || movesOnly.length === 0) {
      return "Starting position";
    }

    // Extract just the moves from PGN (remove numbers and extra spaces)
    const moves = movesOnly
      .replace(/\d+\./g, "") // Remove move numbers like "1."
      .replace(/\s+/g, " ") // Normalize spaces
      .trim()
      .split(" ")
      .filter(move => move.length > 0)
      .slice(0, 6); // First 6 moves

    const result = moves.join(" ");
    return result.length > 0 ? result + (movesOnly.split(" ").length > 6 ? "..." : "") : "Starting position";
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(study.id);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error("Failed to delete study:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const previewSource = study.pgn_preview || study.pgn || "";

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 p-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-lg truncate flex-1 mr-2">
          {study.name}
        </h3>
        <div className="flex gap-1">
          <Link
            href={`/analyze?study=${study.id}`}
            className="px-2 py-1 text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-600 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            Open
          </Link>
          {onDelete && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-2 py-1 text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-600 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
              disabled={isDeleting}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="mb-3">
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">Moves:</p>
        <p className="text-sm font-mono text-neutral-800 dark:text-neutral-200 bg-neutral-50 dark:bg-neutral-800 p-2 rounded">
          {getPreviewMoves(previewSource)}
        </p>
      </div>

      <div className="flex justify-between items-center text-xs text-neutral-500 dark:text-neutral-400">
        <span>Created: {formatDate(study.created_at)}</span>
        <span>Updated: {formatDate(study.updated_at)}</span>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent className="max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                Delete Study
              </AlertDialogTitle>
              <AlertDialogDescription className="text-neutral-600 dark:text-neutral-400">
                Are you sure you want to delete "{study.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-white bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 rounded-md hover:bg-neutral-800 dark:hover:bg-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isDeleting && (
                  <LogoSpinner size="sm" className="text-white dark:text-neutral-900" />
                )}
                Delete
              </button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

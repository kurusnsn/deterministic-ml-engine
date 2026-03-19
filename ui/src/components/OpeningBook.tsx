"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import DOMPurify from "dompurify";
import { BookOpen, AlertCircle } from "lucide-react";
import { LogoSpinner } from "@/components/ui/LogoSpinner";

interface OpeningBookProps {
  moves: string[];
}

interface OpeningTheory {
  content: string | null;
  title: string | null;
  cached: boolean;
}

export default function OpeningBook({ moves }: OpeningBookProps) {
  const [openingTheory, setOpeningTheory] = useState<OpeningTheory | null>(
    null
  );
  // Store the last known valid theory to persist when out of book
  const [lastKnownTheory, setLastKnownTheory] = useState<OpeningTheory | null>(
    null
  );
  const [isOutOfBook, setIsOutOfBook] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const lastMovesRef = useRef<string>("");

  const apiUrl = process.env.NEXT_PUBLIC_GATEWAY_URL;

  // Memoize the moves key to prevent unnecessary re-renders
  const movesKey = useMemo(() => {
    return moves ? moves.join(",") : "";
  }, [moves]);

  useEffect(() => {
    // Check if API URL is configured
    if (!apiUrl) {
      setError("API URL not configured");
      return;
    }

    // Don't fetch if moves haven't actually changed
    if (movesKey === lastMovesRef.current) {
      return;
    }

    lastMovesRef.current = movesKey;

    if (!moves || moves.length === 0) {
      setOpeningTheory(null);
      setIsOutOfBook(false);
      setError(null);
      return;
    }

    // Don't fetch for too many moves - mark as out of book
    if (moves.length > 15) {
      setOpeningTheory(null);
      setIsOutOfBook(true);
      setError(null);
      return;
    }

    const fetchOpeningTheory = async () => {
      setIsLoading(true);
      setError(null);

      const requestUrl = `${apiUrl}/opening-book`;
      const requestBody = { moves };

      try {
        const res = await fetch(requestUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        const data = await res.json();

        // Handle error responses (including 403 from Wikibooks)
        if (!res.ok || data.detail) {
          if (movesKey === lastMovesRef.current) {
            setOpeningTheory({
              content: null,
              title: null,
              cached: false
            });
            // Mark as out of book but keep last known theory
            setIsOutOfBook(true);
          }
          return;
        }

        // Handle successful response with content
        const processedData: OpeningTheory = {
          content: data.content || null,
          title: data.title || null,
          cached: data.cached || false
        };

        // Only update if this is still the current request
        if (movesKey === lastMovesRef.current) {
          if (processedData.content) {
            // We have valid content - update both current and last known theory
            setOpeningTheory(processedData);
            setLastKnownTheory(processedData);
            setIsOutOfBook(false);
            // Auto-expand when new content loads successfully
            setIsExpanded(true);
          } else {
            // No content - we're out of book
            setOpeningTheory(null);
            setIsOutOfBook(true);
          }
        }
      } catch (err: unknown) {
        if (movesKey === lastMovesRef.current) {
          setOpeningTheory(null);
          setIsOutOfBook(true);
        }
      } finally {
        if (movesKey === lastMovesRef.current) {
          setIsLoading(false);
        }
      }
    };

    fetchOpeningTheory();
  }, [movesKey, apiUrl, moves]);

  // Decide which theory to display
  const displayTheory = openingTheory?.content ? openingTheory : (isOutOfBook ? lastKnownTheory : null);
  const hasContent = displayTheory?.content;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50 dark:bg-black">
      {/* Always visible header */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-black flex-shrink-0">
        <div className="w-6 h-6 bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-gray-800 dark:text-white" />
        </div>
        <h3 className="font-semibold text-gray-800 dark:text-white">Opening Theory</h3>
      </div>

      {/* Collapsible toggle - only show when there's content */}
      {hasContent && (
        <button
          type="button"
          className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 flex-shrink-0"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-controls="opening-theory-panel"
        >
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {isExpanded ? "Hide details" : "Show details"}
          </span>
          <svg
            className={`w-4 h-4 text-gray-600 dark:text-gray-300 transition-transform ${isExpanded ? "rotate-180" : ""
              }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      )}

      {isExpanded && (
        <div id="opening-theory-panel" className="p-4 flex-1 overflow-y-auto min-h-0">
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <LogoSpinner size="md" />
              <span className="ml-2 text-gray-600 dark:text-gray-300 text-sm">Loading</span>
            </div>
          )}

          {!isLoading && displayTheory?.content && (
            <div
              className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-100"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(displayTheory.content),
              }}
            />
          )}
        </div>
      )}

      {/* Show "No opening theory available" only when not loading and no content at all */}
      {!isLoading && !hasContent && moves && moves.length > 0 && !isExpanded && (
        <div className="p-4 flex-1 overflow-y-auto">
          <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">
            No opening theory available
          </div>
        </div>
      )}
    </div>
  );
}

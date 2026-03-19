"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type ViewMode = "baseline" | "lc0_enhanced";

interface CompareToggleProps {
    view: ViewMode;
    onViewChange: (view: ViewMode) => void;
    disabled?: boolean;
    className?: string;
}

/**
 * Toggle component for switching between baseline and LC0-enhanced views.
 * 
 * Used in premium sections to let users compare standard analysis
 * with LC0-augmented features.
 */
export function CompareToggle({
    view,
    onViewChange,
    disabled = false,
    className,
}: CompareToggleProps) {
    return (
        <div className={cn(
            "inline-flex items-center rounded-lg bg-gray-800/50 p-0.5 border border-gray-700",
            disabled && "opacity-50 pointer-events-none",
            className
        )}>
            <button
                onClick={() => onViewChange("baseline")}
                className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    view === "baseline"
                        ? "bg-gray-700 text-white"
                        : "text-gray-400 hover:text-gray-200"
                )}
            >
                Baseline
            </button>
            <button
                onClick={() => onViewChange("lc0_enhanced")}
                className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    view === "lc0_enhanced"
                        ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
                        : "text-gray-400 hover:text-gray-200"
                )}
            >
                LC0 Enhanced
            </button>
        </div>
    );
}

/**
 * Hook for managing compare toggle state.
 */
export function useCompareToggle(defaultView: ViewMode = "lc0_enhanced") {
    const [view, setView] = useState<ViewMode>(defaultView);
    return { view, setView };
}

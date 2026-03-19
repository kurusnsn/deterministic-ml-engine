/**
 * Analyze Engine Settings Panel
 *
 * UI component for configuring engine settings in /analyze.
 * Allows toggling between server and WASM Stockfish, and adjusting depth.
 * Server depth is gated by subscription plan.
 */

'use client';

import React from 'react';
import { useEngineSettingsStore } from '../engine/engineSettingsStore';
import type { EngineMode } from '../engine/engineSettingsStore';
import { Lock } from 'lucide-react';

/** Depth limits per subscription plan */
const DEPTH_LIMITS: Record<string, number> = {
    free: 18,
    basic: 22,
    plus: 40,
};

export function getMaxDepthForPlan(plan: string | null): number {
    return DEPTH_LIMITS[plan || 'free'] || DEPTH_LIMITS.free;
}

interface AnalyzeEngineSettingsPanelProps {
    /** Additional CSS classes */
    className?: string;
    /** User's subscription plan */
    plan?: 'basic' | 'plus' | null;
    /** Whether user has active subscription */
    isPremium?: boolean;
}

/**
 * Engine settings panel for /analyze
 *
 * Displays current engine mode and depth, allowing users to:
 * - Switch between Server Stockfish, Local (WASM), or Auto mode
 * - Adjust analysis depth (gated by plan: free=18, basic=22, plus=40)
 */
export const AnalyzeEngineSettingsPanel: React.FC<AnalyzeEngineSettingsPanelProps> = ({
    className = '',
    plan = null,
    isPremium = false,
}) => {
    const mode = useEngineSettingsStore((s) => s.mode);
    const depth = useEngineSettingsStore((s) => s.depth);
    const setMode = useEngineSettingsStore((s) => s.setMode);
    const setDepth = useEngineSettingsStore((s) => s.setDepth);

    const maxDepth = getMaxDepthForPlan(plan);
    const isDepthCapped = maxDepth < 40;

    const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setMode(e.target.value as EngineMode);
    };

    const handleDepthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Number(e.target.value);
        if (!Number.isNaN(val) && val > 0 && val <= maxDepth) {
            setDepth(val);
        }
    };

    // Clamp depth if user's plan changed and current depth exceeds new limit
    React.useEffect(() => {
        if (depth > maxDepth) {
            setDepth(maxDepth);
        }
    }, [depth, maxDepth, setDepth]);

    return (
        <section
            className={`bg-card rounded-lg border border-border p-4 ${className}`}
        >
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <svg
                    className="w-4 h-4 text-muted-foreground"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                </svg>
                Engine Settings
            </h3>

            <div className="space-y-3">
                {/* Engine Mode */}
                <div className="flex items-center justify-between gap-3">
                    <label
                        htmlFor="engine-mode"
                        id="engine-mode-label"
                        className="text-sm text-muted-foreground whitespace-nowrap"
                    >
                        Engine:
                    </label>
                    <select
                        id="engine-mode"
                        aria-labelledby="engine-mode-label"
                        value={mode}
                        onChange={handleModeChange}
                        className="flex-1 text-sm border border-input rounded-md px-2 py-1.5 bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary cursor-pointer"
                    >
                        <option value="server">Server Stockfish</option>
                        <option value="wasm">Local (WASM)</option>
                        <option value="auto">Auto</option>
                    </select>
                </div>

                {/* Depth */}
                <div className="flex items-center justify-between gap-3">
                    <label
                        htmlFor="engine-depth"
                        id="engine-depth-label"
                        className="text-sm text-muted-foreground whitespace-nowrap"
                    >
                        Depth:
                    </label>
                    <div className="flex items-center gap-2 flex-1">
                        <input
                            id="engine-depth"
                            aria-labelledby="engine-depth-label"
                            type="number"
                            min={1}
                            max={maxDepth}
                            value={depth}
                            onChange={handleDepthChange}
                            className="w-16 text-sm border border-input rounded-md px-2 py-1.5 text-center bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                        />
                        <span className="text-xs text-muted-foreground">/ {maxDepth}</span>
                        {isDepthCapped && (
                            <Lock className="w-3 h-3 text-muted-foreground" />
                        )}
                    </div>
                </div>

                {/* Depth limit info for free/basic users */}
                {isDepthCapped && (
                    <p className="text-[10px] text-muted-foreground">
                        {plan === 'basic'
                            ? 'Upgrade to Plus for depth up to 40'
                            : 'Upgrade for deeper server analysis'}
                    </p>
                )}

                {/* Mode indicator */}
                <div className="pt-2 border-t border-border">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span
                            className={`w-2 h-2 rounded-full ${mode === 'wasm'
                                ? 'bg-green-500'
                                : mode === 'auto'
                                    ? 'bg-yellow-500'
                                    : 'bg-blue-500'
                                }`}
                        />
                        <span>
                            {mode === 'server' && 'Using server-side Stockfish'}
                            {mode === 'wasm' && 'Using local WASM engine (no network)'}
                            {mode === 'auto' && 'Auto-selecting best engine'}
                        </span>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default AnalyzeEngineSettingsPanel;

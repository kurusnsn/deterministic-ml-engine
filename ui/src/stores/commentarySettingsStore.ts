/**
 * Commentary Settings Store
 *
 * Zustand store managing commentary mode preferences for the analysis UI.
 * Allows users to switch between LLM and heuristic commentary modes.
 * Settings are persisted to localStorage.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type CommentaryMode = 'llm' | 'heuristic' | 'chess_com_style';

interface CommentarySettingsState {
    /** Current commentary mode: 'llm' (AI-generated) or 'heuristic' (rule-based) */
    mode: CommentaryMode;

    /** 
     * Debug mode: when enabled, shows evidence/reasoning behind heuristic commentary.
     * Only applicable when mode is 'heuristic'.
     */
    debugMode: boolean;

    /** Set the commentary mode */
    setMode: (mode: CommentaryMode) => void;

    /** Set debug mode */
    setDebugMode: (debug: boolean) => void;

    /** Toggle between LLM and heuristic modes */
    toggleMode: () => void;
}

/**
 * Storage key for persisting commentary settings
 */
const STORAGE_KEY = 'chessvector-commentary-settings';

/**
 * Commentary Settings Store
 *
 * Default is 'llm' mode to match current production behavior.
 * Users can switch to 'heuristic' mode for faster, deterministic commentary.
 */
export const useCommentarySettingsStore = create<CommentarySettingsState>()(
    persist(
        (set, get) => ({
            // Default to LLM mode (matches current production behavior)
            mode: 'llm',
            debugMode: false,

            setMode: (mode) => set({ mode }),

            setDebugMode: (debug) => set({ debugMode: debug }),

            toggleMode: () => {
                const current = get().mode;
                set({ mode: current === 'llm' ? 'heuristic' : 'llm' });
            },
        }),
        {
            name: STORAGE_KEY,
            storage: createJSONStorage(() => localStorage),
            // Only persist mode and debugMode
            partialize: (state) => ({
                mode: state.mode,
                debugMode: state.debugMode,
            }),
        }
    )
);

/**
 * Selector for commentary mode
 */
export const selectCommentaryMode = (state: CommentarySettingsState) => state.mode;

/**
 * Selector for debug mode
 */
export const selectDebugMode = (state: CommentarySettingsState) => state.debugMode;

/**
 * Selector for checking if heuristic mode is active
 */
export const selectIsHeuristicMode = (state: CommentarySettingsState) =>
    state.mode === 'heuristic';

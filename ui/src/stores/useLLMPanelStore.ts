import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Represents a single LLM conversation thread for a specific variation path
 */
interface LLMThread {
  id: string;                    // variationPath (e.g., "a1b2c3" or "" for mainline)
  scrollPosition: number;         // Y scroll offset to restore
  lastViewedAt: number;          // timestamp for cache management
}

/**
 * Represents a variation view in the navigation stack
 */
interface VariationView {
  path: string;                  // Full path to this variation
  name: string;                  // Display name (e.g., "Mainline", "Variation: Bb5")
  rootPath: string;              // Path where this variation starts (for message scoping)
}

/**
 * LLM Panel Store - Manages UI state for the LLM chat panel
 *
 * Responsibilities:
 * - Track scroll positions per variation thread
 * - Manage active thread ID (synced with move tree path)
 * - Manage view navigation stack for variation browsing
 * - Persist state across browser sessions
 * - Auto-cleanup old threads for memory efficiency
 */
interface LLMPanelState {
  threads: Record<string, LLMThread>;  // Keyed by variationPath
  activeThreadId: string;              // Current variation path
  viewStack: VariationView[];          // Navigation history stack

  // Actions
  setActiveThread: (id: string) => void;
  updateScroll: (id: string, position: number) => void;
  getThread: (id: string) => LLMThread | undefined;
  clearOldThreads: () => void;

  // View navigation actions
  pushView: (path: string, name: string, rootPath: string) => void;
  popView: () => VariationView | undefined;
  getCurrentView: () => VariationView | undefined;
  clearViewStack: () => void;
}

// Cleanup threads older than 1 hour (in milliseconds)
const THREAD_EXPIRY_MS = 60 * 60 * 1000;

/**
 * Global store for LLM panel state
 *
 * Usage:
 * ```typescript
 * const { setActiveThread, activeThreadId, updateScroll } = useLLMPanelStore();
 * ```
 */
export const useLLMPanelStore = create<LLMPanelState>()(
  persist(
    (set, get) => ({
      threads: {},
      activeThreadId: '', // Start with root/mainline
      viewStack: [], // Start with empty view stack

      /**
       * Set the active thread (called when user navigates to a variation)
       */
      setActiveThread: (id: string) => {
        set({ activeThreadId: id });

        // Create thread entry if it doesn't exist
        const state = get();
        if (!state.threads[id]) {
          set((state) => ({
            threads: {
              ...state.threads,
              [id]: {
                id,
                scrollPosition: 0,
                lastViewedAt: Date.now(),
              },
            },
          }));
        } else {
          // Update last viewed timestamp
          set((state) => ({
            threads: {
              ...state.threads,
              [id]: {
                ...state.threads[id],
                lastViewedAt: Date.now(),
              },
            },
          }));
        }
      },

      /**
       * Update scroll position for a specific thread
       */
      updateScroll: (id: string, position: number) => {
        set((state) => {
          // Create thread if it doesn't exist
          if (!state.threads[id]) {
            return {
              threads: {
                ...state.threads,
                [id]: {
                  id,
                  scrollPosition: position,
                  lastViewedAt: Date.now(),
                },
              },
            };
          }

          // Update existing thread
          return {
            threads: {
              ...state.threads,
              [id]: {
                ...state.threads[id],
                scrollPosition: position,
                lastViewedAt: Date.now(),
              },
            },
          };
        });
      },

      /**
       * Get a specific thread by ID
       */
      getThread: (id: string) => {
        return get().threads[id];
      },

      /**
       * Remove threads that haven't been viewed in over an hour
       * Call this periodically to prevent memory bloat
       */
      clearOldThreads: () => {
        const now = Date.now();
        set((state) => {
          const filteredThreads: Record<string, LLMThread> = {};

          Object.entries(state.threads).forEach(([key, thread]) => {
            if (now - thread.lastViewedAt < THREAD_EXPIRY_MS) {
              filteredThreads[key] = thread;
            }
          });

          return { threads: filteredThreads };
        });
      },

      /**
       * Push a new view onto the navigation stack
       */
      pushView: (path: string, name: string, rootPath: string) => {
        set((state) => ({
          viewStack: [...state.viewStack, { path, name, rootPath }],
        }));
      },

      /**
       * Pop the current view and return to previous
       * Returns the previous view or undefined if stack is empty
       */
      popView: () => {
        const state = get();
        if (state.viewStack.length === 0) return undefined;

        const newStack = [...state.viewStack];
        newStack.pop(); // Remove current view
        const previousView = newStack[newStack.length - 1];

        set({ viewStack: newStack });
        return previousView;
      },

      /**
       * Get the current view from top of stack
       */
      getCurrentView: () => {
        const state = get();
        return state.viewStack[state.viewStack.length - 1];
      },

      /**
       * Clear the entire view stack (e.g., when loading new game)
       */
      clearViewStack: () => {
        set({ viewStack: [] });
      },
    }),
    {
      name: 'llm-panel-storage', // sessionStorage key
      storage: createJSONStorage(() => sessionStorage), // Use sessionStorage for session-only persistence
    }
  )
);

// Auto-cleanup old threads on store initialization and every 10 minutes
if (typeof window !== 'undefined') {
  // Initial cleanup
  setTimeout(() => {
    useLLMPanelStore.getState().clearOldThreads();
  }, 1000);

  // Periodic cleanup every 10 minutes
  setInterval(() => {
    useLLMPanelStore.getState().clearOldThreads();
  }, 10 * 60 * 1000);
}

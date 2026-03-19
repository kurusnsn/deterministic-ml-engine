import { create } from 'zustand';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway';

/**
 * GPU Status types matching backend response
 */
export type GPUStatusType = 'cold' | 'lc0_warming' | 'llama_warming' | 'ready';

export interface QueuedMove {
    path: string;
    fen: string;
    currentFen: string;
    move: string;
    moveFrom?: string;
    moveTo?: string;
    queuedAt: number;
}

interface GPUStatusState {
    status: GPUStatusType;
    lc0Ready: boolean;
    llamaReady: boolean;
    moveQueue: QueuedMove[];
    isPolling: boolean;

    // Actions
    setStatus: (status: GPUStatusType, lc0Ready: boolean, llamaReady: boolean) => void;
    addToQueue: (move: QueuedMove) => void;
    processQueue: () => QueuedMove[];
    clearQueue: () => void;
    startPolling: () => void;
    stopPolling: () => void;
}

let pollIntervalId: NodeJS.Timeout | null = null;

export const useGPUStatusStore = create<GPUStatusState>((set, get) => ({
    status: 'cold',
    lc0Ready: false,
    llamaReady: false,
    moveQueue: [],
    isPolling: false,

    setStatus: (status, lc0Ready, llamaReady) => {
        set({ status, lc0Ready, llamaReady });
    },

    addToQueue: (move) => {
        set((state) => ({
            moveQueue: [...state.moveQueue, move],
        }));
    },

    processQueue: () => {
        const queue = get().moveQueue;
        set({ moveQueue: [] });
        return queue;
    },

    clearQueue: () => {
        set({ moveQueue: [] });
    },

    startPolling: () => {
        if (pollIntervalId) return; // Already polling

        set({ isPolling: true });

        const poll = async () => {
            try {
                const res = await fetch(`${GATEWAY_URL}/gpu/status`);
                if (res.ok) {
                    const data = await res.json();
                    const state = get();
                    state.setStatus(data.status, data.lc0_ready, data.llama_ready);

                    // Stop polling if GPU is ready
                    if (data.status === 'ready') {
                        state.stopPolling();
                    }
                }
            } catch (e) {
                console.error('[GPU Status] Poll failed:', e);
            }
        };

        // Initial poll
        poll();

        // Poll every 2 seconds during warm-up
        pollIntervalId = setInterval(poll, 2000);
    },

    stopPolling: () => {
        if (pollIntervalId) {
            clearInterval(pollIntervalId);
            pollIntervalId = null;
        }
        set({ isPolling: false });
    },
}));

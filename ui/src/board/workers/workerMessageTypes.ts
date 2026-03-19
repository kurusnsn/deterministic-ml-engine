/**
 * Phase 1: Empty scaffolding - Worker message type definitions
 * No logic yet - only type definitions
 */

import { Square } from "chess.js";

// ===== MESSAGE TO WORKER =====

export interface EvalData {
    from: Square;
    to: Square;
    eval: number;
}

export interface ThreatSettings {
    enabled: boolean;
    threshold: number; // Centipawn threshold
}

export interface GridSettings {
    enabled: boolean;
    maxBoxes: number;
}

export interface PVSettings {
    enabled: boolean;
    showBestMove: boolean;
}

export interface MessageToWorker {
    type: "COMPUTE_OVERLAYS";
    payload: {
        fen: string;
        mode: "idle" | "dragging" | "selected";
        evalData?: Record<string, Record<string, number>>; // moveEvalMap
        threatSettings: ThreatSettings;
        gridSettings: GridSettings;
        pvSettings: PVSettings;
        multipvData?: Array<{ moves: string[]; eval: number }>;
    };
}

// ===== MESSAGE FROM WORKER =====

export interface WorkerArrow {
    from: Square;
    to: Square;
    color: string;
}

export interface WorkerGridSquare {
    square: Square;
    score: string;
    color: string;
}

export interface WorkerThreat {
    from: Square;
    to: Square;
    color: string;
}

export interface MessageFromWorker {
    type: "OVERLAYS_COMPUTED";
    payload: {
        fen: string; // Include FEN to validate response matches current position
        arrows: WorkerArrow[];
        grid: WorkerGridSquare[];
        threats: WorkerThreat[];
        pvLines: Array<{ moves: string[]; eval: number }>;
        bestMoveArrow: WorkerArrow | null;
    };
}

// ===== UNION TYPES =====

export type WorkerMessage = MessageToWorker | MessageFromWorker;

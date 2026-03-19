/**
 * Phase 5: Implemented - Main rendering orchestrator
 */

import { Square } from "chess.js";
import { Arrow, GridSquare, Threat, Highlight } from "../core/useBoardStore";
import { drawArrows } from "./drawArrow";
import { drawGrid } from "./drawGrid";
import { drawThreats } from "./drawThreats";
import { drawHighlights } from "./drawHighlights";
import { drawRipples, Ripple } from "./drawRipples";

// ===== TYPE DEFINITIONS =====

export interface RenderContext {
    ctx: CanvasRenderingContext2D;
    boardSize: number;
    orientation: "white" | "black";
    dpr: number; // Device pixel ratio
    hoveredSquare: Square | null;
}

export interface OverlayData {
    arrows: Arrow[];
    grid: GridSquare[];
    threats: Threat[];
    threats: Threat[];
    highlights: Highlight[];
    ripples?: Ripple[];
}

// ===== RENDERER =====

/**
 * Main rendering function - orchestrates all overlay drawing
 * Draws in correct order: highlights → grid → threats → arrows
 * @param context - Canvas rendering context
 * @param data - Overlay data to render
 */
export function renderOverlays(
    context: RenderContext,
    data: OverlayData
): void {
    const { ctx, boardSize, dpr } = context;

    // Clear canvas first
    clearCanvas(ctx, boardSize, dpr);

    // Enable anti-aliasing for smooth rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Draw in order (bottom to top):
    // 1. Highlights (squares) - drawn first, underneath everything
    if (data.highlights.length > 0) {
        drawHighlights(data.highlights, context);
    }

    // 2. Grid overlay (eval boxes) - on top of highlights
    if (data.grid.length > 0) {
        drawGrid(data.grid, context);
    }

    // 3. Threat arrows - underneath regular arrows
    if (data.threats.length > 0) {
        drawThreats(data.threats, context);
    }

    // 4. Arrows (PV, best move, user-drawn) - drawn last, on top
    if (data.arrows.length > 0) {
        drawArrows(data.arrows, context);
    }

    // 5. Ripples (click/release animations) - drawn on very top
    if (data.ripples && data.ripples.length > 0) {
        drawRipples(data.ripples, context);
    }
}

/**
 * Clear the canvas
 * @param ctx - Canvas context
 * @param boardSize - Board size
 * @param dpr - Device pixel ratio
 */
export function clearCanvas(
    ctx: CanvasRenderingContext2D,
    boardSize: number,
    dpr: number
): void {
    ctx.clearRect(0, 0, boardSize * dpr, boardSize * dpr);
}

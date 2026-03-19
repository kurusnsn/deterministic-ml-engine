/**
 * Phase 5: Implemented - Grid overlay drawing utilities
 */

import { GridSquare } from "../core/useBoardStore";
import { RenderContext } from "./overlayRenderer";
import { getSquareBounds } from "../core/coords";

// ===== TAILWIND COLOR MAPPING =====

// Map Tailwind classes to RGBA values (exact colors from OverlayGrid.tsx)
const TAILWIND_COLORS: Record<string, string> = {
    "bg-blue-700": "rgb(29, 78, 216)",     // Best move
    "bg-green-500": "rgb(34, 197, 94)",    // Very close
    "bg-yellow-500": "rgb(234, 179, 8)",   // Moderate
    "bg-red-600": "rgb(220, 38, 38)",      // Bad move
};

/**
 * Convert Tailwind color class to RGBA
 * @param colorClass - Tailwind color class (e.g., "bg-blue-700")
 * @returns RGBA color string
 */
export function tailwindToRGBA(colorClass: string): string {
    return TAILWIND_COLORS[colorClass] || "rgb(0, 0, 0)";
}

// ===== GRID DRAWING =====

/**
 * Draw evaluation boxes on grid squares
 * Positions boxes in top-right corner with exact styling from OverlayGrid.tsx
 * @param grid - Array of grid squares with eval scores
 * @param context - Rendering context
 */
export function drawGrid(grid: GridSquare[], context: RenderContext): void {
    const { ctx, boardSize, orientation, dpr } = context;

    ctx.save();

    for (const gridSquare of grid) {
        const bounds = getSquareBounds(gridSquare.square, boardSize, orientation);
        const color = tailwindToRGBA(gridSquare.color);

        // Box dimensions in CSS pixels (from OverlayGrid.tsx: m-0.5, text-[10px], px-1, rounded)
        const margin = 2; // m-0.5 (0.125rem = 2px)
        const paddingX = 4; // px-1 (0.25rem = 4px)
        const fontSize = 10; // text-[10px]
        const borderRadius = 3; // rounded (0.25rem = 4px)

        // Measure text using scaled font for accuracy
        ctx.font = `bold ${fontSize * dpr}px sans-serif`;
        const textMetrics = ctx.measureText(gridSquare.score);
        const textWidth = textMetrics.width / dpr; // Convert back to CSS pixels

        // Calculate box dimensions in CSS pixels
        const boxWidth = textWidth + paddingX * 2;
        const boxHeight = fontSize + 4; // Extra vertical padding

        // Position in top-right corner with margin (CSS pixels)
        const boxX = bounds.x + bounds.size - boxWidth - margin;
        const boxY = bounds.y + margin;

        // Draw rounded rectangle background (scale to canvas pixels)
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(boxX * dpr, boxY * dpr, boxWidth * dpr, boxHeight * dpr, borderRadius * dpr);
        ctx.fill();

        // Draw text (white, bold)
        ctx.fillStyle = "white";
        ctx.font = `bold ${fontSize * dpr}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
            gridSquare.score,
            (boxX + boxWidth / 2) * dpr,
            (boxY + boxHeight / 2) * dpr
        );
    }

    ctx.restore();
}

/**
 * Phase 6: Implemented - Ripple animation drawing
 */

import { Square } from "chess.js";
import { RenderContext } from "./overlayRenderer";
import { getSquareBounds } from "../core/coords";

export interface Ripple {
    square: Square;
    start: number;
    color?: string;
}

/**
 * Draw ripples on the canvas
 * @param ripples - Array of active ripples
 * @param context - Rendering context
 */
export function drawRipples(
    ripples: Ripple[],
    context: RenderContext
): void {
    const { ctx, boardSize, orientation, dpr } = context;
    const now = performance.now();
    const DURATION = 600; // ms

    ripples.forEach((ripple) => {
        const progress = (now - ripple.start) / DURATION;

        if (progress >= 1) return; // Ripple finished

        const bounds = getSquareBounds(ripple.square, boardSize, orientation);
        const centerX = (bounds.x + bounds.size / 2) * dpr;
        const centerY = (bounds.y + bounds.size / 2) * dpr;
        const baseSize = bounds.size * dpr;

        // Animation: Grow from 60% (was 50%) to 160% of square size
        // Ease-out cubic for expansion
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const radius = (baseSize * 0.6) + (baseSize * 1.0 * easeOut);

        // Opacity: Fade from 0.4 (more see-through) to 0
        // Ease-in cubic for fade out
        const opacity = 0.4 * Math.pow(1 - progress, 3);

        ctx.save();

        // Clip to square bounds
        ctx.beginPath();
        ctx.rect(bounds.x * dpr, bounds.y * dpr, bounds.size * dpr, bounds.size * dpr);
        ctx.clip();

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius / 2, 0, Math.PI * 2);
        // White color with lower opacity as requested
        ctx.fillStyle = ripple.color || `rgba(255, 255, 255, ${opacity})`;

        // If color provided, apply opacity manually if needed, or assume rgba
        if (ripple.color) {
            ctx.globalAlpha = opacity;
            ctx.fillStyle = ripple.color;
        }

        ctx.fill();
        ctx.restore();
    });
}

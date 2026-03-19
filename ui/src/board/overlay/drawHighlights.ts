/**
 * Phase 5: Implemented - Square highlight drawing utilities
 */

import { Highlight } from "../core/useBoardStore";
import { RenderContext } from "./overlayRenderer";
import { getSquareBounds } from "../core/coords";

// ===== HIGHLIGHT STYLES (from customSquareStyles in ChessBoard.tsx) =====

const HIGHLIGHT_STYLES = {
    lastMoveFrom: {
        background: "rgba(250, 204, 21, 0.3)",
        border: "rgba(0, 0, 0, 0.3)",
        borderWidth: 3,
    },
    lastMoveTo: {
        background: "#fde68a",
        border: "rgba(0, 0, 0, 0.3)",
        borderWidth: 3,
    },
    selected: {
        background: "rgba(34, 197, 94, 0.4)",
        // Removed persistent white glow as per user request
        // It should only appear on hover
    },
    legalMove: {
        dotColor: "rgba(34, 197, 94, 0.6)",
        dotSize: 0.2, // 20% of square size
    },
    userCircle: {
        // Used for hover effect now
        borderWidth: 1,
        borderColor: "#FFFFFF",
        shadowBlur: 10,
        shadowColor: "white",
    },
};

// ===== HIGHLIGHT DRAWING =====

/**
 * Draw a single highlight
 * @param highlight - Highlight to draw
 * @param context - Rendering context
 */
export function drawHighlight(
    highlight: Highlight,
    context: RenderContext
): void {
    const { ctx, boardSize, orientation, dpr } = context;
    const bounds = getSquareBounds(highlight.square, boardSize, orientation);

    ctx.save();

    switch (highlight.type) {
        case "lastMove": {
            // Determine if this is "from" or "to" based on color property
            const isFrom = highlight.color === "from";
            const style = isFrom ? HIGHLIGHT_STYLES.lastMoveFrom : HIGHLIGHT_STYLES.lastMoveTo;

            // Draw background
            ctx.fillStyle = highlight.fillColor || style.background;
            ctx.fillRect(
                bounds.x * dpr,
                bounds.y * dpr,
                bounds.size * dpr,
                bounds.size * dpr
            );

            // Draw inset border (box-shadow: inset) - only if no custom fill color (or maybe always?)
            // If custom fill color is used (analyze mode), we might want to skip the border or style it differently.
            // For now, keep border but maybe adjust it? 
            // The user asked for "yellow square", implies solid or semi-transparent fill.
            // If fillColor is present, let's assume it handles the look.
            if (!highlight.fillColor) {
                ctx.strokeStyle = style.border;
                ctx.lineWidth = style.borderWidth * dpr;
                ctx.strokeRect(
                    bounds.x * dpr + (style.borderWidth / 2) * dpr,
                    bounds.y * dpr + (style.borderWidth / 2) * dpr,
                    bounds.size * dpr - style.borderWidth * dpr,
                    bounds.size * dpr - style.borderWidth * dpr
                );
            }
            break;
        }

        case "selected": {
            const style = HIGHLIGHT_STYLES.selected;

            // Draw background only
            ctx.fillStyle = style.background;
            ctx.fillRect(
                bounds.x * dpr,
                bounds.y * dpr,
                bounds.size * dpr,
                bounds.size * dpr
            );
            break;
        }

        case "legal": {
            // Draw legal-move indicator:
            // - empty targets: center dot
            // - occupied/capture targets: ring on the square
            const style = HIGHLIGHT_STYLES.legalMove;
            const centerX = (bounds.x + bounds.size / 2) * dpr;
            const centerY = (bounds.y + bounds.size / 2) * dpr;
            const isRing = highlight.legalVariant === "ring";

            // Base radius (ring uses larger radius to read as square marker)
            let radius = (bounds.size * (isRing ? 0.38 : style.dotSize)) * dpr;

            // Animation logic
            const now = performance.now();
            const ANIMATION_DURATION = 200; // ms

            let scale = 1;
            let opacity = 1;

            if (highlight.entering && highlight.startTime) {
                const progress = Math.min(1, (now - highlight.startTime) / ANIMATION_DURATION);
                // Ease out back for "pop" effect
                scale = 1 - Math.pow(1 - progress, 3);
            } else if (highlight.exiting && highlight.startTime) {
                const progress = Math.min(1, (now - highlight.startTime) / ANIMATION_DURATION);
                // Ripple effect: Expand slightly and fade out
                // Scale goes from 1 to 1.5
                scale = 1 + (progress * 0.5);
                // Opacity goes from 1 to 0 (faster fade: cubic ease-in)
                opacity = Math.pow(1 - progress, 3);
            }

            // Hover effect
            if (context.hoveredSquare === highlight.square) {
                // Expand circle when hovered
                // We can animate this too if we tracked hover start time, but instant expansion is responsive
                scale *= 1.3;
            }

            radius *= scale;

            if (radius <= 0 || opacity <= 0) break;

            // Use custom color if provided, otherwise default to style
            const baseColor = highlight.color || style.dotColor;

            if (isRing) {
                ctx.save();
                if (opacity < 1) {
                    ctx.globalAlpha = opacity;
                }
                ctx.strokeStyle = baseColor;
                ctx.lineWidth = bounds.size * 0.08 * dpr;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
                break;
            }

            // Apply opacity if exiting
            if (opacity < 1) {
                // Parse rgba or hex to apply opacity? 
                // Assuming baseColor is rgba, we can try to inject opacity, or use globalAlpha
                ctx.save();
                ctx.globalAlpha = opacity;
                ctx.fillStyle = baseColor;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            } else {
                ctx.fillStyle = baseColor;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.fill();
            }
            break;
        }

        case "userCircle": {
            // Draw circle outline (inset box-shadow: 4px)
            const style = HIGHLIGHT_STYLES.userCircle;
            // If color is provided (user drawing), use it. If not (hover), use white glow.
            const isHover = !highlight.color;
            const color = highlight.color || style.borderColor;

            ctx.save();
            if (isHover) {
                ctx.shadowBlur = style.shadowBlur * dpr;
                ctx.shadowColor = style.shadowColor;
            }

            ctx.strokeStyle = color;
            ctx.lineWidth = style.borderWidth * dpr;
            ctx.strokeRect(
                bounds.x * dpr + (style.borderWidth / 2) * dpr,
                bounds.y * dpr + (style.borderWidth / 2) * dpr,
                bounds.size * dpr - style.borderWidth * dpr,
                bounds.size * dpr - style.borderWidth * dpr
            );
            ctx.restore();
            break;
        }
    }

    ctx.restore();
}

/**
 * Draw square highlights on the canvas
 * @param highlights - Array of square highlights
 * @param context - Rendering context
 */
export function drawHighlights(
    highlights: Highlight[],
    context: RenderContext
): void {
    highlights.forEach((highlight) => drawHighlight(highlight, context));
}

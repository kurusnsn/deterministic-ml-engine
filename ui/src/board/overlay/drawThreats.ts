/**
 * Phase 5: Implemented - Threat line drawing utilities
 */

import { Threat } from "../core/useBoardStore";
import { RenderContext } from "./overlayRenderer";
import { drawArrow } from "./drawArrow";

// ===== THREAT DRAWING =====

/**
 * Draw threat arrows on the canvas
 * Uses exact color from ChessBoard.tsx: 'rgba(239, 68, 68, 0.8)'
 * @param threats - Array of threat arrows
 * @param context - Rendering context
 */
export function drawThreats(threats: Threat[], context: RenderContext): void {
    // Threats are just arrows with specific color
    // Reuse arrow drawing logic
    threats.forEach((threat) => {
        drawArrow(threat, context);
    });
}

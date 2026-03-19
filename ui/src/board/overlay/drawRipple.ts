/**
 * Landing ripple animation for piece drops
 */

import { Square } from "chess.js";
import { squareToXY } from "../core/coords";

export interface RippleState {
    square: Square;
    start: number;
}

/**
 * Draw landing ripple animation when a piece is dropped
 * @param ctx - Canvas context
 * @param ripple - Ripple state
 * @param timestamp - Current timestamp
 * @param boardSize - Board size
 * @param orientation - Board orientation
 * @param dpr - Device pixel ratio
 */
export function drawLandingRipple(
    ctx: CanvasRenderingContext2D,
    ripple: RippleState | null,
    timestamp: number,
    boardSize: number,
    orientation: "white" | "black",
    dpr: number
): void {
    if (!ripple) return;

    const duration = 180; // Short, subtle animation (ms)
    const progress = (timestamp - ripple.start) / duration;

    // Animation finished
    if (progress > 1) return;

    const S = boardSize / 8;
    const maxRadius = S * 0.45;
    const radius = progress * maxRadius;

    // Strong at first, fades out
    const alpha = 0.25 * (1 - progress);

    const { x, y } = squareToXY(ripple.square, boardSize, orientation);

    ctx.save();
    ctx.scale(dpr, dpr);

    // Draw expanding circle
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 165, 0, ${alpha})`; // Orange-ish ripple
    ctx.fill();

    ctx.restore();
}

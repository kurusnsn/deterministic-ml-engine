/**
 * Phase 6: Implemented - Main Canvas overlay component
 */

"use client";

import React, { useRef, useEffect } from "react";
import { useBoardStore } from "../core/useBoardStore";
import { renderOverlays } from "./overlayRenderer";

// ===== PROPS INTERFACE =====

export interface OverlayCanvasProps {
    className?: string;
}

// ===== COMPONENT =====

export const OverlayCanvas: React.FC<OverlayCanvasProps> = ({ className }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafIdRef = useRef<number | null>(null);

    // OPTIMIZATION: Subscribe to individual values to prevent object recreation issues
    // Each selector only triggers re-render when that specific value changes
    // Zustand uses Object.is() for comparison, so array/object references must be stable
    const boardSize = useBoardStore((state) => state.boardSize);
    const orientation = useBoardStore((state) => state.orientation);
    const arrows = useBoardStore((state) => state.arrows);
    const grid = useBoardStore((state) => state.grid);
    const threats = useBoardStore((state) => state.threats);
    const highlights = useBoardStore((state) => state.highlights);
    const hoveredSquare = useBoardStore((state) => state.hoveredSquare);
    const ripples = useBoardStore((state) => state.ripples);

    // Render overlays with requestAnimationFrame batching
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Check if we need to animate (continuous loop)
        // We need to animate if any highlight is entering or exiting OR if there are active ripples
        const isAnimating = highlights.some(h => h.entering || h.exiting) || ripples.length > 0;

        const render = () => {
            // Get device pixel ratio for sharp rendering on retina displays
            const dpr = window.devicePixelRatio || 1;

            // Set canvas size accounting for DPR
            canvas.width = boardSize * dpr;
            canvas.height = boardSize * dpr;

            // Set display size (CSS pixels)
            canvas.style.width = `${boardSize}px`;
            canvas.style.height = `${boardSize}px`;

            // Render all overlays
            renderOverlays(
                { ctx, boardSize, orientation, dpr, hoveredSquare },
                { arrows, grid, threats, highlights, ripples }
            );

            // If animating, keep looping
            if (isAnimating) {
                rafIdRef.current = requestAnimationFrame(render);
            }
        };

        // Cancel any pending render
        if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
        }

        // Start rendering
        // If animating, this kicks off the loop
        // If not animating, this renders a single frame
        rafIdRef.current = requestAnimationFrame(render);

        // Cleanup on unmount or dependency change
        return () => {
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
            }
        };
    }, [boardSize, orientation, arrows, grid, threats, highlights, hoveredSquare, ripples]);

    return (
        <canvas
            ref={canvasRef}
            className={className}
            aria-hidden="true"
            style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none", // Allow clicks to pass through to board
                width: boardSize,
                height: boardSize,
            }}
        />
    );
};

export default OverlayCanvas;

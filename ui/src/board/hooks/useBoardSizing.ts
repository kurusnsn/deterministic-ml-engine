/**
 * Responsive board sizing hook
 *
 * Provides:
 * - Automatic responsive sizing based on viewport
 * - Manual resize handle support
 * - Window resize handling
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface SizingConstraints {
  /** Minimum board size in pixels */
  minSize?: number;
  /** Maximum board size in pixels */
  maxSize?: number;
  /** Breakpoint for mobile (below this is mobile) */
  mobileBreakpoint?: number;
  /** Fraction of viewport width for desktop (0-1) */
  desktopWidthFraction?: number;
  /** Padding to subtract on mobile */
  mobilePadding?: number;
  /** Height offset to subtract on desktop (for navbar, etc.) */
  desktopHeightOffset?: number;
}

const DEFAULT_CONSTRAINTS: Required<SizingConstraints> = {
  minSize: 320,
  maxSize: 1200,
  mobileBreakpoint: 1024,
  desktopWidthFraction: 0.4,
  mobilePadding: 32,
  desktopHeightOffset: 200,
};

export interface UseBoardSizingReturn {
  /** Current board size in pixels */
  boardSize: number;
  /** Set board size manually */
  setBoardSize: (size: number) => void;
  /** Whether the viewport is mobile */
  isMobile: boolean;
  /** Whether the component has mounted (for SSR) */
  mounted: boolean;
  /** Props for a resize handle element */
  resizeHandleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    className: string;
  };
}

/**
 * Hook that manages responsive board sizing
 *
 * Automatically calculates board size based on viewport:
 * - Mobile: Min of (viewport width - padding, 2/3 viewport height)
 * - Desktop: Constrained by available width/height with offsets
 *
 * Also provides resize handle props for manual sizing.
 *
 * @example
 * ```tsx
 * const { boardSize, isMobile, mounted, resizeHandleProps } = useBoardSizing();
 *
 * return (
 *   <div style={{ width: boardSize, height: boardSize }}>
 *     <UniversalBoard boardWidth={boardSize} ... />
 *     <div {...resizeHandleProps} />
 *   </div>
 * );
 * ```
 */
export const useBoardSizing = (
  constraints: SizingConstraints = {}
): UseBoardSizingReturn => {
  const config = { ...DEFAULT_CONSTRAINTS, ...constraints };

  const [boardSize, setBoardSize] = useState(500); // Default before mount
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Ref for resize handle state
  const resizingRef = useRef(false);

  // Calculate board size based on viewport
  const calculateBoardSize = useCallback(() => {
    if (typeof window === "undefined") return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const mobile = viewportWidth < config.mobileBreakpoint;

    setIsMobile(mobile);

    if (mobile) {
      // Mobile: full width OR 2/3 screen height, whichever is smaller
      const size = Math.min(
        viewportWidth - config.mobilePadding,
        (viewportHeight * 2) / 3
      );
      setBoardSize(Math.max(config.minSize, size));
    } else {
      // Desktop: Account for navbar + padding
      const availableHeight = viewportHeight - config.desktopHeightOffset;
      const availableWidth = viewportWidth * config.desktopWidthFraction;

      // Scale proportionally with constraints
      const size = Math.max(
        config.minSize,
        Math.min(config.maxSize, availableWidth, availableHeight)
      );
      setBoardSize(size);
    }
  }, [config]);

  // Initialize on mount and handle window resize
  useEffect(() => {
    setMounted(true);
    calculateBoardSize();

    window.addEventListener("resize", calculateBoardSize);
    return () => window.removeEventListener("resize", calculateBoardSize);
  }, [calculateBoardSize]);

  // Resize handle mouse down handler
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizingRef.current = true;

      const startX = e.clientX;
      const startY = e.clientY;
      const startSize = boardSize;

      function onMouseMove(ev: MouseEvent) {
        const diff = Math.max(ev.clientX - startX, ev.clientY - startY);
        const newSize = Math.max(
          config.minSize,
          Math.min(config.maxSize, startSize + diff)
        );
        setBoardSize(newSize);
      }

      function onMouseUp() {
        resizingRef.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [boardSize, config.minSize, config.maxSize]
  );

  return {
    boardSize,
    setBoardSize,
    isMobile,
    mounted,
    resizeHandleProps: {
      onMouseDown: handleResizeMouseDown,
      className: "absolute bottom-0 right-0 w-4 h-4 cursor-se-resize",
    },
  };
};

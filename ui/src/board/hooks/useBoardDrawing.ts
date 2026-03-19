/**
 * User drawing system for arrows and circles on the board
 *
 * Features:
 * - Right-click to draw circles/arrows
 * - Left-click to clear all drawings
 * - Drag for arrows, click for circles
 * - Color support (extensible via DRAWING_COLORS)
 */

import { useState, useCallback } from 'react';
import { Square } from 'chess.js';

export interface DrawnArrow {
  from: Square;
  to: Square;
  color: string;
  id: string;
}

export interface DrawnCircle {
  square: Square;
  color: string;
  id: string;
}

export const DRAWING_COLORS = {
  orange: "rgba(249, 115, 22, 0.9)",
};

export const useBoardDrawing = (orientation: "white" | "black") => {
  const [drawnArrows, setDrawnArrows] = useState<DrawnArrow[]>([]);
  const [drawnCircles, setDrawnCircles] = useState<DrawnCircle[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingStart, setDrawingStart] = useState<Square | null>(null);
  const [currentDrawColor, setCurrentDrawColor] = useState<string>("orange");

  const getSquareFromPosition = useCallback((x: number, y: number, boardElement: HTMLElement): Square | null => {
    const rect = boardElement.getBoundingClientRect();
    const size = rect.width / 8;

    const file = Math.floor((x - rect.left) / size);
    const rank = Math.floor((y - rect.top) / size);

    const adjustedFile = orientation === "white" ? file : 7 - file;
    const adjustedRank = orientation === "white" ? 7 - rank : rank;

    if (adjustedFile < 0 || adjustedFile > 7 || adjustedRank < 0 || adjustedRank > 7) {
      return null;
    }

    const fileChar = String.fromCharCode(97 + adjustedFile);
    const rankNum = adjustedRank + 1;

    return `${fileChar}${rankNum}` as Square;
  }, [orientation]);

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button === 2) {
      // Right click - start drawing
      event.preventDefault(); // Only prevent default for right-click
      const boardElement = event.currentTarget;
      const square = getSquareFromPosition(event.clientX, event.clientY, boardElement);

      if (square) {
        setIsDrawing(true);
        setDrawingStart(square);
      }
    } else if (event.button === 0) {
      setDrawnArrows([]);
      setDrawnCircles([]);
    }
  }, [getSquareFromPosition]);

  const handleMouseUp = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawingStart || event.button !== 2) return;

    event.preventDefault();
    const boardElement = event.currentTarget;
    const endSquare = getSquareFromPosition(event.clientX, event.clientY, boardElement);

    if (endSquare) {
      if (endSquare === drawingStart) {
        const circleId = `circle-${drawingStart}-${Date.now()}`;
        setDrawnCircles(prev => {
          const filtered = prev.filter(c => !(c.square === drawingStart && c.color === currentDrawColor));
          return [...filtered, {
            square: drawingStart,
            color: currentDrawColor,
            id: circleId
          }];
        });
      } else {
        const arrowId = `arrow-${drawingStart}-${endSquare}-${Date.now()}`;
        setDrawnArrows(prev => {
          const filtered = prev.filter(a => !(a.from === drawingStart && a.to === endSquare && a.color === currentDrawColor));
          return [...filtered, {
            from: drawingStart,
            to: endSquare,
            color: currentDrawColor,
            id: arrowId
          }];
        });
      }
    }

    setIsDrawing(false);
    setDrawingStart(null);
  }, [isDrawing, drawingStart, getSquareFromPosition, currentDrawColor]);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const clearDrawings = useCallback(() => {
    setDrawnArrows([]);
    setDrawnCircles([]);
  }, []);

  const removeDrawingsOnSquare = useCallback((square: Square) => {
    setDrawnArrows(prev => prev.filter(arrow =>
      arrow.from !== square && arrow.to !== square
    ));

    setDrawnCircles(prev => prev.filter(circle =>
      circle.square !== square
    ));
  }, []);

  const hasDrawingsOnSquare = useCallback((square: Square) => {
    const hasArrows = drawnArrows.some(arrow =>
      arrow.from === square || arrow.to === square
    );
    const hasCircles = drawnCircles.some(circle =>
      circle.square === square
    );
    return hasArrows || hasCircles;
  }, [drawnArrows, drawnCircles]);

  const getCustomArrows = useCallback((engineArrows: Array<[Square, Square, string]> = []): Array<[Square, Square, string]> => {
    const arrows: Array<[Square, Square, string]> = [...engineArrows];

    drawnArrows.forEach(arrow => {
      arrows.push([arrow.from, arrow.to, DRAWING_COLORS[arrow.color as keyof typeof DRAWING_COLORS] || arrow.color]);
    });

    return arrows;
  }, [drawnArrows]);

  const getDrawingSquareStyles = useCallback((): { [square: string]: React.CSSProperties } => {
    const styles: { [square: string]: React.CSSProperties } = {};

    drawnCircles.forEach(circle => {
      const color = DRAWING_COLORS[circle.color as keyof typeof DRAWING_COLORS] || circle.color;
      styles[circle.square] = {
        boxShadow: `inset 0 0 0 4px ${color}`,
      };
    });

    return styles;
  }, [drawnCircles]);

  return {
    // State
    drawnArrows,
    drawnCircles,
    currentDrawColor,

    // Actions
    setCurrentDrawColor,
    clearDrawings,
    removeDrawingsOnSquare,
    hasDrawingsOnSquare,

    // Event handlers
    handleMouseDown,
    handleMouseUp,
    handleContextMenu,

    // Utilities
    getCustomArrows,
    getDrawingSquareStyles,
  };
};

// Re-export with old name for backwards compatibility during transition
export const useChessDrawing = useBoardDrawing;

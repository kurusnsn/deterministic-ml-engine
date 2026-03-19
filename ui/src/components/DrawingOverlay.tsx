import React, { useRef, useState, useEffect } from "react";

type Square = string;

type DrawType = {
  from?: Square;
  to: Square;
  color: string;
  type: "arrow" | "circle";
};

const COLORS = ["green", "red", "blue", "yellow", "orange"];

export default function DrawingOverlay({
  boardSize,
  orientation,
}: {
  boardSize: number;
  orientation: "white" | "black";
}) {
  const [drawings, setDrawings] = useState<DrawType[]>([]);
  const [currentColor, setCurrentColor] = useState(COLORS[0]);
  const startSquare = useRef<Square | null>(null);

  // Convert mouse coords → square
  function coordsToSquare(x: number, y: number): Square | null {
    const file = Math.floor((x / boardSize) * 8);
    const rank = 7 - Math.floor((y / boardSize) * 8);
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;

    const fileChar = String.fromCharCode("a".charCodeAt(0) + file);
    const rankChar = (rank + 1).toString();
    return orientation === "white"
      ? `${fileChar}${rankChar}`
      : `${String.fromCharCode("h".charCodeAt(0) - file)}${8 - rank}`;
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 2) return; // right-click only
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const square = coordsToSquare(e.clientX - rect.left, e.clientY - rect.top);
    startSquare.current = square;
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (e.button !== 2) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const square = coordsToSquare(e.clientX - rect.left, e.clientY - rect.top);
    if (!square) return;

    if (startSquare.current === square) {
      // Circle
      setDrawings((prev) => [
        ...prev,
        { to: square, color: currentColor, type: "circle" },
      ]);
    } else if (startSquare.current) {
      // Arrow
      setDrawings((prev) => [
        ...prev,
        { from: startSquare.current!, to: square, color: currentColor, type: "arrow" },
      ]);
    }
    startSquare.current = null;
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (/^[1-5]$/.test(e.key)) {
        setCurrentColor(COLORS[parseInt(e.key) - 1]);
      } else if (e.key.toLowerCase() === "c") {
        setDrawings([]);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <svg
      className="absolute inset-0"
      width={boardSize}
      height={boardSize}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {drawings.map((d, i) => {
        if (d.type === "circle") {
          const file = d.to.charCodeAt(0) - "a".charCodeAt(0);
          const rank = parseInt(d.to[1]) - 1;
          const x = (file + 0.5) * (boardSize / 8);
          const y = (7.5 - rank) * (boardSize / 8);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={boardSize / 16}
              stroke={d.color}
              strokeWidth="4"
              fill="none"
            />
          );
        } else {
          const f1 = d.from!.charCodeAt(0) - "a".charCodeAt(0);
          const r1 = parseInt(d.from![1]) - 1;
          const f2 = d.to.charCodeAt(0) - "a".charCodeAt(0);
          const r2 = parseInt(d.to[1]) - 1;
          const x1 = (f1 + 0.5) * (boardSize / 8);
          const y1 = (7.5 - r1) * (boardSize / 8);
          const x2 = (f2 + 0.5) * (boardSize / 8);
          const y2 = (7.5 - r2) * (boardSize / 8);

          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={d.color}
              strokeWidth="6"
              markerEnd="url(#arrowhead)"
            />
          );
        }
      })}

      {/* Arrowhead marker */}
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="10"
          refX="5"
          refY="5"
          orient="auto"
        >
          <polygon points="0 0, 10 5, 0 10" fill="currentColor" />
        </marker>
      </defs>
    </svg>
  );
}

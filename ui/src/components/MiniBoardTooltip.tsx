import { Chessboard } from "react-chessboard";

type Props = {
  show: boolean;
  x?: number;
  y?: number;
  fen: string;
  orientation: "white" | "black";
};

export default function MiniBoardTooltip({ show, x, y, fen, orientation }: Props) {
  if (!show) return null;
  return (
    <div
      style={{
        position: x !== undefined && y !== undefined ? "fixed" : "absolute",
        left: x !== undefined ? x + 12 : "50%",
        top: y !== undefined ? y + 12 : "100%",
        transform: x !== undefined && y !== undefined ? "none" : "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: 1000,
        background: "white",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
      }}
    >
      <Chessboard
        position={fen}
        boardWidth={200}
        arePiecesDraggable={false}
        boardOrientation={orientation}
        animationDuration={0}
        customBoardStyle={{ borderRadius: 12 }}
      />
    </div>
  );
}

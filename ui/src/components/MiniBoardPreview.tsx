import { Chessboard } from "react-chessboard";

type Props = {
    show: boolean;
    x: number;
    y: number;
    fen: string;
    orientation?: "white" | "black";
};

export default function MiniBoardPreview({ show, x, y, fen, orientation = "white" }: Props) {
    if (!show) return null;

    return (
        <div
            style={{
                position: "fixed",
                left: x + 15,
                top: y + 15,
                pointerEvents: "none",
                zIndex: 9999,
                background: "#262421", // Classic chess.com dark background
                border: "1px solid #45423e",
                padding: "4px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
        >
            <div style={{ width: "220px", height: "220px" }}>
                <Chessboard
                    position={fen}
                    boardWidth={220}
                    arePiecesDraggable={false}
                    boardOrientation={orientation}
                    animationDuration={0}
                    customBoardStyle={{
                        borderRadius: "0px", // Non-rounded corners
                    }}
                />
            </div>
        </div>
    );
}

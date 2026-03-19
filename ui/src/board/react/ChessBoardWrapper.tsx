/**
 * Phase 6: Updated - ChessBoard wrapper component
 * Removed customArrows and customSquareStyles (now handled by Canvas)
 */

"use client";

import React from "react";
import { Chessboard } from "react-chessboard";
import { Square } from "chess.js";

// ===== PROPS INTERFACE =====

export interface ChessBoardWrapperProps {
    position: string; // FEN
    boardWidth: number;
    boardOrientation: "white" | "black";

    // Interaction handlers
    onPieceDrop?: (sourceSquare: string, targetSquare: string) => boolean;
    onPieceDragBegin?: (piece: string, sourceSquare: Square) => void;
    onPieceDragEnd?: () => void;
    onSquareClick?: (square: Square) => void;
    onMouseOverSquare?: (square: Square) => void;
    onMouseOutSquare?: (square: Square) => void;
    onPromotionPieceSelect?: (sourceSquare: Square, targetSquare: Square) => string;
    customSquareStyles?: Record<string, React.CSSProperties>;
    customDropSquareStyle?: React.CSSProperties;
}

// ===== COMPONENT =====

export const ChessBoardWrapper: React.FC<ChessBoardWrapperProps> = (props) => {
    return (
        <Chessboard
            position={props.position}
            boardWidth={props.boardWidth}
            boardOrientation={props.boardOrientation}
            onPieceDrop={props.onPieceDrop}
            onPieceDragBegin={props.onPieceDragBegin}
            onPieceDragEnd={props.onPieceDragEnd}
            onSquareClick={props.onSquareClick}
            onMouseOverSquare={props.onMouseOverSquare}
            onMouseOutSquare={props.onMouseOutSquare}
            onPromotionPieceSelect={props.onPromotionPieceSelect}
            customSquareStyles={props.customSquareStyles}
            customDropSquareStyle={props.customDropSquareStyle}
            areArrowsAllowed={false}
        />
    );
};

export default ChessBoardWrapper;

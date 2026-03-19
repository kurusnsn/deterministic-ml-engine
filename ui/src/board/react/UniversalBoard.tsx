/**
 * Phase 6: Implemented - Universal board component (Board + Overlay)
 */

"use client";

import React from "react";
import { ChessBoardWrapper, ChessBoardWrapperProps } from "./ChessBoardWrapper";
import { OverlayCanvas } from "../overlay/OverlayCanvas";

// ===== PROPS INTERFACE =====

export interface UniversalBoardProps extends ChessBoardWrapperProps {
    // Additional props for overlay control
    showOverlay?: boolean;
}

// ===== COMPONENT =====

export const UniversalBoard: React.FC<UniversalBoardProps> = ({
    showOverlay = true,
    ...boardProps
}) => {
    return (
        <div
            className="relative"
            style={{ width: boardProps.boardWidth, height: boardProps.boardWidth }}
            tabIndex={0}
            aria-label="Chessboard"
        >
            {/* Chess board */}
            <ChessBoardWrapper {...boardProps} />

            {/* Canvas overlay (positioned absolutely on top) */}
            {showOverlay && <OverlayCanvas />}
        </div>
    );
};

export default UniversalBoard;

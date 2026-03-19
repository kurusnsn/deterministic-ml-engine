
"use client";

import { useEffect, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Button } from "@/components/ui/button";
import EvaluationBar from "@/components/EvaluationBar";
import {
    SkipBack, ChevronLeft, Play, ChevronRight, SkipForward,
    RotateCw, Search, Settings, Maximize2
} from "lucide-react";

type Props = {
    fen?: string;
    orientation?: "white" | "black";
};

export default function BroadcastingBoard({ fen = "start", orientation = "white" }: Props) {
    const [boardSize, setBoardSize] = useState(480);
    const boardContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const updateSize = () => {
            if (!boardContainerRef.current) return;
            const width = boardContainerRef.current.clientWidth;
            const next = Math.min(640, Math.max(260, width));
            setBoardSize(next);
        };
        updateSize();
        window.addEventListener("resize", updateSize);
        return () => window.removeEventListener("resize", updateSize);
    }, []);

    return (
        <div className="flex flex-col h-full gap-2">
            {/* Main Board Area with Eval Bar */}
            <div className="flex-grow flex gap-1 relative min-h-[320px]" ref={boardContainerRef}>
                {/* Eval Bar Container */}
                <div className="w-8 flex-shrink-0 h-full rounded overflow-hidden border border-border">
                    <EvaluationBar evalScore="0.45" turn="w" orientation="white" />
                </div>

                {/* Chessboard Container */}
                <div className="flex-grow relative bg-muted rounded border border-border shadow-sm overflow-hidden group">
                    {/* Hover Controls (Top Right) */}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full shadow-md" aria-label="Flip board">
                            <RotateCw className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full shadow-md" aria-label="Expand board">
                            <Maximize2 className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="flex items-center justify-center h-full p-2" data-testid="broadcast-board-wrapper">
                        <Chessboard
                            id="broadcast-board"
                            position={fen}
                            boardOrientation={orientation}
                            arePiecesDraggable={false}
                            boardWidth={boardSize}
                            animationDuration={200}
                            customBoardStyle={{
                                borderRadius: 14,
                                boxShadow: "inset 0 1px 3px rgba(0,0,0,0.08)",
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Bottom Navigation Bar */}
            <div className="bg-card border rounded-md p-2 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Settings">
                        <Settings className="h-4 w-4 text-muted-foreground" />
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-muted/80" aria-label="First move">
                        <SkipBack className="h-5 w-5 fill-current" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-muted/80" aria-label="Previous move">
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-12 w-12 hover:bg-muted/80 text-primary" aria-label="Play">
                        <Play className="h-6 w-6 fill-current ml-1" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-muted/80" aria-label="Next move">
                        <ChevronRight className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-muted/80" aria-label="Last move">
                        <SkipForward className="h-5 w-5 fill-current" />
                    </Button>
                </div>

                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Search move">
                        <Search className="h-4 w-4 text-muted-foreground" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

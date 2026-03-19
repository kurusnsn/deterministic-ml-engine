"use client";

import { Suspense, useMemo, useCallback } from "react";
import ChessBoard from "@/components/ChessBoard";
import type { BoardConfig, MoveResult } from "@/board/engine/types";

/**
 * LLM Demo Page
 * 
 * A simplified version of the analysis page designed to showcase
 * the LLM commentary and position traversal features.
 */
function LLMDemoPageContent() {
    const pageHeading = <h1 className="sr-only">LLM Panel Demo</h1>;

    // Handle moves via config callback
    const handleDemoMove = useCallback((move: MoveResult) => {
        console.log("[LLM Demo] Move made:", move.san);
    }, []);

    // Board configuration for demo mode
    // Explicitly enabling LLM and analyze features
    const config: Partial<BoardConfig> = useMemo(() => ({
        mode: "analyze",
        draggable: true,
        arrows: true,
        threats: true,
        highlightLastMove: true,
        highlightLegalMoves: true,
        analyze: {
            enableEngine: true,
            enableLLM: true,
        },
        onMove: handleDemoMove,
    }), [handleDemoMove]);

    // Memoize props for ChessBoard
    const chessBoardProps = useMemo(() => ({
        variant: 'analyze' as const,
        config,
        // We can add initialPgn or initialFen here later when provided
    }), [config]);

    return (
        <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
            {pageHeading}

            <div className="p-4 border-b bg-muted/30">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold">AI Chess Analyst Demo</h2>
                        <p className="text-sm text-muted-foreground">Traverse positions and interact with the AI panel on the right.</p>
                    </div>
                    <div className="flex gap-2">
                        <div className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium border border-primary/20">
                            Demo Mode
                        </div>
                    </div>
                </div>
            </div>

            <main className="container mx-auto py-6">
                <ChessBoard {...chessBoardProps} />
            </main>

            <footer className="p-4 text-center text-xs text-muted-foreground border-t mt-auto">
                Powered by lc0 and Llama AI
            </footer>
        </div>
    );
}

export default function LLMDemoPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading Demo...</div>}>
            <LLMDemoPageContent />
        </Suspense>
    );
}

/**
 * useAnimatedLine Hook
 * 
 * Animates a sequence of chess moves on the board at human-readable speed.
 * Used by the "Show Follow-Up", "Show Tactic", etc. buttons.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';

export interface UseAnimatedLineOptions {
    /** Base FEN to start from */
    baseFen: string;
    /** Delay between moves in ms (default: 600) */
    delayMs?: number;
    /** Callback when a move is played */
    onMove?: (fen: string, moveIndex: number, moveSan: string) => void;
    /** Callback when animation completes */
    onComplete?: (line: string[]) => void;
    /** Callback when animation is cancelled */
    onCancel?: () => void;
}

export interface UseAnimatedLineReturn {
    /** Whether animation is currently playing */
    isPlaying: boolean;
    /** Current move index in the line (0-indexed, -1 if not started) */
    currentMoveIndex: number;
    /** The line currently being played */
    currentLine: string[];
    /** Start playing a line */
    play: (line: string[]) => void;
    /** Stop the animation and reset */
    stop: () => void;
    /** Skip to the end of the line */
    skipToEnd: () => void;
}

export function useAnimatedLine({
    baseFen,
    delayMs = 600,
    onMove,
    onComplete,
    onCancel,
}: UseAnimatedLineOptions): UseAnimatedLineReturn {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
    const [currentLine, setCurrentLine] = useState<string[]>([]);

    // Refs to track state in async callbacks
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const gameRef = useRef<Chess | null>(null);
    const lineRef = useRef<string[]>([]);
    const isCancelledRef = useRef(false);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const playNextMove = useCallback((index: number) => {
        if (isCancelledRef.current || !gameRef.current) return;

        const line = lineRef.current;

        if (index >= line.length) {
            // Animation complete
            setIsPlaying(false);
            setCurrentMoveIndex(line.length - 1);
            onComplete?.(line);
            return;
        }

        const moveSan = line[index];

        try {
            const move = gameRef.current.move(moveSan);
            if (!move) {
                // Invalid move, stop animation
                console.warn(`Invalid move in animated line: ${moveSan}`);
                setIsPlaying(false);
                return;
            }

            const newFen = gameRef.current.fen();
            setCurrentMoveIndex(index);
            onMove?.(newFen, index, moveSan);

            // Schedule next move
            timeoutRef.current = setTimeout(() => {
                playNextMove(index + 1);
            }, delayMs);
        } catch (err) {
            console.error('Error playing animated move:', err);
            setIsPlaying(false);
        }
    }, [delayMs, onMove, onComplete]);

    const play = useCallback((line: string[]) => {
        if (line.length === 0) return;

        // Stop any existing animation
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Initialize
        isCancelledRef.current = false;
        lineRef.current = line;
        setCurrentLine(line);
        setCurrentMoveIndex(-1);
        setIsPlaying(true);

        // Create new game from base FEN
        try {
            gameRef.current = new Chess(baseFen);
        } catch (err) {
            console.error('Invalid base FEN for animated line:', baseFen);
            setIsPlaying(false);
            return;
        }

        // Start playing after a brief delay for visual feedback
        timeoutRef.current = setTimeout(() => {
            playNextMove(0);
        }, 200);
    }, [baseFen, playNextMove]);

    const stop = useCallback(() => {
        isCancelledRef.current = true;
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setIsPlaying(false);
        setCurrentMoveIndex(-1);
        setCurrentLine([]);
        onCancel?.();
    }, [onCancel]);

    const skipToEnd = useCallback(() => {
        if (!gameRef.current || lineRef.current.length === 0) return;

        // Cancel the animation
        isCancelledRef.current = true;
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        // Play all remaining moves instantly
        const line = lineRef.current;
        for (let i = currentMoveIndex + 1; i < line.length; i++) {
            try {
                gameRef.current.move(line[i]);
            } catch {
                break;
            }
        }

        const finalFen = gameRef.current.fen();
        setCurrentMoveIndex(line.length - 1);
        setIsPlaying(false);
        onMove?.(finalFen, line.length - 1, line[line.length - 1]);
        onComplete?.(line);
    }, [currentMoveIndex, onMove, onComplete]);

    return {
        isPlaying,
        currentMoveIndex,
        currentLine,
        play,
        stop,
        skipToEnd,
    };
}

export default useAnimatedLine;

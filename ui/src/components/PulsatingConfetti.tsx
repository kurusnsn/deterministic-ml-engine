"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";

interface PulsatingConfettiProps {
    containerRef?: React.RefObject<HTMLDivElement>;
    onComplete?: () => void;
}

export default function PulsatingConfetti({ containerRef, onComplete }: PulsatingConfettiProps) {
    const confettiInstance = useRef<confetti.CreateTypes | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        const container = containerRef?.current;
        if (!container) return;

        // Create confetti instance
        confettiInstance.current = confetti.create(container, {
            resize: true,
            useWorker: true,
        });

        const colors = ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff'];
        let burstCount = 0;
        const maxBursts = 10;

        const fireBurst = () => {
            if (!confettiInstance.current || burstCount >= maxBursts) {
                onComplete?.();
                return;
            }

            confettiInstance.current({
                particleCount: 50,
                spread: 70,
                origin: { x: 0.5, y: 0.5 },
                colors: colors,
            });

            burstCount++;
            // Fire next burst after 5ms
            animationFrameRef.current = window.setTimeout(() => {
                fireBurst();
            }, 5);
        };

        // Start firing bursts
        fireBurst();

        return () => {
            if (animationFrameRef.current) {
                clearTimeout(animationFrameRef.current);
            }
            if (confettiInstance.current) {
                confettiInstance.current.reset();
            }
        };
    }, [containerRef, onComplete]);

    return null;
}







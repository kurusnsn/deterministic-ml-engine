"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, X } from "lucide-react";

interface FeedbackOverlayProps {
    type: 'correct' | 'miss' | 'checkmate-white' | 'checkmate-black' | null;
    onComplete?: () => void;
}

export default function FeedbackOverlay({
    type,
    onComplete,
    targetSquare,
    orientation = 'white',
    boardWidth = 500
}: FeedbackOverlayProps & {
    targetSquare?: string | null,
    orientation?: 'white' | 'black',
    boardWidth?: number
}) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (type) {
            setIsVisible(true);
            const timer = setTimeout(() => {
                setIsVisible(false);
                setTimeout(() => {
                    onComplete?.();
                }, 300); // Wait for fade out animation
            }, 1500); // Show for 1.5 seconds

            return () => clearTimeout(timer);
        } else {
            setIsVisible(false);
        }
    }, [type, onComplete]);

    if (!type) return null;

    const svgPath = `/svg/${type}.svg`;

    // Calculate position
    let positionStyle: React.CSSProperties = {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
    };

    if (targetSquare) {
        const file = targetSquare.charCodeAt(0) - 97; // a=0, h=7
        const rank = parseInt(targetSquare[1]) - 1;   // 1=0, 8=7

        const squareSize = boardWidth / 8;

        // Calculate top-left coordinates of the square
        let x, y;
        if (orientation === 'white') {
            x = file * squareSize;
            y = (7 - rank) * squareSize;
        } else {
            x = (7 - file) * squareSize;
            y = rank * squareSize;
        }

        // Position center of icon on the top-right corner of the square
        // We want the icon to be roughly 40% of square size
        const iconSize = squareSize * 0.4;

        // Center the icon on the top-right corner of the square
        // top = y - (iconSize / 2)
        // left = x + squareSize - (iconSize / 2)

        let top = y - (iconSize / 2);
        let left = x + squareSize - (iconSize / 2);

        // Boundary checks to keep it inside the board
        // If on the right edge, shift it left to be inside the square
        const isRightEdge = (orientation === 'white' && file === 7) || (orientation === 'black' && file === 0);
        if (isRightEdge) {
            left = x + squareSize - iconSize - (squareSize * 0.05); // Inside with padding
        }

        // If on the top edge, shift it down to be inside the square
        const isTopEdge = (orientation === 'white' && rank === 7) || (orientation === 'black' && rank === 0);
        if (isTopEdge) {
            top = y + (squareSize * 0.05); // Inside with padding
        }

        positionStyle = {
            top,
            left,
            width: iconSize,
            height: iconSize,
            transform: 'none',
            zIndex: 10 // Ensure it sits on top
        };
    } else {
        // Fallback to center if no targetSquare provided
        positionStyle = {
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: boardWidth * 0.25, // 25% of board width
            height: boardWidth * 0.25
        };
    }

    return (
        <div
            className={`absolute pointer-events-none z-50 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
            style={positionStyle}
        >
            <div className="relative w-full h-full animate-in zoom-in-50 duration-300">
                {type === "correct" ? (
                    <div className="w-full h-full rounded-full bg-[#96bc4b] shadow-[0_2px_10px_rgba(0,0,0,0.25)] flex items-center justify-center">
                        <Check className="w-[70%] h-[70%] text-white stroke-[3.5]" />
                    </div>
                ) : type === "miss" ? (
                    <div className="w-full h-full rounded-full bg-[#ef4444] shadow-[0_2px_10px_rgba(0,0,0,0.25)] flex items-center justify-center">
                        <X className="w-[70%] h-[70%] text-white stroke-[3.5]" />
                    </div>
                ) : (
                    <Image
                        src={svgPath}
                        alt={type}
                        fill
                        className="object-contain"
                        priority
                        sizes={`${Math.round(boardWidth * 0.25)}px`}
                    />
                )}
            </div>
        </div>
    );
}

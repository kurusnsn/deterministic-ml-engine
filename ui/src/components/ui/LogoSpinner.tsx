"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface LogoSpinnerProps {
    className?: string;
    size?: "xs" | "sm" | "md" | "lg" | "xl";
}

/**
 * LogoSpinner - A branded loading spinner that uses the ChessVector logo
 * with rotating and pulsating animations.
 * 
 * Uses an SVG checkerboard cube pattern that rotates and pulses.
 */
export function LogoSpinner({ className, size = "md" }: LogoSpinnerProps) {
    const sizeClasses = {
        xs: "w-3 h-3",
        sm: "w-4 h-4",
        md: "w-6 h-6",
        lg: "w-8 h-8",
        xl: "w-12 h-12",
    };

    return (
        <div
            className={cn(
                sizeClasses[size],
                "animate-logo-spin",
                className
            )}
        >
            <svg
                viewBox="0 0 100 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full animate-logo-pulse"
            >
                {/* 2x2 Checkerboard pattern representing the logo */}
                {/* Top-left - white */}
                <rect x="5" y="5" width="42" height="42" rx="4" fill="currentColor" className="text-foreground" />
                {/* Top-right - black */}
                <rect x="53" y="5" width="42" height="42" rx="4" fill="currentColor" className="text-muted-foreground/30" />
                {/* Bottom-left - black */}
                <rect x="5" y="53" width="42" height="42" rx="4" fill="currentColor" className="text-muted-foreground/30" />
                {/* Bottom-right - white */}
                <rect x="53" y="53" width="42" height="42" rx="4" fill="currentColor" className="text-foreground" />
            </svg>
        </div>
    );
}

export default LogoSpinner;

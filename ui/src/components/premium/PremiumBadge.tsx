"use client";

import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

interface PremiumBadgeProps {
    variant?: "default" | "small" | "inline";
    label?: string;
}

/**
 * Premium badge component for LC0-powered features.
 * 
 * Displays a gradient badge with sparkle icon indicating
 * this feature is part of the LC0 premium augmentation.
 */
export function PremiumBadge({
    variant = "default",
    label = "LC0 Premium"
}: PremiumBadgeProps) {
    const baseClasses = "bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-0";

    if (variant === "small") {
        return (
            <Badge className={`${baseClasses} text-[10px] px-1.5 py-0`}>
                <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                LC0
            </Badge>
        );
    }

    if (variant === "inline") {
        return (
            <span className="inline-flex items-center gap-1 text-purple-400 text-xs font-medium">
                <Sparkles className="w-3 h-3" />
                {label}
            </span>
        );
    }

    return (
        <Badge className={`${baseClasses} text-xs px-2 py-0.5`}>
            <Sparkles className="w-3 h-3 mr-1" />
            {label}
        </Badge>
    );
}

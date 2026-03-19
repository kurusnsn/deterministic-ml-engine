"use client";

import { Progress } from "@/components/ui/progress";

interface ProgressBarProps {
    value: number;
    label?: string;
}

export default function ProgressBar({ value, label }: ProgressBarProps) {
    return (
        <div className="space-y-2">
            {label && (
                <div className="flex justify-between text-sm">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground">{Math.round(value)}%</span>
                </div>
            )}
            <Progress value={value} className="h-2" />
        </div>
    );
}

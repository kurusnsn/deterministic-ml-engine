"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface DashboardErrorProps {
    onRetry: () => void;
}

/**
 * Error state component for the home dashboard.
 * Shows a friendly error message with retry option.
 */
export function DashboardError({ onRetry }: DashboardErrorProps) {
    return (
        <div className="container mx-auto p-4">
            <Card className="border-destructive/50">
                <CardContent className="p-8 text-center space-y-4">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
                        <AlertTriangle className="w-6 h-6 text-destructive" />
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-xl font-semibold">
                            We couldn&apos;t load your dashboard
                        </h2>
                        <p className="text-muted-foreground">
                            Something went wrong while fetching your data. Please try again.
                        </p>
                    </div>

                    <Button onClick={onRetry} variant="outline" className="gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Retry
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}

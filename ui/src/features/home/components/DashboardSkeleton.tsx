"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Loading skeleton for the home dashboard.
 * Shows placeholder shapes while data is being fetched.
 */
export function DashboardSkeleton() {
    return (
        <div className="container mx-auto p-4 space-y-8">
            {/* Hero skeleton */}
            <Card>
                <CardContent className="p-8">
                    <div className="space-y-4">
                        <Skeleton className="h-8 w-3/4 max-w-md" />
                        <Skeleton className="h-5 w-1/2 max-w-sm" />
                        <div className="flex gap-4 pt-4">
                            <Skeleton className="h-10 w-32" />
                            <Skeleton className="h-10 w-32" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Feature tiles skeleton */}
            <div className="space-y-4">
                <Skeleton className="h-6 w-32" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                        <Card key={i}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="w-10 h-10 rounded-lg" />
                                    <Skeleton className="h-5 w-24" />
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-2/3" />
                                <Skeleton className="h-9 w-full" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Recent activity skeleton */}
            <Card>
                <CardHeader>
                    <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex items-center justify-between p-3">
                            <div className="flex items-center gap-3">
                                <Skeleton className="w-8 h-8 rounded-full" />
                                <div className="space-y-1">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-3 w-16" />
                                </div>
                            </div>
                            <Skeleton className="h-6 w-16" />
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

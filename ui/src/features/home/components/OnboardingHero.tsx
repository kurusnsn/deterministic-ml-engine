"use client";

import { Button } from "@/components/ui/button";
import { Link2 } from "lucide-react";
import Link from "next/link";

/**
 * Compact prompt for users with no linked chess accounts.
 * Single button linking to profile for account connections.
 */
export function OnboardingHero() {
    return (
        <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border bg-muted/50">
            <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                    <Link2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                    <p className="font-medium">Connect your chess accounts</p>
                    <p className="text-sm text-muted-foreground">
                        Link Lichess or Chess.com to fetch your games
                    </p>
                </div>
            </div>
            <Button asChild size="sm">
                <Link href="/profile#linked-accounts">
                    Connect
                </Link>
            </Button>
        </div>
    );
}

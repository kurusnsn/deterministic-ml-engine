"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HomeData, getMostRecentGame } from "@/lib/api/home";
import { Sparkles, PlayCircle, FileText, BarChart3, CheckCircle2, PlusCircle } from "lucide-react";
import Link from "next/link";

interface TrainingHeroProps {
    data: HomeData;
}

/**
 * Hero section for users with at least one linked chess account.
 * Shows trainer insights and primary CTA based on user's data.
 */
export function TrainingHero({ data }: TrainingHeroProps) {
    const recentGame = getMostRecentGame(data);
    const hasTrainerData = data.trainer.has_trainer_data;
    const hasReport = data.latest_report.has_report;

    // Determine primary CTA
    let primaryCta: { href: string; label: string; icon: React.ReactNode };
    if (recentGame) {
        primaryCta = {
            href: `/game-review?game=${recentGame.id}`,
            label: "Review your latest game",
            icon: <PlayCircle className="w-5 h-5 mr-2" />,
        };
    } else if (hasReport && data.latest_report.id) {
        primaryCta = {
            href: `/reports/${data.latest_report.id}`,
            label: "Open latest report",
            icon: <FileText className="w-5 h-5 mr-2" />,
        };
    } else {
        primaryCta = {
            href: "/analyze",
            label: "Analyze a game",
            icon: <BarChart3 className="w-5 h-5 mr-2" />,
        };
    }

    return (
        <Card className="bg-gradient-to-br from-background to-primary/5 border-primary/20">
            <CardContent className="p-6 sm:p-8 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-primary" />
                            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                                Train smarter with your own games
                            </h2>
                        </div>

                        {hasTrainerData && false && data.trainer.headline && (
                            <p className="text-muted-foreground text-lg">
                                <span className="font-medium text-foreground">Coach focus:</span>{" "}
                                {data.trainer.focus_area || data.trainer.headline}
                            </p>
                        )}
                    </div>

                    <Button asChild size="lg" className="w-full sm:w-auto">
                        <Link href={primaryCta.href}>
                            {primaryCta.icon}
                            {primaryCta.label}
                        </Link>
                    </Button>
                </div>

                {/* Accounts summary pill */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                    <span className="text-sm text-muted-foreground">Accounts:</span>

                    <AccountBadge
                        platform="Lichess"
                        connected={data.linked_accounts.lichess.connected}
                        username={data.linked_accounts.lichess.username}
                    />

                    <AccountBadge
                        platform="Chess.com"
                        connected={data.linked_accounts.chesscom.connected}
                        username={data.linked_accounts.chesscom.username}
                    />
                </div>
            </CardContent>
        </Card>
    );
}

interface AccountBadgeProps {
    platform: string;
    connected: boolean;
    username: string | null;
}

function AccountBadge({ platform, connected, username }: AccountBadgeProps) {
    if (connected) {
        return (
            <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                {platform}
                {username && <span className="text-muted-foreground">({username})</span>}
            </Badge>
        );
    }

    return (
        <Link href="/profile#linked-accounts">
            <Badge variant="outline" className="gap-1 hover:bg-accent cursor-pointer">
                <PlusCircle className="w-3 h-3" />
                Connect {platform}
            </Badge>
        </Link>
    );
}

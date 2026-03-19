"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HomeData, hasAnyLinkedAccounts } from "@/lib/api/home";
import {
    PlayCircle,
    FileText,
    BookOpen,
    Puzzle,
    BarChart3,
    User,
    ArrowRight
} from "lucide-react";
import Link from "next/link";

interface FeatureTilesProps {
    data: HomeData;
}

interface TileConfig {
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    href: string;
    buttonLabel: string;
    extra?: React.ReactNode;
}

/**
 * Grid of feature tiles for the home dashboard.
 * Shows quick access to main features: Game Review, Reports, Openings, Puzzles, Analyze, Profile.
 */
export function FeatureTiles({ data }: FeatureTilesProps) {
    const hasLinked = hasAnyLinkedAccounts(data);
    const hasReport = data.latest_report.has_report;
    const recentGame = data.recent_games.length > 0 ? data.recent_games[0] : null;

    const tiles: TileConfig[] = [
        {
            title: "Game Review",
            subtitle: "Upload or sync a game, get instant feedback.",
            icon: <PlayCircle className="w-6 h-6" />,
            href: "/game-review",
            buttonLabel: "Review a game",
            extra: recentGame ? (
                <Link
                    href={`/game-review?game=${recentGame.id}`}
                    className="text-xs text-primary hover:underline"
                >
                    Review latest game →
                </Link>
            ) : null,
        },
        {
            title: "Reports",
            subtitle: "Deep reports on your openings, mistakes, and patterns.",
            icon: <FileText className="w-6 h-6" />,
            href: hasReport && data.latest_report.id ? `/reports/${data.latest_report.id}` : "/reports",
            buttonLabel: hasReport ? "View latest report" : "Generate your first report",
            extra: hasReport && data.latest_report.created_at ? (
                <span className="text-xs text-muted-foreground">
                    Last report: {formatRelativeDate(data.latest_report.created_at)}
                </span>
            ) : null,
        },
        {
            title: "Openings",
            subtitle: "Train your repertoires and gambits.",
            icon: <BookOpen className="w-6 h-6" />,
            href: "/openings",
            buttonLabel: "Train openings",
        },
        {
            title: "Puzzles",
            subtitle: hasLinked
                ? "Personalized puzzles from your games."
                : "Puzzles tailored to your weaknesses.",
            icon: <Puzzle className="w-6 h-6" />,
            href: "/puzzles",
            buttonLabel: "Start puzzles",
            extra: !hasReport ? (
                <span className="text-xs text-muted-foreground">
                    We&apos;ll personalize puzzles after your first report.
                </span>
            ) : null,
        },
        {
            title: "Analyze",
            subtitle: "Open analysis board with engine.",
            icon: <BarChart3 className="w-6 h-6" />,
            href: "/analyze",
            buttonLabel: "Open analysis board",
        },
        {
            title: "Profile",
            subtitle: "Linked accounts, game history.",
            icon: <User className="w-6 h-6" />,
            href: "/profile",
            buttonLabel: "Go to profile",
        },
    ];

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-semibold">Quick Access</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tiles.map((tile) => (
                    <FeatureTile key={tile.title} {...tile} />
                ))}
            </div>
        </div>
    );
}

function FeatureTile({ title, subtitle, icon, href, buttonLabel, extra }: TileConfig) {
    return (
        <Card className="hover:shadow-md transition-shadow h-full min-h-[180px] flex flex-col">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        {icon}
                    </div>
                    <CardTitle className="text-lg">{title}</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between">
                <div className="space-y-1">
                    <CardDescription className="text-sm">{subtitle}</CardDescription>
                    {extra && <div>{extra}</div>}
                </div>

                <Button asChild variant="secondary" size="sm" className="w-full group">
                    <Link href={href}>
                        {buttonLabel}
                        <ArrowRight className="w-4 h-4 ml-2 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-1" />
                    </Link>
                </Button>
            </CardContent>
        </Card>
    );
}

function formatRelativeDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
}

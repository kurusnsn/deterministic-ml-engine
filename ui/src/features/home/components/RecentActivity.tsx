"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HomeData } from "@/lib/api/home";
import {
    Clock,
    Trophy,
    XCircle,
    MinusCircle,
    FileText,
    ArrowRight,
    History
} from "lucide-react";
import Link from "next/link";

interface RecentActivityProps {
    data: HomeData;
}

/**
 * Recent activity section showing the user's latest games and reports.
 */
export function RecentActivity({ data }: RecentActivityProps) {
    const hasGames = data.recent_games.length > 0;
    const hasReport = data.latest_report.has_report;

    if (!hasGames && !hasReport) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <History className="w-5 h-5" />
                        Recent Activity
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                        <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Once you&apos;ve imported games, you&apos;ll see your latest activity here.</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <History className="w-5 h-5" />
                    Recent Activity
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Recent Games List */}
                {hasGames && (
                    <div className="space-y-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Recent Games</h3>
                        <div className="space-y-2">
                            {data.recent_games.slice(0, 3).map((game) => (
                                <GameRow key={game.id} game={game} />
                            ))}
                        </div>
                        {data.recent_games.length > 3 && (
                            <Link
                                href="/profile#game-history"
                                className="text-sm text-primary hover:underline inline-flex items-center"
                            >
                                View all games <ArrowRight className="w-3 h-3 ml-1" />
                            </Link>
                        )}
                    </div>
                )}

                {/* Latest Report Card */}
                {hasReport && data.latest_report.id && (
                    <div className="space-y-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Latest Report</h3>
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="font-medium text-sm">
                                        {data.latest_report.name || "Repertoire Report"}
                                    </p>
                                    {data.latest_report.created_at && (
                                        <p className="text-xs text-muted-foreground">
                                            {formatDate(data.latest_report.created_at)}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <Button asChild size="sm" variant="secondary">
                                <Link href={`/reports/${data.latest_report.id}`}>
                                    Open report
                                </Link>
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

interface GameRowProps {
    game: {
        id: string;
        played_at: string | null;
        opponent: string;
        result: string;
        source: 'lichess' | 'chesscom' | 'manual';
    };
}

function GameRow({ game }: GameRowProps) {
    const resultIcon = getResultIcon(game.result);
    const sourceLabel = getSourceLabel(game.source);

    return (
        <Link
            href={`/game-review?game=${game.id}`}
            className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
        >
            <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getResultBgColor(game.result)}`}>
                    {resultIcon}
                </div>
                <div>
                    <p className="font-medium text-sm">
                        vs {game.opponent}
                    </p>
                    {game.played_at && (
                        <p className="text-xs text-muted-foreground">
                            {formatDate(game.played_at)}
                        </p>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                    {sourceLabel}
                </Badge>
                <Badge
                    variant={getResultVariant(game.result)}
                    className={`text-xs capitalize ${game.result.toLowerCase() === 'loss' || game.result === '0-1' ? 'bg-red-500/60 hover:bg-red-500/50' : ''}`}
                >
                    {game.result}
                </Badge>
            </div>
        </Link>
    );
}

function getResultIcon(result: string) {
    switch (result.toLowerCase()) {
        case 'win':
        case '1-0':
            return <Trophy className="w-4 h-4 text-green-600" />;
        case 'loss':
        case '0-1':
            return <XCircle className="w-4 h-4 text-red-500" />;
        case 'draw':
        case '1/2-1/2':
            return <MinusCircle className="w-4 h-4 text-yellow-500" />;
        default:
            return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
}

function getResultBgColor(result: string): string {
    switch (result.toLowerCase()) {
        case 'win':
        case '1-0':
            return 'bg-green-100 dark:bg-green-900/30';
        case 'loss':
        case '0-1':
            return 'bg-red-100 dark:bg-red-900/30';
        case 'draw':
        case '1/2-1/2':
            return 'bg-yellow-100 dark:bg-yellow-900/30';
        default:
            return 'bg-muted';
    }
}

function getResultVariant(result: string): "default" | "secondary" | "destructive" | "outline" {
    switch (result.toLowerCase()) {
        case 'win':
        case '1-0':
            return 'default';
        case 'loss':
        case '0-1':
            return 'destructive';
        default:
            return 'secondary';
    }
}

function getSourceLabel(source: string): string {
    switch (source) {
        case 'lichess':
            return 'Lichess';
        case 'chesscom':
            return 'Chess.com';
        default:
            return 'Manual';
    }
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

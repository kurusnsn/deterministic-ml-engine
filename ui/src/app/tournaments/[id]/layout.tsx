
"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Clock, MapPin, Share2, Bell } from "lucide-react";
import { MOCK_TOURNAMENTS } from "@/lib/mock-tournament-data";

export default function TournamentLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const params = useParams();
    const pathname = usePathname();
    const id = params.id as string;
    const tournament = MOCK_TOURNAMENTS.find((t) => t.id === id) || MOCK_TOURNAMENTS[0];

    // Determine active tab based on pathname
    const getActiveTab = () => {
        if (pathname.includes("/rounds")) return "rounds";
        if (pathname.includes("/standings")) return "standings";
        if (pathname.includes("/players")) return "players";
        if (pathname.includes("/games")) return "games";
        return "overview";
    };

    return (
        <div className="container mx-auto py-6 px-4 space-y-6">
            {/* Tournament Header Card */}
            <Card className="border-none shadow-sm bg-gradient-to-r from-background to-muted/20">
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <CardTitle className="text-3xl font-bold">{tournament.name}</CardTitle>
                            <CardDescription className="text-lg mt-2">
                                {tournament.description}
                            </CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                                <Share2 className="mr-2 h-4 w-4" />
                                Share
                            </Button>
                            <Button size="sm">
                                <Bell className="mr-2 h-4 w-4" />
                                Follow Event
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
                        <div className="flex items-center">
                            <Calendar className="mr-2 h-4 w-4" />
                            {tournament.startDate} - {tournament.endDate}
                        </div>
                        <div className="flex items-center">
                            <MapPin className="mr-2 h-4 w-4" />
                            {tournament.location}
                        </div>
                        <div className="flex items-center">
                            <Clock className="mr-2 h-4 w-4" />
                            {tournament.timeControl} • {tournament.rounds} Rounds
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Navigation Tabs */}
            <div className="space-y-4">
                <Tabs value={getActiveTab()} className="w-full">
                    <TabsList className="w-full justify-start h-auto p-1 bg-muted/50 overflow-x-auto">
                        <Link href={`/tournaments/${id}`}>
                            <TabsTrigger value="overview" className="px-6 py-2">Overview</TabsTrigger>
                        </Link>
                        <Link href={`/tournaments/${id}/rounds/1`}>
                            <TabsTrigger value="rounds" className="px-6 py-2">Rounds</TabsTrigger>
                        </Link>
                        <Link href={`/tournaments/${id}/standings`}>
                            <TabsTrigger value="standings" className="px-6 py-2">Standings</TabsTrigger>
                        </Link>
                        <Link href={`/tournaments/${id}/players`}>
                            <TabsTrigger value="players" className="px-6 py-2">Players</TabsTrigger>
                        </Link>
                        <Link href={`/tournaments/${id}/games`}>
                            <TabsTrigger value="games" className="px-6 py-2">Games</TabsTrigger>
                        </Link>
                    </TabsList>
                </Tabs>

                {/* Page Content */}
                <div className="min-h-[500px]">
                    {children}
                </div>
            </div>
        </div>
    );
}


import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Trophy } from "lucide-react";
import { MOCK_TOURNAMENTS } from "@/lib/mock-tournament-data";

export default function TournamentsPage() {
    return (
        <div className="container mx-auto py-8 px-4">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Tournaments</h1>
                    <p className="text-muted-foreground mt-2">
                        Follow the latest chess tournaments and events.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {MOCK_TOURNAMENTS.map((tournament) => (
                    <Card key={tournament.id} className="flex flex-col h-full hover:shadow-md transition-shadow">
                        <CardHeader>
                            <div className="flex justify-between items-start">
                                <CardTitle className="text-xl">{tournament.name}</CardTitle>
                                <Badge
                                    variant={
                                        tournament.status === "Live" ? "destructive" :
                                            tournament.status === "Upcoming" ? "secondary" : "outline"
                                    }
                                >
                                    {tournament.status}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-grow space-y-4">
                            <p className="text-sm text-muted-foreground line-clamp-2">
                                {tournament.description}
                            </p>

                            <div className="space-y-2 text-sm">
                                <div className="flex items-center text-muted-foreground">
                                    <Calendar className="mr-2 h-4 w-4" />
                                    <span>{tournament.startDate} - {tournament.endDate}</span>
                                </div>
                                <div className="flex items-center text-muted-foreground">
                                    <MapPin className="mr-2 h-4 w-4" />
                                    <span>{tournament.location}</span>
                                </div>
                                <div className="flex items-center text-muted-foreground">
                                    <Trophy className="mr-2 h-4 w-4" />
                                    <span>{tournament.rounds} Rounds • {tournament.timeControl}</span>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Link href={`/tournaments/${tournament.id}`} className="w-full">
                                <Button className="w-full">View Tournament</Button>
                            </Link>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    );
}

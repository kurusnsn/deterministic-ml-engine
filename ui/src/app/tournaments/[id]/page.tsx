
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MOCK_PLAYERS, MOCK_GAMES } from "@/lib/mock-tournament-data";
import { Trophy, Activity } from "lucide-react";

export default function TournamentOverviewPage() {
    return (
        <>
            <h1 className="sr-only">Tournament Overview</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center text-lg">
                            <Trophy className="mr-2 h-5 w-5 text-yellow-500" />
                            Top Players
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {MOCK_PLAYERS.slice(0, 5).map((player, index) => (
                                <div key={player.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                                    <div className="flex items-center gap-3">
                                        <div className="font-mono text-muted-foreground w-4">{index + 1}</div>
                                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                                            {player.name.split(' ').map(n => n[0]).join('')}
                                        </div>
                                        <div>
                                            <div className="font-medium">{player.name}</div>
                                            <div className="text-xs text-muted-foreground">{player.title} • {player.rating}</div>
                                        </div>
                                    </div>
                                    <div className="font-bold">{player.score}</div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center text-lg">
                            <Activity className="mr-2 h-5 w-5 text-blue-500" />
                            Recent Games
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {MOCK_GAMES.slice(0, 5).map((game) => (
                                <div key={game.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                                    <div className="text-sm">
                                        <span className="font-medium">{game.white.name}</span>
                                        <span className="mx-2 text-muted-foreground">vs</span>
                                        <span className="font-medium">{game.black.name}</span>
                                    </div>
                                    <div className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                                        {game.result}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import GameBoardCard from "@/components/tournament-board/GameBoardCard";
import { loadRoundGames } from "@/lib/api/tournament-broadcast";

export default async function RoundPage({ params }: { params: { id: string; round: string } }) {
    const { id, round } = params;
    const roundNumber = Number(round) || 1;
    const games = await loadRoundGames(id, roundNumber);

    return (
        <>
            <h1 className="sr-only">Tournament Round {round}</h1>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">Round {round} Pairings</h2>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={roundNumber <= 1}>
                            Previous Round
                        </Button>
                        <Button variant="outline" size="sm">
                            Next Round
                        </Button>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                                Round {roundNumber}
                            </Badge>
                            <span>Boards</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {games.map((game, index) => (
                            <GameBoardCard
                                key={game.id}
                                game={game}
                                roundNumber={roundNumber}
                                boardNumber={index + 1}
                                tournamentId={id}
                            />
                        ))}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

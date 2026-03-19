
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import GameBoardCard from "@/components/tournament-board/GameBoardCard";
import { loadTournamentRounds } from "@/lib/api/tournament-broadcast";

export default async function GamesPage({ params }: { params: { id: string } }) {
    const rounds = await loadTournamentRounds(params.id);
    const allGames = rounds.flatMap((round) =>
        round.games.map((game, index) => ({
            ...game,
            roundNumber: round.round,
            boardNumber: index + 1,
        })),
    );

    return (
        <>
            <h1 className="sr-only">Tournament Games</h1>
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle>All Games</CardTitle>
                        <CardDescription>Browse every board and jump straight into the broadcast view.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {allGames.map((game, i) => (
                            <GameBoardCard
                                key={`${game.id}-${i}`}
                                game={game}
                                roundNumber={game.roundNumber as number}
                                boardNumber={game.boardNumber}
                                tournamentId={params.id}
                            />
                        ))}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

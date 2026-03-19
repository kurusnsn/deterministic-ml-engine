
import TournamentSidebar from "@/components/tournament-board/TournamentSidebar";
import BroadcastingBoard from "@/components/tournament-board/BroadcastingBoard";
import ClockCard from "@/components/tournament-board/ClockCard";
import MoveListCard from "@/components/tournament-board/MoveListCard";
import CommentaryCard from "@/components/tournament-board/CommentaryCard";
import { Badge } from "@/components/ui/badge";
import { loadRoundGames, loadTournamentGame } from "@/lib/api/tournament-broadcast";

export default async function BoardPage({ params }: { params: { id: string; round: string; gameId: string } }) {
    const roundNumber = Number(params.round) || 1;
    const roundGames = await loadRoundGames(params.id, roundNumber);
    const gameIndex = roundGames.findIndex((g) => g.id === params.gameId);
    const fromRound = gameIndex >= 0 ? roundGames[gameIndex] : undefined;
    const game = fromRound || (await loadTournamentGame(params.gameId));
    const boardNumber = gameIndex >= 0 ? gameIndex + 1 : undefined;

    return (
        <>
            <h1 className="sr-only">Tournament Game Broadcast</h1>
            <div className="h-[calc(100vh-140px)] min-h-[600px] w-full max-w-[1800px] mx-auto p-2 md:p-4">
                <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_350px] gap-4 h-full">

                {/* COLUMN 1 - Left Sidebar (Desktop only, hidden on mobile initially or stacked) */}
                <div className="hidden lg:block h-full overflow-hidden">
                    <TournamentSidebar />
                </div>

                {/* COLUMN 2 - Main Board Area */}
                <div className="flex flex-col h-full">
                    <div className="mb-2 flex items-center justify-between">
                        <div>
                            <div className="text-sm text-muted-foreground">
                                Round {roundNumber} {boardNumber ? `• Board ${boardNumber}` : ""}
                            </div>
                            <div className="text-xl font-bold">
                                {game ? `${game.white.name} vs ${game.black.name}` : "Game broadcast"}
                            </div>
                            {game?.result && (
                                <div className="text-sm text-muted-foreground">
                                    {game.result} {game.moves ? `• ${game.moves} moves` : ""}
                                </div>
                            )}
                        </div>
                        {game?.status && (
                            <Badge variant={game.status === "Live" ? "destructive" : "secondary"}>
                                {game.status === "Finished" ? game.result : game.status}
                            </Badge>
                        )}
                    </div>
                    <BroadcastingBoard fen={game?.fen} orientation="white" result={game?.result} />
                </div>

                {/* COLUMN 3 - Right Sidebar */}
                <div className="flex flex-col gap-4 h-full overflow-hidden">
                    {/* (A) Player Clocks */}
                    <div className="flex-shrink-0">
                        <ClockCard />
                    </div>

                    {/* (B) Move List */}
                    <div className="flex-grow min-h-0">
                        <MoveListCard />
                    </div>

                    {/* (C) AI Commentary Panel */}
                    <div className="flex-shrink-0 h-[35%] min-h-[200px]">
                        <CommentaryCard />
                    </div>
                </div>

                {/* Mobile Sidebar (Visible only on mobile, maybe below board) */}
                <div className="lg:hidden block h-[500px]">
                    <TournamentSidebar />
                </div>
                </div>
            </div>
        </>
    );
}

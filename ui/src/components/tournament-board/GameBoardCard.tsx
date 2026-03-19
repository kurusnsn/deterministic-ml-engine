"use client";

import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, Clock } from "lucide-react";
import { type BroadcastGame } from "@/lib/api/tournament-broadcast";

type Props = {
    game: BroadcastGame;
    roundNumber: number;
    tournamentId: string;
    boardNumber?: number;
};

const statusVariant: Record<string, "outline" | "secondary" | "destructive"> = {
    Live: "destructive",
    Finished: "secondary",
    Upcoming: "outline",
};

const startPosition = "start";

export default function GameBoardCard({ game, roundNumber, tournamentId, boardNumber }: Props) {
    const href = `/tournaments/${tournamentId}/rounds/${roundNumber}/board/${game.id}`;
    const variant = statusVariant[game.status] || "outline";

    return (
        <Link href={href} className="block h-full">
            <Card className="h-full hover:shadow-lg transition-shadow">
                <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                            {boardNumber ? (
                                <Badge variant="outline" className="rounded-full px-2">
                                    Board {boardNumber}
                                </Badge>
                            ) : null}
                            <span className="font-semibold">Round {roundNumber}</span>
                        </div>
                        <Badge variant={variant} className="text-[11px]">
                            {game.status === "Finished" ? game.result : game.status}
                        </Badge>
                    </div>

                    <div className="relative rounded-lg border bg-muted/40 p-2">
                        <div className="w-full flex justify-center">
                            <Chessboard
                                id={`${game.id}-board`}
                                position={game.fen || startPosition}
                                boardOrientation="white"
                                arePiecesDraggable={false}
                                boardWidth={280}
                                animationDuration={150}
                                customBoardStyle={{
                                    borderRadius: 12,
                                    boxShadow: "inset 0 1px 3px rgba(0,0,0,0.08)",
                                }}
                            />
                        </div>

                        {game.status === "Live" ? (
                            <div className="absolute top-3 right-3 flex items-center gap-2 text-xs font-semibold text-red-600 bg-white/80 backdrop-blur px-2 py-1 rounded-full shadow-sm">
                                <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse"></span>
                                Live
                            </div>
                        ) : null}
                    </div>

                    <div className="flex flex-col gap-1">
                        <PlayerRow player={game.white} color="white" time={game.whiteTime} />
                        <PlayerRow player={game.black} color="black" time={game.blackTime} />
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                            {game.currentMove ? (
                                <>
                                    <span className="uppercase tracking-wide text-[10px]">Last</span>
                                    <span className="font-semibold text-foreground">{game.currentMove}</span>
                                </>
                            ) : null}
                            {game.moves ? <span className="text-muted-foreground">• {game.moves} moves</span> : null}
                        </div>
                        <div className="flex items-center gap-1 text-primary font-medium">
                            <Eye className="h-4 w-4" />
                            <span>Watch</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}

function PlayerRow({ player, color, time }: { player: Player; color: "white" | "black"; time?: string }) {
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <span
                    className={`h-3 w-3 rounded-full border ${color === "white" ? "bg-white border-black/10" : "bg-black border-white/50"
                        }`}
                />
                <div>
                    <div className="font-semibold leading-tight">{player.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                        {player.title} • {player.rating}
                    </div>
                </div>
            </div>
            {time ? (
                <div className="flex items-center gap-1 text-xs font-mono bg-muted px-2 py-1 rounded">
                    <Clock className="h-3 w-3" />
                    {time}
                </div>
            ) : null}
        </div>
    );
}


import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MOCK_STANDINGS } from "@/lib/mock-tournament-data";
import { Search, Trophy } from "lucide-react";

export default function StandingsPage() {
    return (
        <>
            <h1 className="sr-only">Tournament Standings</h1>
            <Card>
            <CardHeader>
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <CardTitle className="flex items-center">
                        <Trophy className="mr-2 h-5 w-5 text-yellow-500" />
                        Standings
                    </CardTitle>
                    <div className="relative w-full md:w-64">
                        <Label htmlFor="standings-search" id="standings-search-label" className="sr-only">
                            Search player
                        </Label>
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="standings-search"
                            aria-labelledby="standings-search-label"
                            placeholder="Search player..."
                            className="pl-8"
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[80px]">Rank</TableHead>
                            <TableHead>Player</TableHead>
                            <TableHead>Title</TableHead>
                            <TableHead>Rating</TableHead>
                            <TableHead>Fed</TableHead>
                            <TableHead className="text-right">Score</TableHead>
                            <TableHead className="text-right">Tiebreak</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {MOCK_STANDINGS.map((player) => (
                            <TableRow key={player.id}>
                                <TableCell className="font-medium">#{player.rank}</TableCell>
                                <TableCell className="font-bold">{player.name}</TableCell>
                                <TableCell>{player.title}</TableCell>
                                <TableCell>{player.rating}</TableCell>
                                <TableCell>{player.country}</TableCell>
                                <TableCell className="text-right font-bold">{player.score}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{player.tiebreak}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
            </Card>
        </>
    );
}

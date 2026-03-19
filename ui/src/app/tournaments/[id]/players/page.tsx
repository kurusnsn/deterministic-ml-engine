
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MOCK_PLAYERS } from "@/lib/mock-tournament-data";
import { Search, ArrowUpDown } from "lucide-react";

export default function PlayersPage() {
    return (
        <>
            <h1 className="sr-only">Tournament Players</h1>
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <h2 className="text-2xl font-bold">Participants</h2>
                    <div className="flex gap-2 w-full md:w-auto">
                        <div className="relative flex-grow md:w-64">
                            <Label htmlFor="players-search" id="players-search-label" className="sr-only">
                                Search player
                            </Label>
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="players-search"
                                aria-labelledby="players-search-label"
                                placeholder="Search player..."
                                className="pl-8"
                            />
                        </div>
                        <Button variant="outline" size="icon" aria-label="Sort players">
                            <ArrowUpDown className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {MOCK_PLAYERS.map((player) => (
                        <Card key={player.id} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
                                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                                    {player.name.split(' ').map(n => n[0]).join('')}
                                </div>
                                <div>
                                    <div className="font-bold text-lg">{player.name}</div>
                                    <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                                        <span className="bg-muted px-1.5 rounded text-xs font-bold">{player.title}</span>
                                        <span>{player.country}</span>
                                    </div>
                                </div>
                                <div className="text-xl font-mono font-bold text-primary/80">
                                    {player.rating}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </>
    );
}

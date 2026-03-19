
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MOCK_PLAYERS } from "@/lib/mock-tournament-data";
import { Clock } from "lucide-react";

export default function ClockCard() {
    const white = MOCK_PLAYERS[0];
    const black = MOCK_PLAYERS[1];
    const whiteTime = "1:04:32";
    const blackTime = "0:58:15";
    const isWhiteTurn = true;

    return (
        <Card>
            <CardContent className="p-4 space-y-4">
                {/* Black Player */}
                <div className={`space-y-2 ${!isWhiteTurn ? "opacity-100" : "opacity-70"}`}>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full bg-black border border-white/20"></div>
                            <span className="font-semibold">{black.name}</span>
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {black.rating}
                            </span>
                        </div>
                        {!isWhiteTurn && <Clock className="h-4 w-4 animate-pulse text-primary" />}
                    </div>
                    <div className={`text-4xl font-mono font-bold tracking-wider bg-muted/50 p-2 rounded text-center ${!isWhiteTurn ? "text-foreground" : "text-muted-foreground"}`}>
                        {blackTime}
                    </div>
                    <Progress value={45} className="h-1" />
                </div>

                <div className="h-px bg-border w-full my-2"></div>

                {/* White Player */}
                <div className={`space-y-2 ${isWhiteTurn ? "opacity-100" : "opacity-70"}`}>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full bg-white border border-black/20"></div>
                            <span className="font-semibold">{white.name}</span>
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {white.rating}
                            </span>
                        </div>
                        {isWhiteTurn && <Clock className="h-4 w-4 animate-pulse text-primary" />}
                    </div>
                    <div className={`text-4xl font-mono font-bold tracking-wider bg-muted/50 p-2 rounded text-center ${isWhiteTurn ? "text-foreground" : "text-muted-foreground"}`}>
                        {whiteTime}
                    </div>
                    <Progress value={80} className="h-1" />
                </div>
            </CardContent>
        </Card>
    );
}

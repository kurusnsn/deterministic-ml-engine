
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MOCK_MOVES } from "@/lib/mock-tournament-data";
import {
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
    MoreHorizontal, Download, Share2
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function MoveListCard() {
    const currentMoveNum = 15; // Mock current move

    return (
        <Card className="flex flex-col h-full">
            <CardHeader className="p-2 border-b flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="First move">
                        <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Previous move">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Next move">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Last move">
                        <ChevronsRight className="h-4 w-4" />
                    </Button>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                            <Download className="mr-2 h-4 w-4" /> Download PGN
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <Share2 className="mr-2 h-4 w-4" /> Share Game
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </CardHeader>

            <CardContent className="p-0 flex-grow overflow-hidden bg-muted/10">
                <ScrollArea className="h-full">
                    <table className="w-full text-sm border-collapse">
                        <thead className="bg-muted/50 sticky top-0 z-10 text-xs text-muted-foreground font-medium">
                            <tr>
                                <th className="py-1 px-2 text-center w-12">#</th>
                                <th className="py-1 px-4 text-left">White</th>
                                <th className="py-1 px-4 text-left">Black</th>
                            </tr>
                        </thead>
                        <tbody>
                            {MOCK_MOVES.map((move) => (
                                <tr key={move.num} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${move.num === currentMoveNum ? "bg-primary/10" : ""}`}>
                                    <td className="py-1.5 px-2 text-center text-muted-foreground bg-muted/20 font-mono text-xs">
                                        {move.num}
                                    </td>
                                    <td className={`py-1.5 px-4 font-medium cursor-pointer hover:text-primary ${move.num === currentMoveNum ? "text-primary font-bold" : ""}`}>
                                        {move.white}
                                    </td>
                                    <td className="py-1.5 px-4 font-medium cursor-pointer hover:text-primary">
                                        {move.black}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}


import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, BrainCircuit, AlertTriangle, Lightbulb } from "lucide-react";
import { MOCK_COMMENTARY } from "@/lib/mock-tournament-data";

export default function CommentaryCard() {
    return (
        <Card className="flex flex-col h-full max-h-[400px]">
            <CardHeader className="pb-2 border-b">
                <CardTitle className="flex items-center text-base font-medium">
                    <Sparkles className="mr-2 h-4 w-4 text-purple-500" />
                    AI Commentary
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-grow p-0 overflow-hidden">
                <ScrollArea className="h-full p-4">
                    <div className="space-y-4 text-sm">
                        <div className="bg-muted/50 p-3 rounded-lg border border-border/50">
                            <h4 className="font-semibold mb-1 flex items-center text-primary">
                                <BrainCircuit className="mr-2 h-3 w-3" />
                                Position Summary
                            </h4>
                            <p className="text-muted-foreground leading-relaxed">
                                {MOCK_COMMENTARY.summary}
                            </p>
                        </div>

                        <div>
                            <h4 className="font-semibold mb-1">Move Explanation</h4>
                            <p className="text-muted-foreground">
                                {MOCK_COMMENTARY.explanation}
                            </p>
                        </div>

                        <div>
                            <h4 className="font-semibold mb-1 flex items-center text-amber-500">
                                <Lightbulb className="mr-2 h-3 w-3" />
                                Alternative Lines
                            </h4>
                            <ul className="list-disc list-inside text-muted-foreground space-y-1">
                                {MOCK_COMMENTARY.alternatives.map((alt, i) => (
                                    <li key={i}>{alt}</li>
                                ))}
                            </ul>
                        </div>

                        <div className="bg-red-50 dark:bg-red-950/20 p-3 rounded-lg border border-red-100 dark:border-red-900/50">
                            <h4 className="font-semibold mb-1 flex items-center text-red-500">
                                <AlertTriangle className="mr-2 h-3 w-3" />
                                Critical Moment
                            </h4>
                            <p className="text-muted-foreground">
                                {MOCK_COMMENTARY.critical}
                            </p>
                        </div>
                    </div>
                </ScrollArea>
            </CardContent>
            <div className="p-2 border-t bg-muted/20 grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" className="text-xs h-8">
                    Explain Move
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-8">
                    Best Line
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-8">
                    Why Mistake?
                </Button>
            </div>
        </Card>
    );
}

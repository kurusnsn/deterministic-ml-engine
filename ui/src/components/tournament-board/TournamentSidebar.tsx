
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MOCK_TOURNAMENTS, MOCK_PLAYERS, MOCK_CHAT } from "@/lib/mock-tournament-data";
import { MessageSquare, Users, FileText, Send } from "lucide-react";

export default function TournamentSidebar() {
    const tournament = MOCK_TOURNAMENTS[0];
    const white = MOCK_PLAYERS[0];
    const black = MOCK_PLAYERS[1];

    return (
        <div className="flex flex-col h-full gap-4">
            {/* Event Info Card */}
            <Card>
                <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        Event Info
                    </CardTitle>
                </CardHeader>
                <CardContent className="py-2 pb-4 space-y-2">
                    <div className="font-bold text-lg leading-tight">{tournament.name}</div>
                    <div className="text-sm text-muted-foreground">
                        Round 5 • {tournament.location}
                    </div>
                    <div className="flex items-center justify-between text-xs font-medium mt-2 pt-2 border-t">
                        <span>{white.name} ({white.rating})</span>
                        <span className="text-muted-foreground">vs</span>
                        <span>{black.name} ({black.rating})</span>
                    </div>
                </CardContent>
            </Card>

            {/* Chat / Notes Tabs */}
            <Card className="flex-grow flex flex-col overflow-hidden">
                <Tabs defaultValue="chat" className="flex flex-col h-full">
                    <div className="px-4 pt-2">
                        <TabsList className="w-full grid grid-cols-2">
                            <TabsTrigger value="chat" className="text-xs">
                                <MessageSquare className="mr-2 h-3 w-3" /> Chat
                            </TabsTrigger>
                            <TabsTrigger value="notes" className="text-xs">
                                <FileText className="mr-2 h-3 w-3" /> Notes
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="chat" className="flex-grow flex flex-col p-0 m-0 data-[state=active]:flex overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/20">
                            <div className="flex items-center text-xs text-muted-foreground">
                                <Users className="mr-1 h-3 w-3" />
                                <span className="font-medium">1,243 spectators</span>
                            </div>
                        </div>

                        <ScrollArea className="flex-grow p-4">
                            <div className="space-y-3">
                                {MOCK_CHAT.map((msg, i) => (
                                    <div key={i} className="text-sm">
                                        <span className="font-bold text-primary mr-2 hover:underline cursor-pointer">
                                            {msg.user}
                                        </span>
                                        <span className="text-foreground/90">{msg.message}</span>
                                    </div>
                                ))}
                                {/* Mock more chat to make it scrollable */}
                                {Array.from({ length: 10 }).map((_, i) => (
                                    <div key={`mock-${i}`} className="text-sm opacity-60">
                                        <span className="font-bold mr-2">User{i}</span>
                                        <span>This is a mock message to test scrolling behavior.</span>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>

                        <div className="p-3 border-t bg-background mt-auto">
                            <div className="flex gap-2">
                                <Label htmlFor="tournament-chat" id="tournament-chat-label" className="sr-only">
                                    Chat message
                                </Label>
                                <Input
                                    id="tournament-chat"
                                    aria-labelledby="tournament-chat-label"
                                    placeholder="Say something..."
                                    className="h-8 text-sm"
                                />
                                <Button size="icon" className="h-8 w-8" aria-label="Send message">
                                    <Send className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="notes" className="flex-grow p-4 m-0 data-[state=active]:flex flex-col">
                        <Label htmlFor="tournament-notes" id="tournament-notes-label" className="sr-only">
                            Private notes
                        </Label>
                        <Textarea
                            id="tournament-notes"
                            aria-labelledby="tournament-notes-label"
                            placeholder="Take private notes on this game..."
                            className="flex-grow resize-none border-none focus-visible:ring-0 bg-transparent p-0"
                        />
                    </TabsContent>
                </Tabs>
            </Card>
        </div>
    );
}

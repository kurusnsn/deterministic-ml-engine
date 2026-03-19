"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Loader2, Sparkles, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

interface Message {
    id: string;
    sender: "user" | "llm";
    text: string;
    timestamp: number;
    moveSan?: string;
    fen?: string;
}

interface GameReviewLLMPanelProps {
    fen: string;
    moveSan?: string;
    moveIndex: number;
    moveHistory: string[];
    evalScore?: number;
    gameMetadata?: {
        white: string;
        black: string;
        whiteElo?: string;
        blackElo?: string;
    };
}

export const GameReviewLLMPanel: React.FC<GameReviewLLMPanelProps> = ({
    fen,
    moveSan,
    moveIndex,
    moveHistory,
    evalScore,
    gameMetadata,
}) => {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            sender: "llm",
            text: "Hello! I'm your AI chess analyst. Ask me about the current position, specific moves, or chess strategy.",
            timestamp: Date.now(),
        },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [streamingText, setStreamingText] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "/api/gateway";

    // Auto-scroll on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, streamingText]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            id: `user-${Date.now()}`,
            sender: "user",
            text: input.trim(),
            timestamp: Date.now(),
            moveSan,
            fen,
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);
        setStreamingText("");

        try {
            const response = await fetch(`${GATEWAY_URL}/chess/analyze_with_llm/stream`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fen,
                    current_fen: fen,
                    last_move: moveSan,
                    move_history: moveHistory,
                    user_question: input.trim(),
                    include_llm: true,
                    multipv: 3,
                    depth: 18,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No reader");

            const decoder = new TextDecoder();
            let fullText = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n");

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6);
                        if (data === "[DONE]") continue;

                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.text) {
                                fullText += parsed.text;
                                setStreamingText(fullText);
                            } else if (parsed.llm?.choices?.[0]?.delta?.content) {
                                fullText += parsed.llm.choices[0].delta.content;
                                setStreamingText(fullText);
                            } else if (parsed.llm?.choices?.[0]?.message?.content) {
                                fullText = parsed.llm.choices[0].message.content;
                                setStreamingText(fullText);
                            }
                        } catch {
                            // Non-JSON line, ignore
                        }
                    }
                }
            }

            // Add final LLM message
            const llmMessage: Message = {
                id: `llm-${Date.now()}`,
                sender: "llm",
                text: fullText || "I couldn't analyze this position. Please try again.",
                timestamp: Date.now(),
                moveSan,
                fen,
            };
            setMessages((prev) => [...prev, llmMessage]);
            setStreamingText("");
        } catch (error) {
            console.error("LLM error:", error);
            const errorMessage: Message = {
                id: `error-${Date.now()}`,
                sender: "llm",
                text: "Sorry, I encountered an error analyzing this position. Please try again.",
                timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    // Quick action buttons
    const quickActions = [
        { label: "Explain this move", prompt: `Explain the move ${moveSan || "just played"}. What does it achieve?` },
        { label: "Best plan here", prompt: "What is the best plan in this position?" },
        { label: "Critical squares", prompt: "What are the critical squares to control in this position?" },
    ];

    const handleQuickAction = (prompt: string) => {
        setInput(prompt);
        inputRef.current?.focus();
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-3 border-b bg-gray-50 flex items-center gap-2 shrink-0">
                <Bot className="w-4 h-4 text-purple-600" />
                <span className="font-semibold text-sm">AI Analysis</span>
                {moveSan && (
                    <Badge variant="outline" className="text-xs ml-auto">
                        At: {moveSan}
                    </Badge>
                )}
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-3">
                <div className="space-y-3">
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex gap-2 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                        >
                            {msg.sender === "llm" && (
                                <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                                    <Sparkles className="w-3 h-3 text-purple-600" />
                                </div>
                            )}
                            <div
                                className={`max-w-[85%] p-3 rounded-lg text-sm ${msg.sender === "user"
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted"
                                    }`}
                            >
                                {msg.moveSan && msg.sender === "llm" && (
                                    <div className="text-xs text-muted-foreground mb-1">
                                        About move: <span className="font-mono font-medium">{msg.moveSan}</span>
                                    </div>
                                )}
                                <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                            </div>
                            {msg.sender === "user" && (
                                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                                    <User className="w-3 h-3 text-primary-foreground" />
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Streaming response */}
                    {isLoading && streamingText && (
                        <div className="flex gap-2 justify-start">
                            <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                                <Sparkles className="w-3 h-3 text-purple-600 animate-pulse" />
                            </div>
                            <div className="max-w-[85%] p-3 rounded-lg text-sm bg-muted">
                                <p className="whitespace-pre-wrap leading-relaxed">
                                    {streamingText}
                                    <span className="animate-pulse ml-0.5">▊</span>
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Loading indicator (before streaming starts) */}
                    {isLoading && !streamingText && (
                        <div className="flex gap-2 justify-start">
                            <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                                <Loader2 className="w-3 h-3 text-purple-600 animate-spin" />
                            </div>
                            <div className="p-3 rounded-lg text-sm bg-muted">
                                <span className="text-muted-foreground">Analyzing position...</span>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </ScrollArea>

            {/* Quick Actions */}
            <div className="p-2 border-t flex flex-wrap gap-1.5 shrink-0">
                {quickActions.map((action) => (
                    <Button
                        key={action.label}
                        variant="secondary"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => handleQuickAction(action.prompt)}
                        disabled={isLoading}
                    >
                        {action.label}
                    </Button>
                ))}
            </div>

            {/* Input */}
            <div className="p-3 border-t shrink-0">
                <div className="flex gap-2">
                    <Label htmlFor="llm-input" id="llm-input-label" className="sr-only">
                        Ask about this position
                    </Label>
                    <textarea
                        ref={inputRef}
                        id="llm-input"
                        aria-labelledby="llm-input-label"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Ask about this position..."
                        className="flex-1 resize-none text-sm p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[40px] max-h-[100px]"
                        rows={1}
                        disabled={isLoading}
                    />
                    <Button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        size="icon"
                        className="shrink-0"
                        aria-label={isLoading ? "Sending message" : "Send message"}
                    >
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default GameReviewLLMPanel;

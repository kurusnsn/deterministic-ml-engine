"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Sword, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { OpeningSystem } from "@/types/openings";
import { Chessboard } from "react-chessboard";

interface OpeningCardProps {
    system: OpeningSystem;
    masteredCount?: number;
}

function WinrateBadge({ winrate, side }: { winrate: number; side: "white" | "black" }) {
    const isGood = winrate >= 52;
    const isBad = winrate < 48;
    const label = `${winrate.toFixed(0)}% ${side === "black" ? "for ♟" : "for ♙"}`;
    if (isGood) {
        return (
            <Badge variant="outline" className="text-[10px] py-0 px-2 h-5 border-green-500/50 text-green-600 dark:text-green-400 flex items-center gap-0.5">
                <TrendingUp className="w-2.5 h-2.5" />
                {label}
            </Badge>
        );
    }
    if (isBad) {
        return (
            <Badge variant="outline" className="text-[10px] py-0 px-2 h-5 border-red-400/50 text-red-500 dark:text-red-400 flex items-center gap-0.5">
                <TrendingDown className="w-2.5 h-2.5" />
                {label}
            </Badge>
        );
    }
    return (
        <Badge variant="outline" className="text-[10px] py-0 px-2 h-5 text-muted-foreground flex items-center gap-0.5">
            <Minus className="w-2.5 h-2.5" />
            {label}
        </Badge>
    );
}

export default function OpeningCard({ system, masteredCount = 0 }: OpeningCardProps) {
    const isGambit = system.type === "forcing" || system.name.toLowerCase().includes("gambit");
    const orientation = system.perspective === "black" ? "black" : "white";

    // Lazy loading state
    const [isVisible, setIsVisible] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect(); // Stop observing once visible
                }
            },
            {
                rootMargin: "200px", // Start loading 200px before entering viewport
                threshold: 0.01
            }
        );

        if (cardRef.current) {
            observer.observe(cardRef.current);
        }

        return () => observer.disconnect();
    }, []);

    return (
        <Link href={`/openings/${system.id}`} className="block h-full">
            <Card ref={cardRef} className="h-full transition-all duration-200 hover:shadow-md hover:border-primary/5 group cursor-pointer border-border/50 bg-card overflow-hidden">
                <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                        <div className="space-y-1">
                            <CardTitle className="text-xl group-hover:text-primary transition-colors font-bold tracking-tight capitalize">
                                {system.name}
                            </CardTitle>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {system.ecoCodes[0] && (
                                    <Badge variant="secondary" className="text-[10px] font-mono py-0 px-2 h-5">
                                        {system.ecoCodes[0]}
                                    </Badge>
                                )}
                                {isGambit && (
                                    <Badge variant="default" className="text-[10px] bg-primary/90 hover:bg-primary py-0 px-2 h-5 flex items-center gap-1">
                                        <Sword className="w-2.5 h-2.5" />
                                        Gambit
                                    </Badge>
                                )}
                                {system.avgWinrate !== undefined && (
                                    <WinrateBadge
                                        winrate={system.avgWinrate}
                                        side={system.perspective ?? "white"}
                                    />
                                )}
                            </div>
                        </div>
                        <div className="p-2.5 bg-muted/50 rounded-xl group-hover:bg-primary/10 transition-colors border border-border/20">
                            <BookOpen className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="aspect-square w-full relative overflow-hidden border border-border/50 bg-muted/20">
                        {isVisible ? (
                            <>
                                <Chessboard
                                    position={system.fen}
                                    boardOrientation={orientation}
                                    areArrowsAllowed={false}
                                    arePiecesDraggable={false}
                                />
                                <div className="absolute inset-0 bg-transparent z-10" />
                            </>
                        ) : (
                            // Skeleton placeholder while loading
                            <div className="w-full h-full bg-gradient-to-br from-muted/40 to-muted/60 animate-pulse flex items-center justify-center">
                                <div className="grid grid-cols-8 grid-rows-8 w-full h-full opacity-30">
                                    {Array.from({ length: 64 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className={`${(Math.floor(i / 8) + i) % 2 === 0 ? 'bg-stone-300' : 'bg-stone-500'}`}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="min-h-[2.5rem]">
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed font-mono bg-muted/30 p-2 rounded-md">
                            {system.canonicalMoves.join(" ")}
                        </p>
                    </div>

                    {/* Lines progress section */}
                    {system.lineCount && system.lineCount > 0 && (
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground">
                                    <span className="font-medium text-foreground">{masteredCount}</span> of {system.lineCount} lines mastered
                                </span>
                                {system.popularity !== undefined && system.popularity > 0 && (
                                    <span className="text-muted-foreground tabular-nums">
                                        {system.popularity >= 1_000_000
                                            ? `${(system.popularity / 1_000_000).toFixed(1)}M games`
                                            : system.popularity >= 1_000
                                            ? `${Math.round(system.popularity / 1_000)}k games`
                                            : `${system.popularity} games`}
                                    </span>
                                )}
                            </div>
                            <Progress value={(masteredCount / system.lineCount) * 100} className="h-1.5" />
                        </div>
                    )}
                </CardContent>
            </Card>
        </Link>
    );
}


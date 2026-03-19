'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Puzzle, Play, Trash2, Calendar, Clock,
    ChevronRight, ChevronDown, Layers
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getSavedPuzzles, deleteSavedPuzzle, SavedPuzzle } from '@/lib/api/repertoire';
import { Chessboard } from 'react-chessboard';

// Collapsible Report Bucket component
function ReportBucket({
    reportName,
    puzzles,
    date,
    timeControl,
    repertoireType,
    blunderCount,
    mistakeCount,
    onStartTraining,
    onPlayPuzzle,
    onDeletePuzzle,
}: {
    reportName: string;
    puzzles: SavedPuzzle[];
    date: string;
    timeControl?: string;
    repertoireType?: string;
    blunderCount: number;
    mistakeCount: number;
    onStartTraining: () => void;
    onPlayPuzzle: (puzzleId: string) => void;
    onDeletePuzzle: (id: string) => Promise<void>;
}) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <Card className="overflow-hidden border-l-4 border-l-purple-500 shadow-sm">
            {/* Collapsed Header - Always visible */}
            <CardHeader
                className="bg-purple-50/50 pb-3 cursor-pointer hover:bg-purple-100/50 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-purple-600" />
                        ) : (
                            <ChevronRight className="w-5 h-5 text-purple-600" />
                        )}
                        <div>
                            <CardTitle className="text-base font-semibold">{reportName}</CardTitle>
                            <CardDescription className="flex items-center gap-3 mt-1.5 text-xs">
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> {timeControl || 'Standard'}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" /> {date}
                                </span>
                                {repertoireType && (
                                    <span className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-purple-100 text-purple-600">
                                        <Layers className="w-3 h-3" /> {repertoireType}
                                    </span>
                                )}
                            </CardDescription>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Stats badges */}
                        <div className="hidden sm:flex items-center gap-2 text-xs">
                            {blunderCount > 0 && (
                                <span className="px-2 py-1 rounded bg-red-50 text-red-700 border border-red-100">
                                    {blunderCount} blunders
                                </span>
                            )}
                            {mistakeCount > 0 && (
                                <span className="px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-100">
                                    {mistakeCount} mistakes
                                </span>
                            )}
                        </div>
                        <Badge variant="outline" className="text-xs font-medium">
                            {puzzles.length} puzzles
                        </Badge>
                        <Button
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                            onClick={(e) => {
                                e.stopPropagation();
                                onStartTraining();
                            }}
                        >
                            <Play className="w-3 h-3 mr-1" />
                            Train
                        </Button>
                    </div>
                </div>
            </CardHeader>

            {/* Expanded Content - Puzzle list */}
            {isExpanded && (
                <CardContent className="bg-white/50 pt-4">
                    <ScrollArea className="max-h-[400px] pr-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {puzzles.map((puzzle) => (
                                <SavedPuzzleRow
                                    key={puzzle.id}
                                    puzzle={puzzle}
                                    onPlay={() => onPlayPuzzle(puzzle.puzzle_id)}
                                    onDelete={() => onDeletePuzzle(puzzle.id)}
                                />
                            ))}
                        </div>
                    </ScrollArea>
                </CardContent>
            )}
        </Card>
    );
}

// Mini board puzzle row with delete option
function SavedPuzzleRow({
    puzzle,
    onPlay,
    onDelete
}: {
    puzzle: SavedPuzzle;
    onPlay: () => void;
    onDelete: () => void;
}) {
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to remove this puzzle?')) {
            setIsDeleting(true);
            await onDelete();
            setIsDeleting(false);
        }
    };

    return (
        <div className="flex items-center justify-between p-3 border rounded-lg bg-white dark:bg-white/5 hover:border-purple-300 transition-colors group">
            <button
                type="button"
                className="flex items-center gap-3 cursor-pointer flex-1 text-left"
                onClick={onPlay}
            >
                {/* Mini chess board */}
                <div className="flex-shrink-0">
                    <Chessboard
                        position={puzzle.fen}
                        boardOrientation={puzzle.side_to_move}
                        arePiecesDraggable={false}
                        boardWidth={60}
                        customBoardStyle={{
                            borderRadius: "4px",
                        }}
                    />
                </div>

                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Badge
                            variant="outline"
                            className={`text-xs py-0 ${puzzle.mistake_type === 'blunder'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                        >
                            {puzzle.mistake_type || 'Blunder'}
                        </Badge>
                        {puzzle.eco && (
                            <span className="text-xs text-muted-foreground font-mono">{puzzle.eco}</span>
                        )}
                    </div>

                    {/* Themes */}
                    {puzzle.theme && puzzle.theme.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {puzzle.theme.slice(0, 2).map((theme) => (
                                <span key={theme} className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                                    {theme.replace(/_/g, ' ')}
                                </span>
                            ))}
                            {puzzle.theme.length > 2 && (
                                <span className="text-[10px] text-muted-foreground">+{puzzle.theme.length - 2}</span>
                            )}
                        </div>
                    )}
                </div>
            </button>

            <div className="flex items-center gap-2 pl-2">
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-purple-600 hover:bg-purple-50"
                    onClick={onPlay}
                >
                    <Play className="w-4 h-4" />
                </Button>
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    aria-label="Delete puzzle"
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}

export default function SavedPuzzlesSection() {
    const [puzzles, setPuzzles] = useState<SavedPuzzle[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [totalCount, setTotalCount] = useState<number | null>(null);
    const { toast } = useToast();
    const pageSize = 50; // Load more at once for better grouping

    useEffect(() => {
        loadPuzzles(0, false);
    }, []);

    const loadPuzzles = async (nextOffset: number, append: boolean) => {
        try {
            if (append) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }
            const data = await getSavedPuzzles(pageSize, nextOffset);
            setHasMore(data.has_more);
            setTotalCount(data.total);
            setOffset(nextOffset + data.puzzles.length);
            setPuzzles(prev => append ? [...prev, ...data.puzzles] : data.puzzles);
        } catch (error) {
            console.error(error);
            toast({
                title: "Error loading puzzles",
                description: "Could not fetch saved puzzles",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const handleDelete = async (puzzleId: string) => {
        try {
            await deleteSavedPuzzle(puzzleId);
            setPuzzles(prev => prev.filter(p => p.id !== puzzleId));
            setTotalCount(prev => (prev === null ? prev : Math.max(prev - 1, 0)));
            toast({
                title: "Puzzle removed",
                description: "Puzzle removed from your profile",
            });
        } catch {
            toast({
                title: "Error",
                description: "Failed to delete puzzle",
                variant: "destructive"
            });
        }
    };

    // Group puzzles by source report
    const groupedPuzzles = React.useMemo(() => {
        const groups: Record<string, SavedPuzzle[]> = {};
        puzzles.forEach(p => {
            const key = p.source_report_name || 'Unknown Report';
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });
        return groups;
    }, [puzzles]);

    if (loading) {
        return <div className="p-8 text-center text-muted-foreground">Loading puzzles...</div>;
    }

    if (puzzles.length === 0) {
        return (
            <Card className="bg-muted/30 border-dashed">
                <CardContent className="flex flex-col items-center justify-center p-8 space-y-3">
                    <Puzzle className="w-10 h-10 text-muted-foreground/50" />
                    <p className="font-medium text-muted-foreground">No saved puzzles yet</p>
                    <p className="text-sm text-muted-foreground text-center">
                        Generate a repertoire report and save puzzles to practice them here.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <Puzzle className="w-5 h-5 text-purple-600" />
                        Personalized Puzzles
                    </h2>
                    <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                        {(totalCount ?? puzzles.length)} Saved
                    </Badge>
                </div>
                <Button
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => window.location.href = `/puzzles?mode=saved`}
                >
                    <Play className="w-4 h-4 mr-2" />
                    Train All
                </Button>
            </div>

            {Object.entries(groupedPuzzles).map(([reportName, groupPuzzles]) => {
                const sample = groupPuzzles[0];
                const date = sample.created_at ? new Date(sample.created_at).toLocaleDateString() : 'Unknown date';
                const blunderCount = groupPuzzles.filter(p => p.mistake_type === 'blunder').length;
                const mistakeCount = groupPuzzles.filter(p => p.mistake_type === 'mistake').length;

                return (
                    <ReportBucket
                        key={reportName}
                        reportName={reportName}
                        puzzles={groupPuzzles}
                        date={date}
                        timeControl={sample.time_control}
                        repertoireType={sample.repertoire_type}
                        blunderCount={blunderCount}
                        mistakeCount={mistakeCount}
                        onStartTraining={() => window.location.href = `/puzzles?mode=saved`}
                        onPlayPuzzle={(puzzleId) => window.location.href = `/puzzles?puzzle=${puzzleId}`}
                        onDeletePuzzle={handleDelete}
                    />
                );
            })}

            {hasMore && (
                <div className="flex justify-center">
                    <Button
                        variant="outline"
                        onClick={() => loadPuzzles(offset, true)}
                        disabled={loadingMore}
                    >
                        {loadingMore ? "Loading..." : "Load more"}
                    </Button>
                </div>
            )}
        </div>
    );
}

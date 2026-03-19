'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Puzzle, Play, ChevronRight, ChevronLeft, Save, Loader2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { GeneratedPuzzle, LC0PremiumOverlay } from '@/types/repertoire';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Chessboard } from 'react-chessboard';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PuzzlesDrawer from './PuzzlesDrawer';
import { cn } from '@/lib/utils';
import { getAuthHeaders } from '@/lib/api/repertoire';

interface PuzzlesBucketCardProps {
    puzzles: GeneratedPuzzle[];
    onPuzzleClick?: (puzzle: GeneratedPuzzle) => void;
    // For save functionality
    sourceReportId?: string;
    sourceReportName?: string;
    timeControl?: string;
    repertoireType?: string;
    /** LC0 premium overlay data (optional) */
    premiumLc0?: LC0PremiumOverlay;
}

// Compact puzzle row with mini board (safe with pagination)
function PuzzleRow({ puzzle, onPlay }: { puzzle: GeneratedPuzzle; onPlay: () => void }) {
    return (
        <button
            type="button"
            className="flex w-full items-center justify-between p-3 border rounded-lg bg-white dark:bg-white/5 hover:border-purple-300 dark:hover:border-purple-600 cursor-pointer transition-colors text-left"
            onClick={onPlay}
        >
            <div className="flex items-center gap-3">
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
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                        <Badge
                            variant="outline"
                            className={`text-xs py-0 ${puzzle.mistake_type === 'blunder'
                                ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800'
                                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
                                }`}
                        >
                            {puzzle.mistake_type || 'Blunder'}
                        </Badge>
                        {puzzle.eco && (
                            <span className="text-xs text-muted-foreground">{puzzle.eco}</span>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">Move {puzzle.move_number || '?'}</p>
                    {puzzle.theme && puzzle.theme.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {puzzle.theme.slice(0, 2).map((theme) => (
                                <span key={theme} className="text-xs text-purple-600">
                                    {theme.replace(/_/g, ' ')}
                                </span>
                            ))}
                            {puzzle.theme.length > 2 && (
                                <span className="text-xs text-muted-foreground">+{puzzle.theme.length - 2}</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <span
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-purple-600")}
                aria-hidden="true"
            >
                <Play className="w-4 h-4" />
            </span>
        </button>
    );
}

// Mini puzzle card with board preview
function MiniPuzzleCard({ puzzle, onPlay }: { puzzle: GeneratedPuzzle; onPlay: () => void }) {
    return (
        <div className="border rounded-lg p-3 bg-white dark:bg-white/5 hover:border-purple-300 dark:hover:border-purple-600 transition-colors">
            <div className="flex gap-3">
                {/* Mini chess board */}
                <div className="flex-shrink-0">
                    <Chessboard
                        position={puzzle.fen}
                        boardOrientation={puzzle.side_to_move}
                        arePiecesDraggable={false}
                        boardWidth={100}
                        customBoardStyle={{
                            borderRadius: "4px",
                            boxShadow: "0 1px 4px rgba(0, 0, 0, 0.1)",
                        }}
                    />
                </div>

                {/* Puzzle info */}
                <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                        <Badge
                            variant="outline"
                            className={`text-xs ${puzzle.mistake_type === 'blunder'
                                ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800'
                                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
                                }`}
                        >
                            {puzzle.mistake_type || 'Blunder'}
                        </Badge>
                        {puzzle.eco && (
                            <span className="text-xs text-muted-foreground">{puzzle.eco}</span>
                        )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Move {puzzle.move_number || '?'}
                    </p>

                    {/* Theme badges */}
                    {puzzle.theme && puzzle.theme.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {puzzle.theme.slice(0, 3).map((theme) => (
                                <Badge
                                    key={theme}
                                    variant="secondary"
                                    className="text-xs py-0 px-1.5 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
                                >
                                    {theme.replace(/_/g, ' ')}
                                </Badge>
                            ))}
                            {puzzle.theme.length > 3 && (
                                <Badge variant="secondary" className="text-xs py-0 px-1.5">
                                    +{puzzle.theme.length - 3}
                                </Badge>
                            )}
                        </div>
                    )}

                    <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-xs text-purple-600 border-purple-200 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:hover:bg-purple-950/40"
                        onClick={onPlay}
                    >
                        <Play className="w-3 h-3 mr-1" /> Practice
                    </Button>
                </div>
            </div>
        </div>
    );
}

const PUZZLES_PER_PAGE = 20;

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway';

export default function PuzzlesBucketCard({
    puzzles,
    onPuzzleClick,
    sourceReportId,
    sourceReportName,
    timeControl,
    repertoireType,
    premiumLc0,
}: PuzzlesBucketCardProps) {
    const [showAllPuzzles, setShowAllPuzzles] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);
    const [filterType, setFilterType] = useState<'all' | 'blunder' | 'mistake'>('all');
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    const handleSavePuzzles = async () => {
        setIsSaving(true);
        try {
            const headers = await getAuthHeaders();
            const res = await fetch(`${GATEWAY_URL}/profile/puzzles`, {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({
                    puzzles,
                    source_report_id: sourceReportId,
                    source_report_name: sourceReportName,
                    time_control: timeControl,
                    repertoire_type: repertoireType
                })
            });
            const data = await res.json();
            if (res.ok) {
                toast({
                    title: 'Puzzles Saved!',
                    description: `${data.saved} puzzles saved to your profile.`,
                });
            } else {
                throw new Error(data.detail || 'Failed to save');
            }
        } catch (err: any) {
            toast({
                title: 'Error',
                description: err.message || 'Failed to save puzzles',
                variant: 'destructive'
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (puzzles.length === 0) {
        return null;
    }

    // Filter puzzles
    const filteredPuzzles = useMemo(() => {
        if (filterType === 'all') return puzzles;
        return puzzles.filter(p => p.mistake_type === filterType);
    }, [puzzles, filterType]);

    // Paginate
    const totalPages = Math.ceil(filteredPuzzles.length / PUZZLES_PER_PAGE);
    const paginatedPuzzles = filteredPuzzles.slice(
        currentPage * PUZZLES_PER_PAGE,
        (currentPage + 1) * PUZZLES_PER_PAGE
    );

    // Get preview puzzles (first 2 for better display with boards)
    const previewPuzzles = puzzles.slice(0, 2);
    const remainingCount = puzzles.length - previewPuzzles.length;

    // Count by type
    const blunderCount = puzzles.filter(p => p.mistake_type === 'blunder').length;
    const mistakeCount = puzzles.filter(p => p.mistake_type === 'mistake').length;

    const handleOpenDialog = () => {
        setCurrentPage(0);
        setFilterType('all');
        setShowAllPuzzles(true);
    };

    return (
        <>
            <Card className="overflow-hidden hover:shadow-md transition-shadow bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-purple-100 dark:bg-purple-900/50">
                                <Puzzle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            </div>
                            <CardTitle className="text-base font-semibold">Practice Puzzles</CardTitle>
                            <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700">
                                {puzzles.length}
                            </Badge>
                        </div>
                        {/* Save button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-purple-600 hover:bg-purple-100 dark:text-purple-400 dark:hover:bg-purple-900/40"
                            onClick={handleSavePuzzles}
                            disabled={isSaving}
                            title="Save all puzzles to profile"
                            aria-label="Save all puzzles to profile"
                        >
                            {isSaving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Save className="w-4 h-4" />
                            )}
                        </Button>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        {blunderCount > 0 && (
                            <span className="text-xs text-red-600">{blunderCount} blunders</span>
                        )}
                        {blunderCount > 0 && mistakeCount > 0 && (
                            <span className="text-xs text-muted-foreground">•</span>
                        )}
                        {mistakeCount > 0 && (
                            <span className="text-xs text-amber-600">{mistakeCount} mistakes</span>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                    {/* Preview puzzle cards with boards */}
                    {previewPuzzles.map((puzzle, index) => (
                        <MiniPuzzleCard
                            key={puzzle.puzzle_id || index}
                            puzzle={puzzle}
                            onPlay={() => onPuzzleClick?.(puzzle)}
                        />
                    ))}

                    {remainingCount > 0 && (
                        <Button
                            variant="outline"
                            className="w-full text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:text-purple-300 dark:hover:bg-purple-950/40"
                            onClick={handleOpenDialog}
                        >
                            View all {puzzles.length} puzzles
                            <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    )}
                </CardContent>
            </Card>

            {/* All Puzzles Drawer */}
            <PuzzlesDrawer
                puzzles={puzzles}
                open={showAllPuzzles}
                onOpenChange={setShowAllPuzzles}
                onPuzzleClick={onPuzzleClick}
                premiumLc0={premiumLc0}
            />
        </>
    );
}

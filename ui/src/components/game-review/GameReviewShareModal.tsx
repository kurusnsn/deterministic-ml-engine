"use client";

import React, { useState, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Loader2, Share2, Check } from "lucide-react";

interface GameReviewShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    analysisId: string;
    currentMoveIndex: number;
    moves: Array<{ num: number; white: string; black?: string }>;
    gameMetadata?: {
        white: string;
        black: string;
        result: string;
    };
}

interface ShareClipResponse {
    id: string;
    slug: string;
    share_url: string;
    status: string;
    gif_url: string | null;
    thumbnail_url: string | null;
    primary_move_index: number;
    show_threat_arrows: boolean;
    show_move_classification: boolean;
    preview: {
        san: string;
        classification: string | null;
        commentary: string;
        eval_cp_before: number;
        eval_cp_after: number;
    };
    game_meta: {
        opponent: string;
        result: string;
        time_control: string;
        played_at: string;
        opening_name: string;
    };
}

/**
 * GameReviewShareModal - Modal for creating shareable game review clips.
 * 
 * Features:
 * - Move selector to choose which move to feature
 * - Toggle for threat arrows
 * - Toggle for move classification badge
 * - Preview of share link
 * - Copy to clipboard functionality
 */
export default function GameReviewShareModal({
    isOpen,
    onClose,
    analysisId,
    currentMoveIndex,
    moves,
    gameMetadata,
}: GameReviewShareModalProps) {
    const GATEWAY_URL = (process.env.NEXT_PUBLIC_GATEWAY_URL as string) ?? "/api/gateway";

    // State
    const [selectedMoveIndex, setSelectedMoveIndex] = useState(currentMoveIndex);
    const [showThreatArrows, setShowThreatArrows] = useState(true);
    const [showMoveClassification, setShowMoveClassification] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shareResult, setShareResult] = useState<ShareClipResponse | null>(null);
    const [copied, setCopied] = useState(false);

    // Reset state when modal opens
    React.useEffect(() => {
        if (isOpen) {
            setSelectedMoveIndex(currentMoveIndex);
            setShareResult(null);
            setError(null);
            setCopied(false);
        }
    }, [isOpen, currentMoveIndex]);

    // Build move options for selector
    const moveOptions = React.useMemo(() => {
        const options: { value: number; label: string }[] = [];
        moves.forEach((move, halfMoveIdx) => {
            // Each entry has white and optionally black
            const whiteIdx = halfMoveIdx * 2;
            options.push({
                value: whiteIdx,
                label: `${move.num}. ${move.white}`,
            });
            if (move.black) {
                options.push({
                    value: whiteIdx + 1,
                    label: `${move.num}... ${move.black}`,
                });
            }
        });
        return options;
    }, [moves]);

    // Generate share clip
    const handleGenerateClip = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(
                `${GATEWAY_URL}/api/me/gamereview/${analysisId}/share`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        primary_move_index: selectedMoveIndex,
                        show_threat_arrows: showThreatArrows,
                        show_move_classification: showMoveClassification,
                    }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || "Failed to create share clip");
            }

            const data: ShareClipResponse = await response.json();
            setShareResult(data);
        } catch (err: any) {
            console.error("Error creating share clip:", err);
            setError(err.message || "Failed to create share clip");
        } finally {
            setIsLoading(false);
        }
    }, [GATEWAY_URL, analysisId, selectedMoveIndex, showThreatArrows, showMoveClassification]);

    // Copy link to clipboard
    const handleCopyLink = useCallback(async () => {
        if (!shareResult?.share_url) return;

        try {
            await navigator.clipboard.writeText(shareResult.share_url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    }, [shareResult]);

    // Open share URL in new tab
    const handleOpenLink = useCallback(() => {
        if (shareResult?.share_url) {
            window.open(shareResult.share_url, "_blank");
        }
    }, [shareResult]);

    // Format eval for display
    const formatEval = (cp: number): string => {
        const pawns = cp / 100;
        return pawns >= 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Share2 className="h-5 w-5" />
                        Share Game Clip
                    </DialogTitle>
                    <DialogDescription>
                        Create a shareable image of a key move from your game.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Move Selector */}
                    <div className="space-y-2">
                        <Label htmlFor="move-select">Featured Move</Label>
                        <Select
                            value={String(selectedMoveIndex)}
                            onValueChange={(val) => setSelectedMoveIndex(parseInt(val))}
                        >
                            <SelectTrigger id="move-select">
                                <SelectValue placeholder="Select a move" />
                            </SelectTrigger>
                            <SelectContent>
                                {moveOptions.map((opt) => (
                                    <SelectItem key={opt.value} value={String(opt.value)}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Options */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="threat-arrows" className="cursor-pointer">
                                Show threat arrows
                            </Label>
                            <Switch
                                id="threat-arrows"
                                checked={showThreatArrows}
                                onCheckedChange={setShowThreatArrows}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <Label htmlFor="classification" className="cursor-pointer">
                                Show move classification
                            </Label>
                            <Switch
                                id="classification"
                                checked={showMoveClassification}
                                onCheckedChange={setShowMoveClassification}
                            />
                        </div>
                    </div>

                    {/* Generate Button */}
                    {!shareResult && (
                        <Button
                            onClick={handleGenerateClip}
                            disabled={isLoading}
                            className="w-full"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Share2 className="mr-2 h-4 w-4" />
                                    Generate Share Clip
                                </>
                            )}
                        </Button>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {/* Result Preview */}
                    {shareResult && (
                        <div className="space-y-4">
                            {/* Preview Card */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-3">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-lg">
                                        {shareResult.preview.san}
                                    </span>
                                    {shareResult.preview.classification && (
                                        <Badge variant="secondary">
                                            {shareResult.preview.classification}
                                        </Badge>
                                    )}
                                </div>

                                {shareResult.preview.commentary && (
                                    <p className="text-sm text-slate-600 dark:text-slate-400">
                                        {shareResult.preview.commentary}
                                    </p>
                                )}

                                <div className="text-sm text-slate-500">
                                    Eval: {formatEval(shareResult.preview.eval_cp_before)} →{" "}
                                    {formatEval(shareResult.preview.eval_cp_after)}
                                </div>

                                {shareResult.status === "pending_render" && (
                                    <div className="text-xs text-amber-600 dark:text-amber-400">
                                        Image rendering in progress...
                                    </div>
                                )}
                            </div>

                            {/* Share URL */}
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={shareResult.share_url}
                                    aria-label="Share URL"
                                    className="flex-1 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 rounded-md border-none"
                                />
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={handleCopyLink}
                                    title="Copy link"
                                    aria-label="Copy link"
                                >
                                    {copied ? (
                                        <Check className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <Copy className="h-4 w-4" />
                                    )}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={handleOpenLink}
                                    title="Open in new tab"
                                    aria-label="Open link in new tab"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

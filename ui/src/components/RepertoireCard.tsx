"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Star,
  MoreVertical,
  Play,
  Edit,
  Trash2,
  Download,
  BookOpen,
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  Lightbulb,
  Plus,
  Zap,
  Clock,
  Timer,
  Circle,
  Pencil
} from 'lucide-react';
import { SavedRepertoire, SuggestedRepertoire } from '@/types/repertoire';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface RepertoireCardProps {
  repertoire: SavedRepertoire | SuggestedRepertoire;
  variant?: 'saved' | 'suggested';
  onFavorite?: (id: string, favorite: boolean) => void;
  onSave?: (repertoire: SuggestedRepertoire) => void;
  onEdit?: (repertoire: SavedRepertoire) => void;
  onDelete?: (id: string) => void;
  onPractice?: (repertoire: SavedRepertoire | SuggestedRepertoire) => void;
  onView?: (repertoire: SavedRepertoire | SuggestedRepertoire) => void;
  onAddOpening?: (repertoire: SavedRepertoire | SuggestedRepertoire) => void;
  onRename?: (repertoire: SavedRepertoire) => void;
  className?: string;
  showActions?: boolean;
}

const CATEGORY_INFO = {
  core: {
    icon: TrendingUp,
    color: 'text-green-600 bg-green-50 border-green-200',
    label: 'Core',
    description: 'Main weapons',
  },
  repair: {
    icon: AlertTriangle,
    color: 'text-red-600 bg-red-50 border-red-200',
    label: 'Repair',
    description: 'Needs attention',
  },
  expansion: {
    icon: Target,
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    label: 'Expansion',
    description: 'Promising options',
  },
  experimental: {
    icon: Lightbulb,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    label: 'Experimental',
    description: 'Under review',
  },
};

// Time control icons mapping
const TIME_CONTROL_INFO: Record<string, { icon: typeof Zap; label: string; color: string }> = {
  bullet: {
    icon: Circle,
    label: 'Bullet',
    color: 'text-red-500',
  },
  blitz: {
    icon: Zap,
    label: 'Blitz',
    color: 'text-yellow-500',
  },
  rapid: {
    icon: Clock,
    label: 'Rapid',
    color: 'text-blue-500',
  },
  classical: {
    icon: Timer,
    label: 'Classical',
    color: 'text-green-500',
  },
};

export default function RepertoireCard({
  repertoire,
  variant = 'saved',
  onFavorite,
  onSave,
  onEdit,
  onDelete,
  onPractice,
  onView,
  onAddOpening,
  onRename,
  className,
  showActions = true,
}: RepertoireCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const resolvedCategory = repertoire.category ?? 'custom';
  const categoryInfo = CATEGORY_INFO[resolvedCategory as keyof typeof CATEGORY_INFO] ?? {
    icon: TrendingUp,
    color: 'text-gray-600 bg-gray-50 border-gray-200',
    label: resolvedCategory
      ? `${resolvedCategory.charAt(0).toUpperCase()}${resolvedCategory.slice(1)}`
      : 'Repertoire',
    description: 'Custom repertoire group'
  };
  const Icon = categoryInfo.icon;
  const isSaved = variant === 'saved' && 'favorite' in repertoire;

  // Get time control info if available
  const timeControl = 'time_control' in repertoire ? (repertoire as SavedRepertoire).time_control?.toLowerCase() : null;
  const timeControlInfo = timeControl ? TIME_CONTROL_INFO[timeControl] : null;
  const TimeControlIcon = timeControlInfo?.icon;
  const isFavorite = isSaved && (repertoire as SavedRepertoire).favorite;

  const handleFavorite = async () => {
    if (!isSaved || !onFavorite) return;
    setIsLoading(true);
    try {
      await onFavorite(repertoire.id, !isFavorite);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (variant !== 'suggested' || !onSave) return;
    setIsLoading(true);
    try {
      await onSave(repertoire as SuggestedRepertoire);
      toast.success(`Repertoire "${repertoire.name}" saved successfully!`, {
        description: `${repertoire.openings.length} openings added to your collection.`,
        duration: 4000,
      });
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to save repertoire';

      // Check if it's a duplicate error (409 Conflict)
      if (errorMessage.includes('409') || errorMessage.includes('already exists')) {
        toast.error('Duplicate Repertoire', {
          description: `A repertoire with the name "${repertoire.name}" and similar openings already exists.`,
          duration: 5000,
        });
      } else {
        toast.error('Failed to save repertoire', {
          description: errorMessage,
          duration: 5000,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getWinrateColor = (winrate: number) => {
    if (winrate >= 0.6) return 'text-green-600';
    if (winrate >= 0.5) return 'text-blue-600';
    if (winrate >= 0.4) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
      className={cn("group", className)}
    >
      <Card className="hover:shadow-md transition-all duration-200 cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("p-1.5 rounded-md border", categoryInfo.color)}>
                  <Icon className="w-4 h-4" />
                </div>
                <Badge variant="outline" className="text-xs capitalize">
                  {categoryInfo.label}
                </Badge>
                {'target_bucket_type' in repertoire && (repertoire as SuggestedRepertoire).target_bucket_type && (
                  <Badge variant="secondary" className="text-xs">
                    Target: {(repertoire as SuggestedRepertoire).target_bucket_type}
                  </Badge>
                )}
                {repertoire.color !== 'both' && (
                  <Badge variant="secondary" className="text-xs">
                    {repertoire.color === 'white' ? '' : ''} {repertoire.color}
                  </Badge>
                )}
                {/* Time control icon */}
                {timeControlInfo && TimeControlIcon && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center">
                          <TimeControlIcon className={cn("w-4 h-4", timeControlInfo.color)} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <span>{timeControlInfo.label}</span>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              <CardTitle className="text-lg mb-1 group-hover:text-blue-600 transition-colors">
                {repertoire.name}
              </CardTitle>

              <p className="text-sm text-gray-500 line-clamp-2">
                {variant === 'suggested'
                  ? (repertoire as SuggestedRepertoire).description
                  : categoryInfo.description
                }
              </p>
              {'puzzles' in repertoire && (repertoire as any).puzzles && (repertoire as any).puzzles.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  {(repertoire as any).puzzles.length} attached puzzles
                </p>
              )}

              {isSaved && (
                <p className="text-xs text-gray-400 mt-1">
                  Created {formatDate((repertoire as SavedRepertoire).created_at)}
                </p>
              )}

              {variant === 'saved' && 'puzzles' in repertoire && (repertoire as SavedRepertoire).puzzles && (repertoire as SavedRepertoire).puzzles!.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500">Puzzles</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(repertoire as SavedRepertoire).puzzles!.slice(0, 3).map((puzzle) => (
                      <Badge key={puzzle.puzzle_id} variant="outline" className="text-[10px]">
                        {puzzle.mistake_type || 'Puzzle'} · {puzzle.puzzle_id.slice(0, 6)}
                      </Badge>
                    ))}
                    {(repertoire as SavedRepertoire).puzzles!.length > 3 && (
                      <Badge variant="secondary" className="text-[10px]">
                        +{(repertoire as SavedRepertoire).puzzles!.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>

            {showActions && (
              <div className="flex items-center gap-1">
                {isSaved && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleFavorite}
                    disabled={isLoading}
                    className={cn(
                      "p-1 opacity-0 group-hover:opacity-100 transition-opacity",
                      isFavorite && "opacity-100"
                    )}
                    aria-label={isFavorite ? "Remove favorite" : "Add to favorites"}
                  >
                    <Star
                      className={cn(
                        "w-4 h-4",
                        isFavorite ? "fill-yellow-400 text-yellow-400" : "text-gray-400"
                      )}
                    />
                  </Button>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Open repertoire actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onView && (
                      <DropdownMenuItem onClick={() => onView(repertoire)}>
                        <BookOpen className="w-4 h-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                    )}
                    {onPractice && (
                      <DropdownMenuItem onClick={() => onPractice(repertoire)}>
                        <Play className="w-4 h-4 mr-2" />
                        Practice
                      </DropdownMenuItem>
                    )}
                    {variant === 'suggested' && onSave && (
                      <DropdownMenuItem onClick={handleSave} disabled={isLoading}>
                        <Download className="w-4 h-4 mr-2" />
                        Save Repertoire
                      </DropdownMenuItem>
                    )}
                    {isSaved && onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(repertoire as SavedRepertoire)}>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {isSaved && onRename && (
                      <DropdownMenuItem onClick={() => onRename(repertoire as SavedRepertoire)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                    )}
                    {isSaved && onAddOpening && (
                      <DropdownMenuItem onClick={() => onAddOpening(repertoire)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Opening
                      </DropdownMenuItem>
                    )}
                    {isSaved && onDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(repertoire.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="space-y-3">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-semibold text-gray-900">{repertoire.total_games}</div>
                <div className="text-gray-500">Games</div>
              </div>
              <div>
                <div className={cn("font-semibold flex items-center gap-1", getWinrateColor(repertoire.avg_winrate))}>
                  {repertoire.avg_winrate >= 0.5 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {(repertoire.avg_winrate * 100).toFixed(1)}%
                </div>
                <div className="text-gray-500">Winrate</div>
              </div>
            </div>

            {/* ECO Codes Preview */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Openings:</div>
              <div className="flex flex-wrap gap-1">
                {repertoire.eco_codes.slice(0, 4).map((eco, idx) => (
                  <Badge key={`${eco}-${idx}`} variant="outline" className="text-xs">
                    {eco}
                  </Badge>
                ))}
                {repertoire.eco_codes.length > 4 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-xs cursor-help">
                          +{repertoire.eco_codes.length - 4} more
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="flex flex-col gap-1">
                          {repertoire.eco_codes.slice(4).map((eco) => (
                            <span key={eco} className="text-xs">{eco}</span>
                          ))}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              {variant === 'suggested' && onSave && (
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? 'Saving...' : 'Save Repertoire'}
                </Button>
              )}

              {onPractice && (
                <Button
                  variant={variant === 'suggested' ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => onPractice(repertoire)}
                  className={variant === 'suggested' ? 'flex-1' : 'w-full'}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Practice
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

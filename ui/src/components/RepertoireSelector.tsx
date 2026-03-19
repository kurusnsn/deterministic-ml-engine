"use client";

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Star,
  Filter,
  RefreshCw,
  BookOpen,
  Plus,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  Lightbulb
} from 'lucide-react';
import { SavedRepertoire } from '@/types/repertoire';
import RepertoireCard from '@/components/RepertoireCard';
import { useSavedRepertoires, useToggleFavorite, useDeleteRepertoire, useRepertoireFilters } from '@/hooks/useRepertoires';
import { cn } from '@/lib/utils';

interface RepertoireSelectorProps {
  onSelectRepertoire?: (repertoire: SavedRepertoire) => void;
  onCreateNew?: () => void;
  className?: string;
}

const CATEGORY_INFO = {
  core: { icon: TrendingUp, label: 'Core', color: 'text-green-600' },
  repair: { icon: AlertTriangle, label: 'Repair', color: 'text-red-600' },
  expansion: { icon: Target, label: 'Expansion', color: 'text-blue-600' },
  experimental: { icon: Lightbulb, label: 'Experimental', color: 'text-amber-600' },
};

export default function RepertoireSelector({
  onSelectRepertoire,
  onCreateNew,
  className,
}: RepertoireSelectorProps) {
  const [activeTab, setActiveTab] = useState('saved');

  // Use real API hooks
  const { data: repertoires = [], isLoading: loading, error: apiError, refetch } = useSavedRepertoires();
  const toggleFavoriteMutation = useToggleFavorite();
  const deleteRepertoireMutation = useDeleteRepertoire();

  // Use filter hooks
  const {
    filters: { searchTerm, categoryFilter, colorFilter, sortBy },
    setters: { setSearchTerm, setCategoryFilter, setColorFilter, setSortBy },
    applyFilters,
  } = useRepertoireFilters();

  const error = apiError ? (apiError as Error).message : null;

  // Filter and sort repertoires
  const filteredRepertoires = useMemo(() => {
    return applyFilters(repertoires);
  }, [repertoires, applyFilters]);

  // Separate favorites
  const favoriteRepertoires = filteredRepertoires.filter(rep => rep.favorite);

  const handleFavoriteToggle = async (id: string, favorite: boolean) => {
    try {
      await toggleFavoriteMutation.mutateAsync({ id, favorite });
    } catch (err) {
      console.error('Failed to update favorite status:', err);
    }
  };

  const handleDeleteRepertoire = async (id: string) => {
    try {
      await deleteRepertoireMutation.mutateAsync(id);
    } catch (err) {
      console.error('Failed to delete repertoire:', err);
    }
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Select Repertoire
              </CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Choose a saved repertoire to practice, or create a new one
              </p>
            </div>
            {onCreateNew && (
              <Button onClick={onCreateNew} variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Create New
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="flex items-center gap-2 flex-1 min-w-64">
              <Label htmlFor="repertoire-search" id="repertoire-search-label" className="sr-only">
                Search repertoires
              </Label>
              <Search className="w-4 h-4 text-gray-400" />
              <Input
                id="repertoire-search"
                aria-labelledby="repertoire-search-label"
                placeholder="Search repertoires..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8"
              />
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <Label>Category:</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {Object.entries(CATEGORY_INFO).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      {info.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Color Filter */}
            <div className="flex items-center gap-2">
              <Label>Color:</Label>
              <Select value={colorFilter} onValueChange={setColorFilter}>
                <SelectTrigger className="w-24 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="white"> White</SelectItem>
                  <SelectItem value="black"> Black</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <Label>Sort:</Label>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as any)}>
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created">Recent</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="winrate">Winrate</SelectItem>
                  <SelectItem value="games">Games</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Refresh */}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="saved" className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            All Repertoires ({filteredRepertoires.length})
          </TabsTrigger>
          <TabsTrigger value="favorites" className="flex items-center gap-2">
            <Star className="w-4 h-4" />
            Favorites ({favoriteRepertoires.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="saved" className="space-y-4">
          <AnimatePresence>
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-4">
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded mb-4 w-2/3"></div>
                      <div className="flex justify-between">
                        <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : error ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <p className="text-red-500 mb-4">{error}</p>
                  <Button variant="outline" onClick={loadRepertoires}>
                    Try Again
                  </Button>
                </CardContent>
              </Card>
            ) : filteredRepertoires.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">No Repertoires Found</h3>
                  <p className="text-gray-500 mb-4">
                    {searchTerm || categoryFilter !== 'all' || colorFilter !== 'all'
                      ? 'No repertoires match your current filters.'
                      : 'You haven\'t saved any repertoires yet. Generate a report and save suggested repertoires.'
                    }
                  </p>
                  {onCreateNew && (
                    <Button onClick={onCreateNew}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Repertoire
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRepertoires.map((repertoire) => (
                  <RepertoireCard
                    key={repertoire.id}
                    repertoire={repertoire}
                    variant="saved"
                    onFavorite={handleFavoriteToggle}
                    onDelete={handleDeleteRepertoire}
                    onPractice={onSelectRepertoire}
                    showActions={true}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="favorites" className="space-y-4">
          <AnimatePresence>
            {favoriteRepertoires.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Star className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">No Favorite Repertoires</h3>
                  <p className="text-gray-500 mb-4">
                    Star your favorite repertoires for quick access.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {favoriteRepertoires.map((repertoire) => (
                  <RepertoireCard
                    key={repertoire.id}
                    repertoire={repertoire}
                    variant="saved"
                    onFavorite={handleFavoriteToggle}
                    onDelete={handleDeleteRepertoire}
                    onPractice={onSelectRepertoire}
                    showActions={true}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
        </TabsContent>
      </Tabs>
    </div>
  );
}

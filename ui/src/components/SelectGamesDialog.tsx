"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Users,
  Calendar,
  Gamepad2,
  AlertCircle,
  CheckCircle,
  Hash,
  Trophy
} from 'lucide-react';
import { LogoSpinner } from '@/components/ui/LogoSpinner';
import { getClientAuthHeaders } from '@/lib/auth';

interface GameData {
  username: string;
  platform: string;
  gameCount: number;
  lastGame: string;
  winrate: number;
  isLinked: boolean;
}

interface SelectGamesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedUsernames: string[]) => void;
  linkedAccounts: { platform: string; username: string }[];
  availableUsernames: string[];
}

export default function SelectGamesDialog({
  isOpen,
  onClose,
  onConfirm,
  linkedAccounts,
  availableUsernames
}: SelectGamesDialogProps) {
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(new Set());
  const [gameData, setGameData] = useState<GameData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset selection when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      // Auto-select linked accounts by default
      const linkedUsernames = linkedAccounts.map(acc => acc.username);
      setSelectedUsernames(new Set(linkedUsernames));
      loadGameData();
    } else {
      setSelectedUsernames(new Set());
      setGameData([]);
      setError(null);
    }
  }, [isOpen, linkedAccounts]);

  const loadGameData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway';

      // Get auth headers
      const headers = await getClientAuthHeaders();

      // Fetch game statistics for each username
      const gameDataPromises = availableUsernames.map(async (username) => {
        try {
          // Try to get basic opening stats for this username
          const response = await fetch(
            `${GATEWAY_URL}/analysis/openings?min_games=1&username=${encodeURIComponent(username)}`,
            { headers }
          );

          if (response.ok) {
            const data = await response.json();
            const isLinked = linkedAccounts.some(acc => acc.username === username);
            const platform = linkedAccounts.find(acc => acc.username === username)?.platform || 'unknown';

            return {
              username,
              platform,
              gameCount: data.total_games || 0,
              lastGame: new Date().toISOString(), // Default, could be improved
              winrate: 0.5, // Default, could be calculated from data
              isLinked
            };
          }

          // If API fails, create basic entry
          const isLinked = linkedAccounts.some(acc => acc.username === username);
          const platform = linkedAccounts.find(acc => acc.username === username)?.platform || 'unknown';

          return {
            username,
            platform,
            gameCount: 0,
            lastGame: new Date().toISOString(),
            winrate: 0.5,
            isLinked
          };
        } catch (err) {
          // Return basic data if individual request fails
          const isLinked = linkedAccounts.some(acc => acc.username === username);
          const platform = linkedAccounts.find(acc => acc.username === username)?.platform || 'unknown';

          return {
            username,
            platform,
            gameCount: 0,
            lastGame: new Date().toISOString(),
            winrate: 0.5,
            isLinked
          };
        }
      });

      const results = await Promise.all(gameDataPromises);

      // Sort: linked accounts first, then by game count
      results.sort((a, b) => {
        if (a.isLinked && !b.isLinked) return -1;
        if (!a.isLinked && b.isLinked) return 1;
        return b.gameCount - a.gameCount;
      });

      setGameData(results);
    } catch (err: any) {
      console.error('Failed to load game data:', err);
      setError('Failed to load game statistics');

      // Create fallback data from available usernames
      const fallbackData = availableUsernames.map(username => {
        const isLinked = linkedAccounts.some(acc => acc.username === username);
        const platform = linkedAccounts.find(acc => acc.username === username)?.platform || 'unknown';

        return {
          username,
          platform,
          gameCount: 0,
          lastGame: new Date().toISOString(),
          winrate: 0.5,
          isLinked
        };
      });

      setGameData(fallbackData);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleUsername = (username: string) => {
    const newSelected = new Set(selectedUsernames);
    if (newSelected.has(username)) {
      newSelected.delete(username);
    } else {
      newSelected.add(username);
    }
    setSelectedUsernames(newSelected);
  };

  const selectAll = () => {
    setSelectedUsernames(new Set(availableUsernames));
  };

  const selectLinkedOnly = () => {
    const linkedUsernames = linkedAccounts.map(acc => acc.username);
    setSelectedUsernames(new Set(linkedUsernames));
  };

  const clearSelection = () => {
    setSelectedUsernames(new Set());
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selectedUsernames));
    onClose();
  };

  const totalSelectedGames = gameData
    .filter(data => selectedUsernames.has(data.username))
    .reduce((sum, data) => sum + data.gameCount, 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Select Games for Analysis
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-hidden">
          {/* Selection Summary */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-muted-foreground">Total Games:</span>
                    <Badge variant="secondary">{totalSelectedGames}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-muted-foreground">Players:</span>
                    <Badge variant="secondary">{selectedUsernames.size}</Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectLinkedOnly}>
                    My Accounts
                  </Button>
                  <Button variant="ghost" size="sm" onClick={selectAll}>
                    All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <LogoSpinner size="lg" className="mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading game statistics...</p>
              </div>
            </div>
          )}

          {/* Player List */}
          {!isLoading && gameData.length > 0 && (
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-2">
                {gameData.map((data) => (
                  <Card key={data.username} className={`cursor-pointer transition-colors ${selectedUsernames.has(data.username)
                      ? 'ring-2 ring-blue-500 bg-blue-50/50'
                      : 'hover:bg-gray-50'
                    }`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedUsernames.has(data.username)}
                            onCheckedChange={() => toggleUsername(data.username)}
                          />
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{data.username}</span>
                              {data.isLinked && (
                                <Badge variant="default" className="text-xs">
                                  My Account
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {data.platform}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                              <div className="flex items-center gap-1">
                                <Gamepad2 className="w-3 h-3" />
                                {data.gameCount} games
                              </div>
                              {data.gameCount > 0 && (
                                <div className="flex items-center gap-1">
                                  <Trophy className="w-3 h-3" />
                                  {(data.winrate * 100).toFixed(0)}% win rate
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {data.gameCount === 0 && (
                          <AlertCircle className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* No Data State */}
          {!isLoading && gameData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Gamepad2 className="w-12 h-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-600 mb-2">No Games Found</h3>
              <p className="text-gray-500 mb-4">
                Import some games first to generate analysis reports.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {selectedUsernames.size > 0
              ? `${totalSelectedGames} games from ${selectedUsernames.size} players selected`
              : 'No players selected'
            }
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={selectedUsernames.size === 0 || totalSelectedGames < 3}
            >
              {totalSelectedGames < 3
                ? 'Need at least 3 games'
                : 'Generate Analysis'
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

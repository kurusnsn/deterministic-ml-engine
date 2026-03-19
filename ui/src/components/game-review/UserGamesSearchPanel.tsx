"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, AlertCircle, X, Clock, User, History, Link } from 'lucide-react';
import { getSessionId } from '@/lib/session';

export interface GameInfo {
    id: string;
    url: string;
    pgn: string;
    timeControl: string;
    result: string;
    resultColor: 'win' | 'loss' | 'draw';
    date: string;
    moves: number;
    white: string;
    black: string;
    whiteRating?: number;
    blackRating?: number;
    perspectiveUsername?: string;
}

interface SearchedUser {
    username: string;
    platform: 'lichess' | 'chesscom';
    games: GameInfo[];
    searchedAt: number;
}

interface LinkedAccount {
    platform: 'lichess' | 'chesscom';
    username: string;
}

interface UserGamesSearchPanelProps {
    onSelectGame: (
        pgn: string,
        url: string,
        selectedUser?: { username: string; platform: 'lichess' | 'chesscom' }
    ) => void;
}

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "/api/gateway";

// Max number of user tabs to keep
const MAX_USER_TABS = 5;
const MAX_RECENT_GAMES = 10;

// localStorage keys
const STORAGE_KEY_USERS = 'game-review-searched-users';
const STORAGE_KEY_RECENT = 'game-review-recent-games';

export function UserGamesSearchPanel({ onSelectGame }: UserGamesSearchPanelProps) {
    const [platform, setPlatform] = useState<'lichess' | 'chesscom'>('lichess');
    const [username, setUsername] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Tabs state: searched users and their games
    const [searchedUsers, setSearchedUsers] = useState<SearchedUser[]>([]);
    const [activeTab, setActiveTab] = useState<'search' | 'recent' | 'history' | string>('search');

    // Recent games (games selected from any user)
    const [recentGames, setRecentGames] = useState<GameInfo[]>([]);
    const [timeControlFilter, setTimeControlFilter] = useState('all');
    const [sideFilter, setSideFilter] = useState<'all' | 'white' | 'black'>('all');
    const [hasHydratedStorage, setHasHydratedStorage] = useState(false);

    // Linked accounts from user profile
    const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
    const [linkedAccountsLoading, setLinkedAccountsLoading] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const storedUsers = localStorage.getItem(STORAGE_KEY_USERS);
            const storedRecent = localStorage.getItem(STORAGE_KEY_RECENT);

            if (storedUsers) {
                const parsed = JSON.parse(storedUsers);
                if (Array.isArray(parsed)) {
                    setSearchedUsers(parsed.slice(0, MAX_USER_TABS));
                }
            }
            if (storedRecent) {
                const parsed = JSON.parse(storedRecent);
                if (Array.isArray(parsed)) {
                    setRecentGames(parsed.slice(0, MAX_RECENT_GAMES));
                }
            }
        } catch (e) {
            console.error('Failed to load search history from localStorage', e);
        } finally {
            setHasHydratedStorage(true);
        }
    }, []);

    // Save to localStorage when searchedUsers changes
    useEffect(() => {
        if (!hasHydratedStorage) return;
        try {
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(searchedUsers));
        } catch (e) {
            console.error('Failed to save search history to localStorage', e);
        }
    }, [searchedUsers, hasHydratedStorage]);

    // Save to localStorage when recentGames changes
    useEffect(() => {
        if (!hasHydratedStorage) return;
        try {
            localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(recentGames));
        } catch (e) {
            console.error('Failed to save recent games to localStorage', e);
        }
    }, [recentGames, hasHydratedStorage]);

    // Fetch linked accounts from profile API
    useEffect(() => {
        const fetchLinkedAccounts = async () => {
            setLinkedAccountsLoading(true);
            try {
                const headers: Record<string, string> = {};
                const sid = getSessionId();
                if (sid) headers["x-session-id"] = sid;

                const resp = await fetch(`${GATEWAY_URL}/api/me/home?include_profile=true`, { headers });
                if (resp.ok) {
                    const data = await resp.json();
                    const accounts: LinkedAccount[] = [];

                    // Extract from linked_accounts object
                    if (data.linked_accounts?.lichess?.connected && data.linked_accounts.lichess.username) {
                        accounts.push({
                            platform: 'lichess',
                            username: data.linked_accounts.lichess.username
                        });
                    }
                    if (data.linked_accounts?.chesscom?.connected && data.linked_accounts.chesscom.username) {
                        accounts.push({
                            platform: 'chesscom',
                            username: data.linked_accounts.chesscom.username
                        });
                    }

                    // Also check linked_accounts_list if available
                    if (data.linked_accounts_list?.length) {
                        for (const acc of data.linked_accounts_list) {
                            const plat = acc.platform === 'lichess.org' ? 'lichess' :
                                        acc.platform === 'chess.com' ? 'chesscom' : null;
                            if (plat && !accounts.some(a => a.platform === plat && a.username === acc.username)) {
                                accounts.push({ platform: plat, username: acc.username });
                            }
                        }
                    }

                    setLinkedAccounts(accounts);
                }
            } catch (e) {
                console.error('Failed to fetch linked accounts', e);
            } finally {
                setLinkedAccountsLoading(false);
            }
        };

        fetchLinkedAccounts();
    }, []);

    const fetchLichessGames = async (user: string): Promise<GameInfo[]> => {
        const response = await fetch(
            `https://lichess.org/api/games/user/${user}?max=20&pgnInJson=true`,
            { headers: { Accept: 'application/x-ndjson' } }
        );

        if (!response.ok) {
            if (response.status === 404) throw new Error('User not found on Lichess');
            throw new Error(`Lichess API error: ${response.statusText}`);
        }

        const text = await response.text();
        const lines = text.split('\n').filter(line => line.trim());

        return lines.map(line => {
            const game = JSON.parse(line);
            const isWhite = game.players?.white?.user?.name?.toLowerCase() === user.toLowerCase();

            // Determine result color based on game.winner and which color the user played
            let resultColor: 'win' | 'loss' | 'draw' = 'draw';
            if (game.winner) {
                // There's a winner
                const userWon = (isWhite && game.winner === 'white') || (!isWhite && game.winner === 'black');
                resultColor = userWon ? 'win' : 'loss';
            }
            // If no winner, it's a draw (resultColor already set to 'draw')

            const whitePlayer = game.players?.white?.user?.name || 'Anonymous';
            const blackPlayer = game.players?.black?.user?.name || 'Anonymous';

            return {
                id: game.id,
                url: `https://lichess.org/${game.id}`,
                pgn: game.pgn || '',
                timeControl: game.perf || game.speed || 'unknown',
                result: game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : '½-½',
                resultColor,
                date: game.createdAt ? new Date(game.createdAt).toLocaleDateString() : 'Unknown',
                moves: game.moves ? game.moves.split(' ').length : 0,
                white: whitePlayer,
                black: blackPlayer,
                whiteRating: game.players?.white?.rating,
                blackRating: game.players?.black?.rating,
            };
        });
    };

    const fetchChessComGames = async (user: string): Promise<GameInfo[]> => {
        const archivesRes = await fetch(`${GATEWAY_URL}/external/chesscom/player/${user}/archives`);
        if (!archivesRes.ok) {
            if (archivesRes.status === 404) throw new Error('User not found on Chess.com');
            throw new Error(`Chess.com API error: ${archivesRes.statusText}`);
        }

        const archivesData = await archivesRes.json();
        const archives = archivesData.archives || [];

        if (archives.length === 0) {
            throw new Error('No games found for this user');
        }

        const allGames: GameInfo[] = [];
        for (let i = archives.length - 1; i >= 0 && allGames.length < 20; i--) {
            const proxyUrl = `${GATEWAY_URL}/external/chesscom/proxy?url=${encodeURIComponent(archives[i])}`;
            const gamesRes = await fetch(proxyUrl);
            if (!gamesRes.ok) continue;

            const gamesData = await gamesRes.json();
            const games = (gamesData.games || []).reverse();

            for (const game of games) {
                if (allGames.length >= 20) break;

                const isWhite = game.white?.username?.toLowerCase() === user.toLowerCase();
                const playerResult = isWhite ? game.white?.result : game.black?.result;

                let resultColor: 'win' | 'loss' | 'draw' = 'draw';
                if (playerResult === 'win') resultColor = 'win';
                else if (['checkmated', 'timeout', 'resigned', 'abandoned', 'lose'].includes(playerResult)) resultColor = 'loss';

                const timeControl = game.time_class || 'unknown';
                let result = '½-½';
                if (game.white?.result === 'win') result = '1-0';
                else if (game.black?.result === 'win') result = '0-1';

                const pgnMoves = game.pgn?.match(/\d+\.\s/g);
                const moveCount = pgnMoves ? pgnMoves.length : 0;

                allGames.push({
                    id: game.uuid || game.url?.split('/').pop() || String(Date.now()),
                    url: game.url || '',
                    pgn: game.pgn || '',
                    timeControl,
                    result,
                    resultColor,
                    date: game.end_time ? new Date(game.end_time * 1000).toLocaleDateString() : 'Unknown',
                    moves: moveCount,
                    white: game.white?.username || 'Unknown',
                    black: game.black?.username || 'Unknown',
                    whiteRating: game.white?.rating,
                    blackRating: game.black?.rating,
                });
            }
        }

        return allGames;
    };

    const handleSearch = async () => {
        if (!username.trim()) {
            setError('Please enter a username');
            return;
        }

        const trimmedUsername = username.trim();

        // Check if we already have this user cached
        const existingUser = searchedUsers.find(
            u => u.username.toLowerCase() === trimmedUsername.toLowerCase() && u.platform === platform
        );

        if (existingUser) {
            // Just switch to their tab
            setActiveTab(`${existingUser.platform}:${existingUser.username}`);
            setError(null);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const fetchedGames = platform === 'lichess'
                ? await fetchLichessGames(trimmedUsername)
                : await fetchChessComGames(trimmedUsername);

            if (fetchedGames.length === 0) {
                setError('No games found for this user');
                return;
            }

            // Add to searched users
            const newUser: SearchedUser = {
                username: trimmedUsername,
                platform,
                games: fetchedGames,
                searchedAt: Date.now(),
            };

            setSearchedUsers(prev => {
                const updated = [newUser, ...prev.filter(
                    u => !(u.username.toLowerCase() === trimmedUsername.toLowerCase() && u.platform === platform)
                )].slice(0, MAX_USER_TABS);
                return updated;
            });

            // Switch to new user's tab
            setActiveTab(`${platform}:${trimmedUsername}`);
            setUsername('');
        } catch (err: any) {
            setError(err.message || 'Failed to fetch games');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGameSelect = useCallback((game: GameInfo) => {
        const selectedUser = searchedUsers.find(u => `${u.platform}:${u.username}` === activeTab);
        const gameWithPerspective = selectedUser
            ? { ...game, perspectiveUsername: selectedUser.username }
            : game;

        // Add to recent games
        setRecentGames(prev => {
            const filtered = prev.filter(g => g.id !== game.id);
            return [gameWithPerspective, ...filtered].slice(0, MAX_RECENT_GAMES);
        });

        // Call the parent handler
        onSelectGame(game.pgn, game.url, selectedUser ? {
            username: selectedUser.username,
            platform: selectedUser.platform,
        } : undefined);
    }, [activeTab, onSelectGame, searchedUsers]);

    const removeUserTab = (userKey: string) => {
        setSearchedUsers(prev => prev.filter(u => `${u.platform}:${u.username}` !== userKey));
        if (activeTab === userKey) {
            setActiveTab('search');
        }
    };

    // Search for a user from history or linked accounts
    const searchFromHistory = async (historyPlatform: 'lichess' | 'chesscom', historyUsername: string) => {
        // Check if already cached
        const existingUser = searchedUsers.find(
            u => u.username.toLowerCase() === historyUsername.toLowerCase() && u.platform === historyPlatform
        );

        if (existingUser) {
            setActiveTab(`${existingUser.platform}:${existingUser.username}`);
            return;
        }

        // Fetch games for this user
        setIsLoading(true);
        setError(null);

        try {
            const fetchedGames = historyPlatform === 'lichess'
                ? await fetchLichessGames(historyUsername)
                : await fetchChessComGames(historyUsername);

            if (fetchedGames.length === 0) {
                setError('No games found for this user');
                return;
            }

            const newUser: SearchedUser = {
                username: historyUsername,
                platform: historyPlatform,
                games: fetchedGames,
                searchedAt: Date.now(),
            };

            setSearchedUsers(prev => {
                const updated = [newUser, ...prev.filter(
                    u => !(u.username.toLowerCase() === historyUsername.toLowerCase() && u.platform === historyPlatform)
                )].slice(0, MAX_USER_TABS);
                return updated;
            });

            setActiveTab(`${historyPlatform}:${historyUsername}`);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch games');
        } finally {
            setIsLoading(false);
        }
    };

    const getResultBadgeClass = (resultColor: 'win' | 'loss' | 'draw') => {
        switch (resultColor) {
            // Monochrome styling: solid black for win, outline for loss, muted for draw
            case 'win': return 'bg-black text-white dark:bg-white dark:text-black';
            case 'loss': return 'border border-black text-black dark:border-white dark:text-white bg-transparent';
            case 'draw': return 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
        }
    };

    const normalizeTimeControl = (timeControl: string) => {
        const normalized = (timeControl || '').trim().toLowerCase();
        if (!normalized) return 'unknown';
        if (normalized === 'ultrabullet' || normalized === 'ultra bullet') return 'ultrabullet';
        return normalized;
    };

    const getTimeControlLabel = (tc: string) => {
        // Monochrome labels - no colored emojis
        const labels: Record<string, string> = {
            bullet: '• Bullet',
            blitz: '• Blitz',
            rapid: '• Rapid',
            classical: '• Classical',
            correspondence: '• Correspondence',
            daily: '• Daily',
            ultrabullet: '• UltraBullet',
            unknown: '• Unknown',
        };
        const normalized = normalizeTimeControl(tc);
        return labels[normalized] || tc;
    };

    const renderGamesList = (games: GameInfo[]) => (
        <ScrollArea className="h-[280px] rounded-md border border-border">
            <div className="divide-y divide-border">
                {games.map((game) => (
                    <button
                        key={game.id}
                        onClick={() => handleGameSelect(game)}
                        className="w-full p-3 text-left hover:bg-muted transition-colors"
                        data-testid={`game-item-${game.id}`}
                    >
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-muted-foreground">
                                {getTimeControlLabel(game.timeControl)}
                            </span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${getResultBadgeClass(game.resultColor)}`}>
                                {game.resultColor === 'win' ? 'Won' : game.resultColor === 'loss' ? 'Lost' : 'Draw'}
                            </span>
                        </div>
                        <div className="text-sm font-medium text-foreground">
                            {game.white} {game.whiteRating ? `(${game.whiteRating})` : ''} vs {game.black} {game.blackRating ? `(${game.blackRating})` : ''}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{game.date}</span>
                            <span>{game.moves} moves</span>
                            <span>{game.result}</span>
                        </div>
                    </button>
                ))}
            </div>
        </ScrollArea>
    );

    // Get current games to display based on active tab
    const getCurrentGames = (): GameInfo[] => {
        if (activeTab === 'recent') return recentGames;
        const user = searchedUsers.find(u => `${u.platform}:${u.username}` === activeTab);
        return user?.games || [];
    };

    const currentGames = getCurrentGames();
    const activeUser = activeTab === 'recent'
        ? null
        : searchedUsers.find(u => `${u.platform}:${u.username}` === activeTab) || null;
    const activeUsername = activeUser?.username || null;

    const timeControlOrder = ['bullet', 'blitz', 'rapid', 'classical', 'daily', 'correspondence', 'ultrabullet', 'unknown'];
    const timeControlCounts = currentGames.reduce<Record<string, number>>((acc, game) => {
        const key = normalizeTimeControl(game.timeControl);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const getPerspectiveUsernameForGame = (game: GameInfo) => {
        if (activeTab === 'recent') return game.perspectiveUsername || null;
        return activeUsername;
    };

    const getPerspectiveSideForGame = (game: GameInfo): 'white' | 'black' | null => {
        const perspectiveUsername = getPerspectiveUsernameForGame(game);
        if (!perspectiveUsername) return null;
        const normalizedPerspective = perspectiveUsername.trim().toLowerCase();
        if (game.white?.trim().toLowerCase() === normalizedPerspective) return 'white';
        if (game.black?.trim().toLowerCase() === normalizedPerspective) return 'black';
        return null;
    };

    const sideCounts = currentGames.reduce<{ white: number; black: number }>((acc, game) => {
        const side = getPerspectiveSideForGame(game);
        if (side === 'white') acc.white += 1;
        if (side === 'black') acc.black += 1;
        return acc;
    }, { white: 0, black: 0 });

    const availableTimeControls = Object.keys(timeControlCounts).sort((a, b) => {
        const indexA = timeControlOrder.indexOf(a);
        const indexB = timeControlOrder.indexOf(b);
        const fallbackA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
        const fallbackB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
        return fallbackA - fallbackB;
    });

    const filteredGames = currentGames.filter((game) => {
        const matchesTimeControl = timeControlFilter === 'all'
            || normalizeTimeControl(game.timeControl) === timeControlFilter;
        const matchesSide = sideFilter === 'all'
            || getPerspectiveSideForGame(game) === sideFilter;
        return matchesTimeControl && matchesSide;
    });

    useEffect(() => {
        setTimeControlFilter('all');
        setSideFilter('all');
    }, [activeTab]);

    return (
        <div className="space-y-3 pt-4">
            {/* Tab Navigation */}
            <div className="flex gap-1 overflow-x-auto pb-1">
                <button
                    onClick={() => setActiveTab('search')}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${activeTab === 'search'
                            ? 'bg-black text-white dark:bg-white dark:text-black'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                    data-testid="tab-search"
                >
                    <Search className="w-3 h-3" />
                    Search
                </button>

                {recentGames.length > 0 && (
                    <button
                        onClick={() => setActiveTab('recent')}
                        className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${activeTab === 'recent'
                                ? 'bg-black text-white dark:bg-white dark:text-black'
                                : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                        data-testid="tab-recent"
                    >
                        <Clock className="w-3 h-3" />
                        Recent ({recentGames.length})
                    </button>
                )}

                <button
                    onClick={() => setActiveTab('history')}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${activeTab === 'history'
                            ? 'bg-black text-white dark:bg-white dark:text-black'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                    data-testid="tab-history"
                >
                    <History className="w-3 h-3" />
                    History
                </button>

                {searchedUsers.map((user) => {
                    const key = `${user.platform}:${user.username}`;
                    return (
                        <div key={key} className="flex items-center">
                            <button
                                onClick={() => setActiveTab(key)}
                                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-l-md transition-colors whitespace-nowrap ${activeTab === key
                                        ? 'bg-black text-white dark:bg-white dark:text-black'
                                        : 'bg-muted text-muted-foreground hover:text-foreground'
                                    }`}
                                data-testid={`tab-${key}`}
                            >
                                <User className="w-3 h-3" />
                                {user.username}
                                <span className="text-[10px] opacity-70">
                                    ({user.platform === 'lichess' ? 'L' : 'C'})
                                </span>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeUserTab(key);
                                }}
                                className={`px-1.5 py-1.5 text-xs rounded-r-md transition-colors ${activeTab === key
                                        ? 'bg-black text-white dark:bg-white dark:text-black hover:opacity-80'
                                        : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                                    }`}
                                data-testid={`close-tab-${key}`}
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Search Tab Content */}
            {activeTab === 'search' && (
                <>
                    {/* Platform Toggle */}
                    <div className="flex gap-2 p-1 bg-muted rounded-lg">
                        <button
                            onClick={() => setPlatform('lichess')}
                            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${platform === 'lichess'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                            data-testid="platform-lichess"
                        >
                            Lichess
                        </button>
                        <button
                            onClick={() => setPlatform('chesscom')}
                            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${platform === 'chesscom'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                            data-testid="platform-chesscom"
                        >
                            Chess.com
                        </button>
                    </div>

                    {/* Username Search */}
                    <div className="flex gap-2">
                        <Label htmlFor="user-games-username" id="user-games-username-label" className="sr-only">
                            Username
                        </Label>
                        <Input
                            id="user-games-username"
                            aria-labelledby="user-games-username-label"
                            aria-describedby={error ? "user-games-error" : undefined}
                            placeholder={`Enter ${platform === 'lichess' ? 'Lichess' : 'Chess.com'} username`}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="flex-1"
                            data-testid="username-input"
                        />
                        <Button
                            onClick={handleSearch}
                            disabled={isLoading}
                            data-testid="search-button"
                            aria-label="Search games"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        </Button>
                    </div>

                    {/* Error Message - Monochrome */}
                    {error && (
                        <div
                            id="user-games-error"
                            role="alert"
                            className="flex items-center gap-2 p-3 text-sm text-foreground bg-muted border border-border rounded-lg"
                            data-testid="error-message"
                        >
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* Loading placeholder */}
                    {isLoading && (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Fetching games...
                        </div>
                    )}

                    {/* Empty state */}
                    {!isLoading && !error && searchedUsers.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            Search for a username to see their recent games
                        </div>
                    )}
                </>
            )}

            {/* History Tab Content */}
            {activeTab === 'history' && (
                <div className="space-y-4">
                    {/* Linked Accounts Section */}
                    {linkedAccountsLoading ? (
                        <div className="flex items-center justify-center py-4 text-muted-foreground">
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Loading linked accounts...
                        </div>
                    ) : linkedAccounts.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Link className="w-4 h-4 text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Linked Accounts
                                </span>
                            </div>
                            <div className="space-y-1">
                                {linkedAccounts.map((account) => (
                                    <button
                                        key={`${account.platform}:${account.username}`}
                                        onClick={() => searchFromHistory(account.platform, account.username)}
                                        disabled={isLoading}
                                        className="w-full flex items-center gap-3 p-3 text-left rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
                                        data-testid={`linked-account-${account.platform}-${account.username}`}
                                    >
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
                                            <User className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm truncate">{account.username}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {account.platform === 'lichess' ? 'Lichess' : 'Chess.com'}
                                            </div>
                                        </div>
                                        <Search className="w-4 h-4 text-muted-foreground" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Search History Section */}
                    {searchedUsers.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <History className="w-4 h-4 text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Search History
                                </span>
                            </div>
                            <div className="space-y-1">
                                {searchedUsers.map((user) => (
                                    <button
                                        key={`history-${user.platform}:${user.username}`}
                                        onClick={() => setActiveTab(`${user.platform}:${user.username}`)}
                                        className="w-full flex items-center gap-3 p-3 text-left rounded-lg border border-border hover:bg-muted transition-colors"
                                        data-testid={`history-${user.platform}-${user.username}`}
                                    >
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
                                            <User className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm truncate">{user.username}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {user.platform === 'lichess' ? 'Lichess' : 'Chess.com'} · {user.games.length} games
                                            </div>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(user.searchedAt).toLocaleDateString()}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Empty State */}
                    {linkedAccounts.length === 0 && searchedUsers.length === 0 && !linkedAccountsLoading && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            <p>No search history yet</p>
                            <p className="mt-1 text-xs">Link accounts in your profile or search for a username</p>
                        </div>
                    )}

                    {/* Loading indicator when fetching games from history */}
                    {isLoading && (
                        <div className="flex items-center justify-center py-4 text-muted-foreground">
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Fetching games...
                        </div>
                    )}

                    {/* Error message */}
                    {error && (
                        <div
                            role="alert"
                            className="flex items-center gap-2 p-3 text-sm text-foreground bg-muted border border-border rounded-lg"
                        >
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}
                </div>
            )}

            {/* Recent/User Games Tab Content */}
            {activeTab !== 'search' && activeTab !== 'history' && (
                <>
                    {currentGames.length > 0 ? (
                        <>
                            <div className="space-y-2">
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Filter by time control
                                </div>
                                <div className="flex flex-wrap gap-1.5" data-testid="time-control-filters">
                                    <button
                                        onClick={() => setTimeControlFilter('all')}
                                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${timeControlFilter === 'all'
                                                ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                                                : 'bg-background text-muted-foreground border-border hover:text-foreground'
                                            }`}
                                        data-testid="tc-filter-all"
                                    >
                                        All ({currentGames.length})
                                    </button>
                                    {availableTimeControls.map((tc) => (
                                        <button
                                            key={tc}
                                            onClick={() => setTimeControlFilter(tc)}
                                            className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${timeControlFilter === tc
                                                    ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                                                    : 'bg-background text-muted-foreground border-border hover:text-foreground'
                                                }`}
                                            data-testid={`tc-filter-${tc}`}
                                        >
                                            {getTimeControlLabel(tc).replace('• ', '')} ({timeControlCounts[tc]})
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Filter by side
                                </div>
                                <div className="flex flex-wrap gap-1.5" data-testid="side-filters">
                                    <button
                                        onClick={() => setSideFilter('all')}
                                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${sideFilter === 'all'
                                                ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                                                : 'bg-background text-muted-foreground border-border hover:text-foreground'
                                            }`}
                                        data-testid="side-filter-all"
                                    >
                                        All ({currentGames.length})
                                    </button>
                                    <button
                                        onClick={() => setSideFilter('white')}
                                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${sideFilter === 'white'
                                                ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                                                : 'bg-background text-muted-foreground border-border hover:text-foreground'
                                            }`}
                                        data-testid="side-filter-white"
                                        disabled={sideCounts.white === 0}
                                    >
                                        White ({sideCounts.white})
                                    </button>
                                    <button
                                        onClick={() => setSideFilter('black')}
                                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${sideFilter === 'black'
                                                ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                                                : 'bg-background text-muted-foreground border-border hover:text-foreground'
                                            }`}
                                        data-testid="side-filter-black"
                                        disabled={sideCounts.black === 0}
                                    >
                                        Black ({sideCounts.black})
                                    </button>
                                </div>
                            </div>

                            {filteredGames.length > 0 ? (
                                renderGamesList(filteredGames)
                            ) : (
                                <div className="text-center py-8 text-muted-foreground text-sm border rounded-md">
                                    No games match the selected time control
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            No games to display
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

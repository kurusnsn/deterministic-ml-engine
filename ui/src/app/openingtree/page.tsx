"use client";

// Force dynamic rendering for pages using useSearchParams
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ImportBoard from '@/components/ImportBoard';
import { Chess } from 'chess.js'; // For game logic
import { useImportStream } from '@/app/hooks/useImportStream';
import { MoveStat } from '@/app/hooks/useOpeningGraph';
import GameCounter from '@/components/GameCounter';
import StopButton from '@/components/StopButton';
import MovesTable from '@/components/MovesTable';
import ResultsTable from '@/components/ResultsTable';
import { Square } from 'chess.js';
import SidebarSection from '@/components/SidebarSection';
import useSound from 'use-sound';
import { usePositionStats } from '@/app/hooks/usePositionStats';
import GameModal from '@/components/GameModal';
import { useOpeningBookCache } from '@/app/hooks/useOpeningBookCache';
import { getSessionId } from '@/lib/session';
import { getClientAuthHeaders } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkipBack, SkipForward, RotateCw, User, Zap, List, BookOpen, Settings, ChevronDown, ChevronUp, Loader2, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import MoveHistoryBox from '@/components/MoveHistoryBox';
import { LogoSpinner } from '@/components/ui/LogoSpinner';

// Main App component
const UploadGames = () => {
  // Gateway base URL and streaming worker ref
  const GATEWAY_URL = (process.env.NEXT_PUBLIC_GATEWAY_URL as string) ?? '/api/gateway';

  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('return');
  const importUrl = searchParams.get('url'); // Get URL from query param
  const reportId = searchParams.get('reportId'); // Report ID for filtering games

  // State for sidebar section visibility
  const [showSelectSource, setShowSelectSource] = useState(true);
  const [showPlayerDetails, setShowPlayerDetails] = useState(false);
  const [showColorFilters, setShowColorFilters] = useState(false); // Start collapsed

  // Multi-step flow state
  const [step1Complete, setStep1Complete] = useState(false); // Username entered
  const [step2Complete, setStep2Complete] = useState(false); // Color selected 
  const [selectedSource, setSelectedSource] = useState('lichess.org');
  const [username, setUsername] = useState('');
  const [fetchedGames, setFetchedGames] = useState<string[]>([]);
  const [normalizedGames, setNormalizedGames] = useState<any[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [gameError, setGameError] = useState('');
  const [loadingSavedGames, setLoadingSavedGames] = useState(false);
  const [reportGameIds, setReportGameIds] = useState<Set<string> | null>(null); // Game IDs from a specific report
  const [loadingReport, setLoadingReport] = useState(false);
  const [savedGamesLoaded, setSavedGamesLoaded] = useState(false);

  // Auto-import effect
  useEffect(() => {
    if (importUrl) {
      handleAutoImport(importUrl);
    }
  }, [importUrl]);

  const handleAutoImport = async (url: string) => {
    setLoadingGames(true);
    setGameError('');
    try {
      let pgn = '';
      let source = '';

      if (url.includes('lichess.org')) {
        source = 'lichess.org';
        const match = url.match(/lichess\.org\/([a-zA-Z0-9]{8,12})/);
        if (match) {
          const gameId = match[1];
          // Use gateway proxy for Lichess export
          const response = await fetch(`${GATEWAY_URL}/external/lichess/export/${gameId}?evals=true&clocks=true`);
          if (!response.ok) throw new Error('Failed to fetch from Lichess');
          pgn = await response.text();
        }
      } else if (url.includes('chess.com')) {
        source = 'chess.com';
        // Chess.com doesn't have a simple CORS-friendly PGN export endpoint
        // We'll need to use our gateway's import service to fetch it
        // The import service can handle Chess.com's API

        // Extract game ID from URL (e.g., https://www.chess.com/game/live/146196861454)
        const match = url.match(/chess\.com\/game\/(live|daily)\/(\d+)/);
        if (match) {
          const gameType = match[1]; // 'live' or 'daily'
          const gameId = match[2];

          // Use the gateway to fetch the game
          // We'll need to pass the URL to the gateway
          const authHeaders = await getClientAuthHeaders();
          const resp = await fetch(`${GATEWAY_URL}/import/games/fetch-by-url`, {
            method: 'POST',
            headers: {
              ...authHeaders,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url, source: 'chess.com' })
          });

          if (!resp.ok) {
            throw new Error('Failed to fetch from Chess.com');
          }

          const data = await resp.json();
          if (data.pgn) {
            pgn = data.pgn;
          } else {
            throw new Error('No PGN returned from Chess.com');
          }
        } else {
          throw new Error('Invalid Chess.com game URL');
        }
      }


      if (pgn) {
        // Normalize and ingest
        // We can use the existing `ingestGames` but we need it in the right format.
        // Or just set it to `fetchedGames` and let the UI handle it?
        // The UI flow expects `normalizedGames` for the new flow.

        // Let's try to parse it locally or send to gateway to normalize.
        // We can use the `pgn-parser` or just wrap it in a simple object if we trust it.

        // We can call the gateway to normalize it.
        const authHeaders = await getClientAuthHeaders();
        const resp = await fetch(`${GATEWAY_URL}/import/games/normalize`, {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ pgn, source })
        });

        if (resp.ok) {
          const data = await resp.json();
          if (data.games && data.games.length > 0) {
            setNormalizedGames(data.games);
            // Automatically start import
            // We need to trigger the effect that watches `normalizedGames`
            // It checks `!isStreaming`.
          }
        } else {
          // Fallback if gateway normalize fails (e.g. offline)
          // Just try to add it directly if we can?
          // But `addGame` expects a game object.
          console.error("Failed to normalize via gateway");
        }
      }

    } catch (e) {
      setGameError(e.message);
    } finally {
      setLoadingGames(false);
    }
  };


  // State for filters
  const [playerColor, setPlayerColor] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [mode, setMode] = useState('Rated and casual');
  const [timeControl, setTimeControl] = useState('All time controls');
  const [fromDate, setFromDate] = useState('Big Bang');
  const [toDate, setToDate] = useState('Now');
  const [opponentRatingRange, setOpponentRatingRange] = useState({ min: 0, max: 3000 });
  const [opponentName, setOpponentName] = useState(''); // Initialize as empty string
  const [downloadLimit, setDownloadLimit] = useState(1000); // Using a number for limit

  const workerRef = useRef<Worker | null>(null);
  const networkAbortRef = useRef<AbortController | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStats, setSaveStats] = useState<{ attempted: number, saved: number }>({ attempted: 0, saved: 0 });

  // Opening book state
  const [bookMoves, setBookMoves] = useState<any[]>([]);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const bookRatings = ['1600', '1800', '2000', '2200', '2500'];
  const bookSpeeds = ['bullet', 'blitz', 'rapid', 'classical'];



  // State for the active sidebar tab
  const [activeTab, setActiveTab] = useState('user'); // 'user', 'moves', 'list', 'book', 'settings'

  // Handle query params for pre-filling filters
  useEffect(() => {
    const userParam = searchParams.get('username');
    const timeParam = searchParams.get('timeControl');
    const tabParam = searchParams.get('tab');

    if (userParam) {
      setUsername(userParam);
      setStep1Complete(true);
      setShowSelectSource(false);
      setShowColorFilters(true);
    }

    if (timeParam) {
      // Map 'blitz' -> 'Blitz', etc.
      const map: Record<string, string> = {
        'bullet': 'Bullet',
        'blitz': 'Blitz',
        'rapid': 'Rapid',
        'classical': 'Daily', // Mapping classical/daily somewhat loosely as per UI logic
        'daily': 'Daily'
      };
      const mapped = map[timeParam.toLowerCase()];
      if (mapped) {
        setTimeControl(mapped);
      }
    }

    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Fetch report to get game IDs when reportId is provided
  useEffect(() => {
    if (!reportId) return;

    const fetchReportGames = async () => {
      setLoadingReport(true);
      try {
        const authHeaders = await getClientAuthHeaders();
        const resp = await fetch(`${GATEWAY_URL}/analysis/reports/${reportId}?lite=true`, {
          headers: authHeaders,
        });

        if (resp.ok) {
          const reportData = await resp.json();
          // Extract game IDs from time_usage array
          const gameIds = new Set<string>();
          if (reportData.time_usage && Array.isArray(reportData.time_usage)) {
            for (const entry of reportData.time_usage) {
              if (entry.game_id) {
                gameIds.add(String(entry.game_id));
              }
            }
          }
          if (gameIds.size > 0) {
            setReportGameIds(gameIds);
          }
        }
      } catch (e) {
        console.error('Failed to fetch report for game filtering:', e);
      } finally {
        setLoadingReport(false);
      }
    };

    fetchReportGames();
  }, [reportId, GATEWAY_URL]);

  // Move history tracking for board moves
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);

  // State for the chess game
  const [game, setGame] = useState(new Chess());
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [boardWidth, setBoardWidth] = useState(512);
  const [isDesktop, setIsDesktop] = useState(false);

  // Calculate board width responsively - match /analyze behavior
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout;
    let lastWidth = window.innerWidth;

    const calculateBoardWidth = () => {
      if (typeof window !== 'undefined') {
        const isMobile = window.innerWidth < 768;
        const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
        const desktop = window.innerWidth >= 1024;

        setIsDesktop(desktop);

        if (isMobile) {
          // Mobile: use width only to prevent shrinking on scroll
          const pagePadding = 32; // p-4
          const width = window.innerWidth - pagePadding;
          setBoardWidth(width);
        } else if (isTablet) {
          // Tablet: use width only
          const pagePadding = 48; // md:p-6
          const width = window.innerWidth - pagePadding;
          setBoardWidth(width);
        } else {
          // Desktop: Match /analyze behavior with height constraints
          const availableHeight = window.innerHeight - 200; // Account for navbar + padding
          const availableWidth = window.innerWidth * 0.4; // 40% of window width

          // Scale proportionally with minimum constraint
          const size = Math.max(
            320, // Minimum size to prevent breaking
            Math.min(1000, availableWidth, availableHeight) // Match /analyze max of 1000px
          );
          setBoardWidth(size);
        }
      }
    };

    const handleResize = () => {
      // Only recalculate if width changed significantly (not just height from address bar)
      const widthDiff = Math.abs(window.innerWidth - lastWidth);
      if (widthDiff > 50) {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          lastWidth = window.innerWidth;
          calculateBoardWidth();
        }, 150);
      }
    };

    calculateBoardWidth();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  // Sound effects
  const [playMove] = useSound("/sounds/move-self.mp3", { volume: 0.5 });
  const [playCapture] = useSound("/sounds/capture.mp3", { volume: 0.5 });
  const [playCastle] = useSound("/sounds/castle.mp3", { volume: 0.5 });
  const [playCheck] = useSound("/sounds/move-check.mp3", { volume: 0.5 });
  const [playPromote] = useSound("/sounds/promote.mp3", { volume: 0.5 });
  const [playIllegal] = useSound("/sounds/illegal.mp3", { volume: 0.5 });

  // Function to handle piece drops (moves)
  const onDrop = useCallback((sourceSquare, targetSquare, piece) => {
    try {
      // Attempt to make the move
      const move = game.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: piece[1].toLowerCase() === 'p' && (targetSquare[1] === '8' || targetSquare[1] === '1') ? 'q' : undefined, // Promote to queen by default
      });

      // If the move is null, it's an illegal move
      if (move === null) return false;

      // Update the game state
      setGame(new Chess(game.fen()));
      return true; // Indicate a successful move
    } catch (e) {
      console.error('Illegal move:', e);
      return false; // Indicate an illegal move
    }
  }, [game]);

  // Import stream / opening graph state
  const { gamesLoaded, currentFen, moves, results, stopImport, setCurrentFen, ingestGames, beginImport, addGame, endImport, goBack: originalGoBack, goForward: originalGoForward, goStart: originalGoStart, goEnd: originalGoEnd, buildAll } = useImportStream();

  // Load saved games from backend on mount
  useEffect(() => {
    // Skip if we already loaded, if there's an import URL, or if already loading
    if (savedGamesLoaded || importUrl || loadingSavedGames) return;

    // If reportId is provided, wait for reportGameIds to be loaded
    if (reportId && reportGameIds === null && !loadingReport) return;

    const loadSavedGames = async () => {
      setLoadingSavedGames(true);
      try {
        const authHeaders = await getClientAuthHeaders();
        const resp = await fetch(`${GATEWAY_URL}/games?include_pgn=true&limit=500`, {
          headers: authHeaders,
        });

        if (resp.ok) {
          const data = await resp.json();
          let games = data.items || [];

          // If we have reportGameIds, filter to only include games from the report
          if (reportGameIds && reportGameIds.size > 0) {
            games = games.filter((g: any) => reportGameIds.has(String(g.id)));
          }

          if (games.length > 0) {
            // Convert DB games to the format expected by buildAll
            const normalizedForGraph = games
              .filter((g: any) => g.pgn)
              .map((g: any) => ({
                pgn: g.pgn,
                white: { username: g.opponent_username || 'Unknown' },
                black: { username: g.opponent_username || 'Unknown' },
                result: g.result,
              }));

            if (normalizedForGraph.length > 0) {
              buildAll(normalizedForGraph);
            }
          }
        }
      } catch (e) {
        console.error('Failed to load saved games:', e);
      } finally {
        setLoadingSavedGames(false);
        setSavedGamesLoaded(true);
      }
    };

    loadSavedGames();
  }, [GATEWAY_URL, savedGamesLoaded, importUrl, loadingSavedGames, buildAll, reportId, reportGameIds, loadingReport]);

  // Enhanced navigation functions with sound effects
  const goBack = useCallback(() => {
    originalGoBack();
    playMove();
  }, [originalGoBack, playMove]);

  const goForward = useCallback(() => {
    originalGoForward();
    playMove();
  }, [originalGoForward, playMove]);

  const goStart = useCallback(() => {
    originalGoStart();
    playMove();
  }, [originalGoStart, playMove]);

  const goEnd = useCallback(() => {
    originalGoEnd();
    playMove();
  }, [originalGoEnd, playMove]);

  // Handle moves from the chessboard with sound effects
  const handleBoardMove = useCallback((move: { from: Square; to: Square; promotion?: string }) => {
    const testGame = new Chess(currentFen);
    try {
      const madeMove = testGame.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion || 'q',
      });

      if (madeMove) {
        // Update position
        setCurrentFen(testGame.fen());

        // Update move history
        setMoveHistory(prev => {
          // If we're not at the end of history, truncate future moves
          const newHistory = currentMoveIndex < prev.length - 1
            ? prev.slice(0, currentMoveIndex + 1)
            : prev;
          return [...newHistory, madeMove.san];
        });
        setCurrentMoveIndex(prev => prev + 1);

        // Play appropriate sound
        // Priority: castle > check > promotion > capture > regular move
        // Check takes priority because a checking capture (e.g. Bxf7+) is more urgent to signal
        if (madeMove.flags.includes('k') || madeMove.flags.includes('q')) {
          playCastle();
        } else if (testGame.isCheck()) {
          playCheck();
        } else if (madeMove.promotion) {
          playPromote();
        } else if (madeMove.captured) {
          playCapture();
        } else {
          playMove();
        }
      }
    } catch (e) {
      playIllegal();
    }
  }, [currentFen, setCurrentFen, playMove, playCapture, playCastle, playCheck, playPromote, playIllegal, currentMoveIndex]);

  const handleMoveAttempt = useCallback((move: { from: Square; to: Square; promotion?: string }): boolean => {
    const testGame = new Chess(currentFen);
    try {
      const madeMove = testGame.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion || 'q',
      });

      if (madeMove) {
        handleBoardMove(move);
        return true;
      }
    } catch (e) {
      playIllegal();
    }
    return false;
  }, [currentFen, handleBoardMove, playIllegal]);

  // Arrow highlighting state (like openingtree)
  const [highlightedMove, setHighlightedMove] = useState<MoveStat | null>(null);

  // Position statistics for highlights report
  const positionStats = usePositionStats(
    currentFen,
    moves,
    results,
    playerColor as 'white' | 'black',
    username
  );

  // Modal state for game details
  const [selectedGame, setSelectedGame] = useState<{
    game: any;
    gameType: string;
  } | null>(null);

  // Handle game detail clicks
  const handleGameClick = (game: any, gameType: string) => {
    setSelectedGame({ game, gameType });
  };

  // Opening book cache
  const bookCache = useOpeningBookCache();

  // Initialize cache on mount
  useEffect(() => {
    bookCache.initialize();
  }, [bookCache]);

  // Helper: persist a normalized game to backend storage
  const persistGame = useCallback(async (g: any): Promise<boolean> => {
    try {
      const sessionId = getSessionId();
      const authHeaders = await getClientAuthHeaders();
      const headers: Record<string, string> = {
        ...authHeaders,
        'Content-Type': 'application/json'
      };
      if (sessionId && !headers['Authorization']) headers['x-session-id'] = sessionId;

      const body = {
        provider: g?.source ?? g?.provider ?? undefined,
        source_id: g?.id ?? undefined,
        rated: g?.rated ?? undefined,
        perf: g?.perf ?? undefined,
        time_control: g?.time_control ?? undefined,
        start_time: g?.start_time ? new Date(g.start_time).toISOString() : undefined,
        end_time: g?.end_time ? new Date(g.end_time).toISOString() : undefined,
        result: g?.result ?? undefined,
        termination: g?.termination ?? undefined,
        opening_eco: g?.opening_eco ?? undefined,
        opening_name: g?.opening_name ?? undefined,
        url: g?.url ?? undefined,
        site: g?.site ?? undefined,
        pgn: g?.pgn ?? '',
      };
      if (!body.pgn) return false;
      const resp = await fetch(`${GATEWAY_URL}/games`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      return resp.ok;
    } catch (e) {
      console.error('Persist game failed', e);
      return false;
    }
  }, [GATEWAY_URL]);

  // When new normalized games arrive, ingest into OpeningGraph (streamed via Worker if possible)
  useEffect(() => {
    // Only batch-ingest when not streaming (e.g., file upload use case)
    if (isStreaming || normalizedGames.length <= 0) return;
    if (normalizedGames.length > 0) {
      try {
        const worker = new Worker(new URL('../../workers/pgnReaderWorker.ts', import.meta.url));
        workerRef.current = worker;
        setIsImporting(true);
        beginImport();
        worker.onmessage = (e) => {
          const msg = e.data;
          if (!msg) return;
          if (msg.type === 'game') {
            addGame(msg.game);
            // fire-and-forget persistence
            setSaving(true);
            setSaveStats((s) => ({ ...s, attempted: s.attempted + 1 }));
            void persistGame(msg.game).then((ok) => {
              setSaveStats((s) => ({ attempted: s.attempted, saved: s.saved + (ok ? 1 : 0) }));
            });
          }
          if (msg.type === 'done') {
            endImport();
            worker.terminate();
            workerRef.current = null;
            setIsImporting(false);
            setTimeout(() => setSaving(false), 1000);
          }
        };
        worker.postMessage({ type: 'start', games: normalizedGames });
      } catch {
        setIsImporting(true);
        ingestGames(normalizedGames).finally(() => setIsImporting(false));
        // Best-effort persist without blocking UI
        setSaving(true);
        setSaveStats({ attempted: normalizedGames.length, saved: 0 });
        let saved = 0;
        normalizedGames.forEach((g) => {
          void persistGame(g).then((ok) => {
            if (ok) saved += 1;
            setSaveStats((s) => ({ attempted: s.attempted, saved }));
          });
        });
      }
      // Do not auto-switch to Moves tab; user can switch manually.
    }
  }, [isStreaming, normalizedGames, beginImport, addGame, endImport, ingestGames, persistGame]);

  // Keep board in sync with currentFen from graph
  useEffect(() => {
    try {
      const ch = new Chess();
      ch.load(currentFen);
      setGame(ch);
    } catch { }
  }, [currentFen]);

  // Fetch opening book from cache or gateway when Book tab is active or fen changes
  useEffect(() => {
    if (activeTab !== 'book') return;
    const run = async () => {
      try {
        setBookLoading(true);
        setBookError(null);

        // Generate cache key
        const cacheKey = bookCache.generateCacheKey(
          currentFen,
          bookRatings,
          bookSpeeds,
          'standard',
          'lichess'
        );

        // Try to get from cache first
        const cachedMoves = bookCache.getFromCache(cacheKey);
        if (cachedMoves) {
          console.log('Opening book loaded from cache for position:', currentFen);
          setBookMoves(cachedMoves);
          setBookLoading(false);
          return;
        }

        // Not in cache, fetch from API
        console.log('Fetching opening book from API for position:', currentFen);
        const params = new URLSearchParams({
          fen: currentFen,
          variant: 'standard',
          type: 'lichess',
        });
        bookRatings.forEach(r => params.append('ratings', r));
        bookSpeeds.forEach(s => params.append('speeds', s));

        const resp = await fetch(`${GATEWAY_URL}/opening/book?${params.toString()}`);
        if (!resp.ok) {
          const t = await resp.text().catch(() => '');
          throw new Error(t || `HTTP ${resp.status}`);
        }

        const data = await resp.json();
        const moves = Array.isArray(data?.moves) ? data.moves : [];
        moves.sort((a: any, b: any) => (b.white + b.black + b.draws) - (a.white + a.black + a.draws));

        // Save to cache
        bookCache.saveToCache(cacheKey, moves);
        setBookMoves(moves);

      } catch (e: any) {
        setBookError(e?.message || 'Failed to load opening book');
      } finally {
        setBookLoading(false);
      }
    };
    run();
  }, [activeTab, currentFen, GATEWAY_URL, bookCache, bookRatings, bookSpeeds]);

  // Arrows derived from moves for current position (like openingtree autoShapes)
  const arrows = useMemo(() => {
    let allArrows: Array<[Square, Square, string]> = [];

    // Add highlighted move arrow first (level 0 - most prominent)
    if (highlightedMove) {
      allArrows.push([
        highlightedMove.orig as Square,
        highlightedMove.dest as Square,
        'rgba(255,0,0,0.9)' // Red highlight like openingtree
      ]);
    }

    // Add regular move arrows (levels 1-3)
    const regularArrows = moves
      .filter(m => {
        // Don't show regular arrow if it's the highlighted one
        if (highlightedMove && highlightedMove.orig === m.orig && highlightedMove.dest === m.dest) {
          return false;
        }
        return m.uci && m.uci.length >= 4;
      })
      .map(m => {
        const level = m.level || 1;

        // Color and alpha based on level like openingtree brush system
        let color;
        let alpha;

        if (level === 3) {
          color = 'rgba(0,100,200,0.8)'; // Strong blue
          alpha = 0.8;
        } else if (level === 2) {
          color = 'rgba(0,150,255,0.6)'; // Medium blue  
          alpha = 0.6;
        } else {
          color = 'rgba(100,150,255,0.4)'; // Light blue
          alpha = 0.4;
        }

        return [m.orig as Square, m.dest as Square, color] as [Square, Square, string];
      });

    allArrows = allArrows.concat(regularArrows);
    return allArrows;
  }, [moves, highlightedMove]);

  // Keyboard navigation: Left/Right for back/forward through move history
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        // Navigate back in move history
        if (currentMoveIndex >= 0) {
          setCurrentMoveIndex(prev => {
            const newIndex = prev - 1;
            // Rebuild position from start
            const tempGame = new Chess();
            for (let i = 0; i <= newIndex; i++) {
              const san = moveHistory[i];
              if (san) {
                tempGame.move(san);
              }
            }
            setCurrentFen(tempGame.fen());
            setGame(tempGame);
            playMove();
            return newIndex;
          });
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        // Navigate forward in move history
        if (currentMoveIndex < moveHistory.length - 1) {
          setCurrentMoveIndex(prev => {
            const newIndex = prev + 1;
            // Rebuild position from start
            const tempGame = new Chess();
            for (let i = 0; i <= newIndex; i++) {
              const san = moveHistory[i];
              if (san) {
                tempGame.move(san);
              }
            }
            setCurrentFen(tempGame.fen());
            setGame(tempGame);
            playMove();
            return newIndex;
          });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentMoveIndex, moveHistory, playMove]);

  // Legacy: Function to fetch games from Lichess (kept for reference)
  const fetchLichessGames = async () => {
    setLoadingGames(true);
    setGameError('');
    setFetchedGames([]);
    try {
      // Construct Lichess API URL with filters
      let lichessApiUrl = `https://lichess.org/api/games/user/${username}?pgnInJson=true`;

      // Apply filters for Lichess API
      if (playerColor === 'white') lichessApiUrl += '&vs=white';
      if (playerColor === 'black') lichessApiUrl += '&vs=black';

      // Mode filter (simplified mapping)
      if (mode === 'Rated') lichessApiUrl += '&rated=true';
      if (mode === 'Casual') lichessApiUrl += '&rated=false';

      // Time control filter (simplified mapping)
      if (timeControl !== 'All time controls') {
        // This would require more complex mapping based on Lichess perf types
        // For example, '&perfType=blitz' or '&perfType=bullet'
        // For now, we'll just acknowledge its presence.
      }

      // Date filters (Lichess uses 'since' and 'until' timestamps)
      if (fromDate) {
        const fromTimestamp = new Date(fromDate).getTime();
        if (!isNaN(fromTimestamp)) lichessApiUrl += `&since=${fromTimestamp}`;
      }
      if (toDate) {
        const toTimestamp = new Date(toDate).getTime();
        if (!isNaN(toTimestamp)) lichessApiUrl += `&until=${toTimestamp}`;
      }

      // Opponent rating range (Lichess has 'min rating' and 'max rating' filters)
      if (opponentRatingRange.min > 0) lichessApiUrl += `&ratingMin=${opponentRatingRange.min}`;
      if (opponentRatingRange.max < 3000) lichessApiUrl += `&ratingMax=${opponentRatingRange.max}`;

      // Opponent name (Lichess has 'opponent' filter)
      if (opponentName.trim() !== '') {
        lichessApiUrl += `&opponent=${opponentName.trim()}`;
      }

      // Download limit
      lichessApiUrl += `&max=${downloadLimit}`;


      const response = await fetch(lichessApiUrl);
      if (!response.ok) {
        throw new Error(`Lichess API error: ${response.statusText}`);
      }
      const text = await response.text();
      const games = text.split('\n')
        .filter(line => line.trim() !== '')
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            console.error("Error parsing Lichess line:", line, e);
            return null;
          }
        })
        .filter(game => game !== null);

      setFetchedGames(games.map(g => g.pgn || 'No PGN available'));
    } catch (error) {
      console.error('Error fetching Lichess games:', error);
      setGameError(`Failed to load Lichess games: ${error.message}`);
    } finally {
      setLoadingGames(false);
    }
  };

  // Legacy: Function to fetch games from Chess.com (kept for reference)
  const fetchChessComGames = async () => {
    setLoadingGames(true);
    setGameError('');
    setFetchedGames([]);
    try {
      const archivesResponse = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`);
      if (!archivesResponse.ok) {
        throw new Error(`Chess.com archives API error: ${archivesResponse.statusText}`);
      }
      const archivesData = await archivesResponse.json();
      const archiveUrls = archivesData.archives;

      if (!archiveUrls || archiveUrls.length === 0) {
        setGameError('No game archives found for this Chess.com username.');
        setLoadingGames(false);
        return;
      }

      const latestArchiveUrl = archiveUrls[archiveUrls.length - 1];
      const gamesResponse = await fetch(latestArchiveUrl);
      if (!gamesResponse.ok) {
        throw new Error(`Chess.com games API error: ${gamesResponse.statusText}`);
      }
      const gamesData = await gamesResponse.json();

      if (gamesData.games && gamesData.games.length > 0) {
        // Client-side filtering for Chess.com as their API doesn't support all filters directly on archive endpoint
        const filtered = gamesData.games.filter(game => {
          // Filter by player color
          if (playerColor === 'white' && game.white.username.toLowerCase() !== username.toLowerCase()) return false;
          if (playerColor === 'black' && game.black.username.toLowerCase() !== username.toLowerCase()) return false;

          // Mode filter (very basic, based on game type in PGN headers if available)
          // This would require parsing PGN headers, which is complex. Skipping for now.

          // Time control filter (requires PGN parsing) - Skipping for now.

          // Date filters (requires PGN parsing for Date tag) - Skipping for now.

          // Opponent rating range (requires parsing opponent rating from PGN or game object)
          const opponent = game.white.username.toLowerCase() === username.toLowerCase() ? game.black : game.white;
          if (opponent.rating) {
            if (opponentRatingRange.min !== 0 && opponent.rating < opponentRatingRange.min) return false;
            if (opponentRatingRange.max !== 3000 && opponent.rating > opponentRatingRange.max) return false;
          }

          // Opponent name
          if (opponentName.trim() !== '' && opponent.username.toLowerCase() !== opponentName.toLowerCase()) {
            return false;
          }

          return true;
        });

        // Apply download limit client-side
        setFetchedGames(filtered.slice(0, downloadLimit).map(g => g.pgn || 'No PGN available'));
      } else {
        setGameError('No games found in the latest archive for this Chess.com username.');
      }

    } catch (error) {
      console.error('Error fetching Chess.com games:', error);
      setGameError(`Failed to load Chess.com games: ${error.message}`);
    } finally {
      setLoadingGames(false);
    }
  };

  // New: Fetch via Gateway -> Import-service, returning normalized games
  const fetchGamesViaGateway = async () => {
    setLoadingGames(true);
    setGameError('');
    setFetchedGames([]);
    setNormalizedGames([]);

    try {
      const filters: any = { max: downloadLimit };
      // color
      if (playerColor === 'white' || playerColor === 'black') {
        filters.color = playerColor;
      }
      // rated
      if (mode === 'Rated') filters.rated = true;
      else if (mode === 'Casual') filters.rated = false;
      // perfType mapping from UI timeControl selection
      try {
        const hasBullet = timeControl.includes('Bullet');
        const hasBlitz = timeControl.includes('Blitz');
        const hasRapid = timeControl.includes('Rapid');
        const hasDaily = timeControl.includes('Daily');
        const selected = [hasBullet, hasBlitz, hasRapid, hasDaily].filter(Boolean).length;
        // Only map when exactly one category selected; otherwise leave unspecified
        if (selected === 1 && timeControl !== 'All except Blitz') {
          if (hasBullet) filters.perfType = 'bullet';
          else if (hasBlitz) filters.perfType = 'blitz';
          else if (hasRapid) filters.perfType = 'rapid';
          else if (hasDaily) filters.perfType = 'daily';
        }
      } catch { }
      // dates -> ms
      if (fromDate) {
        const ts = new Date(fromDate).getTime();
        if (!isNaN(ts)) filters.since = ts;
      }
      if (toDate) {
        const ts = new Date(toDate).getTime();
        if (!isNaN(ts)) filters.until = ts;
      }

      const payload = {
        source: selectedSource,
        username,
        filters,
      };

      const authHeaders = await getClientAuthHeaders();
      const resp = await fetch(`${GATEWAY_URL}/import/games/fetch`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || 'Gateway import error');
      }

      const data = await resp.json();
      const games = Array.isArray(data?.games) ? data.games : [];
      setNormalizedGames(games);
    } catch (e: any) {
      setGameError(e?.message || 'Failed to import games');
    } finally {
      setLoadingGames(false);
    }
  };

  // New: Streaming import via Gateway
  const streamGamesViaGateway = async () => {
    setLoadingGames(true);
    setGameError('');
    setFetchedGames([]);
    setNormalizedGames([]);

    try {
      const filters: any = { max: downloadLimit };
      if (playerColor === 'white' || playerColor === 'black') filters.color = playerColor;
      if (mode === 'Rated') filters.rated = true; else if (mode === 'Casual') filters.rated = false;
      // perfType: allow multiple categories from timeControl label when present
      try {
        const wants: string[] = [];
        if (/Bullet/i.test(timeControl)) wants.push('bullet');
        if (/Blitz/i.test(timeControl)) wants.push('blitz');
        if (/Rapid/i.test(timeControl)) wants.push('rapid');
        if (/Classical|Daily/i.test(timeControl)) wants.push('classical'); // UI label mapping; daily maps server-side when source is chess.com
        if (wants.length > 0) filters.perfType = wants.join(',');
      } catch { }
      if (fromDate) { const ts = new Date(fromDate).getTime(); if (!isNaN(ts)) filters.since = ts; }
      if (toDate) { const ts = new Date(toDate).getTime(); if (!isNaN(ts)) filters.until = ts; }

      const payload = { source: selectedSource, username, filters, normalize: true };

      // Begin live import
      beginImport();
      setIsStreaming(true);
      setIsImporting(true);
      const ctrl = new AbortController();
      networkAbortRef.current = ctrl;

      const authHeaders = await getClientAuthHeaders();
      const resp = await fetch(`${GATEWAY_URL}/import/games/fetch/stream`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => '');
        throw new Error(text || `HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let saved = 0;
      let attempted = 0;
      setSaveStats({ attempted: 0, saved: 0 });
      setSaving(true);
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          try {
            const obj = JSON.parse(line);
            if (obj && !obj.error) {
              addGame(obj);
              setNormalizedGames((arr) => {
                const next = arr.concat(obj);
                return next;
              });
              attempted += 1;
              // fire-and-forget persistence but track count
              void persistGame(obj).then((ok) => {
                if (ok) saved += 1;
                setSaveStats({ attempted, saved });
              });
            }
          } catch { /* ignore malformed lines */ }
        }
      }
      // flush any trailing JSON line
      const tail = buf.trim();
      if (tail) {
        try {
          const obj = JSON.parse(tail);
          if (obj && !obj.error) {
            addGame(obj);
            setNormalizedGames((arr) => arr.concat(obj));
            attempted += 1;
            void persistGame(obj).then((ok) => {
              if (ok) saved += 1;
              setSaveStats({ attempted, saved });
            });
          }
        } catch { }
      }
      endImport();

      // If we're returning to reports and successfully imported games, generate analysis
      if (returnTo === 'reports' && attempted > 0) {
        setTimeout(() => {
          generateAnalysisAndRedirect();
        }, 1000); // Small delay to let the UI update
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setGameError(e?.message || 'Failed to stream games');
      }
    } finally {
      setIsImporting(false);
      setLoadingGames(false);
      networkAbortRef.current = null;
      setIsStreaming(false);
      setSaving(false);
    }
  };

  // Generate analysis after importing games
  const generateAnalysisAndRedirect = async () => {
    try {
      const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway';

      const headers = await getClientAuthHeaders();

      const trimmedUsername = username.trim();
      const analysisBody: Record<string, any> = {
        min_games: 3
      };
      if (trimmedUsername) {
        analysisBody.usernames = [trimmedUsername];
      }

      const response = await fetch(`${GATEWAY_URL}/analysis/repertoire`, {
        method: 'POST',
        headers,
        body: JSON.stringify(analysisBody)
      });

      if (response.ok) {
        // Redirect back to reports page after successful analysis
        router.push('/reports');
      } else {
        console.error('Failed to generate analysis');
        // Still redirect back, user can see the error or try again
        router.push('/reports');
      }
    } catch (error) {
      console.error('Analysis generation failed:', error);
      // Still redirect back
      router.push('/reports');
    }
  };

  // Handle loading games based on selected source
  const handleLoadGames = () => {
    if (!username) {
      setGameError('Please enter a username.');
      return;
    }
    if (selectedSource !== 'lichess.org' && selectedSource !== 'chess.com') {
      setGameError('Please select a valid source (Lichess or Chess.com) to load games.');
      return;
    }
    // Prefer streaming for dynamic updates
    streamGamesViaGateway();
  };

  // SidebarSection moved to a separate component to avoid remounts and focus loss

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-white dark:bg-black font-inter flex flex-col">
        <h1 className="sr-only">Import Games</h1>
        {/* Main content area */}
        <main className="flex flex-col lg:flex-row flex-grow p-4 md:p-6 lg:space-x-6 space-y-5 lg:space-y-0 justify-center lg:items-start">
          {/* Board section with move history */}
          <div className="flex flex-row gap-4 items-start w-full lg:w-auto flex-shrink-0">
            {/* Move History Box - Left of board */}
            <div className="hidden lg:block" style={{ height: boardWidth, width: 200 }}>
              <MoveHistoryBox
                moves={moveHistory}
                currentMoveIndex={currentMoveIndex}
              />
            </div>

            {/* Board and controls */}
            <div className="flex flex-col items-center w-full lg:w-auto">
              <div className="w-full" style={{ maxWidth: boardWidth, width: isDesktop ? boardWidth : '100%' }}>
                <ImportBoard
                  fen={currentFen}
                  arrows={arrows}
                  width={boardWidth}
                  orientation={boardOrientation}
                  onMove={handleBoardMove}
                  onMoveAttempt={handleMoveAttempt}
                />
              </div>

            </div>
          </div>

          {/* Right section: Sidebar and Navigation */}
          <div className="flex flex-col gap-2 flex-shrink-0" style={{ width: isDesktop ? boardWidth / 1.46 : undefined }}>
            <aside
              className="w-full bg-gray-50 dark:bg-zinc-900 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-800 flex-shrink-0"
            >
              {/* Top tab navigation */}
              <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-zinc-800 p-1 rounded-lg">
                <button
                  className={`flex-1 px-4 py-2.5 text-xs font-medium rounded-md transition-all duration-200 ${activeTab === 'user'
                    ? "bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm"
                    : "bg-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  onClick={() => setActiveTab('user')}
                >
                  User
                </button>
                <button
                  className={`flex-1 px-4 py-2.5 text-xs font-medium rounded-md transition-all duration-200 ${activeTab === 'moves'
                    ? "bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm"
                    : "bg-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  onClick={() => setActiveTab('moves')}
                >
                  Moves
                </button>
                <button
                  className={`flex-1 px-4 py-2.5 text-xs font-medium rounded-md transition-all duration-200 ${activeTab === 'list'
                    ? "bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm"
                    : "bg-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  onClick={() => setActiveTab('list')}
                >
                  List
                </button>
                <button
                  className={`flex-1 px-4 py-2.5 text-xs font-medium rounded-md transition-all duration-200 ${activeTab === 'book'
                    ? "bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm"
                    : "bg-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  onClick={() => setActiveTab('book')}
                >
                  Book
                </button>
                <button
                  className={`flex-1 px-4 py-2.5 text-xs font-medium rounded-md transition-all duration-200 ${activeTab === 'settings'
                    ? "bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm"
                    : "bg-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  onClick={() => setActiveTab('settings')}
                >
                  Settings
                </button>
              </div>
              {/* Save status */}
              <div className="mb-3 text-xs text-gray-600 dark:text-gray-400">
                {saving ? (
                  <span>Saving games... {saveStats.saved}/{saveStats.attempted}</span>
                ) : saveStats.attempted > 0 ? (
                  <span>Saved {saveStats.saved} of {saveStats.attempted} games</span>
                ) : null}
              </div>

              {/* Analysis notification when coming from reports */}
              {returnTo === 'reports' && (
                <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-xs text-blue-700">
                    <Zap className="w-3 h-3 inline mr-1" />
                    {saveStats.attempted > 0
                      ? 'Import complete! Generating analysis...'
                      : 'Import games to generate repertoire analysis'
                    }
                  </p>
                </div>
              )}

              {/* Conditional rendering based on activeTab */}
              {activeTab === 'user' && (
                <>


                  {/* Select a source */}
                  <SidebarSection
                    title="Select a source"
                    isExpanded={showSelectSource}
                    onToggle={() => setShowSelectSource(!showSelectSource)}
                  >
                    <div className="space-y-2">
                      <label className="flex items-center text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input
                          type="radio"
                          name="source"
                          value="lichess.org"
                          checked={selectedSource === 'lichess.org'}
                          onChange={(e) => setSelectedSource(e.target.value)}
                          className="form-radio h-4 w-4 text-blue-600 transition duration-150 ease-in-out"
                          aria-label="lichess.org"
                        />
                        <span className="ml-2">lichess.org</span>
                      </label>
                      <label className="flex items-center text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input
                          type="radio"
                          name="source"
                          value="chess.com"
                          checked={selectedSource === 'chess.com'}
                          onChange={(e) => setSelectedSource(e.target.value)}
                          className="form-radio h-4 w-4 text-blue-600 transition duration-150 ease-in-out"
                          aria-label="chess.com"
                        />
                        <span className="ml-2">chess.com</span>
                      </label>


                      {/* Username Input and Continue Button */}
                      <div className="mt-4">
                        <label
                          htmlFor="username"
                          id="username-label"
                          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                          Enter Username:
                        </label>
                        <Input
                          type="text"
                          id="username"
                          className="mt-1"
                          aria-labelledby="username-label"
                          aria-describedby={gameError ? "username-error" : undefined}
                          aria-invalid={Boolean(gameError)}
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="e.g., magnuscarlsen"
                        />
                        <Button
                          onClick={() => {
                            if (!username.trim()) {
                              setGameError('Please enter a username.');
                              return;
                            }
                            setStep1Complete(true);
                            setShowSelectSource(false);
                            setShowColorFilters(true);
                            setGameError('');
                          }}
                          className="mt-3 w-full transition-all duration-200"
                          disabled={!username.trim()}
                        >
                          Continue
                        </Button>
                        {gameError && (
                          <div
                            id="username-error"
                            role="alert"
                            className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md"
                          >
                            <p className="text-red-700 text-sm flex items-start">
                              <svg className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                              </svg>
                              {gameError}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </SidebarSection>


                  {/* Color and filters */}
                  <SidebarSection
                    title="Color and filters"
                    isExpanded={showColorFilters}
                    onToggle={() => setShowColorFilters(!showColorFilters)}
                  >
                    <div className="space-y-4">
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">Games where <span className="font-medium text-gray-900 dark:text-white">{username || 'magnuscarlsen'}</span> is playing as:</p>
                      <div className="flex gap-2" role="group">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant={playerColor === 'white' ? 'default' : 'outline'}
                              size="default"
                              onClick={() => setPlayerColor('white')}
                            >
                              <span className="text-lg mr-2">♔</span>
                              White
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Show games where you play as White pieces</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant={playerColor === 'black' ? 'default' : 'outline'}
                              size="default"
                              onClick={() => setPlayerColor('black')}
                            >
                              <span className="text-lg mr-2">♚</span>
                              Black
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Show games where you play as Black pieces</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>

                      <div className="mt-6">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                              variant="ghost"
                              size="sm"
                              className="text-blue-600 hover:text-blue-700 p-2 h-auto font-semibold rounded-md hover:bg-blue-50 transition-all duration-200"
                            >
                              <span className="mr-2">Advanced filters</span>
                              {showAdvancedFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{showAdvancedFilters ? 'Hide' : 'Show'} additional filter options</p>
                          </TooltipContent>
                        </Tooltip>

                        {showAdvancedFilters && (
                          <div className="mt-3 space-y-4 text-sm text-gray-700 dark:text-gray-300">
                            {/* Mode Filter */}
                            <div>
                              <span className="font-semibold block mb-2">Mode:</span>
                              <div className="space-y-1">
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="radio"
                                    name="modeOption"
                                    value="Rated and casual"
                                    checked={mode === 'Rated and casual'}
                                    onChange={(e) => setMode(e.target.value)}
                                    className="form-radio h-4 w-4 text-blue-600"
                                    aria-label="Rated and casual"
                                  />
                                  <span className="ml-2">Rated and casual</span>
                                </label>
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="radio"
                                    name="modeOption"
                                    value="Rated"
                                    checked={mode === 'Rated'}
                                    onChange={(e) => setMode(e.target.value)}
                                    className="form-radio h-4 w-4 text-blue-600"
                                    aria-label="Rated only"
                                  />
                                  <span className="ml-2">Rated only</span>
                                </label>
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="radio"
                                    name="modeOption"
                                    value="Casual"
                                    checked={mode === 'Casual'}
                                    onChange={(e) => setMode(e.target.value)}
                                    className="form-radio h-4 w-4 text-blue-600"
                                    aria-label="Casual only"
                                  />
                                  <span className="ml-2">Casual only</span>
                                </label>
                              </div>
                            </div>

                            {/* Time Control Filter */}
                            <div>
                              <span className="font-semibold block mb-2">Time control:</span>
                              <div className="space-y-1">
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="radio"
                                    name="timeControlMainOption"
                                    value="All time controls"
                                    checked={timeControl === 'All time controls'}
                                    onChange={(e) => setTimeControl(e.target.value)}
                                    className="form-radio h-4 w-4 text-blue-600"
                                    aria-label="All time controls"
                                  />
                                  <span className="ml-2">All time controls</span>
                                </label>
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="radio"
                                    name="timeControlMainOption"
                                    value="All except Blitz"
                                    checked={timeControl === 'All except Blitz'}
                                    onChange={(e) => setTimeControl(e.target.value)}
                                    className="form-radio h-4 w-4 text-blue-600"
                                    aria-label="All except Blitz"
                                  />
                                  <span className="ml-2">All except Blitz</span>
                                </label>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  <label className="flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      name="timeControlSpecific"
                                      value="Bullet"
                                      checked={timeControl.includes('Bullet')}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setTimeControl(prev => prev === 'All time controls' || prev === 'All except Blitz' ? 'Bullet' : prev + ', Bullet');
                                        } else {
                                          setTimeControl(prev => prev.replace(', Bullet', '').replace('Bullet', '').trim());
                                        }
                                      }}
                                      className="form-checkbox h-4 w-4 text-blue-600 rounded"
                                      aria-label="Bullet"
                                    />
                                    <span className="ml-2">Bullet</span>
                                  </label>
                                  <label className="flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      name="timeControlSpecific"
                                      value="Blitz"
                                      checked={timeControl.includes('Blitz')}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setTimeControl(prev => prev === 'All time controls' || prev === 'All except Blitz' ? 'Blitz' : prev + ', Blitz');
                                        } else {
                                          setTimeControl(prev => prev.replace(', Blitz', '').replace('Blitz', '').trim());
                                        }
                                      }}
                                      className="form-checkbox h-4 w-4 text-blue-600 rounded"
                                      aria-label="Blitz"
                                    />
                                    <span className="ml-2">Blitz</span>
                                  </label>
                                  <label className="flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      name="timeControlSpecific"
                                      value="Rapid"
                                      checked={timeControl.includes('Rapid')}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setTimeControl(prev => prev === 'All time controls' || prev === 'All except Blitz' ? 'Rapid' : prev + ', Rapid');
                                        } else {
                                          setTimeControl(prev => prev.replace(', Rapid', '').replace('Rapid', '').trim());
                                        }
                                      }}
                                      className="form-checkbox h-4 w-4 text-blue-600 rounded"
                                      aria-label="Rapid"
                                    />
                                    <span className="ml-2">Rapid</span>
                                  </label>
                                  <label className="flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      name="timeControlSpecific"
                                      value="Daily"
                                      checked={timeControl.includes('Daily')}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setTimeControl(prev => prev === 'All time controls' || prev === 'All except Blitz' ? 'Daily' : prev + ', Daily');
                                        } else {
                                          setTimeControl(prev => prev.replace(', Daily', '').replace('Daily', '').trim());
                                        }
                                      }}
                                      className="form-checkbox h-4 w-4 text-blue-600 rounded"
                                      aria-label="Daily"
                                    />
                                    <span className="ml-2">Daily</span>
                                  </label>
                                </div>
                              </div>
                            </div>

                            {/* From Date Filter */}
                            <div>
                              <span className="font-semibold block mb-2">From Date:</span>
                              <input
                                type="date"
                                className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                aria-label="From date"
                              />
                              <Button
                                onClick={() => setFromDate('')}
                                variant="ghost"
                                size="sm"
                                className="mt-1 text-blue-600 hover:text-blue-700 text-xs p-0 h-auto"
                              >
                                Reset to Big Bang
                              </Button>
                            </div>

                            {/* To Date Filter */}
                            <div>
                              <span className="font-semibold block mb-2">To Date:</span>
                              <input
                                type="date"
                                className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                aria-label="To date"
                              />
                              <Button
                                onClick={() => setToDate('')}
                                variant="ghost"
                                size="sm"
                                className="mt-1 text-blue-600 hover:text-blue-700 text-xs p-0 h-auto"
                              >
                                Reset to Now
                              </Button>
                            </div>

                            {/* Opponent Rating Range Filter */}
                            <div>
                              <span className="font-semibold block mb-2">Opponent rating range:</span>
                              <div className="space-y-2">
                                <div>
                                  <label
                                    htmlFor="minRating"
                                    id="minRating-label"
                                    className="block text-xs font-medium text-gray-700 dark:text-gray-300"
                                  >
                                    Min Rating: {opponentRatingRange.min}
                                  </label>
                                  <input
                                    type="range"
                                    id="minRating"
                                    min="0"
                                    max="3000"
                                    step="100"
                                    value={opponentRatingRange.min}
                                    onChange={(e) => setOpponentRatingRange(prev => ({ ...prev, min: parseInt(e.target.value) }))}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                    aria-labelledby="minRating-label"
                                  />
                                </div>
                                <div>
                                  <label
                                    htmlFor="maxRating"
                                    id="maxRating-label"
                                    className="block text-xs font-medium text-gray-700 dark:text-gray-300"
                                  >
                                    Max Rating: {opponentRatingRange.max === 3000 ? 'No limit' : opponentRatingRange.max}
                                  </label>
                                  <input
                                    type="range"
                                    id="maxRating"
                                    min="0"
                                    max="3000"
                                    step="100"
                                    value={opponentRatingRange.max}
                                    onChange={(e) => setOpponentRatingRange(prev => ({ ...prev, max: parseInt(e.target.value) }))}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                    aria-labelledby="maxRating-label"
                                  />
                                </div>
                              </div>
                              <Button
                                onClick={() => setOpponentRatingRange({ min: 0, max: 3000 })}
                                variant="ghost"
                                size="sm"
                                className="mt-1 text-blue-600 hover:text-blue-700 text-xs p-0 h-auto"
                              >
                                Reset to Any rating
                              </Button>
                            </div>

                            {/* Opponent Name Filter */}
                            <div>
                              <label htmlFor="opponentName" id="opponent-name-label" className="font-semibold block mb-2">
                                Opponent name:
                              </label>
                              <Input
                                id="opponentName"
                                type="text"
                                aria-labelledby="opponent-name-label"
                                value={opponentName}
                                onChange={(e) => setOpponentName(e.target.value)}
                                placeholder="Enter opponent's username"
                              />
                              <Button
                                onClick={() => setOpponentName('')}
                                variant="ghost"
                                size="sm"
                                className="mt-1 text-blue-600 hover:text-blue-700 text-xs p-0 h-auto"
                              >
                                Reset to All opponents
                              </Button>
                            </div>

                            {/* Download Limit Filter */}
                            <div>
                              <label htmlFor="downloadLimit" id="download-limit-label" className="font-semibold block mb-2">
                                Download limit: {downloadLimit === 1000 ? 'No limit' : downloadLimit}
                              </label>
                              <input
                                type="range"
                                id="downloadLimit"
                                min="1"
                                max="1000"
                                step="10"
                                value={downloadLimit}
                                onChange={(e) => setDownloadLimit(parseInt(e.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                aria-labelledby="download-limit-label"
                              />
                              <Button
                                onClick={() => setDownloadLimit(1000)}
                                variant="ghost"
                                size="sm"
                                className="mt-1 text-blue-600 hover:text-blue-700 text-xs p-0 h-auto"
                              >
                                Reset to No limit
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Continue button for Step 2 */}
                      <Button
                        onClick={() => {
                          if (!playerColor) {
                            setGameError('Please select a color (White or Black).');
                            return;
                          }
                          setStep2Complete(true);
                          setShowColorFilters(false);
                          setGameError('');
                        }}
                        className="mt-4 w-full transition-all duration-200"
                        disabled={!playerColor}
                      >
                        Continue
                      </Button>
                    </div>
                  </SidebarSection>

                  {/* Load Games button - appears after Step 2 complete */}
                  {step2Complete && (
                    <div className="px-4 pb-4">
                      <Button
                        onClick={handleLoadGames}
                        className="w-full transition-all duration-200"
                        disabled={loadingGames || !username || !playerColor}
                      >
                        {loadingGames ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Loading Games...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 mr-2" />
                            Load Games
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}

              {activeTab === 'book' && (
                <div className="p-4">
                  <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100">Opening Book</h2>
                  {bookLoading && (
                    <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      <span className="text-sm">Loading opening book...</span>
                    </div>
                  )}
                  {bookError && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                      <p className="text-red-700 dark:text-red-400 text-sm flex items-start">
                        <svg className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        {bookError}
                      </p>
                    </div>
                  )}
                  {!bookLoading && !bookError && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm border-collapse">
                        <thead>
                          <tr className="text-left border-b border-gray-300 dark:border-zinc-700">
                            <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300 text-sm">Move</th>
                            <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300 text-sm">Games</th>
                            <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300 text-sm">Results</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bookMoves.map((m: any, idx: number) => {
                            const total = (m.white || 0) + (m.black || 0) + (m.draws || 0);
                            const wPct = total ? (m.white * 100) / total : 0;
                            const bPct = total ? (m.black * 100) / total : 0;
                            const dPct = total ? (m.draws * 100) / total : 0;
                            const fmtTotal = (n: number) => {
                              if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
                              if (n >= 10_000) return `${Math.round(n / 1000)}k`;
                              return `${n}`;
                            };
                            const getProgressLabel = (count: number, total: number) => {
                              const pct = (count / total) * 100;
                              if (pct < 10) return '';
                              return `${Math.round(pct)}%`;
                            };
                            const handleBookMoveSelect = () => {
                              try {
                                const ch = new Chess();
                                ch.load(currentFen);
                                const mv = ch.move(m.san, { sloppy: true });
                                if (mv) {
                                  setCurrentFen(ch.fen());
                                  setHighlightedMove({ san: m.san, orig: mv.from, dest: mv.to, level: 0 } as any);
                                }
                              } catch { }
                            };
                            return (
                              <tr
                                key={`${m.san}-${idx}`}
                                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800 border-b border-gray-100 dark:border-zinc-800"
                                onClick={handleBookMoveSelect}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    handleBookMoveSelect();
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                aria-label="Jump to book move"
                              >
                                <td className="px-3 py-2 font-mono align-middle text-sm font-medium text-gray-900 dark:text-gray-100">{m.san}</td>
                                <td className="px-3 py-2 align-middle">
                                  <div className="relative inline-flex items-center gap-1">
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{fmtTotal(total)}</span>
                                    <span
                                      className="text-gray-400 text-xs"
                                      title={`Total: ${total.toLocaleString()}\nAvg rating: ${m.averageRating ?? 'n/a'}`}
                                    >

                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-2 w-full">
                                  <div className="progress" style={{ height: '16px', border: '1px solid #dee2e6' }}>
                                    <div
                                      className="progress-bar whiteMove"
                                      style={{ width: `${wPct}%` }}
                                      title={`White wins: ${m.white || 0}`}
                                    >
                                      {getProgressLabel(m.white || 0, total)}
                                    </div>
                                    <div
                                      className="progress-bar grayMove"
                                      style={{ width: `${dPct}%` }}
                                      title={`Draws: ${m.draws || 0}`}
                                    >
                                      {getProgressLabel(m.draws || 0, total)}
                                    </div>
                                    <div
                                      className="progress-bar blackMove"
                                      style={{ width: `${bPct}%` }}
                                      title={`Black wins: ${m.black || 0}`}
                                    >
                                      {getProgressLabel(m.black || 0, total)}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {bookMoves.length === 0 && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 py-4">No book moves for this position.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'report' && (
                <div className="p-4">
                  <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100">Highlights Report</h2>
                  {positionStats.totalGames === 0 ? (
                    <div className="bg-white dark:bg-zinc-800 p-4 rounded-lg shadow-sm">
                      <p className="text-gray-500 dark:text-gray-400 text-center">No games found at this position. Import some games to see statistics!</p>
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-zinc-800 p-4 rounded-lg shadow-sm space-y-3">
                      <div className="flex justify-between items-center border-b border-gray-200 dark:border-zinc-700 pb-2">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">FEN</span>
                        <span className="text-sm text-gray-600 dark:text-gray-400 font-mono break-all">{currentFen}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Performance</span>
                        <span className="text-gray-800 dark:text-gray-200">{positionStats.performanceRating || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Results</span>
                        <span className="text-gray-800 dark:text-gray-200">{positionStats.resultsSummary}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Avg opponent</span>
                        <span className="text-gray-800 dark:text-gray-200">{positionStats.averageOpponentElo || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Score</span>
                        <span className="text-gray-800 dark:text-gray-200">{positionStats.scoreLabel}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Best win</span>
                        {positionStats.bestWin ? (
                          <Button
                            onClick={() => handleGameClick(positionStats.bestWin, 'Best win')}
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700 p-0 h-auto text-sm"
                          >
                            {positionStats.bestWin.opponentRating || 'Unrated'} vs {playerColor === 'white' ? positionStats.bestWin.black : positionStats.bestWin.white}
                            <svg className="w-3 h-3 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                            </svg>
                          </Button>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">N/A</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Worst loss</span>
                        {positionStats.worstLoss ? (
                          <Button
                            onClick={() => handleGameClick(positionStats.worstLoss, 'Worst loss')}
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700 p-0 h-auto text-sm"
                          >
                            {positionStats.worstLoss.opponentRating || 'Unrated'} vs {playerColor === 'white' ? positionStats.worstLoss.black : positionStats.worstLoss.white}
                            <svg className="w-3 h-3 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                            </svg>
                          </Button>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">N/A</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Longest game</span>
                        {positionStats.longestGame ? (
                          <Button
                            onClick={() => handleGameClick(positionStats.longestGame, 'Longest game')}
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700 p-0 h-auto text-sm"
                          >
                            {positionStats.longestGame.plies || '?'} plies vs {playerColor === 'white' ? positionStats.longestGame.black : positionStats.longestGame.white}
                            <svg className="w-3 h-3 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                            </svg>
                          </Button>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">N/A</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Shortest game</span>
                        {positionStats.shortestGame ? (
                          <Button
                            onClick={() => handleGameClick(positionStats.shortestGame, 'Shortest game')}
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700 p-0 h-auto text-sm"
                          >
                            {positionStats.shortestGame.plies || '?'} plies vs {playerColor === 'white' ? positionStats.shortestGame.black : positionStats.shortestGame.white}
                            <svg className="w-3 h-3 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                            </svg>
                          </Button>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">N/A</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Last played</span>
                        {positionStats.lastPlayed ? (
                          <Button
                            onClick={() => handleGameClick(positionStats.lastPlayed, 'Last played')}
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700 p-0 h-auto text-sm"
                          >
                            {positionStats.lastPlayed.date ? new Date(positionStats.lastPlayed.date).toLocaleDateString() : 'Unknown date'} vs {playerColor === 'white' ? positionStats.lastPlayed.black : positionStats.lastPlayed.white}
                            <svg className="w-3 h-3 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                            </svg>
                          </Button>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">N/A</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Total games</span>
                        <span className="text-gray-800 dark:text-gray-200">{positionStats.totalGames}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">Performance rating calculated based on FIDE regulations</p>
                    </div>
                  )}
                </div>
              )}


              {activeTab === 'moves' && (
                <div className="p-4">
                  <MovesTable
                    moves={moves}
                    onMove={(fen) => setCurrentFen(fen)}
                    perspective={(playerColor as 'white' | 'black') || 'white'}
                    highlightArrow={setHighlightedMove}
                    highlightedMove={highlightedMove}
                  />
                </div>
              )}

              {activeTab === 'list' && (
                <div className="p-4 flex flex-col" style={{ height: '800px' }}>
                  <div className="mb-3 flex-shrink-0">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Games at this position</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{results.length} game{results.length !== 1 ? 's' : ''} found</p>
                  </div>
                  <div className="flex-1 overflow-auto">
                    {results.length > 0 ? (
                      <ResultsTable results={results} />
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 py-4">No games found at this position.</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="p-4">
                  <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100">Settings</h2>
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-md font-semibold mb-2 text-gray-700 dark:text-gray-300">Games</h3>
                      <Button
                        onClick={beginImport}
                        variant="destructive"
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Clear Games
                      </Button>
                    </div>

                    <div>
                      <h3 className="text-md font-semibold mb-2 text-gray-700 dark:text-gray-300">Opening Book Cache</h3>
                      <div className="bg-gray-50 dark:bg-zinc-800 rounded-lg p-3 mb-3">
                        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                          {(() => {
                            const stats = bookCache.getCacheStats();
                            return (
                              <>
                                <div>Memory: {stats.memorySize}/{stats.memoryMaxSize} positions</div>
                                <div>Storage: {stats.localStorageSize}/{stats.localStorageMaxSize} positions</div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      <Button
                        onClick={() => {
                          bookCache.clearCache();
                          setBookMoves([]);
                        }}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Clear Cache
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </aside>

            {/* Navigation Buttons */}
            <div className="flex gap-2 p-2 bg-white dark:bg-zinc-900 shadow rounded border border-gray-200 dark:border-zinc-800">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={goStart}
                      size="icon"
                      variant="outline"
                      className="flex-1"
                      aria-label="Go to start"
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Go to Start</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={goBack}
                      size="icon"
                      variant="outline"
                      className="flex-1"
                      aria-label="Previous move"
                    >
                      <SkipBack className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Previous Move</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={goForward}
                      size="icon"
                      variant="outline"
                      className="flex-1"
                      aria-label="Next move"
                    >
                      <SkipForward className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Next Move</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={goEnd}
                      size="icon"
                      variant="outline"
                      className="flex-1"
                      aria-label="Go to end"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Go to End</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => setBoardOrientation(o => o === 'white' ? 'black' : 'white')}
                      size="icon"
                      variant="outline"
                      className="flex-1"
                      aria-label="Flip board"
                    >
                      <RotateCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Flip Board</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Loading saved games modal - non-blocking */}
          {loadingSavedGames && (
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl p-8 flex flex-col items-center gap-4 border border-gray-200 dark:border-zinc-700 pointer-events-auto">
                <LogoSpinner size="xl" />
                <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">Loading saved games...</p>
              </div>
            </div>
          )}

          {/* Loading status - completely separate below sidebar */}
          {isImporting && (
            <div className="w-80 bg-white dark:bg-zinc-900 p-4 rounded-lg shadow-lg flex-shrink-0 mt-4 border border-gray-200 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <GameCounter gamesLoaded={gamesLoaded} />
                <StopButton
                  disabled={isStopping}
                  onClick={() => {
                    if (isStopping) return; // Prevent multiple clicks
                    setIsStopping(true);
                    stopImport();
                    try {
                      workerRef.current?.postMessage({ type: 'stop' });
                      workerRef.current?.terminate();
                      workerRef.current = null;
                    } catch { }
                    try { networkAbortRef.current?.abort(); } catch { }
                    try {
                      endImport();
                    } catch { }
                    // Use setTimeout to ensure all async operations complete before hiding
                    setTimeout(() => {
                      setIsImporting(false);
                      setIsStopping(false);
                    }, 100);
                  }}
                />
              </div>
            </div>
          )}
        </main>

        {/* Game Modal */}
        {
          selectedGame && (
            <GameModal
              game={selectedGame.game}
              gameType={selectedGame.gameType}
              isOpen={!!selectedGame}
              onClose={() => setSelectedGame(null)}
              playerColor={playerColor as 'white' | 'black'}
            />
          )
        }
      </div >
    </TooltipProvider >
  );
};

import { Suspense } from 'react';

// Wrapper with Suspense for static generation
export default function UploadGamesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
      <UploadGames />
    </Suspense>
  );
}

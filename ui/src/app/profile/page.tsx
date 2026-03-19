
"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ActivityHeatmap from "@/components/ActivityHeatmap";
import StudyCard from "@/components/StudyCard";
import { getSessionId } from "@/lib/session";
import { getClientAuthHeaders } from "@/lib/auth";
import { useSession } from "next-auth/react";
import { useSavedReports, useCurrentAnalysis } from "@/hooks/useRepertoire";
import { useSavedRepertoires, useToggleFavorite, useDeleteRepertoire, useUpdateRepertoire } from "@/hooks/useRepertoires";
import { Button } from "@/components/ui/button";
import { BarChart3, FileText, TrendingUp, TrendingDown, Plus, Trash2, Settings, BookOpen, Star, ChevronLeft, ChevronRight } from "lucide-react";
import RepertoireCard from "@/components/RepertoireCard";
import { SavedRepertoire } from "@/types/repertoire";
import ProfilePictureUpload from "@/components/ProfilePictureUpload";
import SavedPuzzlesSection from "@/components/profile/SavedPuzzlesSection";
import ProfileGameRatingChart from "@/components/profile/ProfileGameRatingChart";
import ProfilePuzzleRatingChart from "@/components/profile/ProfilePuzzleRatingChart";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ProfileTrainerSection } from "@/components/trainer";
import AddOpeningModal from "@/components/profile/AddOpeningModal";
import { useProfileData } from "@/hooks/useProfileData";
import MiniBoardPreview from "@/components/MiniBoardPreview";
import { Chess } from "chess.js";

const dedupeGames = (list: any[]) => {
  const seen = new Set<string>();
  return list.filter((game) => {
    const key = [
      game.id ?? "",
      game.provider ?? "",
      game.source_id ?? "",
      game.digest ?? ""
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};



const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL as string || '/api/gateway';

export default function ProfilePage() {
  const { data: session } = useSession();
  const router = useRouter();

  // Aggregated profile data - single request for initial load
  const { data: profileData, loading: profileDataLoading, error: profileDataError, refetch: refetchProfileData } = useProfileData();

  const [games, setGames] = useState<any[]>([]);
  const [gamePgns, setGamePgns] = useState<Record<string, string>>({});
  const [gamePgnLoading, setGamePgnLoading] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [usernameFilter, setUsernameFilter] = useState("all");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [gamesPerPage, setGamesPerPage] = useState(10);
  const [studies, setStudies] = useState<any[]>([]);
  const [studiesLoading, setStudiesLoading] = useState(true);
  const [studiesError, setStudiesError] = useState<string | null>(null);

  // Activity heatmap state - initially populated from aggregated data
  const [activityData, setActivityData] = useState<{ date: string; count: number }[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);

  // Profile picture state - initially populated from aggregated data
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [profilePictureLoading, setProfilePictureLoading] = useState(true);

  // User info state - initially populated from aggregated data
  const [userInfo, setUserInfo] = useState<{ created_at: string | null } | null>(null);
  const [userInfoLoading, setUserInfoLoading] = useState(true);
  const [puzzleElo, setPuzzleElo] = useState<number | null>(null);
  const [puzzleEloLoading, setPuzzleEloLoading] = useState(true);

  // Mastered lines state
  const [masteredTotal, setMasteredTotal] = useState<number>(0);

  // Hover state for mini board
  const [hoveredGame, setHoveredGame] = useState<{ fen: string, x: number, y: number } | null>(null);

  // Handle game pgn loading
  const loadGamePgn = async (gameId: string) => {
    if (gamePgns[gameId]) return gamePgns[gameId];

    setGamePgnLoading(prev => ({ ...prev, [gameId]: true }));
    try {
      const resp = await fetch(`${GATEWAY_URL}/api/games/${gameId}/pgn`);
      if (resp.ok) {
        const pgn = await resp.text();
        setGamePgns(prev => ({ ...prev, [gameId]: pgn }));
        return pgn;
      }
    } catch (e) {
      console.error('Failed to load PGN:', e);
    } finally {
      setGamePgnLoading(prev => ({ ...prev, [gameId]: false }));
    }
    return null;
  };

  const handleGameHover = (e: React.MouseEvent, game: any) => {
    // Use already-cached PGN only — never fetch on hover to avoid re-render flicker
    const pgn = gamePgns[String(game.id)] || game.pgn;
    if (pgn) {
      try {
        const chess = new Chess();
        chess.loadPgn(pgn);
        setHoveredGame({
          fen: chess.fen(),
          x: e.clientX,
          y: e.clientY
        });
      } catch {
        // Invalid PGN, skip preview
      }
    }
  };

  // User info derived from NextAuth session
  const currentUser = session ? {
    email: session.user?.email || null,
    full_name: session.user?.name || null,
    subscription_status: 'free',
  } : null;

  // Hydrate state from aggregated data when it arrives
  useEffect(() => {
    if (profileData) {
      // Activity heatmap
      if (profileData.activity_heatmap) {
        setActivityData(profileData.activity_heatmap);
        setActivityLoading(false);
      }
      // User info
      if (profileData.user) {
        setProfilePicture(profileData.user.avatar_url);
        setProfilePictureLoading(false);
        setUserInfo(profileData.user);
        setPuzzleElo(profileData.user.puzzle_elo);
        setUserInfoLoading(false);
        setPuzzleEloLoading(false);
      }

      // Fetch mastered stats
      const fetchMastered = async () => {
        try {
          const resp = await fetch(`${GATEWAY_URL}/api/openings/mastered/stats`);
          if (resp.ok) {
            const d = await resp.json();
            setMasteredTotal(d.total || 0);
          }
        } catch (e) {
          console.error("Failed to fetch mastered stats:", e);
        }
      };
      fetchMastered();

      // Linked accounts
      if (profileData.linked_accounts_list) {
        setLinkedAccounts(profileData.linked_accounts_list);
        setLinkedAccountsLoading(false);
      }
      // Sync status
      if (profileData.sync_status) {
        setSyncStatus(profileData.sync_status);
      }
    }
  }, [profileData]);

  // Linked accounts state
  const [linkedAccounts, setLinkedAccounts] = useState<{ platform: string; username: string }[]>([]);
  const [showOnlyMyGames, setShowOnlyMyGames] = useState(false);
  const [newAccountPlatform, setNewAccountPlatform] = useState('');
  const [newAccountUsername, setNewAccountUsername] = useState('');
  const [linkedAccountsLoading, setLinkedAccountsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<Record<string, {
    username: string;
    status: string;
    last_synced_at: string | null;
    games_synced: number;
    error_message: string | null;
  }>>({});
  const [syncing, setSyncing] = useState(false);
  const fallbackTriggered = useRef(false);

  // Repertoire reports data
  const { data: savedReports, isLoading: reportsLoading } = useSavedReports();
  const { currentAnalysis } = useCurrentAnalysis();

  // Repertoires data with real API hooks
  const { data: savedRepertoires = [], isLoading: repertoiresLoading, error: repertoireApiError } = useSavedRepertoires();
  const toggleFavoriteMutation = useToggleFavorite();
  const deleteRepertoireMutation = useDeleteRepertoire();
  const updateRepertoireMutation = useUpdateRepertoire();
  const repertoiresError = repertoireApiError ? (repertoireApiError as Error).message : null;

  // Add Opening Modal state
  const [addOpeningModalOpen, setAddOpeningModalOpen] = useState(false);
  const [addOpeningTarget, setAddOpeningTarget] = useState<{
    id: string;
    name: string;
    color: "white" | "black" | "both";
  } | null>(null);

  // Remove mountedRef - React 18+ handles this properly with automatic batching
  // Using AbortController for proper cleanup instead

  const fetchGames = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const headers: Record<string, string> = {};
      const sid = getSessionId();
      if (sid) headers['x-session-id'] = sid;
      const resp = await fetch(`${GATEWAY_URL}/games?limit=100`, { headers });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      setGames(dedupeGames(items));
    } catch (e: any) {
      setError(e?.message || 'Failed to load games');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGamePgn = useCallback(async (gameId: string | number) => {
    const id = String(gameId);
    if (gamePgns[id]) return gamePgns[id];
    try {
      setGamePgnLoading(prev => ({ ...prev, [id]: true }));
      const headers: Record<string, string> = {};
      const sid = getSessionId();
      if (sid) headers['x-session-id'] = sid;

      const resp = await fetch(`${GATEWAY_URL}/games/${id}/pgn`, { headers });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      const pgn = data?.pgn || "";
      if (pgn) {
        setGamePgns(prev => ({ ...prev, [id]: pgn }));
      }
      return pgn;
    } finally {
      setGamePgnLoading(prev => ({ ...prev, [id]: false }));
    }
  }, [gamePgns]);

  const handleOpenGame = useCallback(async (gameId: string | number, mode: "review" | "analyze") => {
    try {
      const id = String(gameId);
      const existingPgn = gamePgns[id];
      const pgn = existingPgn || await fetchGamePgn(id);
      if (!pgn) throw new Error("Missing PGN");
      const target = mode === "review"
        ? `/game-review?pgn=${encodeURIComponent(pgn)}`
        : `/analyze?pgn=${encodeURIComponent(pgn)}`;
      router.push(target);
    } catch (e) {
      console.error("Failed to open game:", e);
      alert("Failed to load PGN for this game.");
    }
  }, [fetchGamePgn, gamePgns, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const existing = localStorage.getItem('session-id');
    if (!existing) {
      const cookieSession = getSessionId();
      if (cookieSession) {
        localStorage.setItem('session-id', cookieSession);
      } else if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        const sid = crypto.randomUUID();
        localStorage.setItem('session-id', sid);
      }
    }
  }, []);

  const normalizedGames = useMemo(() => {
    // Determine user's color from PGN headers (for Maia games, user is "You")
    const getUserColor = (pgn: string): "white" | "black" | null => {
      if (!pgn) return null;
      const whiteMatch = pgn.match(/\[White "([^"]+)"\]/);
      const blackMatch = pgn.match(/\[Black "([^"]+)"\]/);
      const whiteName = whiteMatch ? whiteMatch[1] : null;
      const blackName = blackMatch ? blackMatch[1] : null;

      if (whiteName === "You") return "white";
      if (blackName === "You") return "black";
      return null; // Can't determine for external games without more context
    };

    const normalizeResult = (result: string | null | undefined, pgn?: string): "win" | "loss" | "draw" | null => {
      const val = (result || "").toLowerCase();
      if (!val) return null;
      if (val === "1/2-1/2" || val === "draw") return "draw";

      // For standard notation, determine from user's perspective
      const userColor = pgn ? getUserColor(pgn) : null;

      if (val === "1-0") {
        // White won
        if (userColor === "white") return "win";
        if (userColor === "black") return "loss";
        return "win"; // Default for external games (assume user played White)
      }
      if (val === "0-1") {
        // Black won
        if (userColor === "black") return "win";
        if (userColor === "white") return "loss";
        return "loss"; // Default for external games (assume user played White)
      }

      // Direct win/loss labels
      if (val === "win") return "win";
      if (val === "loss") return "loss";

      return null;
    };

    const extractOpponentFromPgn = (pgn: string): string => {
      if (!pgn) return "Unknown";

      // Try to extract White and Black player names from PGN headers
      const whiteMatch = pgn.match(/\[White "([^"]+)"\]/);
      const blackMatch = pgn.match(/\[Black "([^"]+)"\]/);

      const whiteName = whiteMatch ? whiteMatch[1] : null;
      const blackName = blackMatch ? blackMatch[1] : null;

      // If we have both names, figure out which one is the opponent
      if (whiteName && blackName) {
        // For Maia games, the user is always "You"
        if (whiteName === "You") return blackName;
        if (blackName === "You") return whiteName;

        // Check for common bot/engine identifiers
        const isMaia = (name: string) => name.toLowerCase().includes("maia");
        if (isMaia(whiteName)) return whiteName;
        if (isMaia(blackName)) return blackName;

        // Default: return Black (assuming user often plays White for external games)
        return blackName;
      }

      return whiteName || blackName || "Unknown";
    };

    const categorizeTimeControl = (timeControl: string): string => {
      if (!timeControl) return "Unknown";

      // Handle various time control formats
      const tc = timeControl.toLowerCase();

      // Extract base time and increment if present
      let baseTime = 0;
      let increment = 0;

      // Handle formats like "60+0", "180+2", "600+0", etc.
      const plusMatch = tc.match(/(\d+)\+(\d+)/);
      if (plusMatch) {
        baseTime = parseInt(plusMatch[1]);
        increment = parseInt(plusMatch[2]);
      } else {
        // Handle simple number formats or named formats
        const numberMatch = tc.match(/(\d+)/);
        if (numberMatch) {
          baseTime = parseInt(numberMatch[1]);
        } else if (tc.includes("bullet")) {
          return "Bullet";
        } else if (tc.includes("blitz")) {
          return "Blitz";
        } else if (tc.includes("rapid")) {
          return "Rapid";
        } else if (tc.includes("classical") || tc.includes("standard")) {
          return "Classical";
        }
      }

      // Calculate effective time (base + 40 moves * increment)
      const effectiveTime = baseTime + (40 * increment);

      if (effectiveTime < 180) {
        return "Bullet";
      } else if (effectiveTime < 600) {
        return "Blitz";
      } else if (effectiveTime < 1800) {
        return "Rapid";
      } else {
        return "Classical";
      }
    };

    return games.map((g: any) => {
      const provider = (g.provider || "").toLowerCase();
      let platform = g.provider || g.source || g.site || "";
      if (provider === "lichess") platform = "lichess.org";
      if (provider === "chess.com") platform = "chess.com";

      // Try to get opponent from database field first, then extract from PGN
      let opponent = g.opponent_username || g.opponent;
      if (!opponent || opponent === "") {
        opponent = extractOpponentFromPgn(g.pgn);
      }

      const startedAt = g.start_time || g.startTime || g.created_at || g.createdAt || null;
      const dateObj = startedAt ? new Date(startedAt) : null;
      const rawTimeControl = g.time_control || g.timeControl || g.perf || "";
      const timeControl = categorizeTimeControl(rawTimeControl);
      const cachedPgn = gamePgns[String(g.id)] || g.pgn || "";
      return {
        ...g,
        platform,
        opponent,
        timeControl,
        rawTimeControl,
        resultLabel: g.result || "",
        resultKey: normalizeResult(g.result, cachedPgn),
        dateValue: dateObj,
        dateLabel: dateObj
          ? dateObj.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric" })
          : "",
        pgn: cachedPgn,
      };
    });
  }, [games, gamePgns]);

  const filteredGames = useMemo(() => {
    return normalizedGames.filter((g: any) => {
      const matchesSearch =
        !search || g.opponent.toLowerCase().includes(search.toLowerCase());
      const matchesResult =
        resultFilter === "all" || g.resultKey === resultFilter;
      const matchesTime =
        timeFilter === "all" || g.timeControl.toLowerCase() === timeFilter.toLowerCase();
      const matchesPlatform =
        platformFilter === "all" || g.platform === platformFilter;
      const matchesUsername =
        usernameFilter === "all" || g.opponent === usernameFilter;
      return matchesSearch && matchesResult && matchesTime && matchesPlatform && matchesUsername;
    });
  }, [normalizedGames, search, resultFilter, timeFilter, platformFilter, usernameFilter]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, resultFilter, timeFilter, platformFilter, usernameFilter]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredGames.length / gamesPerPage);
  const paginatedGames = useMemo(() => {
    const startIndex = (currentPage - 1) * gamesPerPage;
    return filteredGames.slice(startIndex, startIndex + gamesPerPage);
  }, [filteredGames, currentPage, gamesPerPage]);

  // Preload PGNs for the current page of games (enables hover preview)
  useEffect(() => {
    if (paginatedGames.length === 0) return;
    const missing = paginatedGames.filter(
      (g: any) => !gamePgns[String(g.id)] && !g.pgn && !gamePgnLoading[String(g.id)]
    );
    if (missing.length === 0) return;
    missing.forEach((g: any) => loadGamePgn(String(g.id)));
  }, [paginatedGames, gamePgns, gamePgnLoading]);

  // Get unique usernames for the dropdown
  const availableUsernames = useMemo(() => {
    const usernames = new Set<string>();
    normalizedGames.forEach((game: any) => {
      if (game.opponent && game.opponent !== "Unknown") {
        usernames.add(game.opponent);
      }
    });
    return Array.from(usernames).sort();
  }, [normalizedGames]);

  // Get unique platforms/sources for the dropdown
  const availablePlatforms = useMemo(() => {
    const platforms = new Set<string>();
    normalizedGames.forEach((game: any) => {
      if (game.platform) {
        platforms.add(game.platform);
      }
    });
    return Array.from(platforms).sort();
  }, [normalizedGames]);

  // Convert platform for display
  const getPlatformDisplay = (platform: string): string => {
    if (platform === "chess.com") return "Chess.com";
    if (platform === "lichess.org") return "Lichess";
    if (platform.toLowerCase().includes("maia") || platform.toLowerCase().includes("bot")) return "Bot Play";
    return platform;
  };

  const loadStudies = useCallback(async () => {
    console.log('[PROFILE STUDIES] 🔄 Starting studies fetch...');
    try {
      setStudiesLoading(true);
      setStudiesError(null);
      const headers = await getClientAuthHeaders({ includeContentType: false });
      console.log('[PROFILE STUDIES] Session ID from cookie:', headers['x-session-id'] || getSessionId());
      if (headers['Authorization']) {
        console.log('[PROFILE STUDIES] Added auth header');
      }

      console.log('[PROFILE STUDIES] Making GET request to /studies...');
      console.log('[PROFILE STUDIES] Headers:', headers);
      const resp = await fetch(`${GATEWAY_URL}/studies`, { headers });
      console.log('[PROFILE STUDIES] Response status:', resp.status);

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error('[PROFILE STUDIES] Error response:', errorText);
        throw new Error(errorText);
      }

      const data = await resp.json();
      console.log('[PROFILE STUDIES] Raw response data:', data);

      const studiesArray = Array.isArray(data) ? data : (Array.isArray(data?.studies) ? data.studies : []);
      console.log('[PROFILE STUDIES] Studies array length:', studiesArray.length);
      console.log('[PROFILE STUDIES] Studies data:', studiesArray);

      setStudies(studiesArray);
      console.log('[PROFILE STUDIES] ✅ Studies loaded successfully!');
    } catch (e: any) {
      console.error('[PROFILE STUDIES] ❌ Failed to load studies:', e);
      setStudiesError(e?.message || 'Failed to load studies');
    } finally {
      setStudiesLoading(false);
      console.log('[PROFILE STUDIES] 🏁 Fetch complete');
    }
  }, []);

  const fetchActivityData = useCallback(async () => {
    console.log('[ACTIVITY HEATMAP] 🔄 Starting fetch...');

    try {
      setActivityLoading(true);
      console.log('[ACTIVITY HEATMAP] Loading state set to TRUE');

      setActivityError(null);
      const headers: Record<string, string> = {};
      const sid = getSessionId();
      console.log('[ACTIVITY HEATMAP] Session ID from cookie/header:', sid);

      if (sid) headers['x-session-id'] = sid;

      console.log('[ACTIVITY HEATMAP] Making GET request to /activities/heatmap...');
      console.log('[ACTIVITY HEATMAP] Headers:', headers);

      const resp = await fetch(`${GATEWAY_URL}/activities/heatmap?weeks=52`, { headers });
      console.log('[ACTIVITY HEATMAP] Response status:', resp.status);

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error('[ACTIVITY HEATMAP] Error response:', errorText);
        throw new Error(errorText || `HTTP ${resp.status}`);
      }

      const result = await resp.json();
      console.log('[ACTIVITY HEATMAP] Response data:', result);
      console.log('[ACTIVITY HEATMAP] Activity count:', result.data?.length || 0);

      setActivityData(result.data || []);
      console.log('[ACTIVITY HEATMAP] ✅ Data set successfully!');
    } catch (e: any) {
      console.error('[ACTIVITY HEATMAP] ❌ Fetch error:', e);
      setActivityError(e?.message || 'Failed to load activity data');
      console.log('[ACTIVITY HEATMAP] Error state set:', e?.message);
    } finally {
      setActivityLoading(false);
      console.log('[ACTIVITY HEATMAP] Loading state set to FALSE');
      console.log('[ACTIVITY HEATMAP] 🏁 Fetch complete');
    }
  }, []);

  const fetchProfilePicture = useCallback(async () => {
    try {
      setProfilePictureLoading(true);
      const headers: Record<string, string> = {};
      const sid = getSessionId();
      if (sid) headers['x-session-id'] = sid;

      const resp = await fetch(`${GATEWAY_URL}/profile/picture`, { headers });

      if (resp.ok) {
        const data = await resp.json();
        setProfilePicture(data.profile_picture);
      }
    } catch (e: any) {
      console.error('Failed to load profile picture:', e);
    } finally {
      setProfilePictureLoading(false);
    }
  }, []);

  const fetchUserInfo = useCallback(async () => {
    try {
      setUserInfoLoading(true);
      const headers: Record<string, string> = {};
      const sid = getSessionId();
      if (sid) headers['x-session-id'] = sid;

      const resp = await fetch(`${GATEWAY_URL}/profile/info`, { headers });

      if (resp.ok) {
        const data = await resp.json();
        setUserInfo(data);
      }
    } catch (e: any) {
      console.error('Failed to load user info:', e);
    } finally {
      setUserInfoLoading(false);
    }
  }, []);

  const fetchPuzzleElo = useCallback(async () => {
    try {
      setPuzzleEloLoading(true);
      const headers: Record<string, string> = {};
      const sid = getSessionId();
      if (sid) headers['x-session-id'] = sid;

      const resp = await fetch(`${GATEWAY_URL}/api/me/puzzle-elo`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        setPuzzleElo(data.rating || null);
      }
    } catch (e: any) {
      console.error('Failed to load puzzle elo:', e);
    } finally {
      setPuzzleEloLoading(false);
    }
  }, []);

  const deleteStudy = async (id: number) => {
    try {
      const headers: Record<string, string> = {};
      const sid = getSessionId();
      if (sid) headers['x-session-id'] = sid;

      const resp = await fetch(`${GATEWAY_URL}/studies/${id}`, {
        method: 'DELETE',
        headers
      });

      if (!resp.ok) throw new Error(await resp.text());

      // Remove the study from local state
      setStudies(prev => prev.filter(s => s.id !== id));
    } catch (e: any) {
      throw new Error(e?.message || 'Failed to delete study');
    }
  };

  const handleFavoriteRepertoire = async (id: string, favorite: boolean) => {
    try {
      await toggleFavoriteMutation.mutateAsync({ id, favorite });
    } catch (e: any) {
      console.error('Failed to update favorite status:', e);
    }
  };

  const handleDeleteRepertoire = async (id: string) => {
    try {
      await deleteRepertoireMutation.mutateAsync(id);
    } catch (e: any) {
      console.error('Failed to delete repertoire:', e);
    }
  };

  const handleAddOpening = (repertoire: any) => {
    setAddOpeningTarget({
      id: repertoire.id,
      name: repertoire.name,
      color: repertoire.color || 'both',
    });
    setAddOpeningModalOpen(true);
  };

  const handleRenameRepertoire = async (repertoire: SavedRepertoire) => {
    const newName = window.prompt('Enter new name for repertoire:', repertoire.name);
    if (!newName || newName === repertoire.name) return;

    try {
      await updateRepertoireMutation.mutateAsync({
        id: repertoire.id,
        name: newName.trim(),
      });
    } catch (e: any) {
      console.error('Failed to rename repertoire:', e);
    }
  };

  // Linked accounts functions
  const loadLinkedAccounts = useCallback(async () => {
    try {
      setLinkedAccountsLoading(true);
      const headers: Record<string, string> = {};
      const sid = getSessionId();
      if (sid) headers['x-session-id'] = sid;

      const resp = await fetch(`${GATEWAY_URL}/profile/linked-accounts`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        setLinkedAccounts(data.accounts || []);
        setShowOnlyMyGames(data.show_only_my_games || false);
      }
    } catch (e) {
      console.error('Failed to load linked accounts:', e);
    } finally {
      setLinkedAccountsLoading(false);
    }
  }, []);

  const loadSyncStatus = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      const sid = getSessionId();
      if (sid) headers['x-session-id'] = sid;

      const resp = await fetch(`${GATEWAY_URL}/api/profile/sync-status`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        setSyncStatus(data.providers || {});
      }
    } catch (e) {
      console.error('Failed to load sync status:', e);
    }
  }, []);

  const addLinkedAccount = async () => {
    if (!newAccountPlatform || !newAccountUsername) return;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const sid = getSessionId();
      if (sid) headers['x-session-id'] = sid;

      const resp = await fetch(`${GATEWAY_URL}/profile/linked-accounts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          platform: newAccountPlatform,
          username: newAccountUsername
        })
      });

      if (resp.ok) {
        setLinkedAccounts(prev => [...prev, { platform: newAccountPlatform, username: newAccountUsername }]);
        setNewAccountPlatform('');
        setNewAccountUsername('');
        // Refresh sync status after a short delay to show sync in progress
        setTimeout(() => loadSyncStatus(), 1000);
      } else {
        throw new Error(await resp.text());
      }
    } catch (e: any) {
      console.error('Failed to add linked account:', e?.message || e);
    }
  };

  const removeLinkedAccount = async (platform: string, username: string) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const sid = getSessionId();
      if (sid) headers['x-session-id'] = sid;

      const resp = await fetch(`${GATEWAY_URL}/profile/linked-accounts`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ platform, username })
      });

      if (resp.ok) {
        setLinkedAccounts(prev => prev.filter(acc => !(acc.platform === platform && acc.username === username)));
      } else {
        throw new Error(await resp.text());
      }
    } catch (e: any) {
      console.error('Failed to remove linked account:', e?.message || e);
    }
  };

  const triggerSync = async () => {
    try {
      setSyncing(true);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const sid = getSessionId();
      if (sid) headers['x-session-id'] = sid;

      const resp = await fetch(`${GATEWAY_URL}/api/profile/sync/trigger`, {
        method: 'POST',
        headers
      });

      if (resp.ok) {
        // Poll for status updates
        const pollInterval = setInterval(async () => {
          await loadSyncStatus();
          const currentStatus = await fetch(`${GATEWAY_URL}/api/profile/sync-status`, { headers }).then(r => r.json());
          const allIdle = Object.values(currentStatus.providers || {}).every((p: any) => p.status === 'idle');
          if (allIdle) {
            clearInterval(pollInterval);
            setSyncing(false);
            fetchGames(); // Refresh games list
          }
        }, 2000);
        // Stop polling after 2 minutes max
        setTimeout(() => clearInterval(pollInterval), 120000);
      }
    } catch (e: any) {
      console.error('Failed to trigger sync:', e?.message || e);
      setSyncing(false);
    }
  };

  const updateShowOnlyMyGames = async (enabled: boolean) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const sid = getSessionId();
      if (sid) headers['x-session-id'] = sid;

      const resp = await fetch(`${GATEWAY_URL}/profile/settings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ show_only_my_games: enabled })
      });

      if (resp.ok) {
        setShowOnlyMyGames(enabled);
      } else {
        throw new Error(await resp.text());
      }
    } catch (e: any) {
      console.error('Failed to update settings:', e?.message || e);
    }
  };

  useEffect(() => {
    if (profileDataLoading || fallbackTriggered.current) return;

    const missingCore = !profileData || !!profileDataError;
    const missingActivity = !profileData?.activity_heatmap;
    const missingUser = !profileData?.user;
    const missingLinked = !profileData?.linked_accounts_list;
    const missingSync = !profileData?.sync_status;

    if (missingCore || missingActivity || missingUser || missingLinked || missingSync) {
      fallbackTriggered.current = true;

      if (missingActivity) {
        fetchActivityData();
      }

      if (missingUser) {
        fetchProfilePicture();
        fetchUserInfo();
        fetchPuzzleElo();
      }

      if (missingLinked) {
        loadLinkedAccounts();
      }

      if (missingSync) {
        loadSyncStatus();
      }
    }
  }, [
    profileData,
    profileDataError,
    profileDataLoading,
    fetchActivityData,
    fetchProfilePicture,
    fetchUserInfo,
    fetchPuzzleElo,
    loadLinkedAccounts,
    loadSyncStatus,
  ]);

  // Main data fetch - only for data not included in aggregated endpoint
  // Activity, userInfo, puzzleElo, linkedAccounts, syncStatus come from useProfileData
  useEffect(() => {
    fetchGames();
    loadStudies();
    // Other data now comes from useProfileData aggregated endpoint
  }, [fetchGames, loadStudies]);

  const refreshDeps = useRef<{ reportsLen?: number; analysisId?: string | undefined }>({
    reportsLen: savedReports?.length,
    analysisId: currentAnalysis?.id,
  });

  useEffect(() => {
    const prev = refreshDeps.current;
    const reportsChanged = prev.reportsLen !== savedReports?.length;
    const analysisChanged = prev.analysisId !== currentAnalysis?.id;
    refreshDeps.current = {
      reportsLen: savedReports?.length,
      analysisId: currentAnalysis?.id,
    };
    if (reportsChanged || analysisChanged) {
      fetchGames();
      refetchProfileData(); // Refresh aggregated data when reports change
    }
  }, [fetchGames, refetchProfileData, savedReports?.length, currentAnalysis?.id]);

  // Determine if profile is fully ready (for testing)
  const isProfileReady = !profileDataLoading && profileData && !loading;
  const isPremiumStatus = ["premium", "active", "trialing"].includes(
    currentUser?.subscription_status || ""
  );

  return (
    <div className="container mx-auto p-4">
      {/* Hidden element for performance testing - only renders when data is ready */}
      {isProfileReady && <div data-testid="profile-ready" style={{ display: 'none' }} />}
      {profileDataError && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load profile stats from the gateway. {profileDataError}
        </div>
      )}
      {/* Profile Info Section */}
      <Card className="mb-8">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6">
            {/* Avatar with Upload */}
            <ProfilePictureUpload
              currentPicture={profilePicture}
              username={currentUser?.full_name || currentUser?.email || 'User'}
              onUpdate={(newPicture) => setProfilePicture(newPicture)}
            />

            {/* User Info */}
            <div className="flex-grow text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 mb-2">
                <h1 className="text-2xl sm:text-3xl font-bold">{currentUser?.full_name || currentUser?.email || 'User'}</h1>
                <Badge variant={isPremiumStatus ? "default" : "secondary"}>
                  {isPremiumStatus ? "Premium" : "Free"}
                </Badge>
              </div>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-4 text-sm text-muted-foreground">
                <div className="flex items-center justify-center sm:justify-start">
                  <span className="font-medium">Member since:</span>
                  <span className="ml-1">
                    {userInfoLoading ? (
                      'Loading...'
                    ) : userInfo?.created_at ? (
                      new Date(userInfo.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })
                    ) : (
                      'Unknown'
                    )}
                  </span>
                  <span className="mx-2 text-muted-foreground">|</span>
                  <span className="font-medium">Puzzle Rating:</span>
                  <span className="ml-1 font-bold">
                    {puzzleEloLoading ? '...' : puzzleElo || '1500'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Linking Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Linked Chess Accounts
            </div>
            {linkedAccounts.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={triggerSync}
                disabled={syncing}
                className="flex items-center gap-2"
              >
                {syncing ? (
                  <>
                    <span className="animate-spin">⟳</span>
                    Syncing...
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-4 h-4" />
                    Sync Now
                  </>
                )}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Linked Accounts List */}
            <div>
              {linkedAccountsLoading ? (
                <p className="text-sm text-muted-foreground">Loading linked accounts...</p>
              ) : linkedAccounts.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {linkedAccounts.map((account, index) => {
                    const status = syncStatus[account.platform];
                    return (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="capitalize">
                            {account.platform === 'lichess.org' ? 'Lichess' : 'Chess.com'}
                          </Badge>
                          <span className="font-medium">{account.username}</span>
                          {status && (
                            <span className="text-xs text-muted-foreground">
                              {status.status === 'syncing' && <span className="text-blue-500">⟳ Syncing...</span>}
                              {status.status === 'idle' && status.last_synced_at && (
                                <span className="text-green-600">✓ {status.games_synced} games synced</span>
                              )}
                              {status.status === 'failed' && <span className="text-red-500">⚠ Sync failed</span>}
                              {status.status === 'never_synced' && <span className="text-muted-foreground">Not yet synced</span>}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLinkedAccount(account.platform, account.username)}
                          className="text-red-600 hover:text-red-700"
                          aria-label={`Remove ${account.platform} account ${account.username}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mb-4">
                  No accounts linked yet. Add your Chess.com or Lichess usernames to automatically sync your games.
                </p>
              )}

              {/* Add New Account Form */}
              <div className="border-t pt-4">
                <h2 className="text-sm font-medium mb-3">Add Account</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Label htmlFor="linked-account-platform" id="linked-account-platform-label" className="sr-only">
                    Platform
                  </Label>
                  <Select value={newAccountPlatform} onValueChange={setNewAccountPlatform}>
                    <SelectTrigger id="linked-account-platform" aria-labelledby="linked-account-platform-label">
                      <SelectValue placeholder="Platform" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chess.com">Chess.com</SelectItem>
                      <SelectItem value="lichess.org">Lichess</SelectItem>
                    </SelectContent>
                  </Select>
                  <Label htmlFor="linked-account-username" id="linked-account-username-label" className="sr-only">
                    Username
                  </Label>
                  <Input
                    id="linked-account-username"
                    aria-labelledby="linked-account-username-label"
                    placeholder="Username"
                    value={newAccountUsername}
                    onChange={(e) => setNewAccountUsername(e.target.value)}
                  />
                  <Button
                    onClick={addLinkedAccount}
                    disabled={!newAccountPlatform || !newAccountUsername}
                    className="flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Account
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Games will be synced automatically when you add an account.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rating Progress Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Rating Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Game Rating</h3>
              <ProfileGameRatingChart data={profileData?.ratings?.game} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Puzzle Rating</h3>
              <ProfilePuzzleRatingChart data={profileData?.ratings?.puzzle} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Trainer Section */}
      {/* <ProfileTrainerSection preloadedData={profileData?.trainer} /> */}

      <Card className="mb-8">
        <CardContent className="p-4 sm:p-6">
          <div className="mb-6 flex justify-center">
            <div className="w-full max-w-4xl px-4">
              <ActivityHeatmap
                data={activityData}
                loading={activityLoading}
                error={activityError}
                weeks={52}
              />
            </div>
          </div>

          {/* Stats under Activity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            {/* Lines Mastered Progress */}
            <div className="border rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-2">Lines Mastered</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full transition-all duration-300"
                    style={{
                      width: `${savedRepertoires.length > 0 ? Math.min((savedRepertoires.filter((r: SavedRepertoire) => r.total_games > 0).length / savedRepertoires.length) * 100, 100) : 0}%`
                    }}
                  />
                </div>
                <span className="text-sm font-semibold text-foreground">
                  {masteredTotal} lines
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">Total opening lines mastered</div>
            </div>

            {/* Puzzle Elo */}
            <div className="border rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-2">Puzzle Rating</div>
              <div className="flex items-center gap-2">
                {puzzleEloLoading ? (
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-2xl font-bold text-foreground">
                    {puzzleElo !== null ? puzzleElo.toLocaleString() : '—'}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Current puzzle rating</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Saved Analysis Section */}
      <Card className="mb-8">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-xl sm:text-2xl font-bold">Saved Analysis</h2>
            <div className="flex items-center gap-2">
              {studiesLoading && (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              )}
              <Button asChild size="sm">
                <Link href="/analyze">
                  New Analysis
                </Link>
              </Button>
            </div>
          </div>

          {studiesError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <span className="text-red-700 text-sm">{studiesError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {studies.length === 0 && !studiesLoading ? (
              <div className="col-span-full text-center py-8">
                <div className="border rounded-lg p-8 flex flex-col items-center justify-center text-muted-foreground">
                  <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <h3 className="text-lg font-medium mb-2">No saved studies yet</h3>
                  <p className="text-sm mb-4">Start analyzing games and save your studies to see them here</p>
                  <Button asChild>
                    <Link href="/analyze">
                      Start Analyzing
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              studies.map((study) => (
                <StudyCard
                  key={study.id}
                  study={study}
                  onDelete={deleteStudy}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Repertoire Reports Section */}
      <Card className="mb-8">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-xl sm:text-2xl font-bold">Repertoire Analysis</h2>
            <div className="flex items-center gap-2">
              {reportsLoading && (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              )}
              <Button asChild size="sm" variant="secondary">
                <Link href="/reports">
                  View All Reports
                </Link>
              </Button>
            </div>
          </div>

          {!reportsLoading && savedReports && savedReports.length > 0 ? (
            <div className="space-y-4">
              {/* Latest Report Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {savedReports.slice(0, 2).map((report) => (
                  <Card key={report.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-lg">{report.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {new Date(report.updated_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                        <FileText className="w-5 h-5 text-muted-foreground" />
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div className="text-center">
                          <div className="text-xl font-bold text-blue-600">{report.total_games}</div>
                          <div className="text-xs text-muted-foreground">Games</div>
                        </div>
                        <div className="text-center">
                          <div className={`text-xl font-bold flex items-center justify-center gap-1 ${report.overall_winrate >= 0.5 ? 'text-green-600' : 'text-red-600'
                            }`}>
                            {report.overall_winrate >= 0.5 ? (
                              <TrendingUp className="w-4 h-4" />
                            ) : (
                              <TrendingDown className="w-4 h-4" />
                            )}
                            {(report.overall_winrate * 100).toFixed(1)}%
                          </div>
                          <div className="text-xs text-muted-foreground">Winrate</div>
                        </div>
                      </div>

                      {report.preview_openings && report.preview_openings.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-muted-foreground mb-1">Top Openings:</div>
                          <div className="flex flex-wrap gap-1">
                            {report.preview_openings.slice(0, 3).map((eco, idx) => (
                              <Badge key={`${eco}-${idx}`} variant="outline" className="text-xs">
                                {eco}
                              </Badge>
                            ))}
                            {report.preview_openings.length > 3 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="text-xs cursor-help">
                                      +{report.preview_openings.length - 3}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="flex flex-col gap-1">
                                      {report.preview_openings.slice(3).map((eco, idx) => (
                                        <span key={`${eco}-${idx}`} className="text-xs">{eco}</span>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button asChild size="sm" className="flex-1">
                          <Link href={`/reports/${report.id}`}>
                            View Report
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {savedReports.length > 2 && (
                <div className="text-center">
                  <Link
                    href="/reports"
                    className="inline-flex items-center gap-2 px-4 py-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    <BarChart3 className="w-4 h-4" />
                    View all {savedReports.length} reports
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="border rounded-lg p-8 flex flex-col items-center justify-center text-muted-foreground">
                <BarChart3 className="w-12 h-12 mb-4" />
                <h3 className="text-lg font-medium mb-2">No repertoire analysis yet</h3>
                <p className="text-sm mb-4">Analyze your opening repertoire to see strengths and weaknesses</p>
                <Button asChild variant="secondary">
                  <Link href="/reports">
                    Generate First Report
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Personalized Puzzles Section */}
      <Card className="mb-8">
        <CardContent className="p-4 sm:p-6">
          <SavedPuzzlesSection />
        </CardContent>
      </Card>

      {/* Saved Repertoires Section */}
      <Card className="mb-8">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-xl sm:text-2xl font-bold">My Repertoires</h2>
            <div className="flex items-center gap-2">
              {repertoiresLoading && (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              )}
              <Button asChild size="sm">
                <Link href="/reports">
                  Create From Report
                </Link>
              </Button>
            </div>
          </div>

          {repertoiresError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <span className="text-red-700 text-sm">{repertoiresError}</span>
            </div>
          )}

          {!repertoiresLoading && savedRepertoires && savedRepertoires.length > 0 ? (
            <div className="space-y-4">
              {/* Favorites first */}
              {savedRepertoires.filter(rep => rep.favorite).length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-500" />
                    Favorites
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {savedRepertoires
                      .filter(rep => rep.favorite)
                      .map((repertoire) => (
                        <RepertoireCard
                          key={repertoire.id}
                          repertoire={repertoire}
                          variant="saved"
                          onFavorite={handleFavoriteRepertoire}
                          onDelete={handleDeleteRepertoire}
                          onPractice={() => window.location.href = '/practice'}
                          onAddOpening={handleAddOpening}
                          onRename={handleRenameRepertoire}
                          showActions={true}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* All Repertoires */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-muted-foreground" />
                  All Repertoires ({savedRepertoires.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {savedRepertoires.map((repertoire) => (
                    <RepertoireCard
                      key={repertoire.id}
                      repertoire={repertoire}
                      variant="saved"
                      onFavorite={handleFavoriteRepertoire}
                      onDelete={handleDeleteRepertoire}
                      onPractice={() => window.location.href = '/practice'}
                      onAddOpening={handleAddOpening}
                      onRename={handleRenameRepertoire}
                      showActions={true}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="border rounded-lg p-8 flex flex-col items-center justify-center text-muted-foreground">
                <BookOpen className="w-12 h-12 mb-4" />
                <h3 className="text-lg font-medium mb-2">No saved repertoires yet</h3>
                <p className="text-sm mb-4">Generate a repertoire analysis and save suggested repertoires to see them here</p>
                <Button asChild>
                  <Link href="/reports">
                    Generate Report
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-2xl font-bold">Your Games</CardTitle>
              {linkedAccounts.length > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  Showing games for:{' '}
                  {linkedAccounts.map((acc, i) => (
                    <span key={`${acc.platform}-${acc.username}`}>
                      <span className="font-medium">{acc.username}</span>
                      <span className="text-xs ml-1">({acc.platform === 'chess.com' ? 'Chess.com' : 'Lichess'})</span>
                      {i < linkedAccounts.length - 1 && ', '}
                    </span>
                  ))}
                </p>
              )}
            </div>
            {filteredGames.length > 0 && (
              <div className="text-sm text-muted-foreground">
                {filteredGames.length} game{filteredGames.length !== 1 ? 's' : ''} found
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading && <div className="mb-2 text-sm text-muted-foreground">Loading your games…</div>}
          {error && (
            <div className="mb-2 text-sm text-red-600" role="alert">
              {error}
            </div>
          )}
          {!loading && !error && games.length === 0 && (
            <div className="mb-4 p-4 border border-solid rounded-md bg-slate-50 dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300">
              No games imported yet.{' '}
              <Link href="/import" className="text-slate-700 dark:text-slate-300 underline hover:text-slate-900 dark:hover:text-slate-100">
                Click here to import
              </Link>
              .
            </div>
          )}
          {(loading || games.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2 md:gap-3 mb-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <Label htmlFor="search" id="search-label" className="mb-1.5 block">Search</Label>
                <Input
                  id="search"
                  aria-labelledby="search-label"
                  placeholder="Search by opponent..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8"
                />
              </div>
              <div>
                <Label htmlFor="username" id="username-label" className="mb-1.5 block">Opponent</Label>
                <Select value={usernameFilter} onValueChange={setUsernameFilter}>
                  <SelectTrigger id="username" size="sm" aria-labelledby="username-label">
                    <SelectValue placeholder="All opponents" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All opponents</SelectItem>
                    {availableUsernames.map((username) => {
                      // const isLinked = linkedAccounts.some(acc => acc.username === username); // COMMENTED OUT FOR NOW
                      return (
                        <SelectItem key={username} value={username}>
                          <div className="flex items-center gap-2">
                            {username}
                            {/* {isLinked && (
                        <Badge variant="secondary" className="text-xs px-1 py-0">
                          My
                        </Badge>
                      )} */}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="result" id="result-label" className="mb-1.5 block">Result</Label>
                <Select value={resultFilter} onValueChange={setResultFilter}>
                  <SelectTrigger id="result" size="sm" aria-labelledby="result-label">
                    <SelectValue placeholder="All results" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="win">Win</SelectItem>
                    <SelectItem value="loss">Loss</SelectItem>
                    <SelectItem value="draw">Draw</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="time" id="time-label" className="mb-1.5 block">Time Control</Label>
                <Select value={timeFilter} onValueChange={setTimeFilter}>
                  <SelectTrigger id="time" size="sm" aria-labelledby="time-label">
                    <SelectValue placeholder="All time controls" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="bullet">Bullet</SelectItem>
                    <SelectItem value="blitz">Blitz</SelectItem>
                    <SelectItem value="rapid">Rapid</SelectItem>
                    <SelectItem value="classical">Classical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="platform" id="platform-label" className="mb-1.5 block">Source</Label>
                <Select value={platformFilter} onValueChange={setPlatformFilter}>
                  <SelectTrigger id="platform" size="sm" aria-labelledby="platform-label">
                    <SelectValue placeholder="All sources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    {availablePlatforms.map((platform) => (
                      <SelectItem key={platform} value={platform}>
                        {getPlatformDisplay(platform)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Opponent</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="hidden md:table-cell">Time Control</TableHead>
                  <TableHead className="hidden lg:table-cell">Platform</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedGames.map((game: any) => {
                  const platformLabel =
                    game.platform === "lichess.org"
                      ? "Lichess"
                      : game.platform === "chess.com"
                        ? "Chess.com"
                        : game.platform || "";
                  const timeLabel = game.timeControl || "Unknown";
                  const timeTooltip = game.rawTimeControl ? `${game.timeControl} (${game.rawTimeControl})` : game.timeControl;

                  return (
                    <TableRow
                      key={game.id}
                      onMouseEnter={(e) => handleGameHover(e, game)}
                      onMouseMove={(e) => {
                        if (hoveredGame) {
                          setHoveredGame(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
                        }
                      }}
                      onMouseLeave={() => setHoveredGame(null)}
                    >
                      <TableCell>{game.opponent}</TableCell>
                      <TableCell className="hidden sm:table-cell">{game.dateLabel || "—"}</TableCell>
                      <TableCell>{game.resultLabel || "—"}</TableCell>
                      <TableCell className="capitalize hidden md:table-cell" title={timeTooltip}>{timeLabel}</TableCell>
                      <TableCell className="capitalize hidden lg:table-cell">{platformLabel || "—"}</TableCell>
                      <TableCell>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-2 sm:w-fit">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => handleOpenGame(game.id, "review")}
                            disabled={!!gamePgnLoading[String(game.id)]}
                          >
                            {gamePgnLoading[String(game.id)] ? "Loading..." : "Review"}
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleOpenGame(game.id, "analyze")}
                            disabled={!!gamePgnLoading[String(game.id)]}
                          >
                            {gamePgnLoading[String(game.id)] ? "Loading..." : "Analyze"}
                          </Button>
                          {(() => {
                            // Construct external game URL based on platform
                            let externalUrl = game.url;
                            let linkLabel = "View";

                            if (!externalUrl && game.source_id) {
                              if (game.platform === "lichess.org" || game.provider === "lichess") {
                                externalUrl = `https://lichess.org/${game.source_id}`;
                                linkLabel = "Lichess";
                              } else if (game.platform === "chess.com" || game.provider === "chess.com") {
                                externalUrl = `https://www.chess.com/game/live/${game.source_id}`;
                                linkLabel = "Chess.com";
                              }
                            } else if (externalUrl) {
                              // Determine label based on URL
                              if (externalUrl.includes("lichess.org")) {
                                linkLabel = "Lichess";
                              } else if (externalUrl.includes("chess.com")) {
                                linkLabel = "Chess.com";
                              }
                            }

                            if (externalUrl && game.platform !== "maia") {
                              return (
                                <Button asChild size="sm" variant="secondary">
                                  <a
                                    href={externalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={`View game on ${linkLabel}`}
                                  >
                                    {linkLabel}
                                  </a>
                                </Button>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {filteredGames.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Show</span>
                <Select value={gamesPerPage.toString()} onValueChange={(v) => { setGamesPerPage(Number(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[70px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span>per page</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Previous</span>
                </Button>

                <div className="text-sm text-muted-foreground px-2">
                  Page {currentPage} of {totalPages || 1}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="h-8"
                >
                  <span className="hidden sm:inline mr-1">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * gamesPerPage) + 1}–{Math.min(currentPage * gamesPerPage, filteredGames.length)} of {filteredGames.length}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Opening Modal */}
      {addOpeningTarget && (
        <AddOpeningModal
          isOpen={addOpeningModalOpen}
          onClose={() => {
            setAddOpeningModalOpen(false);
            setAddOpeningTarget(null);
          }}
          targetRepertoire={addOpeningTarget}
        />
      )}
      <MiniBoardPreview
        show={!!hoveredGame}
        x={hoveredGame?.x || 0}
        y={hoveredGame?.y || 0}
        fen={hoveredGame?.fen || ""}
      />
    </div>
  );
}

/**
 * ChessBoard - Main analysis board component
 *
 * ================================================================================
 * MIGRATION STATUS: IN PROGRESS
 * ================================================================================
 *
 * This component is being modularized. New code should use the modular board
 * architecture in ui/src/board/:
 *
 * Core:
 *   - useBoardStore: @/board/core/useBoardStore
 *   - BoardEngine: @/board/core/board-engine
 *   - AnalysisController: @/board/core/move-tree
 *
 * Hooks:
 *   - useBoardDrawing: @/board/hooks/useBoardDrawing
 *   - useBoardSounds: @/board/hooks/useBoardSounds
 *   - useBoardOverlays: @/board/hooks/useBoardOverlays
 *   - useBoardSizing: @/board/hooks/useBoardSizing
 *
 * Components:
 *   - BoardSurface: @/board/react/BoardSurface
 *   - BoardShell: @/board/react/BoardShell
 *   - UniversalBoard: @/board/react/UniversalBoard
 *
 * Feature Composer:
 *   - AnalyzeBoard: @/features/analyze/AnalyzeBoard (skeleton)
 *
 * See ui/src/board/README.md for architecture documentation.
 * ================================================================================
 */

"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Chess, PieceSymbol, Square } from "chess.js";
import useSound from "use-sound";
import { usePrecomputedMoveEvals } from "../app/hooks/usePrecomputedMoveEvals";
import EvaluationBar from "./EvaluationBar";
import LLMChatPanel from "./LLMChatPanel";
import { AnalysisController, TreeNode, TreePath, findVariationRoot, generateVariationName } from "./ChessMoveTree";
import { useLLMPanelStore } from "../stores/useLLMPanelStore";
import React from "react";
import PvLinesPanel from "@/components/PvLinesPanel";
import { LogoSpinner } from "@/components/ui/LogoSpinner";

// NOTE: Drawing hook moved to modular board system
// Old: import { useChessDrawing } from "../app/hooks/useChessDrawing";
// New: import { useBoardDrawing } from "@/board/hooks/useBoardDrawing";
import { useChessDrawing } from "../app/hooks/useChessDrawing";

// Canvas overlay system imports
import { UniversalBoard } from "@/board/react/UniversalBoard";
import { useBoardStore } from "@/board/core/useBoardStore";
import { OverlayWorkerWrapper } from "@/board/workers/workerClient";
import type { Highlight, GridSquare, Arrow } from "@/board/core/useBoardStore";

import OpeningBook from "./OpeningBook";
import SaveStudyDialog from "./SaveStudyDialog";
import { AnalyzeEngineSettingsPanel } from "@/features/analyze/AnalyzeEngineSettingsPanel";
import { FooterNavigation } from "./FooterNavigation";
// REMOVED: Static import causes webpack error with onnxruntime-web in Next.js 15
// import { initMaia, getMaiaMove } from "../../../lib/engine/maiaEngine";
// Now dynamically imported where used (see maiaEnabled block)
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SkipBack, SkipForward, ChevronsLeft, ChevronsRight, RotateCw, Target, Save, Grid3x3, Trash2, Copy, Check } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getClientAuthHeaders } from "@/lib/auth";
import { getSessionId } from "@/lib/session";
import { LLMAnalysisQueue, AnalysisRequest } from '../lib/llmAnalysisQueue';
import { MoveClassificationBadge, MoveClassification } from "./MoveClassificationBadge";
import { classifyMove, parseEval, MoveClassificationParams } from "@/lib/moveClassification";
import { UpgradeModal } from "./paywall/UpgradeModal";
import { CapturedPieces } from "./CapturedPieces";
import { PositionEvaluationBubble } from "./PositionEvaluationBubble";
import { NonLLMCommentaryOverlay } from "./NonLLMCommentaryOverlay";
import type { Affordance } from "@/hooks/useNonLLMCommentaryOverlay";
import { useSubscription } from "@/hooks/useSubscription";

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === 'true';

const BOARD_TO_PANEL_RATIO = 1.46;

// Import BoardConfig type for config prop
import type { BoardConfig } from "@/board/engine/types";

interface ChessBoardProps {
  /** Initial PGN to load */
  initialPgn?: string;
  /** Initial FEN to load */
  initialFen?: string;
  /** Study ID to load */
  studyId?: string;
  /** Board variant */
  variant?: 'default' | 'analyze';
  /**
   * Board configuration (new engine system).
   * When provided, enables config-driven behavior for moves, callbacks, etc.
   * This is optional for backwards compatibility.
   */
  config?: Partial<BoardConfig>;
  /** Initial ply (half-move) to navigate to after loading PGN */
  initialPly?: number;
}

export default function ChessBoard({ initialPgn, initialFen, studyId, variant = 'default', config, initialPly }: ChessBoardProps = {}) {
  const isAnalyzeVariant = variant === "analyze";
  // Track current LLM streaming request for cancellation/cleanup
  const llmStreamAbortRef = useRef<AbortController | null>(null);

  // Limit concurrent LLM streams to prevent render thrashing
  const activeStreamsRef = useRef(0);
  const MAX_CONCURRENT_STREAMS = 3;

  // Performance caches
  const pgnCacheRef = useRef<Map<string, string>>(new Map());
  const nodeListCacheRef = useRef<Map<string, TreeNode[]>>(new Map());

  // Abort any in-flight LLM stream when component unmounts
  useEffect(() => {
    return () => {
      try {
        llmStreamAbortRef.current?.abort();
      } catch { }
    };
  }, []);

  // Initialize session ID for anonymous users
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const existing = localStorage.getItem('session-id');
    if (!existing) {
      const sessionId = getSessionId();
      localStorage.setItem('session-id', sessionId);
      console.log('[Session] Generated new session ID:', sessionId);
    } else {
      console.log('[SESSION] ℹ️ Existing session ID:', existing);
    }
  }, []);

  const renderMove = (
    node: TreeNode,
    path: string,
    isMainline: boolean,
    hideMoveNumber?: boolean
  ): React.ReactNode => {
    const shouldShowMoveNumber = !hideMoveNumber && (node.ply % 2 === 1 || !isMainline);
    const fullMove = Math.ceil(node.ply / 2);
    const isActive = path === controller.getCurrentPath();


    return (
      <button
        key={path}
        type="button"
        className={`
        inline-flex cursor-pointer px-1 py-0.5 rounded mr-1
        hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors
        ${isActive ? "bg-foreground text-background" : ""}
        ${isMainline ? "font-medium" : ""}
      `}
        onClick={() => handleJumpToMove(path)}
        aria-current={isActive ? "true" : undefined}
      >
        {shouldShowMoveNumber && (
          <span className="text-gray-600 dark:text-gray-400 mr-1">
            {node.ply % 2 === 1 ? `${fullMove}.` : `${fullMove}...`}
          </span>
        )}
        {node.san}
      </button>
    );
  };

  const renderInlineRecursive = (nodes: TreeNode[], parentPath: string): React.ReactNode => {
    if (!nodes.length) return null;

    const [mainChild, ...variations] = nodes;

    return (
      <>
        {/* Main line of this variation */}
        {mainChild && (
          <>
            <span className="text-gray-500 mr-1 font-mono text-xs">
              {Math.ceil(mainChild.ply / 2)}{mainChild.ply % 2 === 1 ? '.' : '...'}
            </span>
            {renderMove(mainChild, parentPath + mainChild.id, false, true)}
            {renderInlineRecursive(mainChild.children, parentPath + mainChild.id)}
          </>
        )}

        {/* Sibling variations (nested) */}
        {variations.map((variation) => {
          const varPath = parentPath + variation.id;
          return (
            <span key={varPath} className="inline-block ml-1 text-gray-500">
              <span className="text-gray-500 mr-1 font-mono text-xs">
                {Math.ceil(variation.ply / 2)}{variation.ply % 2 === 1 ? '.' : '...'}
              </span>
              {renderMove(variation, varPath, false, true)}
              {renderInlineRecursive(variation.children, varPath)}
            </span>
          );
        })}
      </>
    );
  };
  const gameRef = useRef(new Chess());
  const game = gameRef.current;
  const [fen, setFen] = useState(game.fen());
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [evalScore, setEvalScore] = useState<string | null>(null);
  const [, setBestMove] = useState<string | null>(null);
  const [tab, setTab] = useState<"history" | "analysis" | "settings">("history");
  const [controller] = useState(() => new AnalysisController(game.fen()));
  const [refreshKey, setRefreshKey] = useState(0);

  // Subscription status for premium features (LLM toggle)
  const { isPremium, plan } = useSubscription();

  // Optimized refresh - only increment key, no forceUpdate
  const refresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  // --- Block Building Logic for Main View ---
  type RenderBlock =
    | { type: 'table'; moves: { node: TreeNode; path: string }[] }
    | { type: 'inline'; moves: { node: TreeNode; path: string }[] };

  const getDisplayBlocks = (): RenderBlock[] => {
    // 1. Get the full path of nodes to display (Active Path + Continuation)
    const pathNodes: { node: TreeNode; path: string }[] = [];
    const nodeList: TreeNode[] = controller.tree.getNodeList(controller.path); // [root, node1, node2...]

    // Convert to {node, path} - skip root
    let currentPath = "";
    for (let i = 1; i < nodeList.length; i++) {
      const node = nodeList[i];
      currentPath += node.id;
      pathNodes.push({ node, path: currentPath });
    }

    // Continuation (follow first child)
    let tip: TreeNode = nodeList[nodeList.length - 1];
    let tipPath = currentPath;
    while (tip.children.length > 0) {
      const child: TreeNode = tip.children[0];
      tipPath += child.id;
      pathNodes.push({ node: child, path: tipPath });
      tip = child;
    }

    // 2. Group into Blocks
    const blocks: RenderBlock[] = [];
    let currentBlock: RenderBlock = { type: 'table', moves: [] };
    let isGlobalMainLine = true;
    let parentNode: TreeNode = controller.tree.root;

    for (const item of pathNodes) {
      // Check if this node is part of the Global Main Line
      // It must be the first child (index 0) of its parent
      const isFirstChild = parentNode.children[0]?.id === item.node.id;

      if (isGlobalMainLine && isFirstChild) {
        // Continue Table Block
        if (currentBlock.type !== 'table') {
          if (currentBlock.moves.length > 0) blocks.push(currentBlock);
          currentBlock = { type: 'table', moves: [] };
        }
        currentBlock.moves.push(item);
      } else {
        // Switch to Inline Block (Variation)
        isGlobalMainLine = false; // Once we deviate, we never go back to table
        if (currentBlock.type !== 'inline') {
          if (currentBlock.moves.length > 0) blocks.push(currentBlock);
          currentBlock = { type: 'inline', moves: [] };
        }
        currentBlock.moves.push(item);
      }
      parentNode = item.node;
    }

    if (currentBlock.moves.length > 0) blocks.push(currentBlock);

    return blocks;
  };

  const displayBlocks = getDisplayBlocks();

  // Get siblings for Footer Navigation
  const activeNode = controller.getCurrentNode();
  const activeNodeParentPath = TreePath.init(controller.path);
  const activeNodeParent = controller.tree.nodeAtPath(activeNodeParentPath);
  const siblings = activeNodeParent ? activeNodeParent.children : [];

  // LLM Panel Store integration
  const { setActiveThread, pushView, popView, viewStack } = useLLMPanelStore();
  const setHighlights = useBoardStore((state) => state.setHighlights);
  const lastMove = useBoardStore((state) => state.lastMove);
  const setLastMove = useBoardStore((state) => state.setLastMove);
  const selectedSquare = useBoardStore((state) => state.selectedSquare);
  const setSelectedSquare = useBoardStore((state) => state.setSelectedSquare);
  const setHoveredSquare = useBoardStore((state) => state.setHoveredSquare);
  const hoveredSquare = useBoardStore((state) => state.hoveredSquare);
  const ripples = useBoardStore((state) => state.ripples);
  const [currentPath, setCurrentPath] = useState<string>(''); // Track current path explicitly
  const drawing = useChessDrawing(orientation);
  const [mounted, setMounted] = useState(false);
  const [boardSize, setBoardSize] = useState(500);
  const boardRef = useRef<HTMLDivElement>(null);
  const [showGridOverlay, setShowGridOverlay] = useState(true);
  const [maxOverlayBoxes, setMaxOverlayBoxes] = useState(5); // Number of eval boxes to show
  const [showThreatLines, setShowThreatLines] = useState(false);
  const [threatThreshold, setThreatThreshold] = useState(300); // Centipawn threshold for showing threats

  // Non-LLM Commentary overlay state
  const [activeAffordance, setActiveAffordance] = useState<Affordance | null>(null);

  // ===== WEB WORKER INTEGRATION =====
  // Initialize overlay worker for off-thread computation
  const overlayWorkerRef = useRef<OverlayWorkerWrapper | null>(null);
  const workerRequestIdRef = useRef(0);
  const lastWorkerUpdateRef = useRef(0);
  const currentFenRef = useRef(fen); // Track current FEN to compare against in async callbacks
  currentFenRef.current = fen; // Update on every render
  const WORKER_THROTTLE_MS = 100; // Throttle worker requests to 100ms

  // Initialize worker on mount, cleanup on unmount
  useEffect(() => {
    overlayWorkerRef.current = new OverlayWorkerWrapper();
    console.log('[ChessBoard] Overlay worker initialized');

    return () => {
      if (overlayWorkerRef.current) {
        overlayWorkerRef.current.terminate();
        overlayWorkerRef.current = null;
        console.log('[ChessBoard] Overlay worker terminated');
      }
    };
  }, []);

  // Calculate board size only on client after mount
  useEffect(() => {
    setMounted(true);
    const calculateBoardSize = () => {
      if (typeof window !== 'undefined') {
        const isMobile = window.innerWidth < 1024;

        if (isMobile) {
          // Mobile: 85% of screen width (for equal spacing with eval bar) OR 2/3 screen height
          const size = Math.min(
            window.innerWidth * 0.85,  // 85% of width for balanced margins
            (window.innerHeight * 2) / 3  // 2/3 of screen height
          );
          setBoardSize(size);
        } else {
          // Desktop: Account for navbar + padding + captured pieces + FEN/PGN
          const availableHeight = window.innerHeight - 200;
          const availableWidth = window.innerWidth * 0.4;

          // Scale proportionally with minimum constraint
          const size = Math.max(
            320, // Minimum size to prevent breaking
            Math.min(1200, availableWidth, availableHeight)
          );
          setBoardSize(size);
        }
      }
    };
    calculateBoardSize();

    window.addEventListener('resize', calculateBoardSize);
    return () => window.removeEventListener('resize', calculateBoardSize);
  }, []);

  // Sync LLM panel active thread with current path
  useEffect(() => {
    console.log('[ChessBoard] Syncing active thread to path:', currentPath);
    setActiveThread(currentPath);
  }, [currentPath, setActiveThread]); // Re-run whenever currentPath changes

  // Sound effects - must be defined before callbacks that use them
  const [playMove] = useSound("/sounds/move-self.mp3", { volume: 0.5 });
  const [playCapture] = useSound("/sounds/capture.mp3", { volume: 0.5 });
  const [playCastle] = useSound("/sounds/castle.mp3", { volume: 0.5 });
  const [playCheck] = useSound("/sounds/move-check.mp3", { volume: 0.5 });
  const [playPromote] = useSound("/sounds/promote.mp3", { volume: 0.5 });
  const [playIllegal] = useSound("/sounds/illegal.mp3", { volume: 0.5 });

  // Automatic view stack synchronization based on current path
  // This keeps the view in sync when using navigation controls (back/forward/breadcrumbs)
  useEffect(() => {
    if (!controller || !controller.tree) return;
    if (!currentPath && currentPath !== '') return; // Wait for path initialization

    const currentView = viewStack[viewStack.length - 1];
    if (!currentView) return; // No view stack initialized yet

    // Find which variation the current path belongs to
    const currentVariationInfo = findVariationRoot(controller.tree, currentPath);

    console.log('[View Sync] Current path:', currentPath);
    console.log('[View Sync] Current view:', currentView.name);
    console.log('[View Sync] Path variation root:', currentVariationInfo.variationRoot);
    console.log('[View Sync] View variation root:', currentView.rootPath);
    console.log('[View Sync] Path is mainline:', currentVariationInfo.isMainline);

    // Check if we're navigating within the same variation
    // For mainline: both should be empty string or both mainline
    // For variations: variationRoot should match
    const isSameVariation =
      (currentVariationInfo.isMainline && currentView.rootPath === '') ||
      (currentVariationInfo.variationRoot === currentView.rootPath);

    if (isSameVariation) {
      console.log('[View Sync] Navigating within same variation, no view change needed');
      return;
    }

    console.log('[View Sync] Different variation detected, syncing view stack...');

    // Check if we need to go back to a parent view
    // Walk backwards through view stack to find a matching view
    let foundMatchingView = false;
    for (let i = viewStack.length - 1; i >= 0; i--) {
      const view = viewStack[i];

      // Check if this view matches the target variation
      const viewMatches =
        (currentVariationInfo.isMainline && view.rootPath === '') ||
        (view.rootPath === currentVariationInfo.variationRoot);

      if (viewMatches) {
        // Found matching parent view, pop back to it
        console.log('[View Sync] Found matching view at index', i, ':', view.name);
        const viewsToRemove = viewStack.length - 1 - i;
        for (let j = 0; j < viewsToRemove; j++) {
          popView();
        }
        foundMatchingView = true;
        break;
      }
    }

    // If no matching view found in stack, need to push new view
    if (!foundMatchingView) {
      const variationName = generateVariationName(controller.tree, currentPath);
      console.log('[View Sync] No matching view found, pushing new view:', variationName);
      pushView(currentPath, variationName, currentVariationInfo.variationRoot);
    }
  }, [currentPath, controller, viewStack, pushView, popView]);

  // Handler to jump to a move and update board state
  const handleJumpToMove = useCallback((path: string) => {
    console.log('[Jump] ============ START JUMP ============');
    console.log('[Jump] Jumping to path:', path);
    console.log('[Jump] Path length:', path.length);
    console.log('[Jump] Current path before jump:', currentPath);

    // Detect if we're jumping to a different variation
    const currentVariation = findVariationRoot(controller.tree, currentPath);
    const targetVariation = findVariationRoot(controller.tree, path);

    console.log('[Jump] Current variation root:', currentVariation.variationRoot);
    console.log('[Jump] Target variation root:', targetVariation.variationRoot);

    // If jumping to a different variation, push to view stack
    if (currentVariation.variationRoot !== targetVariation.variationRoot) {
      const variationName = generateVariationName(controller.tree, path);
      console.log('[Jump] Switching variations, pushing view:', variationName);
      pushView(path, variationName, targetVariation.variationRoot);
    }

    controller.jump(path);

    // Update current path state to trigger LLM panel sync
    setCurrentPath(path);

    // Rebuild the position from scratch
    const temp = new Chess();
    const nodeList = controller.tree.getNodeList(path);
    console.log('[Jump] Node list length:', nodeList.length);
    console.log('[Jump] Node list details:', nodeList.map((n: TreeNode, idx: number) => ({
      index: idx,
      id: n.id,
      san: n.san,
      uci: n.uci,
      fen: n.fen ? n.fen.substring(0, 50) + '...' : 'none'
    })));

    // Skip root node, iterate through move nodes
    for (let i = 1; i < nodeList.length; i++) {
      const node = nodeList[i];
      console.log(`[Jump] Processing node ${i}:`, { san: node.san, uci: node.uci });

      if (node.uci) {
        try {
          const moveResult = temp.move({
            from: node.uci.slice(0, 2) as Square,
            to: node.uci.slice(2, 4) as Square,
            promotion: node.uci.length > 4 ? (node.uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
          });
          console.log(`[Jump] Move ${node.san} result:`, moveResult);
        } catch (error) {
          console.error(`[Jump] Failed to play move ${node.san} (${node.uci}):`, error);
          console.error('[Jump] Current position FEN:', temp.fen());
          // If move fails, try using the node's stored FEN
          if (node.fen) {
            console.log('[Jump] Using stored FEN instead:', node.fen);
            temp.load(node.fen);
          }
        }
      } else if (node.fen) {
        // No UCI, use stored FEN
        console.log('[Jump] No UCI, loading FEN:', node.fen);
        temp.load(node.fen);
      }
    }

    const newFen = temp.fen();
    console.log('[Jump] Final FEN:', newFen);
    game.load(newFen);
    setFen(newFen);
    refresh();
    analyzeFen(newFen);

    // Play sound based on the last move in the list
    if (nodeList.length > 1) {
      const lastNode = nodeList[nodeList.length - 1];
      if (lastNode.san) {
        if (lastNode.san.includes('O-O')) {
          playCastle();
        } else if (lastNode.san.includes('+') || lastNode.san.includes('#')) {
          playCheck();
        } else if (lastNode.san.includes('=')) {
          playPromote();
        } else if (lastNode.san.includes('x')) {
          playCapture();
        } else {
          playMove();
        }
      }
    } else {
      // If jumping to root, play a simple move sound
      playMove();
    }
  }, [controller, game, refresh, currentPath, pushView, playMove, playCastle, playCheck, playPromote, playCapture]);

  const [maiaEnabled, setMaiaEnabled] = useState(false);
  const [maiaLevel, setMaiaLevel] = useState(1500); // user-selectable Elo

  // Store previous settings when Maia is enabled
  const prevArrowsRef = useRef<boolean | null>(null);
  const prevGridOverlayRef = useRef<boolean | null>(null);
  const prevThreatLinesRef = useRef<boolean | null>(null);
  const [autoMessage, setAutoMessage] = useState<any>(null);

  // GPU warm-up tracking + analysis queue
  const [gpuStatus, setGpuStatus] = useState<string>('cold');
  const [gpuQueuedCount, setGpuQueuedCount] = useState(0);
  const gpuStatusRef = useRef<string>('cold'); // stays current inside async callbacks
  const analysisQueueRef = useRef(new LLMAnalysisQueue());

  const [, setStatus] = useState(getStatus());
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const [exitingLegalMoves, setExitingLegalMoves] = useState<{ moves: Square[], startTime: number } | null>(null);
  const legalMovesStartTimeRef = useRef(0);
  const prevLegalMovesRef = useRef<Square[]>([]);

  // Update start time when legal moves are set
  useEffect(() => {
    if (legalMoves.length > 0) {
      legalMovesStartTimeRef.current = performance.now();
    }
  }, [legalMoves]);

  // Handle exit animation
  useEffect(() => {
    if (prevLegalMovesRef.current.length > 0 && legalMoves.length === 0) {
      setExitingLegalMoves({
        moves: prevLegalMovesRef.current,
        startTime: performance.now()
      });
      setTimeout(() => {
        setExitingLegalMoves(null);
      }, 200);
    }
    prevLegalMovesRef.current = legalMoves;
  }, [legalMoves]);

  const [draggingFrom, setDraggingFrom] = useState<Square | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [llmMessages, setLLMMessages] = useState<Record<string, any[]>>({});
  const [isLoadingStudy, setIsLoadingStudy] = useState(false);
  const [studyLoadError, setStudyLoadError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const [showArrows, setShowArrows] = useState(true);
  const [pgnInput, setPgnInput] = useState("");
  const [, setPgnError] = useState<string | null>(null);
  const [pgnCopied, setPgnCopied] = useState(false);
  const [fenInput, setFenInput] = useState("");
  const [, setFenError] = useState<string | null>(null);
  const [fenCopied, setFenCopied] = useState(false);

  // Refs for auto-expanding textareas
  const fenTextareaRef = useRef<HTMLTextAreaElement>(null);
  const pgnTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fenTextareaMobileRef = useRef<HTMLTextAreaElement>(null);
  const pgnTextareaMobileRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize function for textareas
  const autoResizeTextarea = useCallback((textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  // Auto-resize FEN and PGN textareas when content changes
  useEffect(() => {
    autoResizeTextarea(fenTextareaRef.current);
    autoResizeTextarea(pgnTextareaRef.current);
    autoResizeTextarea(fenTextareaMobileRef.current);
    autoResizeTextarea(pgnTextareaMobileRef.current);
  }, [fenInput, pgnInput, autoResizeTextarea]);
  const {
    moveEvalMap,
    clearCache,
    getCachedAnalysis,
    cacheAnalysis,
    pvLines,
    pvLine,
    debouncedFen
  } = usePrecomputedMoveEvals(game);

  // ===== CANVAS OVERLAY INTEGRATION =====
  // UI-only overlay data (highlights, user drawings)
  // Heavy computations (grid, threats, PV) moved to Web Worker

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    const highlightColor = "rgba(255, 205, 50, 0.5)"; // Dark yellow, slightly opaque

    // 1. Last Move Highlights
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: highlightColor };
      styles[lastMove.to] = { backgroundColor: highlightColor };
    }

    // 2. Selected Square Highlight
    if (selectedSquare) {
      styles[selectedSquare] = { backgroundColor: highlightColor };
    }

    // 3. Drag Source Highlight (if dragging)
    if (draggingFrom) {
      styles[draggingFrom] = { backgroundColor: highlightColor };
    }

    // 4. Hover Highlight (Under piece, thin white border)
    // EXCEPTION: Do not show glow on the square we are dragging FROM
    if (hoveredSquare && hoveredSquare !== draggingFrom) {
      // User request: Drop hover should be same as regular hover (1px)
      // We disabled the default react-chessboard drop highlight, so this is the ONLY highlight now.
      const borderWidth = "1px";

      const existing = styles[hoveredSquare] || {};
      styles[hoveredSquare] = {
        ...existing,
        boxShadow: `inset 0 0 0 ${borderWidth} white`,
      };
    }

    // 5. Legal Moves (Dots) - Rendered here to be UNDER pieces
    legalMoves.forEach((sq) => {
      const existing = styles[sq] || {};
      styles[sq] = {
        ...existing,
        backgroundImage: "radial-gradient(circle, rgba(0, 0, 0, 0.2) 25%, transparent 25%)",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        borderRadius: "50%"
      };
    });

    // 6. Ripples - Rendered here to be UNDER pieces
    ripples.forEach((r) => {
      const existing = styles[r.square] || {};
      styles[r.square] = {
        ...existing,
        animation: "ripple-effect 0.6s ease-out"
      };
    });

    return styles;
  }, [lastMove, selectedSquare, draggingFrom, hoveredSquare, legalMoves, ripples]);

  const uiOnlyOverlayData = useMemo(() => {
    const highlights: Highlight[] = [];
    const userArrows: Arrow[] = [];

    // Color mapping for user drawings
    const DRAWING_COLORS: Record<string, string> = {
      orange: "rgba(249, 115, 22, 0.9)",
      green: "rgba(34, 197, 94, 0.9)",
      red: "rgba(239, 68, 68, 0.9)",
      blue: "rgba(59, 130, 246, 0.9)",
      yellow: "rgba(234, 179, 8, 0.9)",
    };

    // === HIGHLIGHTS (UI-only, lightweight - Canvas Overlay) ===
    // Note: Last move and selected highlights are now handled by customSquareStyles (under pieces)
    // We only keep legal moves and hover effects here.


    // === HIGHLIGHTS (UI-only, lightweight - Canvas Overlay) ===
    // Note: Last move and selected highlights are now handled by customSquareStyles (under pieces)
    // Note: Legal moves are also handled by customSquareStyles (under pieces)
    // We only keep user circles here.

    // User-drawn circles
    drawing.drawnCircles.forEach((circle) => {
      const rgbaColor = DRAWING_COLORS[circle.color] || circle.color;
      highlights.push({
        square: circle.square,
        type: "userCircle",
        color: rgbaColor,
      });
    });

    // Hover glow (for all squares, including during drag)
    // MOVED TO customSquareStyles (under piece)
    // if (hoveredSquare && hoveredSquare !== draggingFrom) {
    //   highlights.push({
    //     square: hoveredSquare,
    //     type: "userCircle",
    //   });
    // }

    // === USER-DRAWN ARROWS (must be preserved) ===
    drawing.drawnArrows.forEach((arrow) => {
      const rgbaColor = DRAWING_COLORS[arrow.color] || arrow.color;
      userArrows.push({
        from: arrow.from,
        to: arrow.to,
        color: rgbaColor,
      });
    });

    return { highlights, userArrows };
  }, [
    lastMove,
    selectedSquare,
    legalMoves,
    drawing.drawnCircles,
    drawing.drawnArrows,
    exitingLegalMoves,
    exitingLegalMoves,
    variant,
    hoveredSquare
  ]);


  // Worker computation effect - runs heavy computations off main thread
  useEffect(() => {
    const worker = overlayWorkerRef.current;
    if (!worker) return;

    // Throttle worker requests during rapid changes
    const now = Date.now();
    const timeSinceLastUpdate = now - lastWorkerUpdateRef.current;

    if (timeSinceLastUpdate < WORKER_THROTTLE_MS) {
      // Schedule throttled update
      const timeoutId = setTimeout(() => {
        requestWorkerComputation();
      }, WORKER_THROTTLE_MS - timeSinceLastUpdate);
      return () => clearTimeout(timeoutId);
    }

    requestWorkerComputation();

    function requestWorkerComputation() {
      const worker = overlayWorkerRef.current;
      if (!worker) return;

      lastWorkerUpdateRef.current = Date.now();
      const requestId = ++workerRequestIdRef.current;

      // Determine mode based on drag state
      const mode = draggingFrom ? "dragging" : selectedSquare ? "selected" : "idle";

      // Send computation request to worker
      worker.computeOverlays({
        fen,
        mode,
        evalData: moveEvalMap,
        threatSettings: {
          enabled: showThreatLines,
          threshold: threatThreshold,
        },
        gridSettings: {
          enabled: showGridOverlay,
          maxBoxes: maxOverlayBoxes,
        },
        pvSettings: {
          enabled: showArrows,
          showBestMove: showArrows && pvLine.length > 0,
        },
        multipvData: pvLines,
      })
        .then((result) => {
          // Ignore stale responses
          if (requestId !== workerRequestIdRef.current) {
            console.log('[ChessBoard] Ignoring stale worker response');
            return;
          }

          // Ignore responses for different FEN (prevents stale arrows after move)
          // Use ref to get CURRENT FEN, not stale closure-captured value
          if (result.fen !== currentFenRef.current) {
            console.log('[ChessBoard] Ignoring response for stale FEN');
            return;
          }

          // Merge worker results with UI-only data
          const workerArrows = result.arrows || [];
          const workerGrid = result.grid || [];
          const workerThreats = result.threats || [];

          // Add PV arrow if available and not dragging
          const pvArrow = !draggingFrom && result.bestMoveArrow ? [result.bestMoveArrow] : [];

          // Combine worker arrows with user-drawn arrows (MERGE, not overwrite)
          const combinedArrows = [
            ...pvArrow,
            ...workerArrows,
            ...uiOnlyOverlayData.userArrows,
          ];

          // Single batched Zustand update
          useBoardStore.setState({
            boardSize,
            orientation,
            fen,
            highlights: uiOnlyOverlayData.highlights,
            arrows: combinedArrows,
            grid: workerGrid,
            threats: workerThreats,
          });
        })
        .catch((error) => {
          console.error('[ChessBoard] Worker computation error:', error);
          // On error, update with UI-only data
          useBoardStore.setState({
            boardSize,
            orientation,
            fen,
            highlights: uiOnlyOverlayData.highlights,
            arrows: uiOnlyOverlayData.userArrows,
            grid: [],
            threats: [],
          });
        });
    }
  }, [
    fen,
    boardSize,
    orientation,
    moveEvalMap,
    showGridOverlay,
    maxOverlayBoxes,
    showThreatLines,
    threatThreshold,
    showArrows,
    pvLine,
    pvLines,
    draggingFrom,
    selectedSquare,
    uiOnlyOverlayData,
  ]);
  // ===== END CANVAS OVERLAY INTEGRATION =====

  // Handle Maia mode - disable arrows, grid overlay, and threat lines when Maia is enabled
  useEffect(() => {
    if (maiaEnabled) {
      // Save current settings before disabling
      prevArrowsRef.current = showArrows;
      prevGridOverlayRef.current = showGridOverlay;
      prevThreatLinesRef.current = showThreatLines;
      // Disable arrows, grid overlay, and threat lines
      setShowArrows(false);
      setShowGridOverlay(false);
      setShowThreatLines(false);
    } else {
      // Restore previous settings when Maia is disabled
      if (prevArrowsRef.current !== null) {
        setShowArrows(prevArrowsRef.current);
        prevArrowsRef.current = null;
      }
      if (prevGridOverlayRef.current !== null) {
        setShowGridOverlay(prevGridOverlayRef.current);
        prevGridOverlayRef.current = null;
      }
      if (prevThreatLinesRef.current !== null) {
        setShowThreatLines(prevThreatLinesRef.current);
        prevThreatLinesRef.current = null;
      }
    }
  }, [maiaEnabled]);

  // Mock data for testing LLM panel thread switching (DEV ONLY)
  // COMMENTED OUT - Testing with real LLM analysis now
  /*
  const initializeMockData = useCallback(() => {
    if (DEBUG && controller.tree.root.children.length === 0) {
      console.log('[MOCK] Initializing mock game tree with LLM messages...');

      // Root welcome message
      controller.tree.updateAt('', (node: any) => {
        node.llmMessages = [{
          id: 'welcome-root',
          sender: 'llm',
          text: "Welcome! I'm analyzing your chess game. This is the starting position. Let's explore some opening ideas together!",
          timestamp: Date.now(),
        }];
        console.log('[MOCK] Added welcome message to root node');
      });

      // Mainline: 1.e4 e5 2.Nf3 Nc6 3.Bc4
      const moves = [
        { san: 'e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', uci: 'e2e4' },
        { san: 'e5', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2', uci: 'e7e5' },
        { san: 'Nf3', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', uci: 'g1f3' },
        { san: 'Nc6', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', uci: 'b8c6' },
        { san: 'Bc4', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', uci: 'f1c4' },
      ];

      let currentPath = '';
      moves.forEach((move, idx) => {
        controller.playMove(move.san, move.fen, move.uci);
        currentPath = controller.getCurrentPath();

        // Add mock LLM messages to each move
        controller.tree.updateAt(currentPath, (node: any) => {
          node.llmMessages = [{
            id: `llm-main-${idx}`,
            sender: 'llm',
            text: `Great move ${move.san}! ${
              idx === 0 ? "The King's Pawn opening is a classical and aggressive choice." :
              idx === 1 ? "The symmetrical response maintains balance in the center." :
              idx === 2 ? "The Knight develops while attacking the e5 pawn." :
              idx === 3 ? "Defending the pawn and developing with tempo!" :
              "The Italian Game! This leads to sharp tactical play."
            }`,
            timestamp: Date.now() - (5 - idx) * 60000,
          }];
          console.log(`[MOCK] Added message to move ${move.san} at path:`, currentPath);
        });
      });

      // Add variation after 2...Nc6 - create 3.Bb5 (Ruy Lopez) instead of 3.Bc4
      // The path after Nc6 is the 4th node (root + e4 + e5 + Nf3 + Nc6 = 5 nodes, index 4)
      const nodeListForVariation = controller.tree.getNodeList(currentPath);
      const afterNc6Path = nodeListForVariation.slice(0, 5).map((n: any) => n.id).join('').slice(2); // Remove 'rt'
      console.log('[MOCK] After Nc6 path:', afterNc6Path);
      controller.jump(afterNc6Path);

      // Add variation: 3.Bb5 (Ruy Lopez instead of Italian)
      const bb5Move = { san: 'Bb5', fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', uci: 'f1b5' };
      controller.playMove(bb5Move.san, bb5Move.fen, bb5Move.uci);

      const variationPath = controller.getCurrentPath();
      controller.tree.updateAt(variationPath, (node: any) => {
        node.llmMessages = [
          {
            id: 'llm-var-bb5',
            sender: 'llm',
            text: "3.Bb5 is the Ruy Lopez, one of the oldest and most respected openings. It's more positional than the Italian Game (3.Bc4). The Ruy Lopez aims for long-term pressure on Black's position, while the Italian Game leads to sharper, more tactical play. Both are excellent choices!",
            timestamp: Date.now() - 120000,
          },
        ];
      });

      // Add a continuation in the variation: 3...a6
      const a6Move = { san: 'a6', fen: 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4', uci: 'a7a6' };
      controller.playMove(a6Move.san, a6Move.fen, a6Move.uci);

      const a6Path = controller.getCurrentPath();
      controller.tree.updateAt(a6Path, (node: any) => {
        node.llmMessages = [{
          id: 'llm-var-a6',
          sender: 'llm',
          text: "The Morphy Defense! Black challenges the bishop and prepares ...b5. This is the main line of the Ruy Lopez. Very solid and popular at all levels.",
          timestamp: Date.now() - 80000,
        }];
      });

      // Jump back to mainline end
      const mainlinePath = moves.map(() => '').join('');
      const finalMainlinePath = controller.tree.getNodeList(currentPath)[moves.length].id;
      controller.jump(currentPath);

      console.log('[MOCK] Mock data initialized successfully!');
      console.log('[MOCK] Mainline path:', currentPath);
      console.log('[MOCK] Variation path:', variationPath);
      refresh();
    }
  }, [controller, refresh]);

  // Initialize mock data on mount (DEV ONLY)
  useEffect(() => {
    if (DEBUG && !initialPgn && !initialFen && !studyId) {
      const timer = setTimeout(() => {
        initializeMockData();
        // Initialize currentPath to root after mock data
        const initialPath = controller.getCurrentPath();
        setCurrentPath(initialPath);

        // Initialize view stack with mainline view
        clearViewStack(); // Clear any stale views
        pushView(initialPath, 'Mainline', '');
        console.log('[ChessBoard] Initialized view stack with Mainline view');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [DEBUG, initialPgn, initialFen, studyId, initializeMockData, controller, clearViewStack, pushView]);
  */

  // Gateway base URL
  const GATEWAY_URL =
    (process.env.NEXT_PUBLIC_GATEWAY_URL as string) ?? "/api/gateway";

  const [, setOpening] = useState<{
    eco?: string;
    name?: string;
    found?: boolean;
  } | null>(null);

  function analyzeFen(f: string) {
    // First, check if the current node has a stored evaluation
    const currentNode = controller.getCurrentNode();

    if (DEBUG) {
      console.log('[analyzeFen] Called with FEN:', f.substring(0, 50));
      console.log('[analyzeFen] Current node:', {
        hasNode: !!currentNode,
        hasEvalScore: !!currentNode?.evalScore,
        evalScore: currentNode?.evalScore,
        path: controller.getCurrentPath()
      });
    }

    if (currentNode?.evalScore) {
      // Use stored evaluation from the tree node
      if (DEBUG) {
        console.log('[analyzeFen] ✅ Using stored eval from TreeNode:', currentNode.evalScore);
      }
      // Direct state updates - no transition needed for eval bar
      setEvalScore(currentNode.evalScore);
      setBestMove(null); // We don't store bestMove in nodes yet
      setOpening(null);
      return;
    }

    // Fall back to cache lookup
    const hookData = getCachedAnalysis(f);

    if (DEBUG) {
      console.log('[analyzeFen] Cache lookup:', {
        hasCacheData: !!hookData,
        evalScore: hookData?.evalScore
      });
    }

    // Direct state updates - transitions were preventing eval bar updates
    if (hookData) {
      setBestMove(hookData.bestMove);
      setEvalScore(hookData.evalScore);
      if (hookData.opening) setOpening(hookData.opening);
      if (DEBUG && hookData.pvLines) {
        console.log("Setting pvLines:", hookData.pvLines);
      }

      // Trigger classification update if we have data
      updateMoveClassification(
        currentNode,
        hookData.evalScore,
        hookData.opening?.found === true
      );
    } else {
      // Keep the previous eval/best move visible until the async analysis returns
      // so the bar does not snap to 0.00 during navigation.
      if (DEBUG) {
        console.log('[analyzeFen] ⚠️ No cached eval; keeping previous values until analysis completes');
      }
    }
  }

  // Helper to update move classification based on evaluations
  const updateMoveClassification = useCallback((node: TreeNode, currentEval: string | null, isBook: boolean = false) => {
    if (!node || !currentEval || node.classification) return;

    // We need the parent node to get the "before move" evaluation
    // The parent's evaluation represents the best play for the side whose turn it was
    // which effectively serves as the "best move eval" for comparison.
    // However, we need to be careful with perspective.

    // Find parent node
    // Since we don't have direct parent pointers, we look up by path
    // The node's ID is the last part of the path, so parent path is current path minus last 2 chars
    // BUT: controller.getCurrentPath() might not match node if we are just passing a node.
    // Let's rely on the controller to find the parent.

    // Actually, we can just use the controller's current state if 'node' is the current node.
    // If 'node' is not current, this is harder.
    // For now, let's assume we are classifying the CURRENT node.

    const currentPath = controller.getCurrentPath();
    // Verify this node is indeed the current node (by ID or reference)
    if (controller.getCurrentNode().id !== node.id) {
      // If not current, we'd need to find its parent. 
      // For now, skip if not current to avoid complexity, as we mostly classify as we navigate/play.
      return;
    }

    const parentPath = TreePath.init(currentPath);
    const parentNode = controller.tree.nodeAtPath(parentPath);

    if (!parentNode) return;

    // If parent doesn't have an eval, try to find it in the cache
    // This handles the case where we moved too fast and the parent node wasn't updated yet
    let parentEval = parentNode.evalScore;
    if (!parentEval) {
      const cachedParent = getCachedAnalysis(parentNode.fen);
      if (cachedParent?.evalScore) {
        parentEval = cachedParent.evalScore;
        // Persist to parent node so we don't look it up again
        // Note: We use the parent path to update
        controller.tree.updateAt(parentPath, (n) => {
          n.evalScore = cachedParent.evalScore;
        });
        if (DEBUG) console.log('[Classification] Lazily updated parent node eval from cache');
      }
    }

    // If still no eval, we can't classify yet
    if (!parentEval) return;

    const evalBefore = parseEval(parentEval);
    const evalAfter = parseEval(currentEval);

    // Determine whose turn it was BEFORE the move
    // If parent ply is even (0, 2...), it's White's turn.
    // If parent ply is odd (1, 3...), it's Black's turn.
    const isWhiteToMove = parentNode.ply % 2 === 0;

    // For the "best move eval", we use the parent's evaluation.
    // Why? Because the engine evaluation of the parent position IS the evaluation of the best move.
    const bestMoveEval = evalBefore;

    const params: MoveClassificationParams = {
      evalBeforeMove: evalBefore,
      evalAfterMove: evalAfter,
      bestMoveEval: bestMoveEval,
      isWhiteToMove: isWhiteToMove,
      moveNumber: Math.ceil(node.ply / 2),
      isCapture: node.san?.includes('x'),
      isSacrifice: false, // TODO: Detect sacrifice
      isBook: isBook,
    };

    const classification = classifyMove(params);

    if (DEBUG) {
      console.log(`[Classification] Classifying move ${node.san}:`, {
        evalBefore: parentNode.evalScore,
        evalAfter: currentEval,
        isBook,
        result: classification
      });
    }

    // Update node
    controller.tree.updateAt(currentPath, (n) => {
      n.classification = classification;
      n.evalScore = currentEval; // Ensure eval is stored too
    });

    // Force refresh to show badge
    refresh();

  }, [controller, refresh]);

  const getMovesFromController = useCallback((controller: any): string[] => {
    if (!controller || !controller.tree) return [];
    const currentPath = controller.getCurrentPath();

    // Check nodeList cache first
    let nodeList = nodeListCacheRef.current.get(currentPath);
    if (!nodeList) {
      nodeList = controller.tree.getNodeList(currentPath);
      nodeListCacheRef.current.set(currentPath, nodeList);
      if (DEBUG) console.log('[NodeList] Cache miss, generated for path:', currentPath);
    } else if (DEBUG) {
      console.log('[NodeList] Cache hit for path:', currentPath);
    }

    const moves: string[] = [];
    for (let i = 1; i < nodeList.length; i++) {
      if (nodeList[i].san) {
        moves.push(nodeList[i].san);
      }
    }
    return moves;
  }, []);

  // ─── LLM streaming extracted into a reusable callback ────────────────────
  const startLLMStream = useCallback(async (request: AnalysisRequest) => {
    if (activeStreamsRef.current >= MAX_CONCURRENT_STREAMS) {
      if (DEBUG) console.log(`[LLM] Max concurrent streams reached, skipping ${request.moveSan}`);
      return;
    }
    const { movePath, moveSan, moveFrom, moveTo, movePromotion, fenBeforeMove, currentFen, moveHistory, abortController } = request;
    const streamingTextRef = { current: "" };
    let accumulatedData: any = {};

    // Clear llmPending flag now that we're processing this move
    controller?.tree?.updateAt(movePath, (node: TreeNode) => { node.llmPending = false; });

    try {
      activeStreamsRef.current++;
      if (DEBUG) console.log(`[LLM] Starting stream for ${moveSan} (${activeStreamsRef.current}/${MAX_CONCURRENT_STREAMS} active)`);
      llmStreamAbortRef.current = abortController;

      setAutoMessage({ id: `llm-loading-${Date.now()}`, sender: "llm", text: "", move: moveSan, timestamp: Date.now(), _loading: true, _provider: "checking", _targetPath: movePath });

      const response = await fetch(`${GATEWAY_URL}/chess/analyze_with_llm/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: fenBeforeMove, current_fen: currentFen, last_move: moveSan, move_from: moveFrom, move_to: moveTo, move_history: moveHistory, include_llm: true, multipv: 10, depth: 20, user_question: `Analyze the move ${moveSan} in this specific position.` }),
        signal: abortController.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      let buffer = "";
      let lastUpdateTime = Date.now();
      const UPDATE_INTERVAL = 100;

      const processBuffer = (): boolean => {
        let lineEnd: number;
        while ((lineEnd = buffer.indexOf("\n")) >= 0) {
          const rawLine = buffer.slice(0, lineEnd);
          buffer = buffer.slice(lineEnd + 1);
          const line = rawLine.trim();
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.slice(6);
          if (dataStr === "[DONE]") return true;
          try {
            const event = JSON.parse(dataStr);
            if (event.type === "status") {
              setAutoMessage({ id: `llm-loading-${Date.now()}`, sender: "llm", text: streamingTextRef.current, move: moveSan, timestamp: Date.now(), _loading: true, _provider: event.provider, _streamingText: streamingTextRef.current, _targetPath: movePath });
            } else if (event.type === "chunk") {
              streamingTextRef.current += event.text || "";
              const now = Date.now();
              if (now - lastUpdateTime > UPDATE_INTERVAL) {
                lastUpdateTime = now;
                setAutoMessage({ id: `llm-streaming-${Date.now()}`, sender: "llm", text: streamingTextRef.current, move: moveSan, timestamp: Date.now(), _loading: true, _provider: "streaming", _streamingText: streamingTextRef.current, _targetPath: movePath });
              }
            } else if (event.type === "complete") {
              accumulatedData = event.full_response || {};
              const llmText = accumulatedData.llm?.choices?.[0]?.message?.content || streamingTextRef.current || "No explanation received from AI.";
              const stockfishAnalysis = accumulatedData.stockfish?.analysis || [];
              const rawEngineEval = stockfishAnalysis[0]?.score ?? undefined;
              const engineBest = stockfishAnalysis[0]?.move ?? undefined;
              let engineEval: string | undefined;
              if (rawEngineEval !== undefined) {
                const pawnEval = typeof rawEngineEval === "number" ? rawEngineEval / 100 : Number(rawEngineEval) / 100;
                engineEval = pawnEval > 0 ? `+${pawnEval.toFixed(2)}` : pawnEval.toFixed(2);
              }
              const uci = `${moveFrom}${moveTo}${movePromotion || ""}`;
              const playedMoveAnalysis = stockfishAnalysis.find((a: any) => a.move === moveSan || a.uci === uci);
              if (playedMoveAnalysis?.classification && movePath) {
                controller.tree.updateAt(movePath, (node: TreeNode) => { node.classification = playedMoveAnalysis.classification; });
                refresh();
              }
              const heuristicCommentary = accumulatedData.heuristic_commentary || null;
              const bestMoveCommentary = accumulatedData.best_move_commentary || null;
              setAutoMessage({
                id: `llm-${Date.now()}`, sender: "llm", text: llmText, move: moveSan, engineEval, engineBest, timestamp: Date.now(), _loading: false, _targetPath: movePath,
                heuristicCommentary: heuristicCommentary ? { headline: heuristicCommentary.headline, text: heuristicCommentary.text, tags: heuristicCommentary.tags || [], evidence: heuristicCommentary.evidence || {} } : undefined,
                bestMoveCommentary: bestMoveCommentary ? { headline: bestMoveCommentary.headline, text: bestMoveCommentary.text, tags: bestMoveCommentary.tags || [] } : undefined,
              });
            } else if (event.type === "error") {
              throw new Error(event.error || "Streaming error");
            }
          } catch (parseErr) {
            if (DEBUG) console.warn("Failed to parse SSE event:", dataStr, parseErr);
          }
        }
        return false;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (value) { buffer += decoder.decode(value, { stream: !done }); if (processBuffer()) break; }
        if (done) { const rem = decoder.decode(); if (rem) { buffer += rem; processBuffer(); } break; }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') { if (DEBUG) console.log("LLM streaming aborted"); return; }
      if (DEBUG) console.error("LLM streaming failed", err);
      setAutoMessage({ id: `llm-error-${Date.now()}`, sender: "llm", text: "Analysis temporarily unavailable. Try again in a moment.", move: moveSan, timestamp: Date.now(), _loading: false, _targetPath: movePath });
    } finally {
      activeStreamsRef.current--;
      if (DEBUG) console.log(`[LLM] Stream completed for ${moveSan} (${activeStreamsRef.current}/${MAX_CONCURRENT_STREAMS} active)`);
    }
  }, [controller, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── GPU status polling (every 5 s) ───────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${GATEWAY_URL}/chess/gpu-status`);
        if (!res.ok) return;
        const data = await res.json();
        const status: string = data.status ?? 'cold';
        gpuStatusRef.current = status;
        setGpuStatus(status);
      } catch { /* network error — keep current status */ }
    };
    poll(); // immediate first poll
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Drain queue when GPU transitions to ready ────────────────────────────
  useEffect(() => {
    if (gpuStatus !== 'ready') return;
    const queue = analysisQueueRef.current;
    if (queue.getQueueSize() === 0) return;
    if (DEBUG) console.log(`[LLM] GPU ready — draining ${queue.getQueueSize()} queued requests`);
    let req = queue.dequeue();
    while (req) {
      startLLMStream({ ...req, abortController: new AbortController() });
      req = queue.dequeue();
    }
    setGpuQueuedCount(0);
    refresh();
  }, [gpuStatus, startLLMStream, refresh]);

  // Memoize the current moves to prevent unnecessary re-renders
  const currentMoves = useMemo(() => {
    const moves = getMovesFromController(controller);
    console.log("ChessBoard: Memoized moves changed to:", moves);
    return moves;
  }, [fen, getMovesFromController, controller]);

  function getStatus() {
    if (game.isCheckmate()) return "Checkmate!";
    if (game.isDraw()) return "Draw!";
    if (game.isCheck()) return "Check!";
    return game.turn() === "w" ? "White to move " : "Black to move ";
  }

  const playNavigationSound = (san?: string) => {
    if (!san) {
      playMove();
      return;
    }

    if (san.includes('O-O')) {
      playCastle();
    } else if (san.includes('+') || san.includes('#')) {
      playCheck();
    } else if (san.includes('=')) {
      playPromote();
    } else if (san.includes('x')) {
      playCapture();
    } else {
      playMove();
    }
  };

  // Navigate to a specific move
  // const goToPVPosition = (pvLine: string[], moveIndex: number) => {
  //   const temp = new Chess();
  //   for (let i = 0; i <= moveIndex; i++) {
  //     const uci = pvLine[i];
  //     if (!uci || uci.length < 4) continue;
  //     temp.move({
  //       from: uci.slice(0, 2),
  //       to: uci.slice(2, 4),
  //       promotion: uci.length > 4 ? uci[4] : undefined,
  //     });
  //   }
  //   const newFen = temp.fen();
  //   game.load(newFen);
  //   setFen(newFen);
  //   setSelectedSquare(null);
  //   setLegalMoves([]);
  // };

  const goToPreviousMove = () => {
    if (controller.getCurrentPath() === TreePath.root) return;

    // Capture the move we're about to undo (before going back)
    const nodeBeingUndone = controller.getCurrentNode();

    controller.goBack();

    // Use cached FEN from tree node instead of rebuilding position (24x faster!)
    const currentNode = controller.getCurrentNode();
    const newFen = currentNode.fen || game.fen(); // Fallback to current if no FEN stored

    game.load(newFen);
    setFen(newFen);
    setStatus(getStatus());
    setSelectedSquare(null);
    setLegalMoves([]);
    setCurrentPath(controller.getCurrentPath()); // Update path state

    // Defer heavy UI updates
    setTimeout(() => {
      refresh();
      updatePgnDisplay();
      updateFenDisplay();
      analyzeFen(newFen);
    }, 0);

    // Play sound based on the move being undone (the move we just went back from)
    playNavigationSound(nodeBeingUndone?.san);
  };

  const goToNextMove = () => {
    const currentNode = controller.getCurrentNode();
    if (!currentNode.children[0]) return; // No next move

    controller.goForward();

    // Use cached FEN from tree node instead of rebuilding position (24x faster!)
    const nextNode = controller.getCurrentNode();
    const newFen = nextNode.fen || game.fen(); // Fallback to current if no FEN stored

    game.load(newFen);
    setFen(newFen);
    setStatus(getStatus());
    setSelectedSquare(null);
    setLegalMoves([]);
    setCurrentPath(controller.getCurrentPath()); // Update path state

    // Defer heavy UI updates
    setTimeout(() => {
      refresh();
      updatePgnDisplay();
      updateFenDisplay();
      analyzeFen(newFen);
    }, 0);

    // Play sound based on the current move
    playNavigationSound(nextNode.san);
  };

  // function goToMove(path: string) {
  //   // Jump to a specific node in the tree
  //   controller.jump(path);
  //   setCurrentPath(path); // Update path state

  //   // Sync chess.js with controller
  //   const newFen = controller.getCurrentFen();
  //   game.load(newFen);
  //   setFen(newFen);

  //   // Reset UI state
  //   setSelectedSquare(null);
  //   setLegalMoves([]);
  //   setStatus(getStatus());

  //   // Defer heavy UI update
  //   setTimeout(() => {
  //     refresh();
  //   }, 0);

  //   // Optional: play sound depending on last move
  //   const node = controller.getCurrentNode();
  //   if (node.san) {
  //     if (node.san.includes("x")) {
  //       playCapture();
  //     } else {
  //       playMove();
  //     }
  //   }
  // }

  // function resetGame() {
  //   game.reset();

  //   // Create a fresh controller with the starting position
  //   const startFen = game.fen();
  //   controller.jump(TreePath.root);
  //   setCurrentPath(''); // Update path state to root

  //   // Ensure controller's root has the correct FEN
  //   controller.tree.updateAt(TreePath.root, (node: TreeNode) => {
  //     node.fen = startFen;
  //   });

  //   setFen(startFen);
  //   setCaptured({ w: [], b: [] });
  //   setStatus(getStatus());
  //   setLastMoveSquares(null);
  //   setLegalMoves([]);
  //   setSelectedSquare(null);

  //   setPgnInput("");
  //   setFenInput(startFen);

  //   refresh();
  //   clearCache();
  // }
  const onSquareClick = (square: Square) => {
    const temp = new Chess(fen);
    if (!selectedSquare) {
      // First click — select source square
      const piece = temp.get(square);
      if (piece && piece.color === temp.turn()) {
        setSelectedSquare(square);
        const moves = temp.moves({ square, verbose: true });
        setLegalMoves(moves.map((m) => m.to));
      }
    } else {
      // Second click — attempt move
      const legal = temp.moves({ verbose: true });
      const isLegal = legal.some(
        (m) => m.from === selectedSquare && m.to === square
      );

      if (isLegal) {
        // Execute the move using handleMove
        handleMove(selectedSquare, square);
      }

      // Reset selection in either case
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  };
  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Don't handle if user is typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPreviousMove();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextMove();
      }
      // Note: Enter key is handled by FooterNavigation for entering highlighted variations
      // ArrowUp/ArrowDown are also handled by FooterNavigation for highlighting variations
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [controller, refresh, game, playMove, playCapture, playCastle, playCheck, playPromote]);

  useEffect(() => {
    function handleWheel(event: WheelEvent) {
      if (!boardRef.current) return;

      const path = event.composedPath();
      if (!path.includes(boardRef.current)) {
        return;
      }

      event.preventDefault();

      if (event.deltaY > 0) {
        goToNextMove();
      } else if (event.deltaY < 0) {
        goToPreviousMove();
      }
    }

    // Add wheel event listener to the document
    document.addEventListener("wheel", handleWheel, { passive: false });

    // Cleanup
    return () => {
      document.removeEventListener("wheel", handleWheel);
    };
  }, [controller, refresh, game, playMove, playCapture, playCastle, playCheck, playPromote]);
  useEffect(() => {
    analyzeFen(game.fen());
  }, []);

  // Store evaluation in TreeNode when analysis completes
  useEffect(() => {
    const currentFen = game.fen();
    const cachedAnalysis = getCachedAnalysis(currentFen);

    if (DEBUG) {
      console.log('[Eval Storage Check]', {
        fen: currentFen,
        hasCachedAnalysis: !!cachedAnalysis,
        evalScore: cachedAnalysis?.evalScore,
        currentPath: controller.getCurrentPath()
      });
    }

    // If we have a cached evaluation and the current node doesn't have one stored yet
    if (cachedAnalysis?.evalScore) {
      const currentNode = controller.getCurrentNode();
      const currentPath = controller.getCurrentPath();

      // Only update if the node doesn't already have an evaluation
      if (currentNode && currentPath) {
        // Update eval if missing
        if (!currentNode.evalScore) {
          controller.tree.updateAt(currentPath, (node: TreeNode) => {
            node.evalScore = cachedAnalysis.evalScore;
          });
        }

        // Attempt classification (even if eval was already there, classification might be missing)
        updateMoveClassification(
          currentNode,
          cachedAnalysis.evalScore,
          cachedAnalysis.opening?.found === true
        );

        if (DEBUG) {
          console.log('[Eval Storage] ✅ Stored evaluation/classification in TreeNode:', {
            path: currentPath,
            evalScore: cachedAnalysis.evalScore,
            fen: currentFen
          });
        }
      } else if (DEBUG && currentNode?.evalScore) {
        console.log('[Eval Storage] ℹ️ Node already has evaluation:', currentNode.evalScore);
      }
    }
  }, [fen, controller, game, getCachedAnalysis, updateMoveClassification]);

  // Load study if studyId is provided
  useEffect(() => {
    if (studyId && studyId.trim().length > 0) {
      loadStudy(studyId.trim());
      return; // Don't load initial PGN/FEN if loading a study
    }

    // Load initial PGN or FEN if provided and no study
    if (initialPgn && initialPgn.trim().length > 0) {
      const newGame = new Chess();
      try {
        newGame.loadPgn(initialPgn);
        setPgnError(null);
        clearCache();

        // Reset controller to root and rebuild tree with all moves
        controller.jump(TreePath.root);
        game.reset();

        // Get the move history with verbose details
        const moveHistory = newGame.history({ verbose: true });

        // Replay each move through the controller to build the tree
        const tempGame = new Chess();
        for (const move of moveHistory) {
          tempGame.move(move);
          controller.playMove(move.san, tempGame.fen(), `${move.from}${move.to}${move.promotion || ''}`);
        }

        // Sync the main game state
        game.loadPgn(initialPgn);
        setFen(game.fen());
        setCurrentPath(controller.getCurrentPath());
        setLastMove(null);
        setLegalMoves([]);
        setPgnInput(initialPgn);
        analyzeFen(newGame.fen());
        refresh();
        updatePgnDisplay();

        // Navigate to initial ply if provided
        if (initialPly !== undefined && initialPly > 0) {
          const mainline = controller.getMainline();
          if (mainline.length > 0) {
            // Clamp ply to available moves
            const targetPly = Math.min(initialPly, mainline.length);
            const targetNodes = mainline.slice(0, targetPly);
            const targetPath = TreePath.fromNodeList(targetNodes);
            controller.jump(targetPath);

            // Sync game state to the target position
            const tempGame = new Chess();
            for (const node of targetNodes) {
              if (node.san) {
                tempGame.move(node.san);
              }
            }
            game.load(tempGame.fen());
            setFen(tempGame.fen());
            setCurrentPath(targetPath);
            analyzeFen(tempGame.fen());
            refresh();
          }
        }
      } catch {
        setPgnError("Invalid PGN");
      }
    } else if (initialFen && initialFen.trim().length > 0) {
      try {
        game.load(initialFen);
        setFenError(null);
        clearCache();
        setFen(game.fen());


        setStatus(getStatus());
        setLastMove(null);
        setLegalMoves([]);
        setFenInput(initialFen);
        analyzeFen(game.fen());
      } catch {
        setFenError("Invalid FEN");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId, initialPgn, initialFen, initialPly]);

  useEffect(() => {
    if (DEBUG) console.log("pvLines updated:", pvLines);
  }, [pvLines]);

  // Update evaluation when debounced FEN changes (analysis completes)
  useEffect(() => {
    // We use debouncedFen here because that's when the analysis is guaranteed to be ready/cached
    // If we used raw 'fen', we might check the cache before the analysis hook has finished
    const cached = getCachedAnalysis(debouncedFen);

    if (cached) {
      setBestMove(cached.bestMove);
      setEvalScore(cached.evalScore);

      if (cached.opening) {
        setOpening(cached.opening);
      }
    }
    // No else block - keep previous evaluation until new one arrives
  }, [debouncedFen, getCachedAnalysis]);

  // Handler for promotion piece selection
  // react-chessboard calls this when a pawn reaches the promotion square
  // Returns the piece to promote to: 'q', 'r', 'b', or 'n'
  const handlePromotionPieceSelect = useCallback((sourceSquare: Square, targetSquare: Square): string => {
    // Return 'q' as default - react-chessboard will show a promotion dialog
    // and the user can select queen, rook, bishop, or knight
    // The dialog is built into react-chessboard, so we just need to return the default
    return 'q';
  }, []);

  async function handleMove(
    sourceSquare: string,
    targetSquare: string,
    piece?: string
  ): Promise<boolean> {
    drawing.clearDrawings();

    const fenBeforeMove = game.fen();

    // Ensure game is synced with controller's current position

    const gamePiece = game.get(sourceSquare as Square);
    const isPromotion =
      gamePiece?.type === "p" &&
      ((gamePiece.color === "w" && targetSquare[1] === "8") ||
        (gamePiece.color === "b" && targetSquare[1] === "1"));

    // Extract promotion piece from the dropped piece string (format: 'wQ', 'bQ', etc.)
    // or use default 'q' for promotion
    let promotion: string | undefined = undefined;
    if (isPromotion) {
      if (piece) {
        // Extract piece type from piece string (e.g., 'wQ' -> 'q', 'bR' -> 'r')
        const pieceType = piece[1]?.toLowerCase();
        if (pieceType && ['q', 'r', 'b', 'n'].includes(pieceType)) {
          promotion = pieceType;
        } else {
          promotion = 'q'; // Default to queen
        }
      } else {
        promotion = 'q'; // Default to queen
      }
    }

    // Do NOT reload from controller here
    const move = game.move({
      from: sourceSquare,
      to: targetSquare,
      ...(promotion ? { promotion } : {}),
    });

    if (!move) {
      playIllegal();
      return false;
    }

    //  Now push update into controller
    const { isNewNode, path: movePath } = controller.playMove(
      move.san,
      game.fen(),
      `${move.from}${move.to}${move.promotion || ""}`
    );

    // Update last move in store
    setLastMove({ from: sourceSquare as Square, to: targetSquare as Square });

    // Update current path state so React detects the change
    setCurrentPath(movePath);

    setFen(game.fen()); // sync board
    setStatus(getStatus());

    // Defer heavy UI updates to next event loop tick to prevent blocking
    setTimeout(() => {
      refresh();
      updatePgnDisplay();
      updateFenDisplay();
      analyzeFen(game.fen());
    }, 0);

    // Play sound depending on move type
    // Priority: castle > check > promotion > capture > regular move
    // Check takes priority over capture because a checking capture (e.g. Bxf7+) 
    // is more urgent to signal than a regular capture
    if (move.flags.includes("k") || move.flags.includes("q")) {
      playCastle();
    } else if (game.isCheck()) {
      playCheck();
    } else if (move.promotion) {
      playPromote();
    } else if (move.captured) {
      playCapture();
    } else {
      playMove();
    }

    // Invoke config.onMove callback if provided (new engine system)
    if (config?.onMove) {
      config.onMove({
        from: move.from,
        to: move.to,
        san: move.san,
        fen: game.fen(),
        promotion: move.promotion,
        captured: move.captured,
        flags: move.flags,
        piece: move.piece,
        color: move.color,
      });
    }

    // Only trigger LLM analysis for NEW nodes, load cached for existing ones
    if (isNewNode) {
      const moveHistory = getMovesFromController(controller);
      if (DEBUG) {
        console.log("Debug - FEN being sent:", game.fen());
        console.log("Debug - Move played:", move.san);
        console.log("Debug - Move history:", moveHistory);
      }
      const request: AnalysisRequest = {
        id: `req-${Date.now()}`,
        movePath,
        moveSan: move.san,
        fenBeforeMove,
        currentFen: game.fen(),
        moveFrom: move.from,
        moveTo: move.to,
        movePromotion: move.promotion,
        moveHistory,
        abortController: new AbortController(),
      };

      if (gpuStatusRef.current !== 'ready' && activeStreamsRef.current >= MAX_CONCURRENT_STREAMS) {
        // GPU is warming AND we're at stream capacity — queue for later instead of dropping
        if (DEBUG) console.log(`[LLM] GPU cold + streams full, queueing ${move.san}`);
        controller.tree.updateAt(movePath, (node: TreeNode) => { node.llmPending = true; });
        analysisQueueRef.current.enqueue(request);
        setGpuQueuedCount(analysisQueueRef.current.getQueueSize());
        refresh();
      } else {
        // GPU ready or capacity available — stream immediately
        startLLMStream(request);
      }
    } else {
      // Node already exists - tree already has LLM messages, LLMChatPanel displays them
      // Clear autoMessage to prevent duplicates (no streaming needed for existing nodes)
      setAutoMessage(null);
      if (DEBUG) console.log("Existing node at path:", movePath, "- using cached tree messages");
    }

    if (maiaEnabled) {
      (async () => {
        // Dynamic import to avoid onnxruntime-web webpack error in Next.js 15
        const { initMaia, getMaiaMove } = await import("@/lib/engine/maiaEngine");
        await initMaia();
        const maiaMove = await getMaiaMove(game.fen(), maiaLevel);
        if (maiaMove) {
          const moveResult = game.move({
            from: maiaMove.slice(0, 2),
            to: maiaMove.slice(2, 4),
            promotion: maiaMove.length > 4 ? maiaMove[4] : undefined,
          });

          if (moveResult) {
            setFen(game.fen());
            // Use moveResult.san for proper SAN notation, not the UCI maiaMove
            controller.playMove(moveResult.san, game.fen(), maiaMove);

            // Play sound for Maia's move
            if (game.isCheck()) {
              playCheck();
            } else if (moveResult.captured) {
              playCapture();
            } else if (moveResult.flags.includes('k') || moveResult.flags.includes('q')) {
              playCastle();
            } else if (moveResult.promotion) {
              playPromote();
            } else {
              playMove();
            }
          }
        }
      })();
    }

    return true;
  }
  // function undoMove() {
  //   // Go back one node in the tree if possible
  //   controller.goBack();
  //   game.load(controller.getCurrentFen());

  //   setFen(controller.getCurrentFen());
  //   setStatus(getStatus());
  //   setLastMoveSquares(null);

  //   // Handle sound
  //   const node = controller.getCurrentNode();
  //   if (node?.uci) {
  //     if (node.uci.includes("x")) {
  //       playCapture();
  //     } else {
  //       playMove();
  //     }
  //   }

  //   setCaptured({ w: [], b: [] });
  // }



  const updatePgnDisplay = useCallback(() => {
    const currentPath = controller.getCurrentPath();

    // Check cache first (instant on hit!)
    if (pgnCacheRef.current.has(currentPath)) {
      setPgnInput(pgnCacheRef.current.get(currentPath)!);
      if (DEBUG) console.log('[PGN] Cache hit for path:', currentPath);
      return;
    }

    // Cache miss - generate and cache
    const nodeList = controller.tree.getNodeList(currentPath);
    let pgnMoves = "";

    // Skip root node, build PGN from actual moves in current path
    for (let i = 1; i < nodeList.length; i++) {
      const node = nodeList[i];
      if (!node.san) continue;

      const moveNumber = Math.ceil(node.ply / 2);
      const isWhiteMove = node.ply % 2 === 1;

      if (isWhiteMove) {
        pgnMoves += `${moveNumber}. ${node.san} `;
      } else {
        pgnMoves += `${node.san} `;
      }
    }

    const trimmedPgn = pgnMoves.trim();
    pgnCacheRef.current.set(currentPath, trimmedPgn);
    setPgnInput(trimmedPgn);

    if (DEBUG) console.log('[PGN] Generated and cached for path:', currentPath);
  }, [controller]);

  const updateFenDisplay = useCallback(() => {
    setFenInput(game.fen());
  }, [game]);

  const generateDefaultStudyName = (): string => {
    const moves = getMovesFromController(controller);
    if (moves.length === 0) {
      return "Starting Position Analysis";
    }

    // Show first few moves for the study name
    const firstMoves = moves.slice(0, 3).join(" ");
    const suffix = moves.length > 3 ? "..." : "";
    return `${firstMoves}${suffix}`;
  };

  const loadStudy = async (id: string) => {
    setIsLoadingStudy(true);
    setStudyLoadError(null);

    try {
      const headers = await getClientAuthHeaders({ includeContentType: false });
      const response = await fetch(`${GATEWAY_URL}/studies/${id}`, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const study = await response.json();

      // Restore game state from study
      if (study.pgn) {
        setPgnInput(study.pgn);
        try {
          game.loadPgn(study.pgn);
          setPgnError(null);
        } catch {
          // If PGN fails, try FEN
          if (study.current_fen) {
            game.load(study.current_fen);
          }
        }
      } else if (study.current_fen) {
        game.load(study.current_fen);
        setFenInput(study.current_fen);
      }

      // Restore tree structure if available
      if (study.move_tree) {
        // Deserialize tree and rebuild controller
        const deserializeNode = (nodeData: any): TreeNode => {
          return {
            id: nodeData.id,
            ply: nodeData.ply,
            san: nodeData.san,
            uci: nodeData.uci,
            fen: nodeData.fen,
            children: (nodeData.children || []).map(deserializeNode),
            forceVariation: nodeData.forceVariation
          };
        };

        const rootNode = deserializeNode(study.move_tree);
        controller.tree.root = rootNode;

        // Jump to the saved path
        if (study.current_path) {
          controller.jump(study.current_path);
        }
      }

      // Restore LLM messages
      if (study.messages) {
        setLLMMessages(study.messages);
      }

      // Update UI state
      setFen(game.fen());
      setStatus(getStatus());
      setLastMoveSquares(null);
      setLegalMoves([]);
      clearCache();
      refresh();
      analyzeFen(game.fen());

      console.log(`Study "${study.name}" loaded successfully`);

    } catch (error) {
      console.error('Failed to load study:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStudyLoadError(`Failed to load study: ${errorMessage}`);
    } finally {
      setIsLoadingStudy(false);
    }
  };

  const saveStudy = async (name: string): Promise<{ success: boolean; message: string }> => {
    console.log('[STUDY SAVE] Starting study save...');
    setIsSaving(true);

    try {
      // Serialize the tree structure manually
      const serializeNode = (node: any): any => {
        return {
          id: node.id,
          ply: node.ply,
          san: node.san,
          uci: node.uci,
          fen: node.fen,
          children: node.children.map(serializeNode),
          forceVariation: node.forceVariation
        };
      };

      // Get current position and game state
      const currentPgn = pgnInput || game.pgn();
      const currentFen = game.fen();
      const currentPath = controller.getCurrentPath();
      const moveTree = serializeNode(controller.tree.root);

      // Create study payload
      const studyData = {
        name: name.trim() || generateDefaultStudyName(),
        pgn: currentPgn,
        current_fen: currentFen,
        current_path: currentPath,
        move_tree: moveTree,
        messages: llmMessages // All LLM messages organized by path
      };

      const headers = await getClientAuthHeaders();
      console.log('[STUDY SAVE] Session ID from headers:', headers['x-session-id']);
      console.log('[STUDY SAVE] Auth header present:', Boolean(headers.Authorization));

      console.log('[STUDY SAVE] Making POST request to /studies...');
      const response = await fetch(`${GATEWAY_URL}/studies`, {
        method: 'POST',
        headers,
        body: JSON.stringify(studyData)
      });

      console.log('[STUDY SAVE] Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[STUDY SAVE] Error response:', errorData);
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('[STUDY SAVE] Success! Response:', result);
      console.log('[STUDY SAVE] ✅ Study saved successfully!');

      return { success: true, message: `Study "${studyData.name}" saved successfully!` };

    } catch (error) {
      console.error('[STUDY SAVE] ❌ Failed to save study:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    } finally {
      setIsSaving(false);
      console.log('[STUDY SAVE] Done (isSaving set to false)');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background p-2 lg:p-4 overflow-y-auto">
      <div className="flex flex-col xl:flex-row gap-2 xl:gap-4 w-full mx-auto items-start justify-center h-full pt-10">
        {/* WikiBook Panel - Show on left only for >= 1280px (xl) */}
        <div
          className="hidden xl:flex bg-card shadow rounded overflow-auto flex-col"
          style={{
            width: boardSize / 1.55,
            height: boardSize
          }}
        >
          {currentMoves && currentMoves.length > 0 ? (
            <OpeningBook moves={currentMoves} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              No opening theory available
            </div>
          )}
        </div>

        {/* Center container for board+eval and right panel */}
        <div className="flex flex-col lg:flex-row gap-2 lg:gap-4 w-full xl:w-auto items-start">
          {/* Board and Eval Bar Container */}
          <div className="flex flex-col items-center xl:h-auto order-1 relative">
            {/* Study Loading Status */}
            {isLoadingStudy && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md flex items-center gap-2">
                <LogoSpinner size="sm" />
                <span className="text-blue-700 text-sm">Loading study...</span>
              </div>
            )}
            {studyLoadError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <span className="text-red-700 text-sm">{studyLoadError}</span>
              </div>
            )}
            <div className="flex items-center gap-0 mb-8">
              <div className="w-8" style={{ height: boardSize }}>
                <EvaluationBar
                  evalScore={evalScore}
                  orientation={orientation}
                />
              </div>

              <div
                ref={boardRef}
                className="relative bg-card"
                style={{
                  width: boardSize,
                  height: boardSize,
                  maxWidth: '90vw',
                  maxHeight: '90vw'
                }}
              >
                <div className="absolute -top-8 left-0 w-full">
                  <CapturedPieces fen={fen} orientation={orientation} side="top" />
                </div>

                <div
                  onMouseDown={drawing.handleMouseDown}
                  onMouseUp={drawing.handleMouseUp}
                  onContextMenu={drawing.handleContextMenu}
                  className="relative"
                >
                  {/* UniversalBoard replaces Chessboard + customArrows + customSquareStyles */}
                  <UniversalBoard
                    position={fen}
                    boardWidth={boardSize}
                    boardOrientation={orientation}
                    customDropSquareStyle={{ boxShadow: 'inset 0 0 0 1px white' }} // Match regular hover style
                    onPieceDrop={(source, target, piece) => {
                      // Trigger ripple on drop
                      useBoardStore.getState().addRipple(target);
                      handleMove(source, target, piece);
                      return true; // Always return true for the UI, error handling is done inside handleMove
                    }}
                    onPromotionPieceSelect={handlePromotionPieceSelect}
                    onPieceDragBegin={(_, sourceSquare) => {
                      // Trigger ripple on drag start
                      useBoardStore.getState().addRipple(sourceSquare);

                      // Clear hover state immediately so glow doesn't persist on source
                      setHoveredSquare(null);

                      const moves = game.moves({
                        square: sourceSquare,
                        verbose: true,
                      });
                      const legal = moves
                        .map((m) => m.to)
                        .filter((sq): sq is Square => /^[a-h][1-8]$/.test(sq));
                      setDraggingFrom(sourceSquare);
                      setLegalMoves(legal);
                    }}
                    onSquareClick={(square) => {
                      // Trigger ripple on click
                      useBoardStore.getState().addRipple(square);
                      onSquareClick(square);
                    }}
                    onPieceDragEnd={() => {
                      setDraggingFrom(null);
                      setLegalMoves([]);
                    }}
                    onMouseOverSquare={(sq) => setHoveredSquare(sq)}
                    onMouseOutSquare={() => setHoveredSquare(null)}
                    showOverlay={true}
                    customSquareStyles={customSquareStyles}
                  />

                  <div
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const startX = e.clientX;
                      const startY = e.clientY;
                      const startSize = boardSize;

                      function onMouseMove(ev: MouseEvent) {
                        const diff = Math.max(
                          ev.clientX - startX,
                          ev.clientY - startY
                        );
                        setBoardSize(
                          Math.max(300, Math.min(800, startSize + diff))
                        );
                      }

                      function onMouseUp() {
                        document.removeEventListener("mousemove", onMouseMove);
                        document.removeEventListener("mouseup", onMouseUp);
                      }

                      document.addEventListener("mousemove", onMouseMove);
                      document.addEventListener("mouseup", onMouseUp);
                    }}
                  />

                  {/* OverlayGrid removed - now handled by Canvas overlay in UniversalBoard */}

                  {/* Non-LLM Commentary Overlay - Canvas for tactical visualizations */}
                  <NonLLMCommentaryOverlay
                    enabled={!!activeAffordance}
                    boardSize={boardSize}
                    orientation={orientation}
                    affordance={activeAffordance}
                  />
                </div>

                <div className="absolute -bottom-8 left-0 w-full">
                  <CapturedPieces fen={fen} orientation={orientation} side="bottom" />
                </div>
              </div>
            </div>

            {/* MOBILE NAVIGATION BUTTONS - Below board on mobile only */}
            <div className="flex lg:hidden gap-2 p-2 mt-2 order-2 bg-card shadow rounded">
              <Button
                onClick={() => {
                  controller.jump(TreePath.root);
                  game.load(controller.getCurrentFen());
                  const newFen = controller.getCurrentFen();
                  setFen(newFen);
                  setLastMove(null);
                  setSelectedSquare(null);
                  refresh();
                  analyzeFen(newFen);
                  playMove();
                }}
                disabled={controller.getCurrentPath() === TreePath.root}
                size="icon"
                variant="outline"
                className="flex-1"
                aria-label="Go to start"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>

              <Button
                onClick={goToPreviousMove}
                size="icon"
                variant="outline"
                className="flex-1"
                disabled={controller.getCurrentPath() === TreePath.root}
                aria-label="Previous move"
              >
                <SkipBack className="h-4 w-4" />
              </Button>

              <Button
                onClick={goToNextMove}
                disabled={controller.getCurrentNode().children.length === 0}
                size="icon"
                variant="outline"
                className="flex-1"
                aria-label="Next move"
              >
                <SkipForward className="h-4 w-4" />
              </Button>

              <Button
                onClick={() => {
                  const mainline = controller.getMainline();
                  if (mainline.length > 0) {
                    const endPath = TreePath.fromNodeList(mainline);
                    controller.jump(endPath);

                    const temp = new Chess();
                    const nodeList = controller.tree.getNodeList(endPath);

                    for (let i = 1; i < nodeList.length; i++) {
                      const node = nodeList[i];
                      if (node.uci) {
                        temp.move({
                          from: node.uci.slice(0, 2),
                          to: node.uci.slice(2, 4),
                          promotion: node.uci.length > 4 ? node.uci[4] : undefined,
                        });
                      }
                    }

                    const newFen = temp.fen();
                    game.load(newFen);
                    setFen(newFen);
                    refresh();
                    analyzeFen(newFen);

                    // Play sound based on the last move in the mainline
                    if (nodeList.length > 1) {
                      const lastNode = nodeList[nodeList.length - 1];
                      if (lastNode.san) {
                        if (lastNode.san.includes('O-O')) {
                          playCastle();
                        } else if (lastNode.san.includes('+') || lastNode.san.includes('#')) {
                          playCheck();
                        } else if (lastNode.san.includes('=')) {
                          playPromote();
                        } else if (lastNode.san.includes('x')) {
                          playCapture();
                        } else {
                          playMove();
                        }
                      }
                    }
                  }
                }}
                disabled={controller.getCurrentNode().children.length === 0}
                size="icon"
                variant="outline"
                className="flex-1"
                aria-label="Go to end"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>

              <Button
                onClick={() =>
                  setOrientation((o) => (o === "white" ? "black" : "white"))
                }
                size="icon"
                variant="outline"
                className="flex-1"
                aria-label="Flip board"
              >
                <RotateCw className="h-4 w-4" />
              </Button>

              <Button
                onClick={() => setSaveDialogOpen(true)}
                size="icon"
                variant="outline"
                className="flex-1"
                aria-label="Save study"
              >
                <Save className="h-4 w-4" />
              </Button>
            </div>

            {/* FEN/PGN Section - Desktop only */}
            <div className="hidden lg:block mt-4 space-y-3">
              {/* PGN Textarea */}
              <div>
                <label
                  htmlFor="pgn-input"
                  id="pgn-input-label"
                  className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block"
                >
                  PGN
                </label>
                <div className="relative">
                  <Textarea
                    ref={pgnTextareaRef}
                    id="pgn-input"
                    aria-labelledby="pgn-input-label"
                    value={pgnInput}
                    onChange={(e) => {
                      setPgnInput(e.target.value);
                      autoResizeTextarea(e.target);
                      try {
                        const newGame = new Chess();
                        newGame.loadPgn(e.target.value);
                        game.loadPgn(e.target.value);
                        setFen(game.fen());
                        setStatus(getStatus());
                        analyzeFen(game.fen());
                      } catch {
                        // Invalid PGN, ignore
                      }
                    }}
                    className="font-mono text-xs min-h-[60px] overflow-hidden pr-8"
                    placeholder="Paste PGN here..."
                    rows={3}
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-1 right-1 h-6 w-6 p-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100/80 transition-all duration-200"
                          onClick={() => {
                            navigator.clipboard.writeText(pgnInput);
                            setPgnCopied(true);
                            setTimeout(() => setPgnCopied(false), 2000);
                          }}
                          disabled={!pgnInput}
                        >
                          <span className={`transition-all duration-200 ${pgnCopied ? 'scale-110' : 'scale-100'}`}>
                            {pgnCopied ? (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-xs">
                        {pgnCopied ? "Copied!" : "Copy PGN"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              {/* FEN Textarea */}
              <div>
                <label
                  htmlFor="fen-input"
                  id="fen-input-label"
                  className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block"
                >
                  FEN
                </label>
                <div className="relative">
                  <Textarea
                    ref={fenTextareaRef}
                    id="fen-input"
                    aria-labelledby="fen-input-label"
                    value={fenInput}
                    onChange={(e) => {
                      setFenInput(e.target.value);
                      autoResizeTextarea(e.target);
                      try {
                        game.load(e.target.value);
                        setFen(e.target.value);
                        setStatus(getStatus());
                        analyzeFen(e.target.value);
                      } catch {
                        // Invalid FEN, ignore
                      }
                    }}
                    className="font-mono text-xs min-h-[40px] overflow-hidden pr-8"
                    placeholder="Paste FEN here..."
                    rows={1}
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-1 right-1 h-6 w-6 p-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100/80 transition-all duration-200"
                          onClick={() => {
                            navigator.clipboard.writeText(fenInput);
                            setFenCopied(true);
                            setTimeout(() => setFenCopied(false), 2000);
                          }}
                          disabled={!fenInput}
                        >
                          <span className={`transition-all duration-200 ${fenCopied ? 'scale-110' : 'scale-100'}`}>
                            {fenCopied ? (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-xs">
                        {fenCopied ? "Copied!" : "Copy FEN"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL + BUTTONS CONTAINER */}
          <div className="flex flex-col gap-2 w-full lg:w-auto order-3" style={{
            width: mounted && window.innerWidth >= 1024 ? boardSize / 1.46 : undefined,
            minWidth: mounted && window.innerWidth >= 1024 ? 320 : undefined,
            height: mounted && window.innerWidth >= 1024
              ? (isAnalyzeVariant ? "calc(100dvh - 8rem)" : boardSize)
              : undefined,
          }}>
            {/* RIGHT PANEL */}
            <div className="bg-card shadow-sm border rounded-lg p-4 flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
              {/* Tabbed Interface */}
              <div className="flex gap-1 mb-4 bg-muted p-1 rounded-lg">
                <button
                  className={`flex-1 px-4 py-2.5 text-xs font-medium rounded-md transition-all duration-200 ${tab === "history"
                    ? "bg-card text-foreground shadow-sm"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  onClick={() => setTab("history")}
                >
                  Moves
                </button>
                <button
                  className={`flex-1 px-4 py-2.5 text-xs font-medium rounded-md transition-all duration-200 ${tab === "analysis"
                    ? "bg-card text-foreground shadow-sm"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  onClick={() => setTab("analysis")}
                >
                  Analysis
                </button>
                <button
                  className={`flex-1 px-4 py-2.5 text-xs font-medium rounded-md transition-all duration-200 ${tab === "settings"
                    ? "bg-card text-foreground shadow-sm"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  onClick={() => setTab("settings")}
                >
                  Settings
                </button>
              </div>

              {/* Position Evaluation Bubble - Only in Moves tab */}
              {tab === "history" && (
                <div className="mb-4">
                  <PositionEvaluationBubble
                    fen={fen}
                    plyCount={currentMoves.length}
                    onDrawAffordance={setActiveAffordance}
                    moveSan={controller.getCurrentNode()?.san}
                    evalScore={evalScore ? parseFloat(evalScore) : undefined}
                    preMoveFen={(() => {
                      const list = controller.tree.getNodeList(controller.path);
                      return list.length > 1 ? list[list.length - 2].fen : undefined;
                    })()}
                    moveClassification={controller.getCurrentNode()?.classification}
                    llmMessage={(() => {
                      const node = controller.getCurrentNode();
                      const messages = node?.llmMessages;
                      // Get the latest LLM message for this move
                      if (messages && messages.length > 0) {
                        return messages.find((m: any) => m.sender === 'llm') || null;
                      }
                      return null;
                    })()}
                    isPremium={isPremium}
                    plan={plan}
                  />
                </div>
              )}

              {tab === "history" ? (
                <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
                  {/* Engine Lines - always displayed with min height */}
                  <div className="min-h-[80px] flex-shrink-0">
                    {pvLines.length > 0 ? (
                      <PvLinesPanel
                        pvLines={pvLines.slice(0, 3)}
                        startingFen={fen}
                        onClickMove={(line, moveIndex) => {
                          const temp = new Chess(fen);
                          let lastMove = null;

                          // Replay up to the selected PV move
                          for (let i = 0; i <= moveIndex; i++) {
                            const uci = line.moves[i];
                            lastMove = temp.move({
                              from: uci.slice(0, 2),
                              to: uci.slice(2, 4),
                              promotion: uci.length > 4 ? uci[4] : undefined,
                            });
                            if (!lastMove) break;
                          }

                          if (!lastMove) return;

                          const newFen = temp.fen();

                          controller.playMove(
                            lastMove.san,
                            newFen,
                            `${lastMove.from}${lastMove.to}${lastMove.promotion || ""}`
                          );

                          // Sync board + UI
                          game.load(newFen);
                          setFen(newFen);
                          setStatus(getStatus());
                          setSelectedSquare(null);
                          setLegalMoves([]);
                          refresh();
                          analyzeFen(newFen);
                        }}
                      />
                    ) : (
                      <div className="flex flex-col gap-1 font-mono text-xs">
                        {/* Placeholder engine lines skeleton - 3 rows */}
                        <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 animate-pulse">
                          <div className="flex items-start gap-2">
                            <div className="w-10 h-4 bg-slate-200 rounded"></div>
                            <div className="flex-1 h-4 bg-slate-200 rounded"></div>
                          </div>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 animate-pulse">
                          <div className="flex items-start gap-2">
                            <div className="w-10 h-4 bg-slate-200 rounded"></div>
                            <div className="flex-1 h-4 bg-slate-200 rounded"></div>
                          </div>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 animate-pulse">
                          <div className="flex items-start gap-2">
                            <div className="w-10 h-4 bg-slate-200 rounded"></div>
                            <div className="flex-1 h-4 bg-slate-200 rounded"></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Move Classification Description Box - COMMENTED OUT
                   * The commentary bubble already shows move classification.
                   * Logic for goToPreviousMove/goToNextMove preserved.
                   */}
                  {/* {(() => {
                    const currentNode = controller.getCurrentNode();
                    const classificationColor: Record<string, string> = {
                      brilliant: '#1bada6',
                      great: '#2596be',
                      best: '#96bc4b',
                      book: '#a88865',
                      excellent: '#96bc4b',
                      good: '#96af8b',
                      inaccuracy: '#f7c045',
                      mistake: '#e58f2a',
                      blunder: '#ca3431',
                      incorrect: '#ca3431',
                      miss: '#ca3431',
                    };
                    if (currentNode && currentNode.san) {
                      return (
                        <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-100 shadow-sm min-h-[52px] flex items-center flex-shrink-0">
                          {currentNode.classification ? (
                            <p className="text-sm text-gray-700 flex items-center gap-2">
                              <MoveClassificationBadge classification={currentNode.classification as MoveClassification} inline={true} />
                              <span>
                                <span className="font-bold font-mono text-gray-900">{currentNode.san}</span> was <span className="font-bold" style={{ color: classificationColor[currentNode.classification] || '#6b7280' }}>{currentNode.classification}</span>
                              </span>
                            </p>
                          ) : (
                            <p className="text-sm text-gray-500 flex items-center gap-2">
                              <span>
                                This <span className="font-bold font-mono text-gray-900">{currentNode.san}</span> move was played
                              </span>
                            </p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()} */}

                  <div className="mt-4 p-3 border-t border-gray-200 flex-shrink-0">
                    <Button
                      size="sm"
                      variant={maiaEnabled ? "default" : "outline"}
                      className="w-full mb-2"
                      onClick={() => setMaiaEnabled(!maiaEnabled)}
                    >
                      {maiaEnabled ? "Disable Maia" : "Enable Maia"}
                    </Button>

                    {maiaEnabled && (
                      <Select value={maiaLevel.toString()} onValueChange={(value) => setMaiaLevel(parseInt(value))}>
                        <SelectTrigger size="sm" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1100">Maia 1100</SelectItem>
                          <SelectItem value="1500">Maia 1500</SelectItem>
                          <SelectItem value="1900">Maia 1900</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Move tree - uses the parent history panel scroll container */}
                  <div className="relative">
                    {displayBlocks.map((block, blockIdx) => {
                      if (block.type === 'table') {
                        // Render Table Block
                        return (
                          <div key={blockIdx} className="grid grid-cols-[3rem_1fr_1fr] text-sm border-b border-gray-100 last:border-b-0">
                            {Array.from({ length: Math.ceil(block.moves.length / 2) }).map((_, rowIdx) => {
                              const whiteMoveIndex = rowIdx * 2;
                              const blackMoveIndex = rowIdx * 2 + 1;
                              const whiteItem = block.moves[whiteMoveIndex];
                              const blackItem = block.moves[blackMoveIndex];
                              const moveNumber = Math.ceil(whiteItem.node.ply / 2);

                              return (
                                <React.Fragment key={rowIdx}>
                                  <div className="p-2 text-gray-400 bg-gray-50/50 dark:bg-neutral-800/50 font-mono text-xs flex items-center justify-center border-r border-gray-100 dark:border-neutral-800">
                                    {moveNumber}
                                  </div>
                                  <div className="p-1 flex items-center border-r border-gray-100 dark:border-neutral-800">
                                    {renderMove(whiteItem.node, whiteItem.path, true, true)}
                                  </div>
                                  <div className="p-1 flex items-center">
                                    {blackItem && renderMove(blackItem.node, blackItem.path, true, true)}
                                  </div>
                                </React.Fragment>
                              );
                            })}
                          </div>
                        );
                      } else {
                        // Render Inline Block (Variation)
                        return (
                          <div key={blockIdx} className="w-full p-3 bg-gray-50 dark:bg-neutral-800/50 border-t border-b border-gray-200 dark:border-neutral-700 text-sm leading-relaxed break-words flex">
                            {/* Branch indicator - Lichess style */}
                            <span className="text-gray-400 mr-2 flex-shrink-0 select-none font-mono">├─</span>
                            <div className="flex-1">
                              {block.moves.map((item, moveIdx) => (
                                <span key={item.path} className="inline">
                                  {/* Show move number if it's the first move in block OR if it's white */}
                                  {(moveIdx === 0 || item.node.ply % 2 === 1) && (
                                    <span className="text-gray-500 mr-1 font-mono text-xs">
                                      {Math.ceil(item.node.ply / 2)}{item.node.ply % 2 === 1 ? '.' : '...'}
                                    </span>
                                  )}
                                  {renderMove(item.node, item.path, false, true)}
                                  <span className="mr-1"> </span>
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      }
                    })}

                    {/* Footer Navigation for Siblings */}
                    <FooterNavigation
                      siblings={siblings}
                      activeNodeId={activeNode.id}
                      onSelect={(nodeId: string) => {
                        // Jump to the selected sibling
                        // We need the path. Sibling path is parentPath + siblingId
                        const siblingPath = activeNodeParentPath + nodeId;
                        controller.jump(siblingPath);
                        const newFen = controller.getCurrentFen();
                        game.load(newFen);
                        setFen(newFen);
                        setStatus(getStatus());
                        refresh();
                        analyzeFen(newFen);

                        // Play sound for the selected sibling
                        const selectedNode = siblings.find(s => s.id === nodeId);
                        if (selectedNode?.san) {
                          if (selectedNode.san.includes('O-O')) {
                            playCastle();
                          } else if (selectedNode.san.includes('+') || selectedNode.san.includes('#')) {
                            playCheck();
                          } else if (selectedNode.san.includes('=')) {
                            playPromote();
                          } else if (selectedNode.san.includes('x')) {
                            playCapture();
                          } else {
                            playMove();
                          }
                        }
                      }}
                    />
                  </div>


                </div>
              ) : tab === "analysis" ? (
                <div className="flex-1 min-h-0 flex flex-col">
                  <LLMChatPanel
                    fen={fen}
                    pv={pvLine}
                    autoMessage={autoMessage}
                    path={currentPath}
                    moveHistory={getMovesFromController(controller)}
                    controller={controller}
                    lastMove={game.history().slice(-1)[0]}
                    onRefresh={refresh}
                    refreshKey={refreshKey}
                    onJumpToMove={handleJumpToMove}
                    gpuStatus={gpuStatus}
                    gpuQueuedCount={gpuQueuedCount}
                  />
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold mb-4">Settings</h2>

                    {/* Engine Settings */}
                    <AnalyzeEngineSettingsPanel plan={plan} isPremium={isPremium} />

                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium mb-2">Board Display</h3>
                        {maiaEnabled && (
                          <p className="text-xs text-muted-foreground mb-2">
                            Disabled while Maia is active
                          </p>
                        )}
                        <Button
                          size="sm"
                          variant={showGridOverlay ? "default" : "outline"}
                          className="w-full mb-2 flex items-center justify-center whitespace-nowrap"
                          onClick={() => setShowGridOverlay(!showGridOverlay)}
                          disabled={maiaEnabled}
                        >
                          <Grid3x3 className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span>{showGridOverlay ? "Hide Grid Overlay" : "Show Grid Overlay"}</span>
                        </Button>
                        <Button
                          size="sm"
                          variant={showArrows ? "default" : "outline"}
                          className="w-full flex items-center justify-center whitespace-nowrap"
                          onClick={() => setShowArrows((v) => !v)}
                          disabled={maiaEnabled}
                        >
                          <span>{showArrows ? "Hide Arrows" : "Show Arrows"}</span>
                        </Button>

                        {showGridOverlay && !maiaEnabled && (
                          <div className="mt-3">
                            <label
                              htmlFor="max-overlay-boxes"
                              id="max-overlay-boxes-label"
                              className="text-xs font-medium mb-1 block"
                            >
                              Max Eval Boxes: {maxOverlayBoxes === 20 ? 'All' : maxOverlayBoxes}
                            </label>
                            <Input
                              id="max-overlay-boxes"
                              type="range"
                              min="1"
                              max="20"
                              value={maxOverlayBoxes}
                              onChange={(e) => setMaxOverlayBoxes(Number(e.target.value))}
                              className="w-full"
                              aria-labelledby="max-overlay-boxes-label"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Show top {maxOverlayBoxes === 20 ? 'all' : maxOverlayBoxes} best move{maxOverlayBoxes === 1 ? '' : 's'}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="mt-4">
                        <h3 className="text-sm font-medium mb-2">Threat Detection</h3>
                        <Button
                          size="sm"
                          variant={showThreatLines ? "default" : "outline"}
                          className="w-full mb-2 flex items-center justify-center whitespace-nowrap"
                          onClick={() => setShowThreatLines(!showThreatLines)}
                          disabled={maiaEnabled}
                        >
                          <Target className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span>{showThreatLines ? "Hide Threats" : "Show Threats"}</span>
                        </Button>

                        {showThreatLines && !maiaEnabled && (
                          <div className="mt-3">
                            <label
                              htmlFor="threat-threshold"
                              id="threat-threshold-label"
                              className="text-xs font-medium mb-1 block"
                            >
                              Threat Threshold: {threatThreshold === 0 ? 'All' : `${threatThreshold / 100} pawns`}
                            </label>
                            <Input
                              id="threat-threshold"
                              type="range"
                              min="0"
                              max="900"
                              step="100"
                              value={threatThreshold}
                              onChange={(e) => setThreatThreshold(Number(e.target.value))}
                              className="w-full"
                              aria-labelledby="threat-threshold-label"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Show threats to pieces worth ≥ {threatThreshold / 100} pawns
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* NAVIGATION BUTTONS - Under right panel with same width */}
            <div className="hidden lg:flex gap-2 p-2 bg-card shadow rounded">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => {
                        controller.jump(TreePath.root);
                        game.load(controller.getCurrentFen());
                        const newFen = controller.getCurrentFen();
                        setFen(newFen);
                        setLastMove(null);
                        setSelectedSquare(null);
                        refresh();
                        analyzeFen(newFen);
                        playMove();
                      }}
                      disabled={controller.getCurrentPath() === TreePath.root}
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
                      onClick={goToPreviousMove}
                      size="icon"
                      variant="outline"
                      className="flex-1"
                      disabled={controller.getCurrentPath() === TreePath.root}
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
                      onClick={goToNextMove}
                      disabled={controller.getCurrentNode().children.length === 0}
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
                      onClick={() => {
                        const mainline = controller.getMainline();
                        if (mainline.length > 0) {
                          const endPath = TreePath.fromNodeList(mainline);
                          controller.jump(endPath);

                          const temp = new Chess();
                          const nodeList = controller.tree.getNodeList(endPath);

                          for (let i = 1; i < nodeList.length; i++) {
                            const node = nodeList[i];
                            if (node.uci) {
                              temp.move({
                                from: node.uci.slice(0, 2),
                                to: node.uci.slice(2, 4),
                                promotion: node.uci.length > 4 ? node.uci[4] : undefined,
                              });
                            }
                          }

                          const newFen = temp.fen();
                          game.load(newFen);
                          setFen(newFen);
                          refresh();
                          analyzeFen(newFen);

                          // Play sound based on the last move in the mainline
                          if (nodeList.length > 1) {
                            const lastNode = nodeList[nodeList.length - 1];
                            if (lastNode.san) {
                              if (lastNode.san.includes('O-O')) {
                                playCastle();
                              } else if (lastNode.san.includes('+') || lastNode.san.includes('#')) {
                                playCheck();
                              } else if (lastNode.san.includes('=')) {
                                playPromote();
                              } else if (lastNode.san.includes('x')) {
                                playCapture();
                              } else {
                                playMove();
                              }
                            }
                          }
                        }
                      }}
                      disabled={controller.getCurrentNode().children.length === 0}
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
                      onClick={() =>
                        setOrientation((o) => (o === "white" ? "black" : "white"))
                      }
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

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => setSaveDialogOpen(true)}
                      size="icon"
                      variant="outline"
                      className="flex-1"
                      aria-label="Save study"
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Save Study</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => {
                        // Reset to initial position
                        game.reset();
                        const startFen = game.fen();
                        setFen(startFen);
                        // Clear the move tree by removing all children from root
                        controller.tree.root.children = [];
                        controller.jump(TreePath.root);
                        setLastMove(null);
                        // Clear the analysis cache BEFORE triggering new analysis
                        clearCache();
                        refresh();
                        analyzeFen(startFen);
                      }}
                      size="icon"
                      variant="outline"
                      className="flex-1"
                      aria-label="Clear move tree"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Clear Move Tree</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* WikiBook Panel - Show below right panel for 1024px <= width < 1280px */}
            <div className="hidden lg:block xl:hidden">
              {currentMoves && currentMoves.length > 0 ? (
                <OpeningBook moves={currentMoves} />
              ) : (
                <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
                  No opening theory available
                </div>
              )}
            </div>
          </div>
        </div>

        {/* WikiBook Panel - Show on mobile (< 1024px) */}
        <div className="lg:hidden xl:hidden w-full order-4">
          {currentMoves && currentMoves.length > 0 ? (
            <OpeningBook moves={currentMoves} />
          ) : (
            <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
              No opening theory available
            </div>
          )}
        </div>

        {/* FEN/PGN Section - Mobile only */}
        <div className="lg:hidden order-5 space-y-3 w-full">
          {/* FEN Textarea */}
          <div>
            <label
              htmlFor="fen-input-mobile"
              id="fen-input-mobile-label"
              className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block"
            >
              FEN
            </label>
            <div className="relative">
              <Textarea
                ref={fenTextareaMobileRef}
                id="fen-input-mobile"
                aria-labelledby="fen-input-mobile-label"
                value={fenInput}
                onChange={(e) => {
                  setFenInput(e.target.value);
                  autoResizeTextarea(e.target);
                  try {
                    game.load(e.target.value);
                    setFen(e.target.value);
                    setStatus(getStatus());
                    analyzeFen(e.target.value);
                  } catch {
                    // Invalid FEN, ignore
                  }
                }}
                className="font-mono text-xs min-h-[40px] overflow-hidden pr-8"
                placeholder="Paste FEN here..."
                rows={1}
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute top-1 right-1 h-6 w-6 p-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100/80 transition-all duration-200"
                      onClick={() => {
                        navigator.clipboard.writeText(fenInput);
                        setFenCopied(true);
                        setTimeout(() => setFenCopied(false), 2000);
                      }}
                      disabled={!fenInput}
                    >
                      <span className={`transition-all duration-200 ${fenCopied ? 'scale-110' : 'scale-100'}`}>
                        {fenCopied ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    {fenCopied ? "Copied!" : "Copy FEN"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* PGN Textarea */}
          <div>
            <label
              htmlFor="pgn-input-mobile"
              id="pgn-input-mobile-label"
              className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block"
            >
              PGN
            </label>
            <div className="relative">
              <Textarea
                ref={pgnTextareaMobileRef}
                id="pgn-input-mobile"
                aria-labelledby="pgn-input-mobile-label"
                value={pgnInput}
                onChange={(e) => {
                  setPgnInput(e.target.value);
                  autoResizeTextarea(e.target);
                  try {
                    const newGame = new Chess();
                    newGame.loadPgn(e.target.value);
                    game.loadPgn(e.target.value);
                    setFen(game.fen());
                    setStatus(getStatus());
                    analyzeFen(game.fen());
                  } catch {
                    // Invalid PGN, ignore
                  }
                }}
                className="font-mono text-xs min-h-[60px] overflow-hidden pr-8"
                placeholder="Paste PGN here..."
                rows={3}
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute top-1 right-1 h-6 w-6 p-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100/80 transition-all duration-200"
                      onClick={() => {
                        navigator.clipboard.writeText(pgnInput);
                        setPgnCopied(true);
                        setTimeout(() => setPgnCopied(false), 2000);
                      }}
                      disabled={!pgnInput}
                    >
                      <span className={`transition-all duration-200 ${pgnCopied ? 'scale-110' : 'scale-100'}`}>
                        {pgnCopied ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    {pgnCopied ? "Copied!" : "Copy PGN"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </div>

      {/* Save Study Dialog */}
      <SaveStudyDialog
        isOpen={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        onSave={saveStudy}
        defaultName={generateDefaultStudyName()}
        isLoading={isSaving}
      />
      <UpgradeModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} />
    </div>
  );
}

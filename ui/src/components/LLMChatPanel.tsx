import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LLMMessage } from './ChessMoveTree';
import { useLLMPanelStore } from '../stores/useLLMPanelStore';
import { useCommentarySettingsStore } from '../stores/commentarySettingsStore';
import { ChevronLeft, GitBranch, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import VariationTree from './VariationTree';

/**
 * LLM Provider Configuration
 * 
 * GPU Infrastructure:
 * - lc0 (Leela Chess Zero) - Primary engine, faster to start
 * - Llama 8B - Secondary, used for cold start handling
 * 
 * Cold Start Strategy:
 * While GPUs are warming up, use Llama API calls to handle requests.
 * Once lc0 is ready, switch to local GPU inference.
 * 
 * TODO: Implement Llama API endpoint for cold starts
 * const LLAMA_API_ENDPOINT = process.env.NEXT_PUBLIC_LLAMA_API_URL || '/api/gateway/llm/llama';
 */

// Animated loading component
const LoadingDots: React.FC = () => {
  return (
    <span className="inline-flex gap-1">
      <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
      <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
      <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
    </span>
  );
};

/**
 * GPU Warming Indicator with logo animation
 * Shows during cold start while GPUs are warming up
 */
const GPUWarmingIndicator: React.FC<{ queuedCount: number; status: string }> = ({
  queuedCount,
  status
}) => {
  const getStatusMessage = () => {
    switch (status) {
      case 'lc0_warming':
        return 'AI engine warming up...';
      case 'llama_warming':
        return 'Commentary engine starting...';
      default:
        return 'Connecting to AI engine...';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
      {/* Logo with pulse animation */}
      <div className="relative">
        <img
          src="/logo.svg"
          alt="Loading"
          className="w-16 h-16 animate-pulse"
        />
        <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
      </div>

      {/* Status message */}
      <p className="mt-4 text-muted-foreground font-medium">
        {getStatusMessage()}
      </p>

      {/* Queued moves indicator */}
      {queuedCount > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-semibold">{queuedCount}</span> move{queuedCount !== 1 ? 's' : ''} queued
        </p>
      )}

      {/* Subtle progress bar animation */}
      <div className="mt-4 w-32 h-1 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary animate-progress" />
      </div>
    </div>
  );
};


const LoadingMessage: React.FC<{
  moveSan: string;
  provider?: 'checking' | 'gpu' | 'api' | 'cached' | 'streaming';
  streamingText?: string;
}> = ({ moveSan, provider = 'checking', streamingText }) => {
  if (provider === 'streaming' && streamingText) {
    return (
      <div className="bg-card self-start border p-4 rounded-lg max-w-[90%] shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex items-center space-x-2 mb-2">
          <div className="animate-pulse h-2 w-2 rounded-full bg-green-500"></div>
          <span className="text-xs text-muted-foreground">Streaming response</span>
        </div>
        <p className="text-sm text-foreground leading-relaxed">
          {streamingText}
          <span className="animate-pulse">▊</span>
        </p>
      </div>
    );
  }

  const getProviderInfo = () => {
    switch (provider) {
      case 'gpu':
        console.log('[LLM Analysis] Using Modal GPU');
        return { icon: null, message: `Analyzing ${moveSan}`, color: 'text-muted-foreground' };
      case 'api':
        console.log('[LLM Analysis] Using OpenAI API');
        return { icon: null, message: `Analyzing ${moveSan}`, color: 'text-muted-foreground' };
      case 'cached':
        console.log('[LLM Analysis] Loading from cache');
        return { icon: null, message: `Analyzing ${moveSan}`, color: 'text-muted-foreground' };
      default:
        return { icon: null, message: `Analyzing ${moveSan}`, color: 'text-muted-foreground' };
    }
  };

  const info = getProviderInfo();

  return (
    <div className="bg-muted self-start border p-4 rounded-lg max-w-[90%] shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
        <span className={`text-sm ${info.color}`}>
          {info.message}
          {provider === 'checking' && <LoadingDots />}
        </span>
      </div>
    </div>
  );
};

interface LLMChatPanelProps {
  fen: string;
  pv?: string[];
  history?: string[];
  autoMessage?: LLMMessage;
  path: string;
  moveHistory?: string[];
  controller?: any;
  lastMove?: string;
  onRefresh?: () => void;
  refreshKey?: number;
  onJumpToMove?: (path: string) => void;
  gpuStatus?: string;
  gpuQueuedCount?: number;
}

const Message: React.FC<{
  message: LLMMessage & { nodePath?: string; nodeSan?: string };
  controller?: any;
  onRefresh?: () => void;
  onJumpToMove?: (path: string) => void;
}> = ({ message, controller, onRefresh, onJumpToMove }) => {
  const isLLM = message.sender === 'llm';
  const [showBestMove, setShowBestMove] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  // Commentary mode preference
  const commentaryMode = useCommentarySettingsStore((s) => s.mode);
  const debugMode = useCommentarySettingsStore((s) => s.debugMode);

  const handleJumpToNode = () => {
    if (message.nodePath !== undefined) {
      if (onJumpToMove) {
        onJumpToMove(message.nodePath);
      } else if (controller) {
        controller.jump(message.nodePath);
        if (onRefresh) onRefresh();
      }
    }
  };

  const variations = useMemo(() => {
    if (!controller || !controller.tree || !message.nodePath) return [];
    try {
      const node = controller.tree.nodeAtPath(message.nodePath);
      if (!node || !node.children || node.children.length <= 1) return [];
      return node.children.slice(1).map((child: any) => ({
        san: child.san,
        id: child.id,
        path: message.nodePath + child.id,
      }));
    } catch (error) {
      return [];
    }
  }, [controller, message.nodePath]);

  const isNotBestMove = message.move && message.engineBest && message.move !== message.engineBest;

  const handleEnterVariation = (variationPath: string) => {
    if (onJumpToMove) {
      onJumpToMove(variationPath);
    } else if (controller) {
      controller.jump(variationPath);
      if (onRefresh) onRefresh();
    }
  };

  // Determine which text to display based on mode
  const heuristic = message.heuristicCommentary;
  const useHeuristicMode = commentaryMode === 'heuristic' && heuristic?.text;
  const displayText = useHeuristicMode ? heuristic!.text : message.text;
  const displayHeadline = useHeuristicMode ? heuristic!.headline : null;
  const displayTags = useHeuristicMode ? heuristic!.tags : [];

  return (
    <div
      className={`p-4 rounded-lg max-w-[90%] shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300 ${isLLM
        ? 'bg-card self-start border'
        : 'bg-primary text-primary-foreground self-end'
        }`}
    >
      {/* Mode indicator badge */}
      {isLLM && (
        <div className="flex items-center gap-2 mb-2">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${useHeuristicMode
              ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400'
              : 'bg-gray-100 text-black border-gray-200 dark:bg-gray-800 dark:text-white dark:border-gray-700'
              }`}
          >
            {useHeuristicMode ? 'Heuristic' : 'AI'}
          </Badge>
          {displayHeadline && (
            <span className="text-xs font-medium text-muted-foreground">{displayHeadline}</span>
          )}
        </div>
      )}

      {message.nodeSan && message.nodeSan !== 'Start' && (
        <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
          <span>At move:</span>
          <Button variant="secondary" size="sm" onClick={handleJumpToNode} className="h-auto py-1 px-2">
            {message.nodeSan}
          </Button>
        </div>
      )}
      {message.fen && (
        <div className="text-xs text-muted-foreground mb-2">
          Position: <span className="font-mono">{message.fen.substring(0, 30)}...</span>
        </div>
      )}
      {message.move && (
        <div className="text-xs mb-2 font-medium text-primary">
          About move: {message.move}
          {message.engineEval && (
            <span className="ml-2 text-muted-foreground">
              (Engine: {message.engineEval}, prefers {message.engineBest})
            </span>
          )}
        </div>
      )}

      {/* Commentary text */}
      <p className={`text-sm leading-relaxed ${isLLM ? 'text-foreground' : 'text-primary-foreground'}`}>
        {displayText}
      </p>

      {/* Heuristic tags */}
      {useHeuristicMode && displayTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {displayTags.map((tag, idx) => (
            <Badge
              key={`${tag}-${idx}`}
              variant="secondary"
              className="text-[10px] px-1.5 py-0"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Evidence section (debug mode only) */}
      {useHeuristicMode && debugMode && heuristic?.evidence && Object.keys(heuristic.evidence).length > 0 && (
        <div className="mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowEvidence(!showEvidence)}
            className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={`w-3 h-3 mr-1 transition-transform ${showEvidence ? 'rotate-180' : ''}`} />
            {showEvidence ? 'Hide' : 'Show'} evidence
          </Button>
          {showEvidence && (
            <pre className="mt-2 p-2 bg-muted rounded text-[10px] overflow-auto max-h-32">
              {JSON.stringify(heuristic.evidence, null, 2)}
            </pre>
          )}
        </div>
      )}

      {isNotBestMove && (
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={() => setShowBestMove(!showBestMove)} className="h-auto p-0 text-xs font-semibold text-black hover:text-gray-700 dark:text-white dark:hover:text-gray-300">
            {showBestMove ? '▼' : '▶'} Show best move: {message.engineBest}
          </Button>
          {showBestMove && (
            <div className="mt-2 ml-4 p-3 bg-gray-50 border-l-4 border-black rounded dark:bg-gray-900 dark:border-white">
              <div className="text-xs font-semibold text-black dark:text-white mb-1">
                Engine recommends: {message.engineBest}
              </div>
              <div className="text-xs text-gray-700 dark:text-gray-300">
                {message.engineEval ? (
                  <>
                    <span className="font-medium">Evaluation:</span> {message.engineEval}
                    {' vs '}
                    <span className="text-black dark:text-white">played move</span>
                  </>
                ) : 'The engine considers this move to be stronger.'}
              </div>
              {/* Best move explanation using same heuristic metrics */}
              {message.bestMoveCommentary?.text && (
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  {message.bestMoveCommentary.headline && (
                    <div className="text-xs font-medium text-gray-900 dark:text-gray-100 mb-1">
                      {message.bestMoveCommentary.headline}
                    </div>
                  )}
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {message.bestMoveCommentary.text}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {variations.length > 0 && (
        <div className="mt-3 pt-3 border-t">
          <div className="text-xs text-muted-foreground mb-2">Enter variation:</div>
          <div className="flex flex-wrap gap-2">
            {variations.map((variation: { id: string; san: string; path: string }) => (
              <Badge
                key={variation.id}
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80"
                onClick={() => handleEnterVariation(variation.path)}
              >
                {variation.san}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const LLMChatPanel: React.FC<LLMChatPanelProps> = ({
  controller,
  autoMessage,
  path,
  onRefresh,
  refreshKey = 0,
  onJumpToMove,
  gpuStatus = 'ready',
  gpuQueuedCount = 0,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const processedMessageIds = useRef<Set<string>>(new Set());

  // State for Tree View Mode
  const [showTree, setShowTree] = useState(false);

  // LLM Panel Store integration
  const { updateScroll, getThread, viewStack, popView, getCurrentView, pushView } = useLLMPanelStore();

  // Get current view context
  const currentView = getCurrentView();
  const viewRootPath = currentView ? currentView.rootPath : '';
  const viewName = currentView ? currentView.name : 'Mainline';

  // Auto-detect variation entry and push to view stack
  useEffect(() => {
    if (!controller || !controller.tree || !path) return;

    // Check if we're in a variation by checking the tree
    const nodeList = controller.tree.getNodeList(path);
    if (nodeList.length < 2) return; // Need at least root + one move

    // Find the most recent variation point
    let lastVariationIndex = -1;
    let parentNode = controller.tree.root;

    for (let i = 1; i < nodeList.length; i++) {
      const node = nodeList[i];
      const nodeIndex = parentNode.children.findIndex((child: any) => child.id === node.id);

      // If this node is NOT the first child, it's a variation
      if (nodeIndex > 0) {
        lastVariationIndex = i;
      }

      parentNode = node;
    }

    // If we found a variation point, ensure it's in the view stack
    if (lastVariationIndex > 0) {
      const variationNode = nodeList[lastVariationIndex];

      // Calculate the path to the variation START (the variation move itself)
      let variationStartPath = '';
      for (let i = 1; i <= lastVariationIndex; i++) {
        variationStartPath += nodeList[i].id;
      }

      // Check if this variation is already the current view
      // Use direct store access to avoid circular dependency
      const currentView = useLLMPanelStore.getState().getCurrentView();

      if (!currentView || currentView.rootPath !== variationStartPath) {
        // Need to update the view stack
        const newStack: any[] = [];

        // Always have mainline as base
        newStack.push({ path: '', name: 'Mainline', rootPath: '' });

        // Add this variation
        const variationName = variationNode.san || 'Variation';
        newStack.push({
          path: variationStartPath,
          name: variationName,
          rootPath: variationStartPath  // Root is the variation start, not its parent
        });

        // Update the view stack
        useLLMPanelStore.setState({ viewStack: newStack });
      }
    } else {
      // We're on mainline - ensure view stack only has mainline
      const currentStack = useLLMPanelStore.getState().viewStack;
      if (currentStack.length !== 1 || currentStack[0]?.rootPath !== '') {
        useLLMPanelStore.setState({
          viewStack: [{ path: '', name: 'Mainline', rootPath: '' }]
        });
      }
    }
  }, [path, controller]); // Removed viewStack and getCurrentView to prevent circular dependencies

  // Get messages scoped to the current view
  const { currentMessages, pendingMoves } = useMemo(() => {
    if (!controller || !controller.tree) return { currentMessages: [], pendingMoves: [] };

    const messages: Array<LLMMessage & { nodePath?: string; nodeSan?: string }> = [];
    const pending: Array<{ san: string; path: string }> = [];

    const collectMessages = (node: any, nodePath: string) => {
      // Add messages from this node
      if (node.llmMessages && node.llmMessages.length > 0) {
        node.llmMessages.forEach((msg: any) => {
          messages.push({ ...msg, nodePath, nodeSan: node.san || 'Start' });
        });
      }

      if (node.llmPending && node.san) {
        pending.push({ san: node.san, path: nodePath });
      }
    };

    // Get the starting node for message collection
    // For mainline (viewRootPath === ''), we start from the tree root
    // For variations (viewRootPath !== ''), we start from the variation node itself
    let startNode: any;
    let startPath: string;

    if (viewRootPath === '') {
      // Mainline: start from root
      startNode = controller.tree.root;
      startPath = '';
      // Collect from root (welcome message is here)
      collectMessages(startNode, startPath);
    } else {
      // Variation: start from the variation node itself
      startNode = controller.tree.nodeAtPath(viewRootPath);
      startPath = viewRootPath;
      if (!startNode) return { currentMessages: [], pendingMoves: [] };

      // Collect from the variation start node
      collectMessages(startNode, startPath);
    }

    // Collect all messages along the mainline continuation
    const collectMainlineContinuation = (node: any, nodePath: string) => {
      if (node.children && node.children.length > 0 && node.children[0]) {
        const mainlineChild = node.children[0];
        const childPath = nodePath + mainlineChild.id;
        collectMessages(mainlineChild, childPath);
        // Recurse to continue collecting
        collectMainlineContinuation(mainlineChild, childPath);
      }
    };

    collectMainlineContinuation(startNode, startPath);

    return { currentMessages: messages, pendingMoves: pending };
  }, [controller, path, refreshKey, autoMessage, viewRootPath]);

  // Initialize welcome message
  useEffect(() => {
    if (!controller || !controller.tree) return;
    const rootNode = controller.tree.root;
    if (!rootNode.llmMessages || rootNode.llmMessages.length === 0) {
      controller.tree.updateAt('', (node: any) => {
        node.llmMessages = [{
          id: `welcome-root`,
          sender: 'llm',
          text: "Hello! I'm your AI chess analyst. Ask me about the current position, moves, or chess strategy.",
          timestamp: Date.now(),
        }];
      });
      if (onRefresh) onRefresh();
    }
  }, [controller, onRefresh]);

  // Handle auto message
  useEffect(() => {
    if (!autoMessage || !controller) return;
    if (!autoMessage._loading && processedMessageIds.current.has(autoMessage.id)) return;

    if (!autoMessage._loading) {
      // Use _targetPath from autoMessage if available, otherwise fall back to path prop
      // _targetPath is set by ChessBoard to ensure the message is stored on the correct move node
      const storagePath = (autoMessage as any)._targetPath || path;
      controller.tree.updateAt(storagePath, (node: any) => {
        if (!node.llmMessages) node.llmMessages = [];
        if (!node.llmMessages.some((m: LLMMessage) => m.id === autoMessage.id)) {
          node.llmMessages.push(autoMessage);
          processedMessageIds.current.add(autoMessage.id);
        }
      });
    }
    if (onRefresh) onRefresh();
  }, [autoMessage, path, controller, onRefresh]);

  // Scroll management
  useEffect(() => {
    return () => {
      if (messagesContainerRef.current) {
        updateScroll(path, messagesContainerRef.current.scrollTop);
      }
    };
  }, [path, updateScroll]);

  useEffect(() => {
    const thread = getThread(path);
    if (thread && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = thread.scrollPosition;
    } else if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [path, getThread, showTree]); // Re-scroll when switching back from tree

  useEffect(() => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
      if (isAtBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [currentMessages]);

  // Navigation handlers
  const handleBack = () => {
    if (showTree) {
      setShowTree(false);
      return;
    }

    // If we have a view stack, pop it
    if (viewStack.length > 1) {
      const prev = popView();
      if (prev && onJumpToMove) onJumpToMove(prev.path);
    }
  };

  const handleJumpFromTree = (targetPath: string) => {
    if (onJumpToMove) onJumpToMove(targetPath);
    else if (controller) {
      controller.jump(targetPath);
      if (onRefresh) onRefresh();
    }
    setShowTree(false);
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex flex-col space-y-3 pb-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {(viewStack.length > 1 || showTree) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="gap-1 px-2"
                aria-label="Back"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}

            {!showTree && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setShowTree(true)}
              >
                <GitBranch className="h-4 w-4" />
                Tree
              </Button>
            )}
          </div>

          <h3 className="text-lg font-semibold flex-1 text-center truncate px-2">
            {showTree ? 'Analysis Tree' : viewName}
          </h3>

          <div className="w-16" />
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden min-h-0">
        {/* Tree View */}
        {showTree && (
          <div className="absolute inset-0 bg-background z-10 animate-in slide-in-from-left-full duration-300">
            <ScrollArea className="h-full">
              <div className="p-4">
                <VariationTree
                  tree={controller?.tree}
                  currentPath={path}
                  onJump={handleJumpFromTree}
                />
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Chat View */}
        <ScrollArea className="h-full">
          <div
            key={viewRootPath}
            ref={messagesContainerRef}
            className="p-4 flex flex-col space-y-3 pb-20 animate-in slide-in-from-right-8 duration-300 fade-in"
          >
            {gpuStatus !== 'ready' && (
              <GPUWarmingIndicator queuedCount={gpuQueuedCount} status={gpuStatus} />
            )}

            {currentMessages.map((message) => (
              <Message
                key={message.id}
                message={message}
                controller={controller}
                onRefresh={onRefresh}
                onJumpToMove={onJumpToMove}
              />
            ))}

            {pendingMoves.map((pending) => (
              <LoadingMessage key={`loading-${pending.path}`} moveSan={pending.san} />
            ))}

            {autoMessage && autoMessage._loading && (
              <LoadingMessage
                key={`auto-loading-${autoMessage.id}`}
                moveSan={autoMessage.move || 'move'}
                provider={autoMessage._provider}
                streamingText={autoMessage._streamingText}
              />
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default LLMChatPanel;

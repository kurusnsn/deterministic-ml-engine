import React, { useState, useCallback } from 'react';

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === 'true';

type Path = string;
type FEN = string;
type SAN = string;
type UCI = string;

interface LLMMessage {
    id: string;
    sender: 'user' | 'llm';
    text: string;
    fen?: string;
    move?: string;
    engineEval?: string;
    engineBest?: string;
    timestamp: number;
    /** Heuristic commentary for dual-mode display */
    heuristicCommentary?: {
        headline: string;
        text: string;
        tags: string[];
        evidence: Record<string, unknown>;
    };
    /** Commentary explaining why the engine's best move is better */
    bestMoveCommentary?: {
        headline?: string;
        text: string;
        tags?: string[];
    };
}

interface TreeNode {
    id: string;
    ply: number;
    san?: SAN;
    uci?: UCI;
    fen: FEN;
    children: TreeNode[];
    forceVariation?: boolean;
    llmMessages?: LLMMessage[];
    llmPending?: boolean;  // Track if LLM is currently analyzing this move
    classification?: string;  // Move quality: "brilliant" | "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder"
    evalScore?: string;  // Stockfish evaluation for this position (e.g., "+0.35" or "#3")
}

class TreePath {
    static root: Path = '';

    static head(path: Path): string {
        return path.slice(0, 2);
    }

    static tail(path: Path): Path {
        return path.slice(2);
    }

    static init(path: Path): Path {
        return path.slice(0, -2);
    }

    static last(path: Path): string {
        return path.slice(-2);
    }

    static contains(p1: Path, p2: Path): boolean {
        return p1.startsWith(p2);
    }

    static fromNodeList(nodes: TreeNode[]): Path {
        return nodes.map(n => n.id).join('');
    }
}

class TreeOps {
    static childById(node: TreeNode, id: string): TreeNode | undefined {
        return node.children.find(child => child.id === id);
    }

    static last<T>(nodeList: T[]): T | undefined {
        return nodeList[nodeList.length - 1];
    }

    static collect(from: TreeNode, pickChild: (node: TreeNode) => TreeNode | undefined): TreeNode[] {
        const nodes = [from];
        let n = from, c;
        while ((c = pickChild(n))) {
            nodes.push(c);
            n = c;
        }
        return nodes;
    }

    static mainlineNodeList(from: TreeNode): TreeNode[] {
        return TreeOps.collect(from, node => node.children[0]);
    }

    static removeChild(parent: TreeNode, id: string): void {
        parent.children = parent.children.filter(n => n.id !== id);
    }
}

interface TreeWrapper {
    root: TreeNode;
    nodeAtPath(path: Path): TreeNode;
    getNodeList(path: Path): TreeNode[];
    addNode(node: TreeNode, path: Path): Path | undefined;
    pathIsMainline(path: Path): boolean;
    deleteNodeAt(path: Path): void;
    promoteAt(path: Path, toMainline: boolean): void;
    updateAt(path: Path, update: (node: TreeNode) => void): TreeNode | undefined;
}

function buildTree(root: TreeNode): TreeWrapper {
    const nodeAtPath = (path: Path): TreeNode => nodeAtPathFrom(root, path);

    function nodeAtPathFrom(node: TreeNode, path: Path): TreeNode {
        if (path === '') return node;
        const child = TreeOps.childById(node, TreePath.head(path));
        return child ? nodeAtPathFrom(child, TreePath.tail(path)) : node;
    }

    const nodeAtPathOrNull = (path: Path): TreeNode | undefined => {
        if (DEBUG) console.log('=== NODE AT PATH OR NULL ===');
        if (DEBUG) console.log('Looking for node at path:', path);

        if (path === '') {
            if (DEBUG) console.log('Empty path, returning root');
            if (DEBUG) console.log('=== NODE AT PATH OR NULL END ===');
            return root;
        }

        let node = root;
        for (let i = 0; i < path.length; i += 2) {
            const childId = path.slice(i, i + 2);
            if (DEBUG) console.log('Looking for child ID:', childId, 'in node:', node.id);
            if (DEBUG) console.log('Available children:', node.children.map(c => c.id));

            const child = TreeOps.childById(node, childId);
            if (child) {
                if (DEBUG) console.log('Found child:', child.id);
                node = child;
            } else {
                if (DEBUG) console.log('Child not found, returning undefined');
                if (DEBUG) console.log('=== NODE AT PATH OR NULL END ===');
                return undefined;
            }
        }

        if (DEBUG) console.log('Successfully traversed path, returning node:', node.id);
        if (DEBUG) console.log('=== NODE AT PATH OR NULL END ===');
        return node;
    };

    const getNodeList = (path: Path): TreeNode[] => {
        if (DEBUG) console.log('=== GET NODE LIST ===');
        if (DEBUG) console.log('Getting node list for path:', path);

        const nodes = [root];
        if (DEBUG) console.log('Starting with root node:', { id: root.id, fen: root.fen });

        if (!path) {
            if (DEBUG) console.log('Empty path, returning just root');
            if (DEBUG) console.log('=== GET NODE LIST END ===');
            return nodes;
        }

        let node = root;
        for (let i = 0; i < path.length; i += 2) {
            const childId = path.slice(i, i + 2);
            if (DEBUG) console.log('Looking for child with ID:', childId);
            if (DEBUG) console.log('Current node children:', node.children.map(c => ({ id: c.id, san: c.san, fen: c.fen })));

            const child = TreeOps.childById(node, childId);
            if (child) {
                if (DEBUG) console.log('Found child:', { id: child.id, san: child.san, fen: child.fen });
                nodes.push(child);
                node = child;
            } else {
                if (DEBUG) console.log('Child not found! Breaking...');
                break;
            }
        }

        if (DEBUG) console.log('Final node list:', nodes.map(n => ({ id: n.id, san: n.san, fen: n.fen })));
        if (DEBUG) console.log('=== GET NODE LIST END ===');
        return nodes;
    };
    const pathIsMainline = (path: Path): boolean => {
        let node = root;
        for (let i = 0; i < path.length; i += 2) {
            const childId = path.slice(i, i + 2);
            if (node.children[0]?.id !== childId) return false;
            node = node.children[0];
        }
        return true;
    };

    function updateAt(path: Path, update: (node: TreeNode) => void): TreeNode | undefined {
        if (DEBUG) console.log('=== UPDATE AT ===');
        if (DEBUG) console.log('Updating at path:', path);

        const node = nodeAtPathOrNull(path);
        if (DEBUG) console.log('Found node:', node ? { id: node.id, san: node.san } : 'null');

        if (node) {
            if (DEBUG) console.log('Node found, applying update...');
            update(node);
            if (DEBUG) console.log('Update applied successfully');
        } else {
            if (DEBUG) console.log('Node not found!');
        }

        if (DEBUG) console.log('=== UPDATE AT END ===');
        return node;
    }

    function addNode(node: TreeNode, path: Path): Path | undefined {
        if (DEBUG) console.log('=== ADD NODE ===');
        if (DEBUG) console.log('Adding node:', { id: node.id, san: node.san, fen: node.fen });
        if (DEBUG) console.log('To path:', path);

        const newPath = path + node.id;
        if (DEBUG) console.log('New path would be:', newPath);

        const existing = nodeAtPathOrNull(newPath);
        if (DEBUG) console.log('Existing node at new path:', existing ? { id: existing.id, san: existing.san } : 'null');

        if (existing) {
            if (DEBUG) console.log('Node already exists, returning existing path');
            if (DEBUG) console.log('=== ADD NODE END ===');
            return newPath; // Node already exists
        }

        if (DEBUG) console.log('Node does not exist, adding to parent at path:', path);
        const parentNode = nodeAtPathOrNull(path);
        if (DEBUG) console.log('Parent node:', parentNode ? { id: parentNode.id, san: parentNode.san, childrenCount: parentNode.children.length } : 'null');

        const updateResult = updateAt(path, n => {
            if (DEBUG) console.log('Updating parent node:', { id: n.id, san: n.san, childrenBefore: n.children.length });
            n.children.push(node);
            if (DEBUG) console.log('After push, children count:', n.children.length);
            if (DEBUG) console.log('Children:', n.children.map(c => ({ id: c.id, san: c.san })));
        });

        if (DEBUG) console.log('Update result:', updateResult ? 'success' : 'failed');
        if (DEBUG) console.log('=== ADD NODE END ===');

        return updateResult ? newPath : undefined;
    }
    const deleteNodeAt = (path: Path): void => {
        const parentPath = TreePath.init(path);
        const nodeId = TreePath.last(path);
        updateAt(parentPath, parent => {
            TreeOps.removeChild(parent, nodeId);
        });
    };

    function promoteAt(path: Path, toMainline: boolean): void {
        const nodes = getNodeList(path);
        for (let i = nodes.length - 2; i >= 0; i--) {
            const node = nodes[i + 1];
            const parent = nodes[i];
            if (parent.children[0].id !== node.id) {
                TreeOps.removeChild(parent, node.id);
                parent.children.unshift(node);
                if (!toMainline) break;
            }
        }
    }

    return {
        root,
        nodeAtPath,
        getNodeList,
        addNode,
        pathIsMainline,
        deleteNodeAt,
        promoteAt,
        updateAt,
    };
}

// Chess Analysis Controller
class AnalysisController {
    tree: TreeWrapper;
    path!: Path;
    node!: TreeNode;
    nodeList!: TreeNode[];

    constructor(initialFen: FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
        if (DEBUG) console.log('Creating AnalysisController with FEN:', initialFen);

        const rootNode: TreeNode = {
            id: 'rt',
            ply: 0,
            fen: initialFen,
            children: []
        };

        this.tree = buildTree(rootNode);
        this.setPath('');

        if (DEBUG) console.log('Controller initialized:');
        if (DEBUG) console.log('  - Root FEN:', this.tree.root.fen);
        if (DEBUG) console.log('  - Current FEN:', this.getCurrentFen());
    }



    jump(path: Path): void {
        if (DEBUG) console.log('=== CONTROLLER JUMP ===');
        if (DEBUG) console.log('Jumping from path:', this.path, 'to path:', path);
        if (DEBUG) console.log('Before jump - current node FEN:', this.node.fen);
        this.setPath(path);
        if (DEBUG) console.log('After jump - current path:', this.path);
        if (DEBUG) console.log('After jump - current node FEN:', this.node.fen);
        if (DEBUG) console.log('=== CONTROLLER JUMP END ===');
    }

    private setPath(path: Path): void {
        if (DEBUG) console.log('=== SET PATH ===');
        if (DEBUG) console.log('Setting path to:', path);

        this.path = path;
        this.nodeList = this.tree.getNodeList(path);

        if (DEBUG) console.log('Node list length:', this.nodeList.length);
        if (DEBUG) console.log('Node list:', this.nodeList.map(n => ({ id: n.id, fen: n.fen, san: n.san })));

        const lastNode = TreeOps.last(this.nodeList);
        if (!lastNode) {
            if (DEBUG) console.error('No last node found in nodeList!');
            return;
        }

        this.node = lastNode;
        if (DEBUG) console.log('Set current node to:', { id: this.node.id, fen: this.node.fen, san: this.node.san });
        if (DEBUG) console.log('=== SET PATH END ===');
    }
    playMove(san: SAN, fen: FEN, uci?: UCI): { success: boolean; isNewNode: boolean; path: string } {
        if (DEBUG) console.log('=== CONTROLLER PLAYMOVE ===');
        if (DEBUG) console.log('Current path:', this.path);
        if (DEBUG) console.log('Current node ply:', this.node.ply);
        if (DEBUG) console.log('Playing move:', san, 'with FEN:', fen);

        // Check if this move already exists in the current node's children
        const existingChild = this.node.children.find(child => {
            // Match by SAN first (most reliable for chess moves)
            if (child.san === san) return true;
            // Fall back to UCI if provided and SAN doesn't match
            if (uci && child.uci === uci) return true;
            return false;
        });

        let isNewNode = false;
        let targetPath: string;

        if (existingChild) {
            // Move already exists - reuse the existing node
            if (DEBUG) console.log('Found existing child node:', existingChild);
            targetPath = this.path + existingChild.id;
            isNewNode = false;
        } else {
            // This is a new move - create a new node
            const moveNode: TreeNode = {
                id: this.generateNodeId(),
                ply: this.node.ply + 1,
                san,
                fen,
                uci,
                children: []
            };

            if (DEBUG) console.log('Created new move node:', moveNode);

            const newPath = this.tree.addNode(moveNode, this.path);
            if (!newPath) {
                if (DEBUG) console.log('=== CONTROLLER PLAYMOVE FAILED ===');
                return { success: false, isNewNode: false, path: this.path };
            }

            targetPath = newPath;
            isNewNode = true;
        }

        if (DEBUG) console.log('Target path:', targetPath);
        if (DEBUG) console.log('Is new node:', isNewNode);

        // Jump to the target node (either existing or newly created)
        this.jump(targetPath);
        if (DEBUG) console.log('After jump - current FEN:', this.getCurrentFen());
        if (DEBUG) console.log('=== CONTROLLER PLAYMOVE SUCCESS ===');

        return { success: true, isNewNode, path: targetPath };
    }

    getCurrentFen(): FEN {
        if (DEBUG) console.log('getCurrentFen called, returning:', this.node.fen);
        return this.node.fen;
    }

    goBack(): void {
        if (DEBUG) console.log('=== CONTROLLER GO BACK ===');
        if (DEBUG) console.log('Current path before:', this.path);
        if (this.path.length >= 2) {
            const newPath = TreePath.init(this.path);
            if (DEBUG) console.log('Going to path:', newPath);
            this.jump(newPath);
            if (DEBUG) console.log('After jump - current path:', this.path);
            if (DEBUG) console.log('After jump - current FEN:', this.getCurrentFen());
        }
        if (DEBUG) console.log('=== CONTROLLER GO BACK END ===');
    }

    goForward(): void {
        if (DEBUG) console.log('=== CONTROLLER GO FORWARD ===');
        if (DEBUG) console.log('Current path before:', this.path);
        if (DEBUG) console.log('Current node children:', this.node.children.length);
        if (this.node.children[0]) {
            const newPath = this.path + this.node.children[0].id;
            if (DEBUG) console.log('Going to path:', newPath);
            this.jump(newPath);
            if (DEBUG) console.log('After jump - current path:', this.path);
            if (DEBUG) console.log('After jump - current FEN:', this.getCurrentFen());
        }
        if (DEBUG) console.log('=== CONTROLLER GO FORWARD END ===');
    }


    playMoveAt(path: Path, san: SAN, fen: FEN, uci?: UCI): boolean {
        const moveNode: TreeNode = {
            id: this.generateNodeId(),
            ply: this.tree.nodeAtPath(path).ply + 1,
            san,
            fen,
            uci,
            children: []
        };

        const newPath = this.tree.addNode(moveNode, path);
        if (newPath) {
            this.jump(newPath);
            return true;
        }
        return false;
    }

    deleteCurrentNode(): void {
        if (this.path) {
            const parentPath = TreePath.init(this.path);
            this.tree.deleteNodeAt(this.path);
            this.jump(parentPath);
        }
    }

    promoteCurrentVariation(toMainline: boolean = true): void {
        if (this.path && !this.tree.pathIsMainline(this.path)) {
            this.tree.promoteAt(this.path, toMainline);
        }
    }



    private generateNodeId(): string {
        return Math.random().toString(36).substring(2, 4);
    }

    getCurrentNode(): TreeNode { return this.node; }
    getCurrentPath(): Path { return this.path; }
    isOnMainline(): boolean { return this.tree.pathIsMainline(this.path); }
    getMainline(): TreeNode[] { return TreeOps.mainlineNodeList(this.tree.root); }
}

// React Component
const ChessMoveTree: React.FC = () => {
    const [controller] = useState(() => new AnalysisController());
    const [, forceUpdate] = useState({});

    const refresh = useCallback(() => forceUpdate({}), []);

    React.useEffect(() => {
        controller.playMove('e4', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 'e2e4');
        controller.playMove('e5', 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2', 'e7e5');
        controller.playMove('Nf3', 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', 'g1f3');
        controller.playMove('Nf6', 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', 'g8f6');

        // Go back and create variation
        controller.jump(controller.tree.getNodeList(controller.getCurrentPath())[3].id + 'rt');
        const nf3Path = TreePath.fromNodeList(controller.tree.getNodeList('').slice(0, 4));
        controller.playMoveAt(nf3Path, 'Nc6', 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', 'b8c6');

        refresh();
    }, [controller, refresh]);

    const jumpTo = (path: Path) => {
        controller.jump(path);
        refresh();
    };

    const renderMove = (node: TreeNode, path: Path, isMainlineMove: boolean): React.ReactNode => {
        const shouldShowMoveNumber = node.ply % 2 === 1 || !isMainlineMove;
        const fullMove = Math.ceil(node.ply / 2);
        const isActive = path === controller.getCurrentPath();

        return (
            <React.Fragment key={path}>
                {shouldShowMoveNumber && (
                    <span className="text-gray-600 mr-1">
                        {node.ply % 2 === 1 ? `${fullMove}.` : `${fullMove}...`}
                    </span>
                )}
                <button
                    type="button"
                    className={`
            inline-flex cursor-pointer px-1 py-0.5 rounded mr-1
            hover:bg-gray-200 transition-colors
            ${isActive ? 'bg-foreground text-background' : ''}
            ${isMainlineMove ? 'font-medium' : ''}
          `}
                    onClick={() => jumpTo(path)}
                    aria-current={isActive ? "true" : undefined}
                >
                    {node.san}
                </button>
            </React.Fragment>
        );
    };

    const renderNodes = (nodes: TreeNode[], parentPath: Path): React.ReactNode => {
        if (!nodes.length) return null;

        const [mainChild, ...variations] = nodes;

        return (
            <>
                {/* Main line */}
                {mainChild && (
                    <>
                        {renderMove(mainChild, parentPath + mainChild.id, true)}
                        {renderNodes(mainChild.children, parentPath + mainChild.id)}
                    </>
                )}

                {/* Variations */}
                {variations.map((variation) => {
                    const varPath = parentPath + variation.id;
                    return (
                        <div key={varPath} className="ml-5 text-gray-600">
                            <span className="mr-1">(</span>
                            {renderMove(variation, varPath, false)}
                            {renderNodes(variation.children, varPath)}
                            <span className="ml-1">)</span>
                        </div>
                    );
                })}
            </>
        );
    };

    const currentNode = controller.getCurrentNode();
    const isOnMainline = controller.isOnMainline();

    return (
        <div className="p-6 max-w-2xl">
            {/* Current position info */}
            <div className="mb-4 p-3 bg-gray-50 rounded">
                <div className="font-semibold text-gray-800">
                    Ply {currentNode.ply}: {currentNode.san || 'Starting position'}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                    {isOnMainline ? 'On mainline' : 'In variation'} • Path: {controller.getCurrentPath() || 'root'}
                </div>
            </div>

            {/* Move tree */}
            <div className="text-sm leading-relaxed mb-4">
                {renderNodes(controller.tree.root.children, '')}
            </div>

            {/* Controls */}
            <div className="flex gap-2 flex-wrap">
                <button
                    onClick={() => { controller.goBack(); refresh(); }}
                    className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm"
                    disabled={!controller.getCurrentPath()}
                >
                    ← Back
                </button>
                <button
                    onClick={() => { controller.goForward(); refresh(); }}
                    className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm"
                    disabled={!currentNode.children[0]}
                >
                    Forward →
                </button>
                {!isOnMainline && (
                    <button
                        onClick={() => { controller.promoteCurrentVariation(); refresh(); }}
                        className="px-3 py-1 bg-blue-200 hover:bg-blue-300 rounded text-sm"
                    >
                        Promote to Mainline
                    </button>
                )}
                <button
                    onClick={() => {
                        // Demo: add a move from current position
                        const demoMoves = ['Bc4', 'Be7', 'd3', 'd6', 'O-O'];
                        const randomMove = demoMoves[Math.floor(Math.random() * demoMoves.length)];
                        controller.playMove(randomMove, currentNode.fen + '_updated', 'demo');
                        refresh();
                    }}
                    className="px-3 py-1 bg-green-200 hover:bg-green-300 rounded text-sm"
                >
                    Add Random Move
                </button>
            </div>

            <div className="mt-4 text-xs text-gray-500">

            </div>
        </div>
    );
};

/**
 * Helper function to find where a variation diverges from its parent line
 * For nested variations, finds the MOST RECENT divergence point (not the first)
 *
 * @param tree - The tree wrapper
 * @param path - The current path to analyze
 * @returns Object with variationRoot (path where variation starts), moves (SAN moves), and isMainline
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function findVariationRoot(tree: any, path: string): {
    variationRoot: string;
    variationMoves: string[];
    isMainline: boolean;
} {
    if (!path || path === '') {
        return { variationRoot: '', variationMoves: [], isMainline: true };
    }

    const nodeList = tree.getNodeList(path);
    let parentNode = tree.root;
    let currentPath = '';
    let lastVariationStartIndex = -1; // Track the MOST RECENT divergence
    const allVariationMoves: string[] = [];

    // Walk through the path to find the LAST point where we diverge from first child
    // This handles nested variations correctly
    for (let i = 1; i < nodeList.length; i++) {
        const node = nodeList[i];
        const nodeIndex = parentNode.children.findIndex((child: TreeNode) => child.id === node.id);

        // If this node is NOT the first child, this is a variation point
        if (nodeIndex > 0) {
            // Update to track the MOST RECENT divergence (for nested variations)
            lastVariationStartIndex = i;
            // Reset variation moves - we only want moves from the last divergence
            allVariationMoves.length = 0;
        }

        // If we're in a variation, collect the move names from last divergence onwards
        if (lastVariationStartIndex !== -1 && i >= lastVariationStartIndex && node.san) {
            allVariationMoves.push(node.san);
        }

        // currentPath += node.id;
        parentNode = node;
    }

    // If we never found a variation point, this is mainline
    if (lastVariationStartIndex === -1) {
        return { variationRoot: '', variationMoves: [], isMainline: true };
    }

    // Calculate the path to the variation start (include the diverging move)
    let variationRootPath = '';
    for (let i = 1; i <= lastVariationStartIndex; i++) {
        variationRootPath += nodeList[i].id;
    }

    return {
        variationRoot: variationRootPath,
        variationMoves: allVariationMoves,
        isMainline: false,
    };
}

/**
 * Generate a human-readable name for a variation
 *
 * @param tree - The tree wrapper
 * @param path - The path to generate name for
 * @returns Display name like "Mainline", "Variation: Bb5", or "Variation: Bb5 > a6"
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function generateVariationName(tree: any, path: string): string {
    const { variationMoves, isMainline } = findVariationRoot(tree, path);

    if (isMainline) {
        return 'Mainline';
    }

    if (variationMoves.length === 0) {
        return 'Variation';
    }

    // Join moves with " > " to show nesting
    return `Variation: ${variationMoves.join(' > ')}`;
}

export default ChessMoveTree;
export { AnalysisController, TreeOps, TreePath };
export type { TreeNode, LLMMessage };

import React, { useMemo } from 'react';
import { TreeNode } from './ChessMoveTree';
import { cn } from '@/lib/utils';
import { GitBranch } from 'lucide-react';

interface VariationTreeProps {
    tree: any; // TreeWrapper
    currentPath: string;
    onJump: (path: string) => void;
}

interface ViewSegment {
    id: string;
    name: string;
    rootPath: string;
    startMove: string;
    moveCount: number;
    children: ViewSegment[];
    isMainline: boolean;
    isActive: boolean;
}

const VariationTree: React.FC<VariationTreeProps> = ({ tree, currentPath, onJump }) => {
    // Build the tree of views
    const viewTree = useMemo(() => {
        if (!tree || !tree.root) return null;

        const buildRecursive = (node: TreeNode, path: string, isMainline: boolean): ViewSegment => {
            const segment: ViewSegment = {
                id: path,
                name: isMainline ? 'Mainline' : `${node.san}`,
                rootPath: path,
                startMove: node.san || 'Start',
                moveCount: 0,
                children: [],
                isMainline,
                isActive: false
            };

            const collect = (n: TreeNode, p: string) => {
                // Look for variations from this node
                if (n.children) {
                    for (let i = 1; i < n.children.length; i++) {
                        const vNode = n.children[i];
                        segment.children.push(buildRecursive(vNode, p + vNode.id, false));
                    }

                    // Continue mainline
                    if (n.children[0]) {
                        segment.moveCount++;
                        collect(n.children[0], p + n.children[0].id);
                    }
                }
            };

            collect(node, path);
            return segment;
        };

        return buildRecursive(tree.root, '', true);

    }, [tree]);

    // Mark active state
    const markActive = (segment: ViewSegment, currentPath: string): boolean => {
        // A segment is active if the current path is within it
        // i.e. currentPath starts with segment.rootPath AND 
        // currentPath does NOT start with any of its children's rootPaths (except if it IS the child's root path? No)

        // Simpler: Find the deepest segment whose rootPath is a prefix of currentPath

        if (currentPath.startsWith(segment.rootPath)) {
            // Check if any child is a better match
            const activeChild = segment.children.find(child => currentPath.startsWith(child.rootPath));
            if (activeChild) {
                segment.isActive = false; // Child is more specific
                markActive(activeChild, currentPath);
                return false; // This segment is a parent of the active one, but not THE active one
            } else {
                segment.isActive = true;
                return true;
            }
        }

        // Recurse for siblings (though they shouldn't match if parent didn't, but for top level)
        segment.children.forEach(child => markActive(child, currentPath));
        return segment.isActive;
    };

    if (viewTree) {
        markActive(viewTree, currentPath);
    }

    const renderSegment = (segment: ViewSegment, depth: number = 0) => {
        return (
            <div key={segment.id} className="flex flex-col">
                <button
                    type="button"
                    className={cn(
                        "flex w-full items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-sm text-left",
                        segment.isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "hover:bg-muted text-muted-foreground"
                    )}
                    style={{ marginLeft: `${depth * 12}px` }}
                    onClick={() => onJump(segment.rootPath)}
                    aria-current={segment.isActive ? "true" : undefined}
                >
                    <GitBranch className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                        {segment.name}
                        {segment.moveCount > 0 && <span className="ml-1 opacity-70 text-xs">({segment.moveCount} moves)</span>}
                    </span>
                </button>

                {segment.children.length > 0 && (
                    <div className="flex flex-col mt-0.5">
                        {segment.children.map(child => renderSegment(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    if (!viewTree) return null;

    return (
        <div className="flex flex-col gap-1 py-2">
            {renderSegment(viewTree)}
        </div>
    );
};

export default VariationTree;

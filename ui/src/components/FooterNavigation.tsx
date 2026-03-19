import React, { useEffect, useState } from 'react';
import { TreeNode } from './ChessMoveTree';
import { cn } from "@/lib/utils";
import { MoveClassificationBadge, MoveClassification } from './MoveClassificationBadge';

interface FooterNavigationProps {
    siblings: TreeNode[];
    activeNodeId: string;
    onSelect: (nodeId: string) => void;
}

export const FooterNavigation: React.FC<FooterNavigationProps> = ({
    siblings,
    activeNodeId,
    onSelect,
}) => {
    // Highlighted node for keyboard navigation (separate from active)
    // This is just visual - doesn't change game state until Enter is pressed
    const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

    // Reset highlight when active node changes or siblings change
    useEffect(() => {
        setHighlightedNodeId(null);
    }, [activeNodeId, siblings]);

    // Handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't handle if user is typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            // Only handle if we have siblings to navigate
            if (siblings.length <= 1) return;

            // Use highlighted node if set, otherwise use active node
            const currentId = highlightedNodeId || activeNodeId;
            const currentIndex = siblings.findIndex(s => s.id === currentId);
            if (currentIndex === -1) return;

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevIndex = (currentIndex - 1 + siblings.length) % siblings.length;
                // Just highlight, don't navigate
                setHighlightedNodeId(siblings[prevIndex].id);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextIndex = (currentIndex + 1) % siblings.length;
                // Just highlight, don't navigate
                setHighlightedNodeId(siblings[nextIndex].id);
            } else if (e.key === 'Enter' && highlightedNodeId) {
                e.preventDefault();
                // Actually enter the highlighted variation
                onSelect(highlightedNodeId);
                setHighlightedNodeId(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [siblings, activeNodeId, highlightedNodeId, onSelect]);

    if (siblings.length <= 1) return null;

    return (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 flex flex-row overflow-x-auto z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            {siblings.map((node) => {
                const isActive = node.id === activeNodeId;
                const isHighlighted = node.id === highlightedNodeId;
                const fullMove = Math.ceil(node.ply / 2);
                const isWhite = node.ply % 2 === 1;
                const moveNumber = isWhite ? `${fullMove}.` : `${fullMove}...`;

                return (
                    <button
                        key={node.id}
                        onClick={() => onSelect(node.id)}
                        className={cn(
                            "flex-1 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-r border-gray-100 last:border-r-0 flex items-center justify-center gap-2 min-w-[100px]",
                            isActive
                                ? "bg-blue-500 text-white hover:bg-blue-600"
                                : isHighlighted
                                    ? "bg-amber-100 text-amber-900 ring-2 ring-amber-400 ring-inset"
                                    : "bg-white text-gray-700 hover:bg-gray-50"
                        )}
                    >
                        <span className={cn(
                            "opacity-70 font-normal",
                            isActive ? "text-blue-100" : isHighlighted ? "text-amber-600" : "text-gray-500"
                        )}>
                            {moveNumber}
                        </span>
                        <span>{node.san}</span>
                        {node.classification && (
                            <MoveClassificationBadge
                                classification={node.classification as MoveClassification}
                                inline={true}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
};

/**
 * IdeaTokenParser Component
 *
 * Parses commentary text and wraps known chess concepts in hoverable tokens.
 * When hovered, triggers canvas overlay visualizations.
 *
 * This implements Chess.com-style bordered keywords like "passed" that
 * highlight related squares on the board.
 */

'use client';

import React, { useCallback, useMemo } from 'react';
import type { Affordance } from '@/hooks/useNonLLMCommentaryOverlay';

// ============================================================================
// KEYWORD DEFINITIONS
// ============================================================================

interface IdeaKeyword {
    patterns: RegExp;
    affordanceType: 'PAWN_PATH' | 'ARROW' | 'LINE' | 'HIGHLIGHT' | 'SHADED_FILE';
    pattern: string;
}

/**
 * Keywords that can be highlighted and hovered
 * Each maps to an affordance type for visualization
 */
const IDEA_KEYWORDS: IdeaKeyword[] = [
    {
        patterns: /\b(passed)\b/gi,
        affordanceType: 'PAWN_PATH',
        pattern: 'passed_pawn',
    },
    {
        patterns: /\b(fork(?:s|ed|ing)?)\b/gi,
        affordanceType: 'ARROW',
        pattern: 'fork',
    },
    {
        patterns: /\b(skewer(?:s|ed|ing)?)\b/gi,
        affordanceType: 'LINE',
        pattern: 'skewer',
    },
    {
        patterns: /\b(pin(?:s|ned|ning)?)\b/gi,
        affordanceType: 'LINE',
        pattern: 'pin',
    },
    {
        patterns: /\b(fianchetto(?:ed)?)\b/gi,
        affordanceType: 'HIGHLIGHT',
        pattern: 'fianchetto',
    },
    {
        patterns: /\b(open file)\b/gi,
        affordanceType: 'SHADED_FILE',
        pattern: 'open_file',
    },
    {
        patterns: /\b(discovered attack)\b/gi,
        affordanceType: 'ARROW',
        pattern: 'discovered_attack',
    },
    {
        patterns: /\b(back rank)\b/gi,
        affordanceType: 'HIGHLIGHT',
        pattern: 'back_rank',
    },
    {
        patterns: /\b(outpost)\b/gi,
        affordanceType: 'HIGHLIGHT',
        pattern: 'outpost',
    },
    {
        patterns: /\b(doubled)\b/gi,
        affordanceType: 'HIGHLIGHT',
        pattern: 'doubled_pawns',
    },
    {
        patterns: /\b(isolated)\b/gi,
        affordanceType: 'HIGHLIGHT',
        pattern: 'isolated_pawn',
    },
];

// ============================================================================
// TYPES
// ============================================================================

interface IdeaTokenParserProps {
    /** The text to parse for keywords */
    text: string;
    /** Affordances from backend (used to determine what squares to highlight) */
    affordances?: Affordance[];
    /** Callback when a keyword is hovered */
    onHover?: (affordance: Affordance | null) => void;
    /** CSS class for the text color */
    textColorClass?: string;
    /** Whether the feature is enabled */
    enabled?: boolean;
}

interface ParsedSegment {
    type: 'text' | 'token';
    content: string;
    keyword?: IdeaKeyword;
    affordance?: Affordance;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * IdeaTokenParser
 *
 * Parses text and wraps known chess keywords in hoverable tokens.
 * Tokens trigger canvas overlays when hovered.
 */
export const IdeaTokenParser: React.FC<IdeaTokenParserProps> = ({
    text,
    affordances = [],
    onHover,
    textColorClass = 'text-gray-300',
    enabled = true,
}) => {
    // Find matching affordance for a keyword pattern
    const findAffordanceForPattern = useCallback(
        (pattern: string): Affordance | undefined => {
            return affordances.find((a) => a.pattern === pattern);
        },
        [affordances]
    );

    // Parse text into segments
    const segments = useMemo((): ParsedSegment[] => {
        if (!enabled) {
            return [{ type: 'text', content: text }];
        }

        const result: ParsedSegment[] = [];
        let remaining = text;
        let lastIndex = 0;

        // Build a combined regex to find all keywords
        const combinedPattern = IDEA_KEYWORDS.map((k) => k.patterns.source).join('|');
        const combinedRegex = new RegExp(combinedPattern, 'gi');

        let match;
        while ((match = combinedRegex.exec(text)) !== null) {
            // Add text before match
            if (match.index > lastIndex) {
                result.push({
                    type: 'text',
                    content: text.slice(lastIndex, match.index),
                });
            }

            // Find which keyword matched
            const matchedText = match[0].toLowerCase();
            const keyword = IDEA_KEYWORDS.find((k) => k.patterns.test(matchedText));

            if (keyword) {
                // Reset lastIndex on the keyword's regex (it was modified by test)
                keyword.patterns.lastIndex = 0;

                const affordance = findAffordanceForPattern(keyword.pattern);

                result.push({
                    type: 'token',
                    content: match[0],
                    keyword,
                    affordance,
                });
            } else {
                result.push({
                    type: 'text',
                    content: match[0],
                });
            }

            lastIndex = match.index + match[0].length;
        }

        // Add remaining text
        if (lastIndex < text.length) {
            result.push({
                type: 'text',
                content: text.slice(lastIndex),
            });
        }

        return result;
    }, [text, enabled, findAffordanceForPattern]);

    // Render token with hover handlers
    const renderToken = (segment: ParsedSegment, index: number) => {
        if (!segment.keyword) return segment.content;

        const handleMouseEnter = () => {
            if (segment.affordance && onHover) {
                onHover(segment.affordance);
            } else if (segment.keyword && onHover) {
                // Create a synthetic affordance for visualization
                onHover({
                    type: segment.keyword.affordanceType,
                    pattern: segment.keyword.pattern,
                });
            }
        };

        const handleMouseLeave = () => {
            if (onHover) {
                onHover(null);
            }
        };

        return (
            <span
                key={index}
                className="idea-token"
                data-pattern={segment.keyword.pattern}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {segment.content}
            </span>
        );
    };

    return (
        <span className={textColorClass}>
            {segments.map((segment, index) =>
                segment.type === 'token' ? (
                    renderToken(segment, index)
                ) : (
                    <React.Fragment key={index}>{segment.content}</React.Fragment>
                )
            )}
        </span>
    );
};

// ============================================================================
// CSS (to be added to globals.css or a CSS module)
// ============================================================================

/**
 * Add these styles to your global CSS:
 *
 * .idea-token {
 *   border: 1px solid rgba(255, 255, 255, 0.2);
 *   border-radius: 4px;
 *   padding: 0 4px;
 *   cursor: pointer;
 *   transition: background-color 0.15s ease, border-color 0.15s ease;
 * }
 *
 * .idea-token:hover {
 *   background-color: rgba(255, 165, 0, 0.2);
 *   border-color: rgba(255, 165, 0, 0.5);
 * }
 */

export default IdeaTokenParser;

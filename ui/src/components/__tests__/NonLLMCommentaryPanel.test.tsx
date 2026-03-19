/**
 * Tests for NonLLMCommentaryPanel Component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NonLLMCommentaryPanel } from '../NonLLMCommentaryPanel';

// Mock the store
jest.mock('@/stores/commentarySettingsStore', () => ({
    useCommentarySettingsStore: jest.fn(),
}));

import { useCommentarySettingsStore } from '@/stores/commentarySettingsStore';

const mockCommentary = {
    label: 'excellent',
    text: 'The knight forks the king and queen!',
    confidence: 0.95,
    idea: 'FORK_KNIGHT',
    category: 'tactical_motif',
    affordances: [
        {
            type: 'ARROW' as const,
            from: 'f7',
            to: ['e8', 'd8'],
            color: 'red',
        },
    ],
};

describe('NonLLMCommentaryPanel', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders nothing when mode is llm', () => {
        (useCommentarySettingsStore as unknown as jest.Mock).mockImplementation((selector) =>
            selector({ mode: 'llm' })
        );

        const { container } = render(
            <NonLLMCommentaryPanel commentary={mockCommentary} />
        );

        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when mode is heuristic', () => {
        (useCommentarySettingsStore as unknown as jest.Mock).mockImplementation((selector) =>
            selector({ mode: 'heuristic' })
        );

        const { container } = render(
            <NonLLMCommentaryPanel commentary={mockCommentary} />
        );

        expect(container.firstChild).toBeNull();
    });

    it('renders commentary when mode is chess_com_style', () => {
        (useCommentarySettingsStore as unknown as jest.Mock).mockImplementation((selector) =>
            selector({ mode: 'chess_com_style' })
        );

        render(<NonLLMCommentaryPanel commentary={mockCommentary} />);

        expect(screen.getByText('The knight forks the king and queen!')).toBeInTheDocument();
        expect(screen.getByText('excellent')).toBeInTheDocument();
    });

    it('renders nothing when commentary is null', () => {
        (useCommentarySettingsStore as unknown as jest.Mock).mockImplementation((selector) =>
            selector({ mode: 'chess_com_style' })
        );

        const { container } = render(
            <NonLLMCommentaryPanel commentary={null} />
        );

        expect(container.firstChild).toBeNull();
    });

    it('displays confidence percentage', () => {
        (useCommentarySettingsStore as unknown as jest.Mock).mockImplementation((selector) =>
            selector({ mode: 'chess_com_style' })
        );

        render(<NonLLMCommentaryPanel commentary={mockCommentary} />);

        expect(screen.getByText('95%')).toBeInTheDocument();
    });

    it('shows Show Tactic button when affordance is present', () => {
        (useCommentarySettingsStore as unknown as jest.Mock).mockImplementation((selector) =>
            selector({ mode: 'chess_com_style' })
        );

        const commentaryWithTactic = {
            ...mockCommentary,
            affordances: [
                ...mockCommentary.affordances,
                { type: 'SHOW_TACTIC' as const, line: ['Nxf7', 'Kxf7'] },
            ],
        };

        render(<NonLLMCommentaryPanel commentary={commentaryWithTactic} />);

        expect(screen.getByText('Show Tactic')).toBeInTheDocument();
    });

    it('calls onShowTactic when button is clicked', () => {
        (useCommentarySettingsStore as unknown as jest.Mock).mockImplementation((selector) =>
            selector({ mode: 'chess_com_style' })
        );

        const onShowTactic = jest.fn();
        const line = ['Nxf7', 'Kxf7'];
        const commentaryWithTactic = {
            ...mockCommentary,
            affordances: [{ type: 'SHOW_TACTIC' as const, line }],
        };

        render(
            <NonLLMCommentaryPanel
                commentary={commentaryWithTactic}
                onShowTactic={onShowTactic}
            />
        );

        fireEvent.click(screen.getByText('Show Tactic'));
        expect(onShowTactic).toHaveBeenCalledWith(line);
    });

    it('triggers affordance hover callback', () => {
        (useCommentarySettingsStore as unknown as jest.Mock).mockImplementation((selector) =>
            selector({ mode: 'chess_com_style' })
        );

        const onAffordanceHover = jest.fn();

        render(
            <NonLLMCommentaryPanel
                commentary={mockCommentary}
                onAffordanceHover={onAffordanceHover}
            />
        );

        const hoverHint = screen.getByText('Hover to see visualization');
        fireEvent.mouseEnter(hoverHint);

        expect(onAffordanceHover).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'ARROW' })
        );
    });
});

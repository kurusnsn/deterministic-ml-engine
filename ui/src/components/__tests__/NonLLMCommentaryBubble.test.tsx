/**
 * Tests for NonLLMCommentaryBubble Component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NonLLMCommentaryBubble } from '../NonLLMCommentaryBubble';

const mockCommentary = {
    text: 'Pushing a passed pawn.',
    label: 'best',
    idea: 'PASSED_PAWN',
    confidence: 0.95,
    affordances: [
        {
            type: 'PAWN_PATH' as const,
            pattern: 'passed_pawn',
            from: 'f6',
            to: 'f8',
            color: 'orange',
        },
    ],
};

const mockCommentaryWithFollowUp = {
    text: 'A solid choice.',
    label: 'excellent',
    idea: 'DEVELOPMENT',
    affordances: [
        {
            type: 'SHOW_FOLLOW_UP' as const,
            line: ['d8', 'Qxd8+', 'Kxd8'],
        },
    ],
};

describe('NonLLMCommentaryBubble', () => {
    it('renders nothing when disabled', () => {
        const { container } = render(
            <NonLLMCommentaryBubble
                commentary={mockCommentary}
                enabled={false}
            />
        );

        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when commentary is null', () => {
        const { container } = render(
            <NonLLMCommentaryBubble
                commentary={null}
                enabled={true}
            />
        );

        expect(container.firstChild).toBeNull();
    });

    it('renders commentary text with hoverable keywords', () => {
        render(
            <NonLLMCommentaryBubble
                commentary={mockCommentary}
                moveSan="f3"
                evalScore={-7.18}
                enabled={true}
            />
        );

        // Should show the commentary text
        expect(screen.getByText(/Pushing a/)).toBeInTheDocument();

        // Should show the label
        expect(screen.getByText(/is best/)).toBeInTheDocument();

        // Should show the move
        expect(screen.getByText('f3')).toBeInTheDocument();
    });

    it('displays eval score', () => {
        render(
            <NonLLMCommentaryBubble
                commentary={mockCommentary}
                evalScore={-7.18}
                enabled={true}
            />
        );

        expect(screen.getByText('-7.18')).toBeInTheDocument();
    });

    it('shows Show Follow-Up button when affordance is present', () => {
        render(
            <NonLLMCommentaryBubble
                commentary={mockCommentaryWithFollowUp}
                enabled={true}
            />
        );

        expect(screen.getByText('Show Follow-Up')).toBeInTheDocument();
    });

    it('calls onShowFollowUp when button is clicked', () => {
        const onShowFollowUp = jest.fn();

        render(
            <NonLLMCommentaryBubble
                commentary={mockCommentaryWithFollowUp}
                onShowFollowUp={onShowFollowUp}
                enabled={true}
            />
        );

        fireEvent.click(screen.getByText('Show Follow-Up'));
        expect(onShowFollowUp).toHaveBeenCalledWith(['d8', 'Qxd8+', 'Kxd8']);
    });

    it('calls onDrawOverlay when keyword is hovered', () => {
        const onDrawOverlay = jest.fn();

        render(
            <NonLLMCommentaryBubble
                commentary={mockCommentary}
                onDrawOverlay={onDrawOverlay}
                enabled={true}
            />
        );

        // Find the "passed" keyword token
        const passedToken = screen.getByText('passed');

        fireEvent.mouseEnter(passedToken);
        expect(onDrawOverlay).toHaveBeenCalled();

        fireEvent.mouseLeave(passedToken);
        expect(onDrawOverlay).toHaveBeenCalledWith(null);
    });

    it('displays Retry button when onRetry is provided', () => {
        const onRetry = jest.fn();

        render(
            <NonLLMCommentaryBubble
                commentary={mockCommentary}
                onRetry={onRetry}
                enabled={true}
            />
        );

        expect(screen.getByText('Retry')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Retry'));
        expect(onRetry).toHaveBeenCalled();
    });
});

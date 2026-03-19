/**
 * Tests for IdeaTokenParser Component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { IdeaTokenParser } from '../IdeaTokenParser';

describe('IdeaTokenParser', () => {
    it('renders plain text when no keywords present', () => {
        render(
            <IdeaTokenParser
                text="A solid move."
                enabled={true}
            />
        );

        expect(screen.getByText('A solid move.')).toBeInTheDocument();
    });

    it('wraps "passed" keyword in hoverable token', () => {
        render(
            <IdeaTokenParser
                text="Pushing a passed pawn."
                enabled={true}
            />
        );

        const token = screen.getByText('passed');
        expect(token).toHaveClass('idea-token');
        expect(token).toHaveAttribute('data-pattern', 'passed_pawn');
    });

    it('wraps "fork" keyword in hoverable token', () => {
        render(
            <IdeaTokenParser
                text="The knight forks the king and queen."
                enabled={true}
            />
        );

        const token = screen.getByText('forks');
        expect(token).toHaveClass('idea-token');
        expect(token).toHaveAttribute('data-pattern', 'fork');
    });

    it('wraps "pin" keyword in hoverable token', () => {
        render(
            <IdeaTokenParser
                text="The bishop pins the knight."
                enabled={true}
            />
        );

        const token = screen.getByText('pins');
        expect(token).toHaveClass('idea-token');
        expect(token).toHaveAttribute('data-pattern', 'pin');
    });

    it('wraps "skewer" keyword in hoverable token', () => {
        render(
            <IdeaTokenParser
                text="A deadly skewer!"
                enabled={true}
            />
        );

        const token = screen.getByText('skewer');
        expect(token).toHaveClass('idea-token');
        expect(token).toHaveAttribute('data-pattern', 'skewer');
    });

    it('calls onHover when keyword is hovered', () => {
        const onHover = jest.fn();

        render(
            <IdeaTokenParser
                text="Pushing a passed pawn."
                onHover={onHover}
                enabled={true}
            />
        );

        const token = screen.getByText('passed');

        fireEvent.mouseEnter(token);
        expect(onHover).toHaveBeenCalled();

        fireEvent.mouseLeave(token);
        expect(onHover).toHaveBeenCalledWith(null);
    });

    it('does not wrap keywords when disabled', () => {
        render(
            <IdeaTokenParser
                text="Pushing a passed pawn."
                enabled={false}
            />
        );

        // Text should still be present
        expect(screen.getByText('Pushing a passed pawn.')).toBeInTheDocument();

        // But there should be no idea-token class
        const tokens = document.querySelectorAll('.idea-token');
        expect(tokens.length).toBe(0);
    });

    it('matches affordance by pattern', () => {
        const onHover = jest.fn();
        const affordances = [
            {
                type: 'PAWN_PATH' as const,
                pattern: 'passed_pawn',
                from: 'e6',
                to: 'e8',
            },
        ];

        render(
            <IdeaTokenParser
                text="Pushing a passed pawn."
                affordances={affordances}
                onHover={onHover}
                enabled={true}
            />
        );

        const token = screen.getByText('passed');
        fireEvent.mouseEnter(token);

        // Should call onHover with the matching affordance
        expect(onHover).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'PAWN_PATH',
                pattern: 'passed_pawn',
            })
        );
    });

    it('handles multiple keywords in one text', () => {
        render(
            <IdeaTokenParser
                text="The knight forks after the passed pawn advances."
                enabled={true}
            />
        );

        expect(screen.getByText('forks')).toHaveClass('idea-token');
        expect(screen.getByText('passed')).toHaveClass('idea-token');
    });
});

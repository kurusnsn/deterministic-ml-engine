/**
 * Tests for TacticalOverlay Component
 */

import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TacticalOverlay } from '../TacticalOverlay';

describe('TacticalOverlay', () => {
    const defaultProps = {
        boardSize: 400,
        orientation: 'white' as const,
    };

    it('renders nothing when affordance is null', () => {
        const { container } = render(
            <TacticalOverlay {...defaultProps} affordance={null} />
        );

        expect(container.querySelector('svg')).toBeNull();
    });

    it('renders SVG when affordance is provided', () => {
        const affordance = {
            type: 'ARROW' as const,
            from: 'e2',
            to: ['e4'],
            color: 'green',
        };

        const { container } = render(
            <TacticalOverlay {...defaultProps} affordance={affordance} />
        );

        expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('renders arrow elements for ARROW affordance', () => {
        const affordance = {
            type: 'ARROW' as const,
            from: 'f7',
            to: ['e8', 'd8'],
            color: 'red',
        };

        const { container } = render(
            <TacticalOverlay {...defaultProps} affordance={affordance} />
        );

        // Should have line elements for arrows
        const lines = container.querySelectorAll('line');
        expect(lines.length).toBe(2); // One for each target

        // Should have polygon elements for arrow heads
        const polygons = container.querySelectorAll('polygon');
        expect(polygons.length).toBe(2);
    });

    it('renders line element for LINE affordance', () => {
        const affordance = {
            type: 'LINE' as const,
            squares: ['e1', 'e4', 'e8'],
            color: 'orange',
        };

        const { container } = render(
            <TacticalOverlay {...defaultProps} affordance={affordance} />
        );

        const lines = container.querySelectorAll('line');
        expect(lines.length).toBe(1);
    });

    it('renders rect elements for HIGHLIGHT affordance', () => {
        const affordance = {
            type: 'HIGHLIGHT' as const,
            squares: ['d4', 'd5', 'e4', 'e5'],
            color: 'blue',
        };

        const { container } = render(
            <TacticalOverlay {...defaultProps} affordance={affordance} />
        );

        const rects = container.querySelectorAll('rect');
        expect(rects.length).toBe(4); // One for each square
    });

    it('renders shaded file for SHADED_FILE affordance', () => {
        const affordance = {
            type: 'SHADED_FILE' as const,
            file: 'e',
            color: 'green',
        };

        const { container } = render(
            <TacticalOverlay {...defaultProps} affordance={affordance} />
        );

        const rect = container.querySelector('rect');
        expect(rect).toBeInTheDocument();
        expect(rect).toHaveAttribute('height', '400'); // Full board height
    });

    it('renders shaded rank for SHADED_RANK affordance', () => {
        const affordance = {
            type: 'SHADED_RANK' as const,
            rank: 1,
            color: 'red',
        };

        const { container } = render(
            <TacticalOverlay {...defaultProps} affordance={affordance} />
        );

        const rect = container.querySelector('rect');
        expect(rect).toBeInTheDocument();
        expect(rect).toHaveAttribute('width', '400'); // Full board width
    });

    it('renders pawn path for PAWN_PATH affordance', () => {
        const affordance = {
            type: 'PAWN_PATH' as const,
            from: 'e6',
            to: 'e8',
            color: 'green',
        };

        const { container } = render(
            <TacticalOverlay {...defaultProps} affordance={affordance} />
        );

        // Should have a line (dashed path)
        const line = container.querySelector('line');
        expect(line).toBeInTheDocument();

        // Should have a circle (promotion indicator)
        const circle = container.querySelector('circle');
        expect(circle).toBeInTheDocument();
    });

    it('correctly handles black orientation', () => {
        const affordance = {
            type: 'HIGHLIGHT' as const,
            squares: ['a1'],
            color: 'yellow',
        };

        const { container: whiteContainer } = render(
            <TacticalOverlay
                {...defaultProps}
                orientation="white"
                affordance={affordance}
            />
        );

        const { container: blackContainer } = render(
            <TacticalOverlay
                {...defaultProps}
                orientation="black"
                affordance={affordance}
            />
        );

        // The rect positions should be different for white vs black orientation
        const whiteRect = whiteContainer.querySelector('rect');
        const blackRect = blackContainer.querySelector('rect');

        // For a1, white orientation should have it bottom-left, black should have it top-right
        expect(whiteRect?.getAttribute('x')).not.toBe(blackRect?.getAttribute('x'));
        expect(whiteRect?.getAttribute('y')).not.toBe(blackRect?.getAttribute('y'));
    });

    it('has pointer-events-none to not interfere with board', () => {
        const affordance = {
            type: 'ARROW' as const,
            from: 'e2',
            to: ['e4'],
            color: 'green',
        };

        const { container } = render(
            <TacticalOverlay {...defaultProps} affordance={affordance} />
        );

        const svg = container.querySelector('svg');
        expect(svg).toHaveClass('pointer-events-none');
    });
});

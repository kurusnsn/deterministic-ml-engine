/**
 * Tests for MoveEngineComment component.
 *
 * Tests cover:
 * - Rendering with different classification types
 * - Eval formatting (positive/negative)
 * - Heuristic commentary display
 * - "Play follow-up" button visibility and click handler
 * - Loading state
 * - No annotation state
 */

import React from 'react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import MoveEngineComment from '../MoveEngineComment'
import { MoveEngineAnnotation } from '@/types/repertoire'

// Mock next/image
vi.mock('next/image', () => ({
    default: ({ src, alt, ...props }: { src: string; alt: string }) => (
        <img src={src} alt={alt} {...props} />
    ),
}))

describe('MoveEngineComment', () => {
    const createMockAnnotation = (overrides: Partial<MoveEngineAnnotation> = {}): MoveEngineAnnotation => ({
        plyIndex: 1,
        moveSan: 'e4',
        sideToMove: 'white',
        evalCp: 30,
        evalDelta: 30,
        mistakeType: 'best',
        bestMoveSan: null,
        bestMoveUci: null,
        betterMoveExists: false,
        pvSan: null,
        pvUci: null,
        ...overrides,
    })

    describe('Loading state', () => {
        it('shows loading skeleton when isLoading is true', () => {
            render(<MoveEngineComment annotation={null} isLoading={true} />)

            // Should have animate-pulse class for loading state
            const card = document.querySelector('.animate-pulse')
            expect(card).toBeInTheDocument()
        })
    })

    describe('No annotation state', () => {
        it('shows placeholder when annotation is null and not loading', () => {
            render(<MoveEngineComment annotation={null} isLoading={false} />)

            expect(screen.getByText('Select a move to see engine analysis')).toBeInTheDocument()
        })
    })

    describe('Classification rendering', () => {
        it('renders best move classification correctly', () => {
            const annotation = createMockAnnotation({ mistakeType: 'best' })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.getByText('e4')).toBeInTheDocument()
            expect(screen.getByText('Best')).toBeInTheDocument()
        })

        it('renders blunder classification correctly', () => {
            const annotation = createMockAnnotation({
                mistakeType: 'blunder',
                evalDelta: -300,
                evalCp: -250
            })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.getByText('Blunder')).toBeInTheDocument()
        })

        it('renders inaccuracy classification correctly', () => {
            const annotation = createMockAnnotation({
                mistakeType: 'inaccuracy',
                evalDelta: -40,
                evalCp: -10
            })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.getByText('Inaccuracy')).toBeInTheDocument()
        })

        it('renders brilliant classification correctly', () => {
            const annotation = createMockAnnotation({
                mistakeType: 'brilliant',
                evalDelta: 100,
                evalCp: 150
            })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.getByText('Brilliant')).toBeInTheDocument()
        })
    })

    describe('Eval formatting', () => {
        it('formats positive eval with plus sign', () => {
            const annotation = createMockAnnotation({ evalCp: 145 })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.getByText('+1.45')).toBeInTheDocument()
        })

        it('formats negative eval with minus sign', () => {
            const annotation = createMockAnnotation({ evalCp: -32 })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.getByText('-0.32')).toBeInTheDocument()
        })

        it('formats zero eval with plus sign', () => {
            const annotation = createMockAnnotation({ evalCp: 0 })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.getByText('+0.00')).toBeInTheDocument()
        })

        it('displays mate scores correctly', () => {
            const annotation = createMockAnnotation({ evalCp: 10000 })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.getByText('+M')).toBeInTheDocument()
        })
    })

    describe('Heuristic commentary', () => {
        it('displays heuristic commentary when provided', () => {
            const annotation = createMockAnnotation({
                heuristicSummary: {
                    advantage: 'white_slightly_better',
                    commentary: 'White has a slight space advantage.',
                    whiteScore: 10,
                    blackScore: 5,
                    eval: 5
                }
            })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.getByText('White has a slight space advantage.')).toBeInTheDocument()
        })

        it('does not render commentary section when not provided', () => {
            const annotation = createMockAnnotation({ heuristicSummary: undefined })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.queryByText(/advantage/i)).not.toBeInTheDocument()
        })
    })

    describe('Best move suggestion', () => {
        it('displays best move when better move exists', () => {
            const annotation = createMockAnnotation({
                betterMoveExists: true,
                bestMoveSan: 'd4',
                evalDelta: -50
            })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.getByText('Best move:')).toBeInTheDocument()
            expect(screen.getByText('d4')).toBeInTheDocument()
        })

        it('does not show best move section when no better move exists', () => {
            const annotation = createMockAnnotation({
                betterMoveExists: false,
                bestMoveSan: null
            })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.queryByText('Best move:')).not.toBeInTheDocument()
        })
    })

    describe('Principal variation', () => {
        it('displays PV when available', () => {
            const annotation = createMockAnnotation({
                pvSan: ['d5', 'exd5', 'Qxd5'],
                betterMoveExists: true
            })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.getByText('Engine line:')).toBeInTheDocument()
            expect(screen.getByText('d5 exd5 Qxd5')).toBeInTheDocument()
        })

        it('truncates long PV with ellipsis', () => {
            const annotation = createMockAnnotation({
                pvSan: ['d5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'Bd2', 'Bb4'],
                betterMoveExists: true
            })
            render(<MoveEngineComment annotation={annotation} />)

            // Should show first 5 moves + ellipsis
            expect(screen.getByText('d5 exd5 Qxd5 Nc3 Qa5...')).toBeInTheDocument()
        })
    })

    describe('Play follow-up button', () => {
        it('shows button when betterMoveExists, pvSan is not empty, and onPlayFollowUp is provided', () => {
            const mockHandler = vi.fn()
            const annotation = createMockAnnotation({
                betterMoveExists: true,
                pvSan: ['d5', 'exd5']
            })
            render(<MoveEngineComment annotation={annotation} onPlayFollowUp={mockHandler} />)

            expect(screen.getByText('Play follow-up')).toBeInTheDocument()
        })

        it('hides button when betterMoveExists is false', () => {
            const annotation = createMockAnnotation({
                betterMoveExists: false,
                pvSan: ['d5', 'exd5']
            })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.queryByText('Play follow-up')).not.toBeInTheDocument()
        })

        it('hides button when pvSan is null', () => {
            const annotation = createMockAnnotation({
                betterMoveExists: true,
                pvSan: null
            })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.queryByText('Play follow-up')).not.toBeInTheDocument()
        })

        it('hides button when pvSan is empty array', () => {
            const annotation = createMockAnnotation({
                betterMoveExists: true,
                pvSan: []
            })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.queryByText('Play follow-up')).not.toBeInTheDocument()
        })

        it('calls onPlayFollowUp with pvSan when clicked', () => {
            const mockHandler = vi.fn()
            const annotation = createMockAnnotation({
                betterMoveExists: true,
                pvSan: ['d5', 'exd5', 'Qxd5']
            })
            render(<MoveEngineComment annotation={annotation} onPlayFollowUp={mockHandler} />)

            const button = screen.getByText('Play follow-up')
            fireEvent.click(button)

            expect(mockHandler).toHaveBeenCalledWith(['d5', 'exd5', 'Qxd5'])
        })
    })

    describe('Side to move', () => {
        it('displays white to move correctly', () => {
            const annotation = createMockAnnotation({ sideToMove: 'white' })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.getByText('white to move')).toBeInTheDocument()
        })

        it('displays black to move correctly', () => {
            const annotation = createMockAnnotation({ sideToMove: 'black' })
            render(<MoveEngineComment annotation={annotation} />)

            expect(screen.getByText('black to move')).toBeInTheDocument()
        })
    })
})

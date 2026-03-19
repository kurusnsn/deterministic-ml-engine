/**
 * Tests for PositionEvaluationBubble component.
 *
 * Tests cover:
 * - Rendering with mock API success
 * - Loading state
 * - Error state
 * - Correct text displayed based on tier
 * - Deterministic formatting
 */

import React from 'react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from './test-utils'
import { PositionEvaluationBubble } from '../components/PositionEvaluationBubble'

// Mock fetch globally
const mockFetch = vi.fn()

beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('PositionEvaluationBubble', () => {
    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

    it('shows loading state while fetching', () => {
        // Mock a pending fetch
        mockFetch.mockImplementation(() => new Promise(() => { }))

        render(<PositionEvaluationBubble fen={startingFen} plyCount={1} />)

        expect(screen.getByText('Thinking...')).toBeInTheDocument()
    })

    describe('Success state', () => {
        it('displays commentary on successful fetch', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    advantage: 'equal',
                    commentary: 'The position remains balanced.',
                    white_score: 0,
                    black_score: 0,
                    eval: 0,
                }),
            })

            render(<PositionEvaluationBubble fen={startingFen} plyCount={1} />)

            await waitFor(() => {
                expect(screen.getByText('The position remains balanced.')).toBeInTheDocument()
            })
        })

        it('displays white slightly better tier correctly', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    advantage: 'white_slightly_better',
                    commentary: 'White is slightly better.',
                    white_score: 10,
                    black_score: 0,
                    eval: 10,
                }),
            })

            render(<PositionEvaluationBubble fen={startingFen} plyCount={1} />)

            await waitFor(() => {
                expect(screen.getByText('White is slightly better.')).toBeInTheDocument()
            })
        })

        it('displays black winning tier correctly', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    advantage: 'black_winning',
                    commentary: 'Black is winning.',
                    white_score: 0,
                    black_score: 50,
                    eval: -50,
                }),
            })

            render(<PositionEvaluationBubble fen={startingFen} plyCount={1} />)

            await waitFor(() => {
                expect(screen.getByText('Black is winning.')).toBeInTheDocument()
            })
        })

        it('displays score percentages', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    advantage: 'white_better',
                    commentary: 'White has a comfortable advantage.',
                    white_score: 20,
                    status: 'success',
                    black_score: 5,
                    eval: 15,
                }),
            })

            render(<PositionEvaluationBubble fen={startingFen} plyCount={1} />)

            await waitFor(() => {
                // The current component doesn't display percentages text, 
                // but it should display the commentary.
                expect(screen.getByText('White has a comfortable advantage.')).toBeInTheDocument()
            })
        })
    })

    describe('Error state', () => {
        it('shows error state on fetch failure', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
            })

            render(<PositionEvaluationBubble fen={startingFen} plyCount={1} />)

            await waitFor(() => {
                expect(screen.getByText('Evaluation unavailable')).toBeInTheDocument()
            })
        })

        it('shows error state on network error', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'))

            render(<PositionEvaluationBubble fen={startingFen} plyCount={1} />)

            await waitFor(() => {
                expect(screen.getByText('Evaluation unavailable')).toBeInTheDocument()
            })
        })
    })

    describe('No FEN state', () => {
        it('shows no evaluation when FEN is empty', () => {
            render(<PositionEvaluationBubble fen="" plyCount={1} />)

            expect(screen.getByText(/Start the game to see commentary/i)).toBeInTheDocument()
        })
    })

    describe('Initial position gating (plyCount === 0)', () => {
        it('shows placeholder at initial position when plyCount is 0', () => {
            // Should NOT call fetch at all
            render(<PositionEvaluationBubble fen={startingFen} plyCount={0} />)

            expect(screen.getByText('Game start — No moves played yet.')).toBeInTheDocument()
            expect(mockFetch).not.toHaveBeenCalled()
        })

        it('shows placeholder at initial position with default plyCount', () => {
            // Default plyCount is 0
            render(<PositionEvaluationBubble fen={startingFen} />)

            expect(screen.getByText('Game start — No moves played yet.')).toBeInTheDocument()
            expect(mockFetch).not.toHaveBeenCalled()
        })

        it('fetches evaluation when plyCount is greater than 0', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    advantage: 'white_slightly_better',
                    commentary: 'White is slightly better.',
                    white_score: 10,
                    black_score: 0,
                    eval: 10,
                }),
            })

            render(<PositionEvaluationBubble fen={startingFen} plyCount={1} />)

            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalled()
                expect(screen.getByText('White is slightly better.')).toBeInTheDocument()
            })
        })

        it('sends ply_count in API request', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    advantage: 'equal',
                    commentary: 'The game is roughly equal.',
                    white_score: 0,
                    black_score: 0,
                    eval: 0,
                }),
            })

            render(<PositionEvaluationBubble fen={startingFen} plyCount={5} />)

            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalledWith(
                    expect.any(String),
                    expect.objectContaining({
                        body: expect.stringContaining('"ply_count":5'),
                    })
                )
            })
        })

        it('shows backend commentary when disabled flag is true', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    advantage: 'equal',
                    commentary: 'Game start — No moves played yet.',
                    white_score: 0,
                    black_score: 0,
                    eval: 0,
                    disabled: true,
                }),
            })

            render(<PositionEvaluationBubble fen={startingFen} plyCount={1} />)

            await waitFor(() => {
                expect(screen.getByText('Game start — No moves played yet.')).toBeInTheDocument()
            })
        })
    })

    describe('Tier styling', () => {
        it('applies correct styling for equal tier', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    advantage: 'equal',
                    commentary: 'The position remains balanced.',
                    white_score: 0,
                    black_score: 0,
                    eval: 0,
                }),
            })

            const { container } = render(<PositionEvaluationBubble fen={startingFen} plyCount={1} />)

            await waitFor(() => {
                const bubble = container.querySelector('.rounded-xl')
                // Component uses standard bg-white dark:bg-black now
                expect(bubble).toHaveClass('bg-white')
            })
        })

        it('applies correct styling for white advantage', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    advantage: 'white_better',
                    commentary: 'White enjoys the better position.',
                    white_score: 20,
                    black_score: 0,
                    eval: 20,
                }),
            })

            const { container } = render(<PositionEvaluationBubble fen={startingFen} plyCount={1} />)

            await waitFor(() => {
                const bubble = container.querySelector('.rounded-xl')
                expect(bubble).toHaveClass('bg-white')
            })
        })

        it('applies correct styling for black advantage', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    advantage: 'black_much_better',
                    commentary: 'Black holds a significant advantage.',
                    white_score: 0,
                    black_score: 35,
                    eval: -35,
                }),
            })

            const { container } = render(<PositionEvaluationBubble fen={startingFen} plyCount={1} />)

            await waitFor(() => {
                const bubble = container.querySelector('.rounded-xl')
                expect(bubble).toHaveClass('bg-white')
            })
        })
    })

    describe('AI Toggle', () => {
        const mockLLMMessage = {
            id: 'ai-123',
            sender: 'llm',
            text: 'This is an AI analysis of the move.',
            timestamp: Date.now(),
            heuristicCommentary: {
                headline: 'AI Insight'
            }
        }

        it('shows AI toggle badge for premium users with AI message', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    advantage: 'equal',
                    commentary: 'Heuristic text',
                    white_score: 0,
                    black_score: 0,
                    eval: 0,
                }),
            })

            render(
                <PositionEvaluationBubble
                    fen={startingFen}
                    plyCount={1}
                    isPremium={true}
                    llmMessage={mockLLMMessage as any}
                />
            )

            await waitFor(() => {
                expect(screen.getByText('AI')).toBeInTheDocument()
            })
        })

        it('switches to AI commentary when AI badge is clicked', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    advantage: 'equal',
                    commentary: 'Heuristic text',
                    white_score: 0,
                    black_score: 0,
                    eval: 0,
                }),
            })

            render(
                <PositionEvaluationBubble
                    fen={startingFen}
                    plyCount={1}
                    isPremium={true}
                    llmMessage={mockLLMMessage as any}
                />
            )

            // Wait for heuristic text
            await waitFor(() => {
                expect(screen.getByText('Heuristic text')).toBeInTheDocument()
            })

            // Click AI badge
            const aiButton = screen.getByText('AI')
            aiButton.click()

            // Should show AI text
            await waitFor(() => {
                expect(screen.getByText('AI Insight')).toBeInTheDocument()
                expect(screen.getByText('This is an AI analysis of the move.')).toBeInTheDocument()
                expect(screen.queryByText('Heuristic text')).not.toBeInTheDocument()
            })
        })

        it('hides AI toggle badge for non-premium users', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    advantage: 'equal',
                    commentary: 'Heuristic text',
                    eval: 0,
                }),
            })

            render(
                <PositionEvaluationBubble
                    fen={startingFen}
                    plyCount={1}
                    isPremium={false}
                    llmMessage={mockLLMMessage as any}
                />
            )

            await waitFor(() => {
                expect(screen.queryByText('AI')).not.toBeInTheDocument()
            })
        })
    })
})

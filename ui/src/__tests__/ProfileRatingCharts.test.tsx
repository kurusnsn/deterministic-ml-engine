/**
 * Tests for Profile Rating Chart Components
 * 
 * Uses Vitest + Testing Library to test the ProfileGameRatingChart
 * and ProfilePuzzleRatingChart components.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Mock next/link
vi.mock('next/link', () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}));

// Mock session
vi.mock('@/lib/session', () => ({
    getSessionId: () => 'test-session-id',
}));

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
    useSession: () => ({ data: null, status: 'unauthenticated' }),
}));

// Mock Recharts (avoid rendering issues in tests)
vi.mock('recharts', () => ({
    LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Legend: () => null,
}));

describe('ProfileGameRatingChart', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows loading state initially', async () => {
        // Mock fetch to be slow
        global.fetch = vi.fn().mockImplementation(
            () => new Promise(() => { }) // Never resolves
        );

        const { default: ProfileGameRatingChart } = await import(
            '@/components/profile/ProfileGameRatingChart'
        );

        render(<ProfileGameRatingChart />);

        // Should show spinner
        expect(document.querySelector('.animate-spin')).toBeTruthy();
    });

    it('renders chart when data is available', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                series: [
                    {
                        provider: 'lichess',
                        time_control: 'blitz',
                        points: [
                            { recorded_at: '2025-01-01T00:00:00Z', rating: 1500 },
                            { recorded_at: '2025-01-02T00:00:00Z', rating: 1520 },
                        ],
                    },
                ],
            }),
        });

        const { default: ProfileGameRatingChart } = await import(
            '@/components/profile/ProfileGameRatingChart'
        );

        render(<ProfileGameRatingChart />);

        await waitFor(() => {
            expect(screen.getByTestId('line-chart')).toBeTruthy();
        });
    });

    it('shows empty state when no data', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ series: [] }),
        });

        const { default: ProfileGameRatingChart } = await import(
            '@/components/profile/ProfileGameRatingChart'
        );

        render(<ProfileGameRatingChart />);

        await waitFor(() => {
            expect(screen.getByText(/No rating data yet/i)).toBeTruthy();
        });
    });

    it('shows error state on fetch failure', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            text: () => Promise.resolve('Server error'),
        });

        const { default: ProfileGameRatingChart } = await import(
            '@/components/profile/ProfileGameRatingChart'
        );

        render(<ProfileGameRatingChart />);

        await waitFor(() => {
            expect(screen.getByText(/Server error/i)).toBeTruthy();
        });
    });
});

describe('ProfilePuzzleRatingChart', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders chart when data is available', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                series: [
                    {
                        provider: 'internal',
                        time_control: 'puzzle',
                        points: [
                            { recorded_at: '2025-01-01T00:00:00Z', rating: 1800 },
                            { recorded_at: '2025-01-02T00:00:00Z', rating: 1820 },
                        ],
                    },
                ],
            }),
        });

        const { default: ProfilePuzzleRatingChart } = await import(
            '@/components/profile/ProfilePuzzleRatingChart'
        );

        render(<ProfilePuzzleRatingChart />);

        await waitFor(() => {
            expect(screen.getByTestId('line-chart')).toBeTruthy();
        });
    });

    it('shows empty state when no puzzle data', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ series: [] }),
        });

        const { default: ProfilePuzzleRatingChart } = await import(
            '@/components/profile/ProfilePuzzleRatingChart'
        );

        render(<ProfilePuzzleRatingChart />);

        await waitFor(() => {
            expect(screen.getByText(/No puzzle rating data yet/i)).toBeTruthy();
        });
    });
});

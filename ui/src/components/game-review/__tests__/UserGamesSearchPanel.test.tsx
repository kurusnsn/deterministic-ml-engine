import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserGamesSearchPanel, GameInfo } from '../UserGamesSearchPanel';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Sample game data for mocking API responses
const mockLichessGame = {
    id: 'abc123',
    players: {
        white: { user: { name: 'TestUser' }, rating: 1500, result: 'win' },
        black: { user: { name: 'Opponent' }, rating: 1450, result: 'lose' }
    },
    perf: 'blitz',
    winner: 'white',
    createdAt: Date.now(),
    moves: 'e4 e5 Nf3 Nc6',
    pgn: '1. e4 e5 2. Nf3 Nc6 *'
};

const mockChessComArchives = {
    archives: ['https://api.chess.com/pub/player/testuser/games/2024/12']
};

const mockChessComGames = {
    games: [{
        uuid: 'xyz789',
        url: 'https://chess.com/game/live/xyz789',
        white: { username: 'TestUser', rating: 1500, result: 'win' },
        black: { username: 'Opponent', rating: 1450, result: 'checkmated' },
        time_class: 'rapid',
        end_time: Math.floor(Date.now() / 1000),
        pgn: '1. d4 d5 2. c4 e6 *'
    }]
};

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value.toString();
        }),
        clear: vi.fn(() => {
            store = {};
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        length: 0,
        key: vi.fn(),
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock
});

describe('UserGamesSearchPanel', () => {
    const mockOnSelectGame = vi.fn();

    beforeEach(() => {
        mockFetch.mockReset();
        mockOnSelectGame.mockClear();
        localStorageMock.clear();
        mockFetch.mockImplementation((input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.includes('/api/me/home?include_profile=true')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ linked_accounts: {}, linked_accounts_list: [] })
                });
            }
            return Promise.reject(new Error(`Unhandled fetch call: ${url}`));
        });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ linked_accounts: {}, linked_accounts_list: [] })
        });
    });

    it('renders the component with search tab active', () => {
        render(<UserGamesSearchPanel onSelectGame={mockOnSelectGame} />);

        expect(screen.getByTestId('tab-search')).toBeInTheDocument();
        expect(screen.getByTestId('platform-lichess')).toBeInTheDocument();
        expect(screen.getByTestId('platform-chesscom')).toBeInTheDocument();
        expect(screen.getByTestId('username-input')).toBeInTheDocument();
        expect(screen.getByTestId('search-button')).toBeInTheDocument();
    });

    it('shows error when searching with empty username', async () => {
        render(<UserGamesSearchPanel onSelectGame={mockOnSelectGame} />);

        fireEvent.click(screen.getByTestId('search-button'));

        await waitFor(() => {
            expect(screen.getByTestId('error-message')).toHaveTextContent('Please enter a username');
        });
    });

    it('toggles between Lichess and Chess.com platforms', () => {
        render(<UserGamesSearchPanel onSelectGame={mockOnSelectGame} />);

        const lichessBtn = screen.getByTestId('platform-lichess');
        const chesscomBtn = screen.getByTestId('platform-chesscom');

        // Lichess should be selected by default
        expect(lichessBtn).toHaveClass('bg-background');

        // Click Chess.com
        fireEvent.click(chesscomBtn);
        expect(chesscomBtn).toHaveClass('bg-background');

        // Click back to Lichess
        fireEvent.click(lichessBtn);
        expect(lichessBtn).toHaveClass('bg-background');
    });

    it('fetches and displays Lichess games on search', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            text: async () => JSON.stringify(mockLichessGame)
        });

        render(<UserGamesSearchPanel onSelectGame={mockOnSelectGame} />);

        const input = screen.getByTestId('username-input');
        fireEvent.change(input, { target: { value: 'TestUser' } });
        fireEvent.click(screen.getByTestId('search-button'));

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('lichess.org/api/games/user/TestUser'),
                expect.any(Object)
            );
        });

        // Wait for user tab to appear
        await waitFor(() => {
            expect(screen.getByTestId('tab-lichess:TestUser')).toBeInTheDocument();
        });
    });

    it('fetches Chess.com games on search', async () => {
        // Mock archives endpoint
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockChessComArchives
        });
        // Mock games endpoint
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockChessComGames
        });

        render(<UserGamesSearchPanel onSelectGame={mockOnSelectGame} />);

        // Switch to Chess.com
        fireEvent.click(screen.getByTestId('platform-chesscom'));

        const input = screen.getByTestId('username-input');
        fireEvent.change(input, { target: { value: 'testuser' } });
        fireEvent.click(screen.getByTestId('search-button'));

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/external/chesscom/player/testuser/archives')
            );
        });
    });

    it('handles user not found error', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: 'Not Found'
        });

        render(<UserGamesSearchPanel onSelectGame={mockOnSelectGame} />);

        const input = screen.getByTestId('username-input');
        fireEvent.change(input, { target: { value: 'nonexistentuser' } });
        fireEvent.click(screen.getByTestId('search-button'));

        await waitFor(() => {
            expect(screen.getByTestId('error-message')).toHaveTextContent('User not found on Lichess');
        });
    });

    it('allows switching between search and user tabs', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            text: async () => JSON.stringify(mockLichessGame)
        });

        render(<UserGamesSearchPanel onSelectGame={mockOnSelectGame} />);

        // Search for a user
        const input = screen.getByTestId('username-input');
        fireEvent.change(input, { target: { value: 'TestUser' } });
        fireEvent.click(screen.getByTestId('search-button'));

        // Wait for user tab
        await waitFor(() => {
            expect(screen.getByTestId('tab-lichess:TestUser')).toBeInTheDocument();
        });

        // Switch back to search tab
        fireEvent.click(screen.getByTestId('tab-search'));
        expect(screen.getByTestId('username-input')).toBeInTheDocument();

        // Switch to user tab
        fireEvent.click(screen.getByTestId('tab-lichess:TestUser'));
        // Games should be visible
        await waitFor(() => {
            expect(screen.getByTestId('game-item-abc123')).toBeInTheDocument();
        });
    });

    it('closes user tab when close button is clicked', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            text: async () => JSON.stringify(mockLichessGame)
        });

        render(<UserGamesSearchPanel onSelectGame={mockOnSelectGame} />);

        // Search for a user
        const input = screen.getByTestId('username-input');
        fireEvent.change(input, { target: { value: 'TestUser' } });
        fireEvent.click(screen.getByTestId('search-button'));

        // Wait for user tab
        await waitFor(() => {
            expect(screen.getByTestId('tab-lichess:TestUser')).toBeInTheDocument();
        });

        // Close the tab
        fireEvent.click(screen.getByTestId('close-tab-lichess:TestUser'));

        // Tab should be gone
        await waitFor(() => {
            expect(screen.queryByTestId('tab-lichess:TestUser')).not.toBeInTheDocument();
        });
    });

    it('calls onSelectGame when a game is clicked', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            text: async () => JSON.stringify(mockLichessGame)
        });

        render(<UserGamesSearchPanel onSelectGame={mockOnSelectGame} />);

        // Search for a user
        const input = screen.getByTestId('username-input');
        fireEvent.change(input, { target: { value: 'TestUser' } });
        fireEvent.click(screen.getByTestId('search-button'));

        // Wait for user tab and click on game
        await waitFor(() => {
            expect(screen.getByTestId('tab-lichess:TestUser')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('tab-lichess:TestUser'));

        await waitFor(() => {
            expect(screen.getByTestId('game-item-abc123')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('game-item-abc123'));

        expect(mockOnSelectGame).toHaveBeenCalledTimes(1);
        const [pgn, url, selectedUser] = mockOnSelectGame.mock.calls[0];
        expect(pgn).toEqual(expect.any(String));
        expect(url).toContain('lichess.org');
        expect(selectedUser).toEqual({ username: 'TestUser', platform: 'lichess' });
    });

    it('shows recent tab after selecting a game', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            text: async () => JSON.stringify(mockLichessGame)
        });

        render(<UserGamesSearchPanel onSelectGame={mockOnSelectGame} />);

        // Search and select a game
        const input = screen.getByTestId('username-input');
        fireEvent.change(input, { target: { value: 'TestUser' } });
        fireEvent.click(screen.getByTestId('search-button'));

        await waitFor(() => {
            expect(screen.getByTestId('tab-lichess:TestUser')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('tab-lichess:TestUser'));

        await waitFor(() => {
            expect(screen.getByTestId('game-item-abc123')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('game-item-abc123'));

        // Recent tab should now appear
        await waitFor(() => {
            expect(screen.getByTestId('tab-recent')).toBeInTheDocument();
        });
    });

    it('reuses cached results when searching for same user again', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            text: async () => JSON.stringify(mockLichessGame)
        });

        render(<UserGamesSearchPanel onSelectGame={mockOnSelectGame} />);

        // First search
        const input = screen.getByTestId('username-input');
        fireEvent.change(input, { target: { value: 'TestUser' } });
        fireEvent.click(screen.getByTestId('search-button'));

        await waitFor(() => {
            expect(screen.getByTestId('tab-lichess:TestUser')).toBeInTheDocument();
        });

        const lichessFetchCalls = mockFetch.mock.calls.filter(
            ([url]) => String(url).includes('lichess.org/api/games/user/TestUser')
        );
        expect(lichessFetchCalls).toHaveLength(1);

        // Switch back to search
        fireEvent.click(screen.getByTestId('tab-search'));

        // Search for same user again
        fireEvent.change(input, { target: { value: 'TestUser' } });
        fireEvent.click(screen.getByTestId('search-button'));

        // Should NOT make another Lichess fetch call
        const lichessFetchCallsAfterSecondSearch = mockFetch.mock.calls.filter(
            ([url]) => String(url).includes('lichess.org/api/games/user/TestUser')
        );
        expect(lichessFetchCallsAfterSecondSearch).toHaveLength(1);
    });

    it('persists searched users to localStorage', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            text: async () => JSON.stringify(mockLichessGame)
        });

        const { unmount } = render(<UserGamesSearchPanel onSelectGame={mockOnSelectGame} />);

        // Search for a user
        const input = screen.getByTestId('username-input');
        fireEvent.change(input, { target: { value: 'TestUser' } });
        fireEvent.click(screen.getByTestId('search-button'));

        await waitFor(() => {
            expect(screen.getByTestId('tab-lichess:TestUser')).toBeInTheDocument();
        });

        // Unmount to trigger useEffect cleanup (not strictly necessary for this test but good practice)
        unmount();

        // Check localStorage
        const storedUsers = JSON.parse(localStorage.getItem('game-review-searched-users') || '[]');
        expect(storedUsers).toHaveLength(1);
        expect(storedUsers[0].username).toBe('TestUser');
        expect(storedUsers[0].platform).toBe('lichess');

        // Re-render to verify restoration
        render(<UserGamesSearchPanel onSelectGame={mockOnSelectGame} />);
        expect(screen.getByTestId('tab-lichess:TestUser')).toBeInTheDocument();
    });

    it('does not wipe persisted history during initial hydration', async () => {
        localStorage.setItem('game-review-searched-users', JSON.stringify([{
            username: 'PersistedUser',
            platform: 'lichess',
            games: [],
            searchedAt: Date.now(),
        }]));
        localStorage.setItem('game-review-recent-games', JSON.stringify([]));
        localStorageMock.setItem.mockClear();

        render(<UserGamesSearchPanel onSelectGame={mockOnSelectGame} />);

        await waitFor(() => {
            expect(screen.getByTestId('tab-lichess:PersistedUser')).toBeInTheDocument();
        });

        expect(localStorageMock.setItem).not.toHaveBeenCalledWith('game-review-searched-users', '[]');
    });

    it('filters fetched games by time control', async () => {
        const secondLichessGame = {
            ...mockLichessGame,
            id: 'def456',
            perf: 'rapid',
            moves: 'd4 d5 c4 e6',
            pgn: '1. d4 d5 2. c4 e6 *'
        };

        mockFetch.mockResolvedValueOnce({
            ok: true,
            text: async () => `${JSON.stringify(mockLichessGame)}\n${JSON.stringify(secondLichessGame)}`
        });

        render(<UserGamesSearchPanel onSelectGame={mockOnSelectGame} />);

        const input = screen.getByTestId('username-input');
        fireEvent.change(input, { target: { value: 'TestUser' } });
        fireEvent.click(screen.getByTestId('search-button'));

        await waitFor(() => {
            expect(screen.getByTestId('game-item-abc123')).toBeInTheDocument();
            expect(screen.getByTestId('game-item-def456')).toBeInTheDocument();
        });

        expect(screen.getByTestId('tc-filter-all')).toBeInTheDocument();
        expect(screen.getByTestId('tc-filter-blitz')).toBeInTheDocument();
        expect(screen.getByTestId('tc-filter-rapid')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('tc-filter-rapid'));

        await waitFor(() => {
            expect(screen.queryByTestId('game-item-abc123')).not.toBeInTheDocument();
            expect(screen.getByTestId('game-item-def456')).toBeInTheDocument();
        });
    });

    it('filters fetched games by side color', async () => {
        const blackSideGame = {
            ...mockLichessGame,
            id: 'ghi789',
            players: {
                white: { user: { name: 'Opponent' }, rating: 1450, result: 'lose' },
                black: { user: { name: 'TestUser' }, rating: 1500, result: 'win' }
            },
            winner: 'black',
            pgn: '1. d4 Nf6 2. c4 e6 *'
        };

        mockFetch.mockResolvedValueOnce({
            ok: true,
            text: async () => `${JSON.stringify(mockLichessGame)}\n${JSON.stringify(blackSideGame)}`
        });

        render(<UserGamesSearchPanel onSelectGame={mockOnSelectGame} />);

        const input = screen.getByTestId('username-input');
        fireEvent.change(input, { target: { value: 'TestUser' } });
        fireEvent.click(screen.getByTestId('search-button'));

        await waitFor(() => {
            expect(screen.getByTestId('game-item-abc123')).toBeInTheDocument();
            expect(screen.getByTestId('game-item-ghi789')).toBeInTheDocument();
        });

        expect(screen.getByTestId('side-filter-all')).toBeInTheDocument();
        expect(screen.getByTestId('side-filter-white')).toBeInTheDocument();
        expect(screen.getByTestId('side-filter-black')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('side-filter-black'));

        await waitFor(() => {
            expect(screen.queryByTestId('game-item-abc123')).not.toBeInTheDocument();
            expect(screen.getByTestId('game-item-ghi789')).toBeInTheDocument();
        });
    });
});

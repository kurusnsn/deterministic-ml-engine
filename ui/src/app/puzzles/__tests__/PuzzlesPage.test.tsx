/**
 * Unit tests for PuzzlesPage component.
 * Tests empty repertoire state, retry button logic, and info panel rendering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the hooks and APIs
vi.mock('@/hooks/useRepertoires', () => ({
  useSavedRepertoires: vi.fn(),
}));

vi.mock('@/lib/api/puzzle', () => ({
  getNextPuzzle: vi.fn(),
  getUserRating: vi.fn(),
  submitPuzzleResult: vi.fn(),
}));

vi.mock('use-sound', () => ({
  default: () => [vi.fn()],
}));

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

vi.mock('@/app/hooks/useChessDrawing', () => ({
  useChessDrawing: () => ({
    handleMouseDown: vi.fn(),
    handleMouseUp: vi.fn(),
    handleContextMenu: vi.fn(),
    clearDrawings: vi.fn(),
    getCustomArrows: () => [],
    getDrawingSquareStyles: () => ({}),
  }),
}));

import { useSavedRepertoires } from '@/hooks/useRepertoires';
import PuzzlesPage from '../page';

const mockedUseSavedRepertoires = useSavedRepertoires as ReturnType<typeof vi.fn>;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('PuzzlesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(() => 'test-user-id'),
        setItem: vi.fn(),
      },
      writable: true,
    });
  });

  describe('Empty Repertoire State', () => {
    it('shows empty state message when no repertoires exist', async () => {
      mockedUseSavedRepertoires.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      render(<PuzzlesPage />, { wrapper: createWrapper() });

      // Select repertoire mode
      const modeSelect = screen.getByRole('combobox');
      fireEvent.click(modeSelect);

      await waitFor(() => {
        const repertoireOption = screen.getByText('From Repertoire');
        fireEvent.click(repertoireOption);
      });

      // Check for empty state message
      await waitFor(() => {
        expect(screen.getByText('No repertoires imported')).toBeInTheDocument();
      });
    });

    it('shows empty state message when repertoires is undefined', async () => {
      mockedUseSavedRepertoires.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
      });

      render(<PuzzlesPage />, { wrapper: createWrapper() });

      // Select repertoire mode
      const modeSelect = screen.getByRole('combobox');
      fireEvent.click(modeSelect);

      await waitFor(() => {
        const repertoireOption = screen.getByText('From Repertoire');
        fireEvent.click(repertoireOption);
      });

      // Check for empty state message
      await waitFor(() => {
        expect(screen.getByText('No repertoires imported')).toBeInTheDocument();
      });
    });

    it('shows repertoire dropdowns when repertoires exist', async () => {
      mockedUseSavedRepertoires.mockReturnValue({
        data: [
          { id: '1', name: 'My Repertoire', eco_codes: ['B20'], openings: [] },
        ],
        isLoading: false,
        error: null,
      });

      render(<PuzzlesPage />, { wrapper: createWrapper() });

      // Select repertoire mode
      const modeSelect = screen.getByRole('combobox');
      fireEvent.click(modeSelect);

      await waitFor(() => {
        const repertoireOption = screen.getByText('From Repertoire');
        fireEvent.click(repertoireOption);
      });

      // Check that dropdowns are shown instead of empty state
      await waitFor(() => {
        expect(screen.queryByText('No repertoires imported')).not.toBeInTheDocument();
        expect(screen.getByText('Select Repertoires')).toBeInTheDocument();
      });
    });

    it('disables Start Training button when no repertoires in repertoire mode', async () => {
      mockedUseSavedRepertoires.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      render(<PuzzlesPage />, { wrapper: createWrapper() });

      // Select repertoire mode
      const modeSelect = screen.getByRole('combobox');
      fireEvent.click(modeSelect);

      await waitFor(() => {
        const repertoireOption = screen.getByText('From Repertoire');
        fireEvent.click(repertoireOption);
      });

      // Check that Start Training button is disabled
      await waitFor(() => {
        const startButton = screen.getByRole('button', { name: /Start Training/i });
        expect(startButton).toBeDisabled();
      });
    });
  });

  describe('Info Panel Rendering', () => {
    it('renders info panel with placeholder values when no puzzle loaded', () => {
      mockedUseSavedRepertoires.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      render(<PuzzlesPage />, { wrapper: createWrapper() });

      // Check for info panel labels
      expect(screen.getByText('ID')).toBeInTheDocument();
      expect(screen.getByText('Rating')).toBeInTheDocument();
      expect(screen.getByText('Themes')).toBeInTheDocument();
      expect(screen.getByText('Opening')).toBeInTheDocument();
    });

    it('renders info panel with bordered styling', () => {
      mockedUseSavedRepertoires.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      const { container } = render(<PuzzlesPage />, { wrapper: createWrapper() });

      // Check for the styled info panel container
      const infoPanel = container.querySelector('.border.border-slate-200.rounded-lg');
      expect(infoPanel).toBeInTheDocument();
    });
  });
});

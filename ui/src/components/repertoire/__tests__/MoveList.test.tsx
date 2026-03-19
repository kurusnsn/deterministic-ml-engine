/**
 * Unit tests for MoveList component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MoveList from '../MoveList';
import { MoveAnalysis, GeneratedPuzzle } from '@/types/repertoire';

describe('MoveList', () => {
  const mockMoves: MoveAnalysis[] = [
    {
      ply: 1,
      move: 'e4',
      fen_before: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      fen_after: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      eval: { cp: 50 },
      eval_delta: 50,
      mistake_type: null,
      heuristics: {
        fork: false,
        pin: false,
        skewer: false,
        xray: false,
        hanging_piece: false,
        trapped_piece: false,
        overloaded_piece: false,
        discovered_attack: false,
        weak_squares: [],
        outposts: [],
        king_safety_drop: false,
        pawn_structure: {
          isolated_pawns: [],
          doubled_pawns: [],
          passed_pawns: []
        },
        mobility_score: 20
      },
      game_id: '1'
    },
    {
      ply: 3,
      move: 'Nf3',
      fen_before: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      fen_after: 'rnbqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 1',
      eval: { cp: -200 },
      eval_delta: -250,
      mistake_type: 'blunder',
      heuristics: {
        fork: true,
        pin: false,
        skewer: false,
        xray: false,
        hanging_piece: true,
        trapped_piece: false,
        overloaded_piece: false,
        discovered_attack: false,
        weak_squares: ['d4'],
        outposts: [],
        king_safety_drop: false,
        pawn_structure: {
          isolated_pawns: [],
          doubled_pawns: [],
          passed_pawns: []
        },
        mobility_score: 15
      },
      game_id: '1'
    }
  ];

  const mockPuzzles: GeneratedPuzzle[] = [
    {
      puzzle_id: 'pz_1_3',
      game_id: '1',
      move_ply: 3,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      side_to_move: 'black',
      best_move: 'e5',
      theme: ['fork', 'hanging_piece'],
      mistake_move: 'Nf3'
    }
  ];

  it('renders move list', () => {
    render(
      <MoveList
        moves={mockMoves}
        puzzles={mockPuzzles}
        onPuzzleClick={vi.fn()}
      />
    );

    expect(screen.getByText(/Move Analysis/i)).toBeInTheDocument();
    expect(screen.getByText(/e4/i)).toBeInTheDocument();
    expect(screen.getByText(/Nf3/i)).toBeInTheDocument();
  });

  it('highlights blunders', () => {
    render(
      <MoveList
        moves={mockMoves}
        puzzles={mockPuzzles}
        onPuzzleClick={vi.fn()}
      />
    );

    // Should show blunder indicator for move 3
    expect(screen.getByText(/blunder/i)).toBeInTheDocument();
  });

  it('displays heuristics', () => {
    render(
      <MoveList
        moves={mockMoves}
        puzzles={mockPuzzles}
        onPuzzleClick={vi.fn()}
      />
    );

    // Should show fork and hanging piece heuristics
    expect(screen.getByText(/fork/i)).toBeInTheDocument();
    expect(screen.getByText(/hanging_piece/i)).toBeInTheDocument();
  });

  it('links to puzzles', () => {
    const onPuzzleClick = vi.fn();
    render(
      <MoveList
        moves={mockMoves}
        puzzles={mockPuzzles}
        onPuzzleClick={onPuzzleClick}
      />
    );

    // Should show puzzle link for blunder move
    const puzzleLink = screen.getByText(/View Puzzle/i);
    expect(puzzleLink).toBeInTheDocument();
  });

  it('renders empty state when no moves', () => {
    render(
      <MoveList
        moves={[]}
        puzzles={[]}
        onPuzzleClick={vi.fn()}
      />
    );

    expect(screen.getByText(/No moves to display/i)).toBeInTheDocument();
  });
});







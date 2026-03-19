/**
 * Unit tests for EvalSwingChart component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EvalSwingChart from '../EvalSwingChart';
import { ChartsAdditional } from '@/types/repertoire';

describe('EvalSwingChart', () => {
  const mockData: ChartsAdditional['eval_swing_chart'] = [
    { ply: 1, eval: 0.5 },
    { ply: 2, eval: -0.3 },
    { ply: 3, eval: 0.8 }
  ];

  it('renders with data', () => {
    render(<EvalSwingChart data={mockData} moves={[]} />);

    expect(screen.getByText(/Evaluation Swing Over Game/i)).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    render(<EvalSwingChart data={[]} moves={[]} />);

    expect(screen.getByText(/No evaluation data available/i)).toBeInTheDocument();
  });

  it('renders empty state when data is undefined', () => {
    render(<EvalSwingChart data={undefined} moves={[]} />);

    expect(screen.getByText(/No evaluation data available/i)).toBeInTheDocument();
  });
});







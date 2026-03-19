/**
 * Unit tests for TacticalInsightsCard component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TacticalInsightsCard from '../TacticalInsightsCard';
import { RepertoireInsight, WeakLine } from '@/types/repertoire';

describe('TacticalInsightsCard', () => {
  const mockInsights: RepertoireInsight[] = [
    {
      type: 'warning',
      message: 'Test warning insight',
      priority: 'high',
      opening_eco: 'B20'
    },
    {
      type: 'suggestion',
      message: 'Test suggestion',
      priority: 'medium'
    }
  ];

  const mockWeakLines: WeakLine[] = [
    {
      id: 'wl_1',
      eco: 'B20',
      line: ['e4', 'e5', 'Nf3'],
      games_count: 5,
      winrate: 0.3,
      avg_eval_swing: -0.8,
      common_mistakes: ['blunder'],
      tactical_issues: ['fork'],
      puzzle_ids: []
    }
  ];

  it('renders with insights', () => {
    render(
      <TacticalInsightsCard
        insights={mockInsights}
        weak_lines={mockWeakLines}
        engine_analysis={{ moves: [] }}
      />
    );

    expect(screen.getByText(/Key Tactical Insights/i)).toBeInTheDocument();
    expect(screen.getByText(/Test warning insight/i)).toBeInTheDocument();
  });

  it('renders empty state when no insights', () => {
    render(
      <TacticalInsightsCard
        insights={[]}
        weak_lines={[]}
        engine_analysis={{ moves: [] }}
      />
    );

    expect(screen.getByText(/No specific tactical insights/i)).toBeInTheDocument();
  });

  it('displays weak lines count', () => {
    render(
      <TacticalInsightsCard
        insights={[]}
        weak_lines={mockWeakLines}
        engine_analysis={{ moves: [] }}
      />
    );

    expect(screen.getByText(/1 Weak Lines Detected/i)).toBeInTheDocument();
  });

  it('filters high priority warnings', () => {
    const insights: RepertoireInsight[] = [
      { type: 'warning', message: 'High priority', priority: 'high' },
      { type: 'warning', message: 'Low priority', priority: 'low' }
    ];

    render(
      <TacticalInsightsCard
        insights={insights}
        weak_lines={[]}
        engine_analysis={{ moves: [] }}
      />
    );

    expect(screen.getByText(/High priority/i)).toBeInTheDocument();
    expect(screen.queryByText(/Low priority/i)).not.toBeInTheDocument();
  });
});







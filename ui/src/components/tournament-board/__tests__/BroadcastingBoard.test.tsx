import { describe, it, expect } from 'vitest';
import { render, screen } from '@/__tests__/test-utils';
import BroadcastingBoard from '../BroadcastingBoard';

describe('BroadcastingBoard', () => {
  it('renders the chessboard surface with provided fen', () => {
    const { container } = render(<BroadcastingBoard fen="8/8/8/8/8/8/8/K6k w - - 0 1" />);

    const wrapper = screen.getByTestId('broadcast-board-wrapper');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.childElementCount).toBeGreaterThan(0);
  });

  it('renders the evaluation bar alongside the board', () => {
    const { container } = render(<BroadcastingBoard />);
    const evalContainer = container.querySelector('.w-8');
    expect(evalContainer).toBeInTheDocument();
  });

  it('renders navigation controls for playback', () => {
    render(<BroadcastingBoard />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(5);
  });

  it('shows hover controls container', () => {
    const { container } = render(<BroadcastingBoard />);
    const hoverControls = container.querySelector('[class*="opacity-0"]');
    expect(hoverControls).toBeInTheDocument();
  });
});

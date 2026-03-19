import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/__tests__/test-utils'
import CommentaryCard from '../CommentaryCard'

/**
 * Unit Tests: CommentaryCard Component
 * 
 * Tests the AI commentary panel including:
 * - Commentary sections display
 * - Action buttons
 * - Scrollable content
 */

describe('CommentaryCard', () => {
  describe('header', () => {
    it('renders AI Commentary title', () => {
      render(<CommentaryCard />)
      
      expect(screen.getByText('AI Commentary')).toBeInTheDocument()
    })

    it('renders sparkles icon with title', () => {
      const { container } = render(<CommentaryCard />)
      
      // Sparkles icon should be present
      const icon = container.querySelector('svg')
      expect(icon).toBeInTheDocument()
    })
  })

  describe('commentary sections', () => {
    it('renders Position Summary section', () => {
      render(<CommentaryCard />)
      
      expect(screen.getByText('Position Summary')).toBeInTheDocument()
      expect(screen.getByText(/White has a slight space advantage/)).toBeInTheDocument()
    })

    it('renders Move Explanation section', () => {
      render(<CommentaryCard />)
      
      expect(screen.getByText('Move Explanation')).toBeInTheDocument()
      expect(screen.getByText(/Re8 prepares to meet Bg3/)).toBeInTheDocument()
    })

    it('renders Alternative Lines section', () => {
      render(<CommentaryCard />)
      
      expect(screen.getByText('Alternative Lines')).toBeInTheDocument()
      expect(screen.getByText(/b4 was also possible/)).toBeInTheDocument()
    })

    it('renders Critical Moment section', () => {
      render(<CommentaryCard />)
      
      expect(screen.getByText('Critical Moment')).toBeInTheDocument()
      expect(screen.getByText(/The next few moves will determine/)).toBeInTheDocument()
    })
  })

  describe('section styling', () => {
    it('Position Summary has muted background', () => {
      const { container } = render(<CommentaryCard />)
      
      const summarySection = container.querySelector('.bg-muted\\/50')
      expect(summarySection).toBeInTheDocument()
    })

    it('Critical Moment has warning background', () => {
      const { container } = render(<CommentaryCard />)
      
      // Red warning background
      const warningSection = container.querySelector('[class*="bg-red"]')
      expect(warningSection).toBeInTheDocument()
    })
  })

  describe('action buttons', () => {
    it('renders Explain Move button', () => {
      render(<CommentaryCard />)
      
      expect(screen.getByRole('button', { name: 'Explain Move' })).toBeInTheDocument()
    })

    it('renders Best Line button', () => {
      render(<CommentaryCard />)
      
      expect(screen.getByRole('button', { name: 'Best Line' })).toBeInTheDocument()
    })

    it('renders Why Mistake button', () => {
      render(<CommentaryCard />)
      
      expect(screen.getByRole('button', { name: 'Why Mistake?' })).toBeInTheDocument()
    })

    it('action buttons are clickable', () => {
      render(<CommentaryCard />)
      
      const explainButton = screen.getByRole('button', { name: 'Explain Move' })
      
      // Should not throw
      fireEvent.click(explainButton)
    })
  })

  describe('scroll behavior', () => {
    it('renders scrollable content area', () => {
      const { container } = render(<CommentaryCard />)
      
      // ScrollArea component
      const scrollArea = container.querySelector('[class*="overflow-hidden"]')
      expect(scrollArea).toBeInTheDocument()
    })
  })

  describe('alternative lines list', () => {
    it('renders alternative lines as list items', () => {
      render(<CommentaryCard />)
      
      // Multiple alternatives should be listed
      expect(screen.getByText(/b4 was also possible/)).toBeInTheDocument()
      expect(screen.getByText(/c5.*complicates/)).toBeInTheDocument()
    })
  })
})




import { describe, it, expect } from 'vitest'
import { render, screen } from '@/__tests__/test-utils'
import ClockCard from '../ClockCard'

/**
 * Unit Tests: ClockCard Component
 * 
 * Tests the player clock display including:
 * - Player names and ratings
 * - Clock times
 * - Active player indicator
 * - Progress bars
 */

describe('ClockCard', () => {
  describe('player display', () => {
    it('renders both player names', () => {
      render(<ClockCard />)
      
      expect(screen.getByText('Magnus Carlsen')).toBeInTheDocument()
      expect(screen.getByText('Hikaru Nakamura')).toBeInTheDocument()
    })

    it('renders player ratings', () => {
      render(<ClockCard />)
      
      expect(screen.getByText('2830')).toBeInTheDocument()
      expect(screen.getByText('2789')).toBeInTheDocument()
    })
  })

  describe('clock times', () => {
    it('displays white player time', () => {
      render(<ClockCard />)
      
      expect(screen.getByText('1:04:32')).toBeInTheDocument()
    })

    it('displays black player time', () => {
      render(<ClockCard />)
      
      expect(screen.getByText('0:58:15')).toBeInTheDocument()
    })

    it('times have monospace font styling', () => {
      const { container } = render(<ClockCard />)
      
      const timers = container.querySelectorAll('.font-mono')
      expect(timers.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('active player indicator', () => {
    it('shows clock icon with animation for player on move', () => {
      const { container } = render(<ClockCard />)
      
      // Animated clock icon for active player
      const animatedIcon = container.querySelector('.animate-pulse')
      expect(animatedIcon).toBeInTheDocument()
    })

    it('white section has full opacity when white is on move', () => {
      const { container } = render(<ClockCard />)
      
      // Look for opacity-100 class on white section
      const fullOpacitySections = container.querySelectorAll('.opacity-100')
      expect(fullOpacitySections.length).toBeGreaterThan(0)
    })

    it('black section has reduced opacity when white is on move', () => {
      const { container } = render(<ClockCard />)
      
      // Look for opacity-70 class on black section
      const reducedOpacitySections = container.querySelectorAll('.opacity-70')
      expect(reducedOpacitySections.length).toBeGreaterThan(0)
    })
  })

  describe('progress bars', () => {
    it('renders progress bars for time remaining', () => {
      const { container } = render(<ClockCard />)
      
      // Progress bars with h-1 class
      const progressBars = container.querySelectorAll('.h-1')
      expect(progressBars.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('piece color indicators', () => {
    it('renders white piece indicator circle', () => {
      const { container } = render(<ClockCard />)
      
      // White piece circle (bg-white)
      const whiteIndicator = container.querySelector('.bg-white')
      expect(whiteIndicator).toBeInTheDocument()
    })

    it('renders black piece indicator circle', () => {
      const { container } = render(<ClockCard />)
      
      // Black piece circle (bg-black)
      const blackIndicator = container.querySelector('.bg-black')
      expect(blackIndicator).toBeInTheDocument()
    })
  })
})




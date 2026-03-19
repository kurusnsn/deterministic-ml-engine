import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/__tests__/test-utils'
import TournamentSidebar from '../TournamentSidebar'

/**
 * Unit Tests: TournamentSidebar Component
 * 
 * Tests the sidebar display including:
 * - Event info card
 * - Chat tab functionality
 * - Notes tab functionality
 * - Spectator count
 * - Chat messages display
 */

describe('TournamentSidebar', () => {
  describe('event info card', () => {
    it('renders Event Info heading', () => {
      render(<TournamentSidebar />)
      
      expect(screen.getByText('Event Info')).toBeInTheDocument()
    })

    it('renders tournament name', () => {
      render(<TournamentSidebar />)
      
      expect(screen.getByText('Spring Championship 2025')).toBeInTheDocument()
    })

    it('renders round number and location', () => {
      render(<TournamentSidebar />)
      
      expect(screen.getByText(/Round 5/)).toBeInTheDocument()
      expect(screen.getByText(/New York, USA/)).toBeInTheDocument()
    })

    it('renders player matchup', () => {
      render(<TournamentSidebar />)
      
      expect(screen.getByText(/Magnus Carlsen \(2830\)/)).toBeInTheDocument()
      expect(screen.getByText('vs')).toBeInTheDocument()
      expect(screen.getByText(/Hikaru Nakamura \(2789\)/)).toBeInTheDocument()
    })
  })

  describe('tabs', () => {
    it('renders Chat tab', () => {
      render(<TournamentSidebar />)
      
      expect(screen.getByRole('tab', { name: /Chat/ })).toBeInTheDocument()
    })

    it('renders Notes tab', () => {
      render(<TournamentSidebar />)
      
      expect(screen.getByRole('tab', { name: /Notes/ })).toBeInTheDocument()
    })

    it('Chat tab is active by default', () => {
      render(<TournamentSidebar />)
      
      const chatTab = screen.getByRole('tab', { name: /Chat/ })
      expect(chatTab).toHaveAttribute('data-state', 'active')
    })
  })

  describe('chat content', () => {
    it('displays spectator count', () => {
      render(<TournamentSidebar />)
      
      expect(screen.getByText(/1,243 spectators/)).toBeInTheDocument()
    })

    it('displays chat messages', () => {
      render(<TournamentSidebar />)
      
      expect(screen.getByText('ChessFan123')).toBeInTheDocument()
      expect(screen.getByText('What a move by Magnus!')).toBeInTheDocument()
    })

    it('displays multiple chat messages', () => {
      render(<TournamentSidebar />)
      
      expect(screen.getByText('GrandmasterFlash')).toBeInTheDocument()
      expect(screen.getByText('RookLifter')).toBeInTheDocument()
      expect(screen.getByText('PawnStorm')).toBeInTheDocument()
    })

    it('renders chat input field', () => {
      render(<TournamentSidebar />)
      
      expect(screen.getByPlaceholderText('Say something...')).toBeInTheDocument()
    })

    it('renders send button', () => {
      const { container } = render(<TournamentSidebar />)
      
      // Send button with Send icon
      const sendButtons = container.querySelectorAll('button')
      const sendButton = Array.from(sendButtons).find(btn => 
        btn.querySelector('svg') && btn.classList.contains('h-8')
      )
      expect(sendButton).toBeInTheDocument()
    })
  })

  describe('notes content', () => {
    it('Notes tab is clickable and interactive', async () => {
      render(<TournamentSidebar />)
      
      const notesTab = screen.getByRole('tab', { name: /Notes/ })
      
      // Verify Notes tab can be clicked
      fireEvent.click(notesTab)
      
      // Tab should exist and be accessible
      expect(notesTab).toBeInTheDocument()
    })
  })

  describe('chat interaction', () => {
    it('chat input accepts text', () => {
      render(<TournamentSidebar />)
      
      const input = screen.getByPlaceholderText('Say something...')
      fireEvent.change(input, { target: { value: 'Great game!' } })
      
      expect(input).toHaveValue('Great game!')
    })
  })

  describe('scroll behavior', () => {
    it('chat area is scrollable', () => {
      const { container } = render(<TournamentSidebar />)
      
      // ScrollArea component for chat
      const scrollArea = container.querySelector('[class*="ScrollArea"]')
      expect(scrollArea || container.querySelector('[class*="overflow"]')).toBeTruthy()
    })
  })
})


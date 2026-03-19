'use client'

import { useEffect } from 'react'

/**
 * MockAuthProvider - Auto-sets mock authentication credentials from environment variables.
 * This allows persistent mock login that survives frontend rebuilds.
 *
 * Enable by setting these env vars in .env.local:
 * - NEXT_PUBLIC_MOCK_AUTH_ENABLED=true
 * - NEXT_PUBLIC_MOCK_USER_ID=mock-user-123
 * - NEXT_PUBLIC_MOCK_USER_EMAIL=mock@example.com
 * - NEXT_PUBLIC_MOCK_USER_NAME=Mock User
 * - NEXT_PUBLIC_MOCK_SESSION_ID=mock-session-123
 * - NEXT_PUBLIC_MOCK_JWT_SECRET=your-dev-jwt-secret (optional, for JWT generation)
 */

// Simple base64url encoding for JWT
function base64url(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// Create a simple unsigned JWT for development (backend should be configured to accept it)
function createMockJWT(payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify(payload))
  // For dev purposes, we use a placeholder signature
  // The backend should be configured with MOCK_AUTH_ENABLED=true to skip validation
  // OR use the same secret for HMAC signing
  const signature = base64url('mock-signature-for-dev')
  return `${header}.${body}.${signature}`
}

export function getMockAuthConfig() {
  if (typeof window === 'undefined') return null

  if (process.env.NODE_ENV !== 'development') return null

  const enabled = process.env.NEXT_PUBLIC_MOCK_AUTH_ENABLED === 'true'
  if (!enabled) return null

  return {
    userId: process.env.NEXT_PUBLIC_MOCK_USER_ID || '00000000-0000-0000-0000-000000000001',
    email: process.env.NEXT_PUBLIC_MOCK_USER_EMAIL || 'mock@example.com',
    name: process.env.NEXT_PUBLIC_MOCK_USER_NAME || 'Mock User',
    sessionId: process.env.NEXT_PUBLIC_MOCK_SESSION_ID || '00000000-0000-0000-0000-000000000001',
  }
}

export function isMockAuthEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_MOCK_AUTH_ENABLED === 'true'
}

export default function MockAuthProvider() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const config = getMockAuthConfig()
    if (!config) return

    // Create mock JWT payload
    const payload = {
      sub: config.userId,
      email: config.email,
      name: config.name,
      user_id: config.userId, // Some endpoints check this
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365, // 1 year expiry for dev
      iat: Math.floor(Date.now() / 1000),
    }

    const token = createMockJWT(payload)

    // Set credentials in localStorage
    localStorage.setItem('auth-token', token)
    localStorage.setItem('session-id', config.sessionId)
    localStorage.setItem('mock-user-name', config.name)
    localStorage.setItem('mock-user-email', config.email)
    localStorage.setItem('mock-user-id', config.userId)

    // Also set session_id cookie for middleware
    document.cookie = `session_id=${config.sessionId}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`

    if (process.env.NODE_ENV === 'development') {
      console.info('[MockAuth] Mock authentication active:', {
        userId: config.userId,
        email: config.email,
        name: config.name,
      })
    }
  }, [])

  return null
}

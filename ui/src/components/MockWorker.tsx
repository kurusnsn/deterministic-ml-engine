'use client'

import { useEffect } from 'react'

export default function MockWorker() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    if (process.env.NEXT_PUBLIC_ENABLE_MOCKS !== 'true') {
      // Clean up stale MSW registrations so they cannot interfere with Next chunk requests.
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => {
            registrations.forEach((registration) => {
              const scriptURL =
                registration.active?.scriptURL ||
                registration.waiting?.scriptURL ||
                registration.installing?.scriptURL ||
                ''

              if (scriptURL.includes('/mockServiceWorker.js')) {
                registration.unregister()
              }
            })
          })
          .catch(() => {})
      }
      return
    }

    let cancelled = false
    let activeWorker: { stop: () => void } | undefined

    const start = async () => {
      try {
        const { worker } = await import('@/mocks')
        activeWorker = worker
        if (!cancelled) {
          await worker.start({
            quiet: true,
            onUnhandledRequest: 'bypass',
            serviceWorker: {
              url: '/mockServiceWorker.js',
            },
          })
          if (process.env.NODE_ENV === 'development') {
            console.info('[msw] mock service worker active')
          }
        }
      } catch (err) {
        console.warn('[msw] failed to start mock worker', err)
      }
    }

    start()

    return () => {
      cancelled = true
      activeWorker?.stop()
    }
  }, [])

  return null
}

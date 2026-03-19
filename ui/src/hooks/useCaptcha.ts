'use client'
import { useState, useCallback, useEffect, useRef } from 'react'

/**
 * Turnstile types for TypeScript
 */
declare global {
    interface Window {
        turnstile?: {
            render: (container: string | HTMLElement, options: TurnstileOptions) => string
            getResponse: (widgetId: string) => string | undefined
            reset: (widgetId: string) => void
            remove: (widgetId: string) => void
        }
    }
}

interface TurnstileOptions {
    sitekey: string
    callback: (token: string) => void
    'error-callback'?: () => void
    'expired-callback'?: () => void
    execution?: 'render' | 'execute'
    appearance?: 'always' | 'execute' | 'interaction-only'
}

/**
 * Hook for Cloudflare Turnstile invisible CAPTCHA.
 * 
 * Usage:
 * ```tsx
 * const { getToken, loading, error, reset } = useCaptcha()
 * 
 * const handleSubmit = async () => {
 *   const token = await getToken()
 *   if (!token) return // CAPTCHA failed
 *   
 *   // Verify with backend before auth
 *   const verified = await verifyCaptcha(token)
 *   if (!verified) return
 *   
 *   // Proceed with auth...
 * }
 * ```
 */
export function useCaptcha() {
    const [token, setToken] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const widgetIdRef = useRef<string | null>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const scriptLoadedRef = useRef(false)

    /**
     * Load Turnstile script lazily (only when needed)
     */
    const loadScript = useCallback((): Promise<void> => {
        // Already loaded
        if (window.turnstile) return Promise.resolve()

        // Script already being loaded
        if (scriptLoadedRef.current) {
            return new Promise((resolve) => {
                const check = setInterval(() => {
                    if (window.turnstile) {
                        clearInterval(check)
                        resolve()
                    }
                }, 100)
            })
        }

        scriptLoadedRef.current = true

        return new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
            script.async = true
            script.onload = () => resolve()
            script.onerror = () => {
                scriptLoadedRef.current = false
                reject(new Error('Failed to load Turnstile script'))
            }
            document.head.appendChild(script)
        })
    }, [])

    /**
     * Get a CAPTCHA token (invisible, no user interaction)
     * Returns null if CAPTCHA fails
     */
    const getToken = useCallback(async (): Promise<string | null> => {
        setLoading(true)
        setError(null)

        const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

        // Skip CAPTCHA in development if no site key
        if (!siteKey) {
            console.warn('[CAPTCHA] No NEXT_PUBLIC_TURNSTILE_SITE_KEY set, skipping CAPTCHA')
            setLoading(false)
            return 'dev-bypass-token'
        }

        try {
            await loadScript()

            if (!window.turnstile) {
                throw new Error('Turnstile failed to initialize')
            }

            // Create invisible container if needed
            if (!containerRef.current) {
                containerRef.current = document.createElement('div')
                containerRef.current.style.display = 'none'
                containerRef.current.id = 'turnstile-container'
                document.body.appendChild(containerRef.current)
            }

            // Remove previous widget if exists
            if (widgetIdRef.current) {
                try {
                    window.turnstile.remove(widgetIdRef.current)
                } catch {
                    // Ignore errors from removing non-existent widget
                }
                widgetIdRef.current = null
            }

            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    setError('CAPTCHA verification timed out')
                    setLoading(false)
                    reject(new Error('CAPTCHA timeout'))
                }, 30000) // 30s timeout

                widgetIdRef.current = window.turnstile!.render(containerRef.current!, {
                    sitekey: siteKey,
                    callback: (newToken) => {
                        clearTimeout(timeoutId)
                        setToken(newToken)
                        setLoading(false)
                        resolve(newToken)
                    },
                    'error-callback': () => {
                        clearTimeout(timeoutId)
                        setError('CAPTCHA verification failed')
                        setLoading(false)
                        reject(new Error('CAPTCHA failed'))
                    },
                    'expired-callback': () => {
                        clearTimeout(timeoutId)
                        setError('CAPTCHA expired, please try again')
                        setLoading(false)
                        reject(new Error('CAPTCHA expired'))
                    },
                    execution: 'render',
                    appearance: 'execute', // Invisible mode
                })
            })
        } catch (err) {
            const message = err instanceof Error ? err.message : 'CAPTCHA error'
            setError(message)
            setLoading(false)
            return null
        }
    }, [loadScript])

    /**
     * Reset CAPTCHA state (call after failed attempt or before retry)
     */
    const reset = useCallback(() => {
        if (widgetIdRef.current && window.turnstile) {
            try {
                window.turnstile.reset(widgetIdRef.current)
            } catch {
                // Ignore errors from resetting non-existent widget
            }
        }
        setToken(null)
        setError(null)
    }, [])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (widgetIdRef.current && window.turnstile) {
                try {
                    window.turnstile.remove(widgetIdRef.current)
                } catch {
                    // Ignore cleanup errors
                }
            }
            if (containerRef.current) {
                containerRef.current.remove()
            }
        }
    }, [])

    return { token, loading, error, getToken, reset }
}

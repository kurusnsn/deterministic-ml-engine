'use client'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback, useRef } from 'react'
import { getSessionId } from '@/lib/session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Check, X, Loader2, Sparkles, User, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trackEvent, AnalyticsEvents } from '@/components/PostHogProvider'

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway'

interface UsernameCheckResult {
    available: boolean
    valid: boolean
    error: string | null
    suggestions: string[]
    similar_usernames?: string[]
}

export default function UsernameSelectionPage() {
    const [username, setUsername] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [checking, setChecking] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [checkResult, setCheckResult] = useState<UsernameCheckResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [loadingSuggestions, setLoadingSuggestions] = useState(true)

    const router = useRouter()
    const { data: session } = useSession()
    const hasTrackedSignup = useRef(false)

    // Track signup for OAuth users (they land here after OAuth callback)
    useEffect(() => {
        if (session?.user?.id && !hasTrackedSignup.current) {
            // This page is only shown to new users who need to set a username
            // If they're here, they just signed up via OAuth
            trackEvent(AnalyticsEvents.SIGNUP_COMPLETED, {
                method: 'oauth',
            })
            hasTrackedSignup.current = true
        }
    }, [session?.user?.id])

    // Load initial suggestions on mount
    useEffect(() => {
        const loadSuggestions = async () => {
            try {
                const headers: Record<string, string> = {}
                const sid = getSessionId()
                if (sid) headers['x-session-id'] = sid

                const response = await fetch(`${GATEWAY_URL}/users/username/suggestions`, { headers })

                if (response.ok) {
                    const data = await response.json()
                    setSuggestions(data.suggestions || [])
                    // Pre-fill with first suggestion
                    if (data.suggestions?.[0]) {
                        setUsername(data.suggestions[0])
                    }
                }
            } catch (e) {
                console.error('Failed to load suggestions:', e)
            } finally {
                setLoadingSuggestions(false)
            }
        }

        loadSuggestions()
    }, [router])

    // Debounced username check
    useEffect(() => {
        if (!username || username.length < 3) {
            setCheckResult(null)
            return
        }

        const timer = setTimeout(async () => {
            setChecking(true)
            try {
                const headers: Record<string, string> = {}
                const sid = getSessionId()
                if (sid) headers['x-session-id'] = sid

                const response = await fetch(
                    `${GATEWAY_URL}/users/username/check?username=${encodeURIComponent(username)}`,
                    { headers }
                )

                if (response.ok) {
                    const result = await response.json()
                    setCheckResult(result)
                    if (result.suggestions?.length > 0) {
                        setSuggestions(result.suggestions)
                    }
                }
            } catch (e) {
                console.error('Username check failed:', e)
            } finally {
                setChecking(false)
            }
        }, 500)

        return () => clearTimeout(timer)
    }, [username])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!checkResult?.available || !checkResult?.valid) {
            return
        }

        setSubmitting(true)
        setError(null)

        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' }
            const sid = getSessionId()
            if (sid) headers['x-session-id'] = sid

            const response = await fetch(`${GATEWAY_URL}/users/username`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    username: username.trim(),
                    display_name: displayName.trim() || null,
                }),
            })

            if (response.ok) {
                // Success! Redirect to profile or home
                router.push('/profile')
            } else if (response.status === 409) {
                // Username collision
                const data = await response.json()
                setError('This username was just taken. Please try one of the suggestions.')
                if (data.detail?.suggestions) {
                    setSuggestions(data.detail.suggestions)
                }
            } else {
                const data = await response.json()
                setError(data.detail || 'Failed to set username')
            }
        } catch (e) {
            console.error('Failed to set username:', e)
            setError('An error occurred. Please try again.')
        } finally {
            setSubmitting(false)
        }
    }

    const selectSuggestion = useCallback((suggestion: string) => {
        setUsername(suggestion)
        setCheckResult(null) // Will trigger re-check
    }, [])

    const getStatusIcon = () => {
        if (checking) {
            return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        }
        if (!checkResult) return null
        if (checkResult.available && checkResult.valid) {
            return <Check className="h-4 w-4 text-green-500" />
        }
        return <X className="h-4 w-4 text-red-500" />
    }

    const getStatusMessage = () => {
        if (!username) return null
        if (username.length < 3) {
            return <span className="text-muted-foreground text-sm">Username must be at least 3 characters</span>
        }
        if (checking) {
            return <span className="text-muted-foreground text-sm">Checking availability...</span>
        }
        if (!checkResult) return null
        if (checkResult.available && checkResult.valid) {
            return <span className="text-green-600 dark:text-green-400 text-sm">Username is available!</span>
        }
        return <span className="text-red-600 dark:text-red-400 text-sm">{checkResult.error}</span>
    }

    return (
        <div className="min-h-screen w-full flex items-center justify-center px-4 py-12 bg-gradient-to-b from-zinc-100 to-white dark:from-zinc-950 dark:to-zinc-900">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800 flex items-center justify-center">
                        <User className="h-8 w-8 text-zinc-600 dark:text-zinc-300" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">Choose your username</h1>
                    <p className="text-muted-foreground mt-2">
                        This will be your unique identity on ChessVector
                    </p>
                </div>

                {/* Form Card */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-lg p-6">
                    {error && (
                        <div
                            id="username-error"
                            role="alert"
                            className="mb-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg flex items-start gap-2"
                        >
                            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Username Input */}
                        <div className="space-y-2">
                            <Label htmlFor="username" id="username-label">Username</Label>
                            <div className="relative">
                                <Input
                                    id="username"
                                    type="text"
                                    aria-labelledby="username-label"
                                    aria-describedby={
                                        error
                                            ? "username-error username-status username-help"
                                            : "username-status username-help"
                                    }
                                    aria-invalid={Boolean(error)}
                                    placeholder="Enter your username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                                    maxLength={20}
                                    disabled={submitting}
                                    className={cn(
                                        "pr-10",
                                        checkResult?.available && checkResult?.valid && "border-green-500 focus-visible:ring-green-500",
                                        checkResult && (!checkResult.available || !checkResult.valid) && "border-red-500 focus-visible:ring-red-500"
                                    )}
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    {getStatusIcon()}
                                </div>
                            </div>
                            <div id="username-status" role="status" className="min-h-[1.25rem]">
                                {getStatusMessage()}
                            </div>
                            <p id="username-help" className="text-xs text-muted-foreground">
                                3-20 characters. Letters, numbers, and underscores only.
                            </p>
                        </div>

                        {/* Suggestions */}
                        {(suggestions.length > 0 || loadingSuggestions) && (
                            <div className="space-y-2">
                                <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Suggested usernames
                                </Label>
                                {loadingSuggestions ? (
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading suggestions...
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {suggestions.map((suggestion) => (
                                            <button
                                                key={suggestion}
                                                type="button"
                                                onClick={() => selectSuggestion(suggestion)}
                                                className={cn(
                                                    "px-3 py-1.5 text-sm rounded-full border transition-colors",
                                                    username === suggestion
                                                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 border-transparent"
                                                        : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                                )}
                                            >
                                                {suggestion}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Display Name (Optional) */}
                        <div className="space-y-2">
                            <Label htmlFor="displayName" id="display-name-label">
                                Display Name <span className="text-muted-foreground">(optional)</span>
                            </Label>
                            <Input
                                id="displayName"
                                type="text"
                                aria-labelledby="display-name-label"
                                aria-describedby="display-name-help"
                                placeholder="How should we call you?"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                maxLength={50}
                                disabled={submitting}
                            />
                            <p id="display-name-help" className="text-xs text-muted-foreground">
                                This can be your real name or nickname. You can change it later.
                            </p>
                        </div>

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            className="w-full"
                            size="lg"
                            disabled={!checkResult?.available || !checkResult?.valid || checking || submitting}
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Setting username...
                                </>
                            ) : (
                                'Continue'
                            )}
                        </Button>
                    </form>

                    {/* Skip Option */}
                    <div className="mt-4 text-center">
                        <button
                            type="button"
                            onClick={() => router.push('/')}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Skip for now
                        </button>
                    </div>
                </div>

                {/* Footer Note */}
                <p className="text-center text-xs text-muted-foreground mt-6">
                    You can only set your username once. Choose wisely!
                </p>
            </div>
        </div>
    )
}

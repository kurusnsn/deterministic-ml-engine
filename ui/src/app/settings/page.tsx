'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Bell, Palette, Shield, Volume2, CreditCard, User, Loader2, Check, X } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useSubscription } from '@/hooks/useSubscription'
import { useToast } from '@/hooks/use-toast'
import { getClientAuthHeaders } from '@/lib/auth'
import Link from 'next/link'

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway'

export default function SettingsPage() {
    const { plan, isActive, isOnTrial, trialDaysRemaining } = useSubscription()
    const { toast } = useToast()

    const [soundEnabled, setSoundEnabled] = useState(true)
    const [notificationsEnabled, setNotificationsEnabled] = useState(true)
    const [darkMode, setDarkMode] = useState(false)


    // Username state
    const [currentUsername, setCurrentUsername] = useState<string | null>(null)
    const [newUsername, setNewUsername] = useState('')
    const [usernameLoading, setUsernameLoading] = useState(false)
    const [usernameError, setUsernameError] = useState<string | null>(null)
    const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([])
    const [showUsernameForm, setShowUsernameForm] = useState(false)
    const [profileLoading, setProfileLoading] = useState(true)

    // Fetch current user profile
    const fetchProfile = useCallback(async () => {
        try {
            const headers = await getClientAuthHeaders({ includeContentType: true, includeSessionId: true })
            const res = await fetch(`${GATEWAY_URL}/users/me`, { headers })
            if (res.ok) {
                const data = await res.json()
                setCurrentUsername(data.username)
                setNewUsername(data.username || '')
            }
        } catch {
            // ignore — user may not be logged in
        } finally {
            setProfileLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchProfile()
    }, [fetchProfile])


    const handleUsernameChange = async () => {
        const username = newUsername.trim()
        setUsernameError(null)
        setUsernameSuggestions([])

        if (username.length < 3) {
            setUsernameError('Username must be at least 3 characters')
            return
        }
        if (username === currentUsername) {
            setShowUsernameForm(false)
            return
        }

        setUsernameLoading(true)
        try {
            const headers = await getClientAuthHeaders({ includeContentType: true, includeSessionId: true })
            const res = await fetch(`${GATEWAY_URL}/users/username`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ username }),
            })

            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: 'Failed to update username' }))
                if (res.status === 409 && err.detail?.suggestions) {
                    setUsernameError(err.detail.error || 'Username is taken')
                    setUsernameSuggestions(err.detail.suggestions)
                } else {
                    setUsernameError(typeof err.detail === 'string' ? err.detail : 'Failed to update username')
                }
                return
            }

            toast({ title: 'Success', description: 'Username updated successfully' })
            setCurrentUsername(username)
            setShowUsernameForm(false)
        } catch (e: any) {
            setUsernameError(e?.message || 'Failed to update username')
        } finally {
            setUsernameLoading(false)
        }
    }

    return (
        <div className="container max-w-4xl py-10">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground mt-2">
                    Manage your account preferences
                </p>
            </div>

            <div className="grid gap-6">
                {/* Account — Username & Password */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Account
                        </CardTitle>
                        <CardDescription>
                            Manage your username and password
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Username */}
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <p className="font-medium">Username</p>
                                {profileLoading ? (
                                    <p className="text-sm text-muted-foreground">Loading...</p>
                                ) : showUsernameForm ? (
                                    <div className="mt-2 space-y-2 max-w-sm">
                                        <Input
                                            value={newUsername}
                                            onChange={(e) => {
                                                setNewUsername(e.target.value)
                                                setUsernameError(null)
                                                setUsernameSuggestions([])
                                            }}
                                            placeholder="Enter new username"
                                            maxLength={20}
                                        />
                                        {usernameError && (
                                            <p className="text-xs text-red-600 dark:text-red-400">{usernameError}</p>
                                        )}
                                        {usernameSuggestions.length > 0 && (
                                            <div className="text-xs text-muted-foreground">
                                                Suggestions:{' '}
                                                {usernameSuggestions.map((s) => (
                                                    <button
                                                        key={s}
                                                        className="text-primary hover:underline mr-2"
                                                        onClick={() => {
                                                            setNewUsername(s)
                                                            setUsernameError(null)
                                                            setUsernameSuggestions([])
                                                        }}
                                                    >
                                                        {s}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={handleUsernameChange} disabled={usernameLoading}>
                                                {usernameLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                Save
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => {
                                                setShowUsernameForm(false)
                                                setNewUsername(currentUsername || '')
                                                setUsernameError(null)
                                                setUsernameSuggestions([])
                                            }}>
                                                <X className="w-4 h-4" />
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        {currentUsername || 'No username set'}
                                    </p>
                                )}
                            </div>
                            {!showUsernameForm && !profileLoading && (
                                <Button variant="outline" onClick={() => setShowUsernameForm(true)}>
                                    {currentUsername ? 'Change' : 'Set'}
                                </Button>
                            )}
                        </div>


                        {/* Delete Account */}
                        <div className="flex items-center justify-between pt-4 border-t">
                            <div>
                                <p className="font-medium text-red-600">Delete Account</p>
                                <p className="text-sm text-muted-foreground">
                                    Permanently delete your account and all data
                                </p>
                            </div>
                            <Button variant="destructive">Delete</Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Subscription & Billing */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CreditCard className="h-5 w-5" />
                            Subscription & Billing
                        </CardTitle>
                        <CardDescription>
                            Manage your plan and payment details
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-lg font-semibold capitalize">{plan || 'Free'}</p>
                                <p className="text-sm text-muted-foreground">
                                    {isOnTrial ? (
                                        <span className="text-amber-600">Trial — {trialDaysRemaining} days remaining</span>
                                    ) : isActive ? (
                                        <span className="text-green-600">Active subscription</span>
                                    ) : (
                                        'No active subscription'
                                    )}
                                </p>
                            </div>
                            <Button variant="outline" asChild>
                                <Link href="/billing">
                                    Manage Billing
                                </Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Sound Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Volume2 className="h-5 w-5" />
                            Sound
                        </CardTitle>
                        <CardDescription>
                            Control sound effects and audio feedback
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="sound-effects" className="flex flex-col gap-1">
                                <span>Sound Effects</span>
                                <span className="font-normal text-sm text-muted-foreground">
                                    Play sounds for moves and game events
                                </span>
                            </Label>
                            <Switch
                                id="sound-effects"
                                checked={soundEnabled}
                                onCheckedChange={setSoundEnabled}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Notifications */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Bell className="h-5 w-5" />
                            Notifications
                        </CardTitle>
                        <CardDescription>
                            Configure how you receive notifications
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="email-notifications" className="flex flex-col gap-1">
                                <span>Email Notifications</span>
                                <span className="font-normal text-sm text-muted-foreground">
                                    Receive updates about your account
                                </span>
                            </Label>
                            <Switch
                                id="email-notifications"
                                checked={notificationsEnabled}
                                onCheckedChange={setNotificationsEnabled}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Appearance */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Palette className="h-5 w-5" />
                            Appearance
                        </CardTitle>
                        <CardDescription>
                            Customize how ChessVector looks
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="dark-mode" className="flex flex-col gap-1">
                                <span>Dark Mode</span>
                                <span className="font-normal text-sm text-muted-foreground">
                                    Use dark theme across the application
                                </span>
                            </Label>
                            <Switch
                                id="dark-mode"
                                checked={darkMode}
                                onCheckedChange={setDarkMode}
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

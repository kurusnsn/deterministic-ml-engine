'use client'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useGlobalLoader } from '@/hooks/useGlobalLoader'

import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getSessionId } from '@/lib/session'
import { PlanBadge } from '@/components/PlanBadge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { User, CreditCard, Settings, LogOut } from 'lucide-react'

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL as string || '/api/gateway'

export default function UserNav() {
  const { data: session, status } = useSession()
  const [profilePicture, setProfilePicture] = useState<string | null>(null)
  const router = useRouter()
  const { setLoading: setGlobalLoading } = useGlobalLoader()

  const user = session?.user ?? null
  const loading = status === 'loading'

  useEffect(() => {
    if (!user) {
      setProfilePicture(null)
      return
    }

    // Fetch profile picture — auth is attached server-side via gateway proxy
    const controller = new AbortController()
    fetch(`${GATEWAY_URL}/profile/picture`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setProfilePicture(data.profile_picture) })
      .catch(() => { /* non-fatal */ })

    // Link anonymous session to authenticated user on first sign-in
    const sid = getSessionId()
    if (sid) {
      fetch(`${GATEWAY_URL}/link-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sid,
        },
        body: JSON.stringify({ session_id: sid }),
      }).catch(() => { /* non-fatal */ })
    }

    return () => controller.abort()
  }, [user?.id])

  const handleSignOut = async () => {
    setGlobalLoading(true)
    try {
      await signOut({ redirect: false })
      router.push('/')
    } finally {
      setGlobalLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center space-x-4">
        <div className="h-8 w-20 bg-gray-200 animate-pulse rounded"></div>
      </div>
    )
  }

  return (
    <div>
      {user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition-opacity outline-none">
              <Avatar className="w-8 h-8 rounded-full">
                {profilePicture ? (
                  <AvatarImage src={profilePicture} alt="Profile" />
                ) : null}
                <AvatarFallback className="text-sm">
                  {(user.name || user.email || 'U').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="text-sm text-left">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium">
                    {user.name || user.email}
                  </p>
                  <PlanBadge />
                </div>
                {user.name && (
                  <p className="text-gray-500 text-xs">{user.email}</p>
                )}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/billing" className="flex items-center cursor-pointer">
                <CreditCard className="mr-2 h-4 w-4" />
                <span>Billing</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-red-600 focus:text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Link href="/login">
          <Button size="sm">Login</Button>
        </Link>
      )}
    </div>
  )
}

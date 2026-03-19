"use client"

import { useEffect, useState, Suspense, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { getSubscriptionStatus, SubscriptionStatus } from '@/lib/api/subscription'
import { trackEvent, AnalyticsEvents } from '@/components/PostHogProvider'

function SubscriptionSuccessContent() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const pageHeading = <h1 className="sr-only">Subscription Success</h1>
  const hasTrackedSubscription = useRef(false)

  useEffect(() => {
    // Poll for subscription status (webhook might take a moment)
    const checkStatus = async () => {
      try {
        const subStatus = await getSubscriptionStatus()
        if (subStatus.is_active) {
          setStatus(subStatus)
          setLoading(false)

          // Track subscription started (only once)
          if (!hasTrackedSubscription.current) {
            trackEvent(AnalyticsEvents.SUBSCRIPTION_STARTED, {
              plan: subStatus.plan,
              billing_cycle: subStatus.billing_cycle,
            })
            hasTrackedSubscription.current = true
          }
        } else {
          // Retry after a short delay
          setTimeout(checkStatus, 2000)
        }
      } catch (e) {
        console.error('Failed to check subscription status:', e)
        setLoading(false)
      }
    }

    checkStatus()

    // Timeout after 30 seconds
    const timeout = setTimeout(() => {
      setLoading(false)
    }, 30000)

    return () => clearTimeout(timeout)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        {pageHeading}
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <CardTitle className="mt-4">Setting up your subscription...</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This will only take a moment.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const planLabel = status?.plan ? `${status.plan[0].toUpperCase()}${status.plan.slice(1)}` : 'Subscription'
  const billingLabel = status?.billing_cycle ? ` (${status.billing_cycle})` : ''

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {pageHeading}
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Check className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Subscription Active</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Your {planLabel}{billingLabel} plan is now active.
          </p>

          <div className="pt-4 space-y-2">
            <Link href="/profile" className="block">
              <Button className="w-full">Go to Profile</Button>
            </Link>
            <Link href="/game-review" className="block">
              <Button variant="outline" className="w-full">
                Start Analyzing Games
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Wrapper with Suspense for static generation
export default function SubscriptionSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <SubscriptionSuccessContent />
    </Suspense>
  )
}

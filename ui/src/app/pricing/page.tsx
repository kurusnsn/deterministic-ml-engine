"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  BillingCycle,
  PlanId,
  PRICING,
  formatPrice,
  getSubscriptionStatus,
  redirectToCheckout,
  redirectToCustomerPortal,
  SubscriptionStatus,
} from '@/lib/api/subscription'
import { trackEvent, AnalyticsEvents } from '@/components/PostHogProvider'

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null)

  // Check subscription status on mount
  useEffect(() => {
    let isMounted = true

    const loadStatus = async () => {
      try {
        const status = await getSubscriptionStatus()
        if (isMounted) setSubscriptionStatus(status)
      } catch {
        if (isMounted) setSubscriptionStatus(null)
      }
    }

    loadStatus()
    return () => {
      isMounted = false
    }
  }, [])

  const handleSubscribe = useCallback(async (plan: PlanId, cycle: BillingCycle) => {
    try {
      setLoading(`${plan}-${cycle}`)
      await redirectToCheckout(plan, cycle)
    } catch (e) {
      console.error(e)

      // Track subscription failure
      trackEvent(AnalyticsEvents.SUBSCRIPTION_FAILED, {
        plan,
        billing_cycle: cycle,
        error: e instanceof Error ? e.message : 'Unknown error',
      })

      alert('Could not start checkout. Please try again.')
    } finally {
      setLoading(null)
    }
  }, [])

  const handleManageSubscription = useCallback(async () => {
    try {
      setLoading('manage')
      await redirectToCustomerPortal()
    } catch (e) {
      console.error(e)
      alert('Could not open subscription management. Please try again.')
    } finally {
      setLoading(null)
    }
  }, [])

  const isSubscribed = subscriptionStatus?.is_active
  const currentPlanName = subscriptionStatus?.plan ? PRICING[subscriptionStatus.plan].name : 'Plan'
  const currentCycleLabel = subscriptionStatus?.billing_cycle === 'annual' ? 'annual' : 'monthly'
  const plans = [PRICING.basic, PRICING.plus]

  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            New accounts get 7 days of full access with no card required. Subscribe to keep premium features.
          </p>
        </div>

        {/* Subscription Status Banner */}
        {isSubscribed && (
          <div className="mb-8 p-4 bg-primary/10 rounded-lg text-center">
            <p className="text-sm">
              You&apos;re currently subscribed to the{' '}
              <strong>{currentPlanName}</strong> ({currentCycleLabel}) plan.
              {subscriptionStatus.cancel_at_period_end && (
                <span className="text-destructive"> (Cancels at period end)</span>
              )}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={handleManageSubscription}
              disabled={loading === 'manage'}
            >
              {loading === 'manage' ? 'Opening...' : 'Manage Subscription'}
            </Button>
          </div>
        )}

        {/* Billing Toggle */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center gap-1 rounded-lg border bg-background p-1">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                billingCycle === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('annual')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                billingCycle === 'annual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              Annual
              <Badge variant="secondary" className="ml-2">Save 20%</Badge>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto pt-4">
          {plans.map((plan) => {
            const pricing = billingCycle === 'monthly' ? plan.monthly : plan.annual
            const loadingKey = `${plan.id}-${billingCycle}`
            const isCurrentPlan = subscriptionStatus?.is_active
              && subscriptionStatus.plan === plan.id
              && subscriptionStatus.billing_cycle === billingCycle

            return (
              <Card
                key={plan.id}
                className={`relative flex flex-col ${plan.id === 'plus' ? 'border-primary border-2' : ''}`}
              >
                <CardHeader className={plan.id === 'plus' ? 'pt-4' : ''}>
                  {plan.id === 'plus' && (
                    <Badge className="bg-primary text-primary-foreground w-fit mb-2">Most Popular</Badge>
                  )}
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="mb-6">
                    <span className="text-4xl font-bold">
                      {formatPrice(pricing.price)}
                    </span>
                    <span className="text-muted-foreground">/{billingCycle === 'monthly' ? 'month' : 'year'}</span>
                    {billingCycle === 'annual' && (
                      <p className="text-sm text-muted-foreground mt-1">
                        ({formatPrice(pricing.price / 12)}/month)
                      </p>
                    )}
                  </div>
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={isCurrentPlan ? 'secondary' : 'default'}
                    onClick={() => handleSubscribe(plan.id, billingCycle)}
                    disabled={loading === loadingKey || isCurrentPlan}
                  >
                    {loading === loadingKey
                      ? 'Redirecting...'
                      : isCurrentPlan
                        ? 'Current Plan'
                        : 'Subscribe'}
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>

        {/* FAQ / Info */}
        <div className="mt-16 text-center text-muted-foreground">
          <p className="text-sm">
            Free 7-day access starts at signup. Subscribe anytime to keep premium features.
            <br />
            Manage or cancel your subscription from your account settings.
          </p>
        </div>
      </div>
    </div>
  )
}

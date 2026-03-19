'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CreditCard, Package, Calendar, ExternalLink, AlertTriangle } from 'lucide-react'
import { useSubscription } from '@/hooks/useSubscription'
import { redirectToCustomerPortal } from '@/lib/api/subscription'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'

export default function BillingPage() {
    const { status, plan, isActive, isOnTrial, trialDaysRemaining, isLoading, billingCycle } = useSubscription()
    const router = useRouter()
    const { toast } = useToast()
    const [isRedirecting, setIsRedirecting] = useState(false)

    const isPastDue = status?.status === 'past_due'
    const isCanceling = status?.cancel_at_period_end === true

    const handleManagePlan = async () => {
        if (isActive || isPastDue) {
            setIsRedirecting(true)
            try {
                await redirectToCustomerPortal()
            } catch (error) {
                toast({
                    title: 'Error',
                    description: error instanceof Error ? error.message : 'Failed to open customer portal',
                    variant: 'destructive',
                })
                setIsRedirecting(false)
            }
        } else {
            router.push('/pricing')
        }
    }

    const handleManagePayment = async () => {
        setIsRedirecting(true)
        try {
            await redirectToCustomerPortal()
        } catch (error) {
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to open customer portal',
                variant: 'destructive',
            })
            setIsRedirecting(false)
        }
    }

    // Format period end date
    const periodEndDate = status?.current_period_end
        ? new Date(Number(status.current_period_end) * 1000 || status.current_period_end).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        })
        : null

    return (
        <div className="container max-w-4xl py-10">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
                <p className="text-muted-foreground mt-2">
                    Manage your subscription and billing information
                </p>
            </div>

            <div className="grid gap-6">
                {/* Past Due Warning */}
                {isPastDue && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                            <div className="flex-1">
                                <p className="font-medium text-amber-900 dark:text-amber-100">
                                    Payment overdue
                                </p>
                                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                    Your last payment failed. Please update your payment method to keep your subscription active.
                                </p>
                                <Button
                                    size="sm"
                                    className="mt-3"
                                    onClick={handleManagePayment}
                                    disabled={isRedirecting}
                                >
                                    {isRedirecting ? 'Loading...' : 'Update Payment Method'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Cancellation Notice */}
                {isCanceling && !isPastDue && periodEndDate && (
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-4">
                        <div className="flex items-start gap-3">
                            <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-medium text-blue-900 dark:text-blue-100">
                                    Subscription ending
                                </p>
                                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                                    Your subscription will end on {periodEndDate}. You can reactivate anytime before then.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Current Plan */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5" />
                            Current Plan
                        </CardTitle>
                        <CardDescription>
                            Your current subscription plan and status
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="h-20 bg-muted animate-pulse rounded" />
                        ) : (
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-2xl font-semibold capitalize">{plan || 'Free'}</p>
                                    {billingCycle && (
                                        <p className="text-xs text-muted-foreground capitalize">{billingCycle} billing</p>
                                    )}
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {isPastDue ? (
                                            <span className="text-amber-600 font-medium">Payment overdue</span>
                                        ) : isCanceling && periodEndDate ? (
                                            <span className="text-blue-600">Ends {periodEndDate}</span>
                                        ) : isOnTrial ? (
                                            <span className="text-amber-600">
                                                Trial ends in {trialDaysRemaining} days
                                            </span>
                                        ) : isActive ? (
                                            <span className="text-green-600">Active subscription</span>
                                        ) : (
                                            <span>No active subscription</span>
                                        )}
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={handleManagePlan}
                                    disabled={isRedirecting}
                                >
                                    {isRedirecting ? (
                                        'Loading...'
                                    ) : isActive || isPastDue ? (
                                        <>
                                            Manage Plan
                                            <ExternalLink className="ml-2 h-4 w-4" />
                                        </>
                                    ) : (
                                        'Upgrade'
                                    )}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Payment Method */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CreditCard className="h-5 w-5" />
                            Payment Method
                        </CardTitle>
                        <CardDescription>
                            Manage your payment methods and billing details
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <p className="text-muted-foreground">
                                {isPastDue
                                    ? 'Your payment method needs to be updated'
                                    : isActive
                                        ? 'Manage your payment methods in the customer portal'
                                        : 'No payment method on file'}
                            </p>
                            <Button
                                variant={isPastDue ? 'default' : 'outline'}
                                onClick={handleManagePayment}
                                disabled={isRedirecting || (!isActive && !isPastDue)}
                            >
                                {isRedirecting ? 'Loading...' : (
                                    <>
                                        {isPastDue ? 'Update Payment' : isActive ? 'Manage Payment' : 'Add Payment Method'}
                                        {(isActive || isPastDue) && <ExternalLink className="ml-2 h-4 w-4" />}
                                    </>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Billing History */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            Billing History
                        </CardTitle>
                        <CardDescription>
                            View your past invoices and payments
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <p className="text-muted-foreground">
                                {isActive || isPastDue ? 'View your invoices in the customer portal' : 'No billing history available'}
                            </p>
                            {(isActive || isPastDue) && (
                                <Button
                                    variant="outline"
                                    onClick={handleManagePayment}
                                    disabled={isRedirecting}
                                >
                                    {isRedirecting ? 'Loading...' : (
                                        <>
                                            View History
                                            <ExternalLink className="ml-2 h-4 w-4" />
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

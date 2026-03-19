import Link from "next/link";

export const metadata = {
    title: "Refund Policy — ChessVector",
    description: "ChessVector Refund Policy - Information about refunds for subscription purchases.",
};

export default function RefundPolicyPage() {
    const lastUpdated = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
                {/* Header */}
                <div className="mb-12">
                    <Link
                        href="/"
                        className="text-muted-foreground hover:text-foreground text-sm mb-6 inline-flex items-center gap-2"
                    >
                        ← Back to Home
                    </Link>
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight mt-4">
                        Refund Policy
                    </h1>
                    <p className="text-muted-foreground mt-4">
                        Last updated: {lastUpdated}
                    </p>
                </div>

                {/* Intro */}
                <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
                    <section className="bg-muted/50 rounded-lg p-6">
                        <p className="text-muted-foreground leading-relaxed">
                            We want you to have a great experience using ChessVector.
                            This Refund Policy explains when refunds may be granted for subscription purchases made through our payment provider, Stripe.
                        </p>
                        <p className="text-muted-foreground leading-relaxed mt-4">
                            By subscribing to ChessVector PRO, you agree to this policy.
                        </p>
                    </section>

                    {/* Section 1 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">1. Payments &amp; Billing</h2>
                        <ul className="list-disc list-inside text-muted-foreground space-y-2">
                            <li>All payments, renewals, and billing operations are handled securely by Stripe.</li>
                            <li>We do not directly store or process credit card or billing information.</li>
                            <li>Your payment is subject to Stripe&apos;s own terms, which comply with international tax and consumer regulations.</li>
                        </ul>
                    </section>

                    {/* Section 2 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">2. Refund Eligibility</h2>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            We understand that sometimes things do not work out as planned.
                            ChessVector provides goodwill refunds under specific conditions.
                        </p>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            You may request a refund if:
                        </p>
                        <div className="space-y-3">
                            <div className="flex items-start gap-3">
                                <span className="text-green-500 shrink-0">✔</span>
                                <p className="text-muted-foreground">1. You are a first-time PRO subscriber</p>
                            </div>
                            <p className="text-muted-foreground text-center font-medium">AND</p>
                            <div className="flex items-start gap-3">
                                <span className="text-green-500 shrink-0">✔</span>
                                <p className="text-muted-foreground">2. You request a refund within 7 days of the original purchase</p>
                            </div>
                            <p className="text-muted-foreground text-center font-medium">AND</p>
                            <div className="flex items-start gap-3">
                                <span className="text-green-500 shrink-0">✔</span>
                                <p className="text-muted-foreground">
                                    3. You have not excessively used premium features
                                    (e.g., dozens of engine analyses, mass export, automated queries, etc.)
                                </p>
                            </div>
                        </div>
                        <p className="text-muted-foreground leading-relaxed mt-4 text-sm italic">
                            This policy exists to prevent abuse while still being fair to honest users.
                        </p>
                    </section>

                    {/* Section 3 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">3. Non-Refundable Situations</h2>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            Refunds will not be provided when:
                        </p>
                        <div className="space-y-3">
                            <div className="flex items-start gap-3">
                                <span className="text-red-500 shrink-0">❌</span>
                                <p className="text-muted-foreground">The 7-day window has passed</p>
                            </div>
                            <div className="flex items-start gap-3">
                                <span className="text-red-500 shrink-0">❌</span>
                                <p className="text-muted-foreground">The subscription has been heavily used</p>
                            </div>
                            <div className="flex items-start gap-3">
                                <span className="text-red-500 shrink-0">❌</span>
                                <p className="text-muted-foreground">
                                    Renewal payments were processed automatically
                                    <span className="block text-sm">(you can avoid future renewals by cancelling anytime)</span>
                                </p>
                            </div>
                            <div className="flex items-start gap-3">
                                <span className="text-red-500 shrink-0">❌</span>
                                <p className="text-muted-foreground">
                                    You forgot to cancel before renewal
                                    <span className="block text-sm">(this is standard for subscription products)</span>
                                </p>
                            </div>
                            <div className="flex items-start gap-3">
                                <span className="text-red-500 shrink-0">❌</span>
                                <p className="text-muted-foreground">You purchased through fraudulent or abusive behavior</p>
                            </div>
                        </div>
                    </section>

                    {/* Section 4 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">4. Canceling Your Subscription</h2>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            Cancellation is always available at any time, and takes effect at the end of the billing period.
                        </p>
                        <p className="text-muted-foreground leading-relaxed mb-2">
                            You can cancel through:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4">
                            <li>Stripe Customer Portal (link provided in your billing settings inside ChessVector)</li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed mb-2">
                            After cancellation:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1">
                            <li>Your PRO features remain active until expiration</li>
                            <li>No further charges will be made</li>
                        </ul>
                        <div className="bg-muted/50 rounded-lg p-4 mt-4">
                            <p className="text-muted-foreground text-sm">
                                <strong>Note:</strong> Cancelling does not automatically trigger a refund.
                            </p>
                        </div>
                    </section>

                    {/* Section 5 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">5. How to Request a Refund</h2>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            To request a refund, contact us at:
                        </p>
                        <div className="bg-muted/50 rounded-lg p-4">
                            <p className="mb-2">
                                <strong>Email:</strong>{" "}
                                <a href="mailto:support@chessvector.com" className="text-primary hover:underline">
                                    support@chessvector.com
                                </a>
                            </p>
                        </div>
                        <p className="text-muted-foreground leading-relaxed mt-4 mb-2">
                            Provide:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1">
                            <li>Your ChessVector account email</li>
                            <li>Order ID or receipt from Stripe</li>
                            <li>Reason for the refund request</li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed mt-4">
                            <strong>Refund processing time:</strong> Typically 3–7 business days, depending on Stripe and your payment provider.
                        </p>
                    </section>

                    {/* Section 6 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">6. Exceptions</h2>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            We may, at our discretion, offer refunds outside this policy in cases such as:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1">
                            <li>Duplicate purchases</li>
                            <li>Technical issues preventing service use</li>
                            <li>Payment errors</li>
                            <li>Statutory consumer rights in your jurisdiction</li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed mt-4 text-sm italic">
                            This is determined case-by-case.
                        </p>
                    </section>

                    {/* Section 7 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">7. Changes to This Policy</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We may update this Refund Policy from time to time.
                            Changes will appear with a new &ldquo;Last Updated&rdquo; date.
                        </p>
                    </section>

                    {/* Section 8 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">8. Contact Information</h2>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            If you have any questions:
                        </p>
                        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                            <p>
                                <strong>Email:</strong>{" "}
                                <a href="mailto:support@chessvector.com" className="text-primary hover:underline">
                                    support@chessvector.com
                                </a>
                            </p>
                            <p><strong>Business Name:</strong> ChessVector</p>
                            <p><strong>Location:</strong> Stockholm, Sweden</p>
                        </div>
                    </section>
                </div>

                {/* Footer Navigation */}
                <div className="mt-16 pt-8 border-t border-border">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
                        <Link href="/" className="hover:text-foreground">
                            ← Back to Home
                        </Link>
                        <div className="flex gap-6">
                            <Link href="/privacy" className="hover:text-foreground">
                                Privacy Policy
                            </Link>
                            <Link href="/terms" className="hover:text-foreground">
                                Terms of Service
                            </Link>
                            <Link href="/refund" className="hover:text-foreground font-medium text-foreground">
                                Refund Policy
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

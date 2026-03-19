'use client';

import Link from 'next/link';
import { ArrowLeft, Twitter, Instagram } from 'lucide-react';
import { Button } from '@/components/ui/button';

// TikTok icon (lucide-react doesn't have TikTok, so we'll create a simple SVG)
const TikTokIcon = () => (
    <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-5 w-5"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
);

export default function TermsOfServicePage() {
    const lastUpdated = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
                {/* Header */}
                <div className="mb-8">
                    <Link href="/">
                        <Button variant="ghost" size="sm" className="mb-4">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Home
                        </Button>
                    </Link>
                    <h1 className="text-4xl font-bold tracking-tight mb-2">Terms of Service</h1>
                    <p className="text-muted-foreground">Last updated: {lastUpdated}</p>
                </div>

                {/* Content */}
                <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
                    <p className="text-lg">
                        Welcome to ChessVector (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;).
                        These Terms of Service (&quot;Terms&quot;) govern your access to and use of ChessVector (the &quot;Service&quot;).
                        By creating an account or using the Service, you agree to these Terms.
                    </p>
                    <p className="text-lg font-semibold text-destructive">
                        If you do not agree, do not use ChessVector.
                    </p>

                    {/* Section 1 */}
                    <section>
                        <h2 className="text-2xl font-bold mt-8 mb-4">1. Use of the Service</h2>

                        <h3 className="text-xl font-semibold mt-6 mb-3">1.1 Eligibility</h3>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>You must be at least 13 years old to use ChessVector.</li>
                            <li>If you are in the EU, you must be at least 16 years old, unless local law allows younger usage with parental consent.</li>
                        </ul>

                        <h3 className="text-xl font-semibold mt-6 mb-3">1.2 Account Responsibility</h3>
                        <p className="mb-3">You agree to:</p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Provide accurate information</li>
                            <li>Maintain the security of your account</li>
                            <li>Not share your account or password</li>
                            <li>Be responsible for all actions that occur under your account</li>
                        </ul>
                        <p className="mt-4 text-muted-foreground">
                            We may suspend or terminate accounts that violate these Terms.
                        </p>
                    </section>

                    {/* Section 2 */}
                    <section>
                        <h2 className="text-2xl font-bold mt-8 mb-4">2. License to Use ChessVector</h2>
                        <p className="mb-4">
                            We grant you a limited, non-exclusive, non-transferable license to access and use the Service for personal, non-commercial use.
                        </p>
                        <p className="mb-3 font-semibold">You may not:</p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Reverse engineer the Service</li>
                            <li>Scrape or probe endpoints</li>
                            <li>Abuse analysis infrastructure</li>
                            <li>Circumvent paywalls or rate limits</li>
                            <li>Modify, copy, or redistribute proprietary parts of the Service</li>
                        </ul>
                    </section>

                    {/* Section 3 */}
                    <section>
                        <h2 className="text-2xl font-bold mt-8 mb-4">3. Acceptable Use</h2>
                        <p className="mb-3 font-semibold">You agree not to:</p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong>Exploit or overload servers</strong> (e.g., automated request spamming)</li>
                            <li><strong>Upload harmful content</strong> (viruses, malware, corrupted PGN files)</li>
                            <li><strong>Attempt unauthorized access</strong> (server, database, or other accounts)</li>
                            <li><strong>Use tools/scripts to bypass limitations</strong> (free plan limits, feature gating)</li>
                            <li><strong>Engage in harassment or abuse</strong> (toward staff, community, or system)</li>
                        </ul>
                        <div className="mt-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                            <p className="font-semibold text-destructive mb-2">Violation may result in:</p>
                            <ul className="list-disc pl-6 space-y-1 text-destructive">
                                <li>Account suspension</li>
                                <li>Termination</li>
                                <li>IP blocks</li>
                                <li>Legal action (if applicable)</li>
                            </ul>
                        </div>
                    </section>

                    {/* Section 4 */}
                    <section>
                        <h2 className="text-2xl font-bold mt-8 mb-4">4. AI &amp; Engine Outputs</h2>
                        <p className="mb-3">ChessVector includes:</p>
                        <ul className="list-disc pl-6 space-y-2 mb-4">
                            <li>Stockfish engine evaluations</li>
                            <li>Statistical opening data</li>
                            <li>Move classifications</li>
                            <li>LLM-generated commentary</li>
                        </ul>
                        <p className="mb-3 font-semibold">You acknowledge that:</p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>AI outputs may be incomplete, inaccurate, or outdated</li>
                            <li>Engine evaluations change with depth and version</li>
                            <li>No evaluation or suggestion should be considered guaranteed or professional advice</li>
                        </ul>
                        <p className="mt-4 p-4 bg-muted rounded-lg">
                            <strong>ChessVector is a training tool, not a perfect oracle.</strong><br />
                            We are not responsible for decisions or outcomes based on AI analysis.
                        </p>
                    </section>

                    {/* Section 5 */}
                    <section>
                        <h2 className="text-2xl font-bold mt-8 mb-4">5. Subscriptions &amp; Payments</h2>

                        <h3 className="text-xl font-semibold mt-6 mb-3">5.1 Billing Provider</h3>
                        <p>
                            All payments, invoicing, VAT collection, and subscription management are handled via Stripe.
                            You agree to Stripe&apos;s own terms and policies.
                        </p>

                        <h3 className="text-xl font-semibold mt-6 mb-3">5.2 Subscription Plans</h3>
                        <p>
                            Some features require a paid subscription (&quot;PRO&quot;).
                            Plan details, pricing, and benefits are listed on our{' '}
                            <Link href="/pricing" className="text-primary underline underline-offset-4 hover:text-primary/80">
                                /pricing
                            </Link>{' '}
                            page.
                        </p>

                        <h3 className="text-xl font-semibold mt-6 mb-3">5.3 Renewal</h3>
                        <p>
                            Subscriptions renew automatically at the end of each billing period unless cancelled.
                        </p>

                        <h3 className="text-xl font-semibold mt-6 mb-3">5.4 Cancellation</h3>
                        <p>
                            You may cancel at any time via your Stripe customer portal.
                            Your subscription will remain active until the end of the current billing cycle.
                        </p>

                        <h3 className="text-xl font-semibold mt-6 mb-3">5.5 Refunds</h3>
                        <p>
                            Refunds are handled according to our Refund Policy (usually a limited 7-day goodwill refund for first-time customers).
                        </p>
                    </section>

                    {/* Section 6 */}
                    <section>
                        <h2 className="text-2xl font-bold mt-8 mb-4">6. Content Ownership</h2>

                        <h3 className="text-xl font-semibold mt-6 mb-3">6.1 Your Content</h3>
                        <p className="mb-3">You retain ownership of:</p>
                        <ul className="list-disc pl-6 space-y-2 mb-4">
                            <li>PGN files you upload</li>
                            <li>Moves and data you enter</li>
                            <li>Any other content you create using the Service</li>
                        </ul>
                        <p className="mb-3">By using ChessVector, you grant us a license to:</p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Process content to deliver features</li>
                            <li>Store it in your account</li>
                            <li>Use anonymized game data to improve models and training features</li>
                        </ul>

                        <h3 className="text-xl font-semibold mt-6 mb-3">6.2 Our Content</h3>
                        <p className="mb-3">We own:</p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>The ChessVector brand</li>
                            <li>Website design and assets</li>
                            <li>Custom analysis algorithms</li>
                            <li>Engine integrations</li>
                            <li>LLM commentary pipelines</li>
                            <li>UI components</li>
                            <li>Code, back end, and intellectual property</li>
                        </ul>
                        <p className="mt-4 text-muted-foreground">
                            You may not copy, redistribute, or create derivative works without permission.
                        </p>
                    </section>

                    {/* Section 7 */}
                    <section>
                        <h2 className="text-2xl font-bold mt-8 mb-4">7. Service Availability</h2>
                        <p className="mb-4">
                            ChessVector is provided &quot;as is&quot; and &quot;as available.&quot;
                        </p>
                        <p className="mb-3 font-semibold">We do not guarantee:</p>
                        <ul className="list-disc pl-6 space-y-2 mb-4">
                            <li>100% uptime</li>
                            <li>Error-free operation</li>
                            <li>Perfect accuracy of AI or engine evaluations</li>
                            <li>Uninterrupted access</li>
                            <li>Preservation of your data</li>
                        </ul>
                        <p className="mb-3 font-semibold">We may:</p>
                        <ul className="list-disc pl-6 space-y-2 mb-4">
                            <li>Update, modify, or discontinue parts of the Service</li>
                            <li>Perform maintenance</li>
                            <li>Change features or pricing</li>
                            <li>Limit access to certain tools</li>
                            <li>Enforce usage caps</li>
                        </ul>
                        <p className="mb-3 font-semibold">You agree that we are not liable for:</p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Downtime</li>
                            <li>Feature changes</li>
                            <li>Data loss (although we take care to prevent it)</li>
                        </ul>
                    </section>

                    {/* Section 8 */}
                    <section>
                        <h2 className="text-2xl font-bold mt-8 mb-4">8. Limitation of Liability</h2>
                        <p className="mb-4">To the fullest extent permitted by law:</p>
                        <ul className="list-disc pl-6 space-y-2 mb-4">
                            <li>We are not liable for direct, indirect, incidental, special, or consequential damages arising from your use of ChessVector.</li>
                            <li>Our total liability will not exceed the amount you paid for the Service in the past 12 months.</li>
                            <li>We do not provide any warranties (express or implied).</li>
                        </ul>
                        <p className="mb-3">This includes:</p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Incorrect chess evaluations</li>
                            <li>Lost chess games</li>
                            <li>Misinterpreted commentary</li>
                            <li>Service outages</li>
                            <li>Data issues</li>
                            <li>Third-party failures</li>
                        </ul>
                    </section>

                    {/* Section 9 */}
                    <section>
                        <h2 className="text-2xl font-bold mt-8 mb-4">9. Termination</h2>
                        <p className="mb-3">We may suspend or terminate your account if you:</p>
                        <ul className="list-disc pl-6 space-y-2 mb-4">
                            <li>Violate these Terms</li>
                            <li>Abuse the system</li>
                            <li>Attempt to harm the Service</li>
                            <li>Engage in fraudulent behavior</li>
                            <li>Fail to pay subscription fees</li>
                        </ul>
                        <p>
                            You may terminate your account at any time via account deletion or by contacting support.
                        </p>
                    </section>

                    {/* Section 10 */}
                    <section>
                        <h2 className="text-2xl font-bold mt-8 mb-4">10. Changes to the Terms</h2>
                        <p>
                            We may update these Terms periodically.
                            Revised Terms will be posted with an updated &quot;Last Updated&quot; date.
                            Continued use of the Service constitutes acceptance of the new Terms.
                        </p>
                    </section>

                    {/* Section 11 */}
                    <section>
                        <h2 className="text-2xl font-bold mt-8 mb-4">11. Governing Law</h2>
                        <p>
                            These Terms are governed by the laws of Sweden, without regard to conflict-of-law principles.
                            Any disputes shall be resolved in Swedish courts unless otherwise required by applicable consumer protection laws.
                        </p>
                    </section>

                    {/* Section 12 */}
                    <section>
                        <h2 className="text-2xl font-bold mt-8 mb-4">12. Contact Us</h2>
                        <p className="mb-3">For questions or concerns:</p>
                        <ul className="list-none space-y-2">
                            <li><strong>Email:</strong> support@chessvector.com</li>
                            <li><strong>Business Name:</strong> ChessVector</li>
                            <li><strong>Location:</strong> Stockholm, Sweden</li>
                        </ul>
                    </section>
                </div>

                {/* Footer Navigation */}
                <div className="mt-16 pt-8 border-t border-border">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-6 text-sm text-muted-foreground">
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                            <Link href="/" className="hover:text-foreground">
                                ← Back to Home
                            </Link>
                            <div className="flex gap-6">
                                <Link href="/terms" className="hover:text-foreground font-medium text-foreground">
                                    Terms of Service
                                </Link>
                                <Link href="/privacy" className="hover:text-foreground">
                                    Privacy Policy
                                </Link>
                                <Link href="/cookies" className="hover:text-foreground">
                                    Cookie Policy
                                </Link>
                            </div>
                        </div>

                        {/* Social Media Links */}
                        <div className="flex items-center gap-4">
                            <a
                                href="https://x.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Follow us on X (Twitter)"
                            >
                                <Twitter className="h-5 w-5" />
                            </a>
                            <a
                                href="https://tiktok.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Follow us on TikTok"
                            >
                                <TikTokIcon />
                            </a>
                            <a
                                href="https://instagram.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Follow us on Instagram"
                            >
                                <Instagram className="h-5 w-5" />
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

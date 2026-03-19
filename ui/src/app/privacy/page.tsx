import Link from "next/link";
import { Twitter, Instagram } from "lucide-react";

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

export const metadata = {
    title: "Privacy Policy — ChessVector",
    description: "ChessVector Privacy Policy - How we collect, use, and protect your data in compliance with GDPR.",
};

export default function PrivacyPolicyPage() {
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
                        Privacy Policy
                    </h1>
                    <p className="text-muted-foreground mt-4">
                        Last updated: {lastUpdated}
                    </p>
                </div>

                {/* Content */}
                <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
                    {/* Section 1 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Welcome to ChessVector (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;).
                            We are committed to protecting your privacy and complying with the General Data Protection Regulation (GDPR) and other applicable data protection laws.
                        </p>
                        <p className="text-muted-foreground leading-relaxed mt-4">
                            This Privacy Policy explains:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li>What personal data we collect</li>
                            <li>How we use it</li>
                            <li>Your rights</li>
                            <li>How we protect your information</li>
                            <li>How to contact us</li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed mt-4">
                            By using ChessVector, you agree to the terms of this Policy.
                        </p>
                    </section>

                    {/* Section 2 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">2. What Data We Collect</h2>

                        <h3 className="text-xl font-medium mt-6 mb-3">2.1 Account Information</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            When you create an account using Supabase Authentication, we collect:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li>Email address</li>
                            <li>Password hash (never stored or seen by us)</li>
                            <li>Authentication tokens</li>
                            <li>Metadata you choose to provide (username, preferences)</li>
                        </ul>

                        <h3 className="text-xl font-medium mt-6 mb-3">2.2 Payment Information</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            Payments and subscriptions are processed by Stripe.
                            We do not store your credit card information.
                        </p>
                        <p className="text-muted-foreground leading-relaxed mt-2">
                            Stripe collects and processes:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li>Payment details</li>
                            <li>Billing address</li>
                            <li>Tax/VAT information</li>
                            <li>Subscription status and renewal dates</li>
                        </ul>

                        <h3 className="text-xl font-medium mt-6 mb-3">2.3 Usage Data</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            We may collect information related to your use of ChessVector, including:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li>Game PGNs you upload or analyze</li>
                            <li>Number of analyses performed</li>
                            <li>Opening explorer usage</li>
                            <li>Puzzle attempts</li>
                            <li>Device type and operating system</li>
                            <li>Browser information</li>
                            <li>IP address (for security and abuse prevention)</li>
                            <li>Timestamps of requests</li>
                            <li>Clickstream data related to navigation and feature use</li>
                        </ul>

                        <h3 className="text-xl font-medium mt-6 mb-3">2.4 AI Processing Data</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            When you request analysis, the following may be processed:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li>FEN and PGN game states</li>
                            <li>Move history</li>
                            <li>Evaluations</li>
                            <li>Commentary prompts</li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed mt-2">
                            If an external LLM provider is used (e.g., OpenAI), this data may be temporarily transmitted to generate commentary or insights.
                        </p>

                        <h3 className="text-xl font-medium mt-6 mb-3">2.5 Error & Performance Data</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            Collected via Sentry, Grafana, and Prometheus:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li>Stack traces</li>
                            <li>Error logs</li>
                            <li>API performance metrics</li>
                            <li>System health data</li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed mt-2">
                            No sensitive game content or passwords are included.
                        </p>
                    </section>

                    {/* Section 3 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Data</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We use your data to:
                        </p>

                        <h3 className="text-xl font-medium mt-6 mb-3">3.1 Provide and Improve the Service</h3>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1">
                            <li>Authenticate your account</li>
                            <li>Save and retrieve your analyses</li>
                            <li>Display personalized training insights</li>
                            <li>Process payments and manage subscriptions</li>
                            <li>Ensure the platform functions correctly</li>
                            <li>Improve performance, features, and reliability</li>
                        </ul>

                        <h3 className="text-xl font-medium mt-6 mb-3">3.2 Customer Support</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            We use account and usage information to:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li>Respond to questions</li>
                            <li>Investigate issues</li>
                            <li>Detect and prevent abuse</li>
                        </ul>

                        <h3 className="text-xl font-medium mt-6 mb-3">3.3 Security</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            We may process IP addresses and usage behavior to:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li>Detect malicious behavior</li>
                            <li>Prevent account abuse</li>
                            <li>Limit automated scraping</li>
                            <li>Enforce rate limits</li>
                        </ul>

                        <h3 className="text-xl font-medium mt-6 mb-3">3.4 Legal Compliance</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            We may process data to:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li>Comply with tax, accounting, and subscription regulations</li>
                            <li>Respond to lawful data requests</li>
                        </ul>
                    </section>

                    {/* Section 4 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">4. Legal Basis for Processing (GDPR)</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We process your data under the following legal bases:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li><strong>Contractual necessity:</strong> To provide ChessVector to you</li>
                            <li><strong>Legitimate interest:</strong> Improve the service, maintain security</li>
                            <li><strong>Consent:</strong> Cookies (where applicable)</li>
                            <li><strong>Legal obligation:</strong> Tax, payment, or regulatory compliance</li>
                        </ul>
                    </section>

                    {/* Section 5 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">5. How We Share Your Data</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We share data only with trusted third-party processors required to operate ChessVector:
                        </p>

                        <h3 className="text-xl font-medium mt-6 mb-3">5.1 Authentication & Database</h3>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1">
                            <li>Supabase (EU region recommended)</li>
                        </ul>

                        <h3 className="text-xl font-medium mt-6 mb-3">5.2 Payments</h3>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1">
                            <li>Stripe</li>
                        </ul>

                        <h3 className="text-xl font-medium mt-6 mb-3">5.3 Analytics, Monitoring & Logging</h3>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1">
                            <li>Sentry (error monitoring)</li>
                            <li>Grafana / Prometheus (performance metrics)</li>
                            <li>Cloudflare (security + CDN)</li>
                        </ul>

                        <h3 className="text-xl font-medium mt-6 mb-3">5.4 AI Providers (If Enabled)</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            If AI commentary is used, game data (FEN, PGN, move lists) may be transmitted to an external LLM API.
                        </p>

                        <div className="bg-muted/50 rounded-lg p-4 mt-6">
                            <p className="text-foreground font-medium">We DO NOT:</p>
                            <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                                <li>Sell your data</li>
                                <li>Share your email with advertisers</li>
                                <li>Allow third parties to use your data for marketing</li>
                            </ul>
                        </div>
                    </section>

                    {/* Section 6 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">6. Data Retention</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We retain:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li>Account data until your account is deleted</li>
                            <li>Payment history as required by tax law</li>
                            <li>Game analyses and training data until deleted by you</li>
                            <li>Logs for security and debugging (30–180 days depending on type)</li>
                        </ul>
                    </section>

                    {/* Section 7 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">7. Your Rights (GDPR)</h2>
                        <p className="text-muted-foreground leading-relaxed mb-4">
                            You have the following rights:
                        </p>
                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <span className="text-primary">✔</span>
                                <div>
                                    <p className="font-medium">Right to Access</p>
                                    <p className="text-muted-foreground text-sm">Request a copy of your personal data.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <span className="text-primary">✔</span>
                                <div>
                                    <p className="font-medium">Right to Rectification</p>
                                    <p className="text-muted-foreground text-sm">Fix incorrect or incomplete data.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <span className="text-primary">✔</span>
                                <div>
                                    <p className="font-medium">Right to Erasure (&ldquo;Right to be Forgotten&rdquo;)</p>
                                    <p className="text-muted-foreground text-sm">Delete your account and associated data.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <span className="text-primary">✔</span>
                                <div>
                                    <p className="font-medium">Right to Data Portability</p>
                                    <p className="text-muted-foreground text-sm">Export your data in a readable format.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <span className="text-primary">✔</span>
                                <div>
                                    <p className="font-medium">Right to Withdraw Consent</p>
                                    <p className="text-muted-foreground text-sm">For cookies or optional tracking.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <span className="text-primary">✔</span>
                                <div>
                                    <p className="font-medium">Right to File a Complaint</p>
                                    <p className="text-muted-foreground text-sm">
                                        Sweden&apos;s Data Protection Authority (IMY):{" "}
                                        <a
                                            href="https://www.imy.se"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary hover:underline"
                                        >
                                            https://www.imy.se
                                        </a>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Section 8 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">8. Data Security</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We use:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li>HTTPS encryption</li>
                            <li>Prepared statements</li>
                            <li>Role-based access controls</li>
                            <li>Secure credential storage</li>
                            <li>Isolated server environments</li>
                            <li>Cloudflare DDoS protection</li>
                            <li>Monitoring and alerting tools</li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed mt-4">
                            No system is 100% secure, but we take reasonable steps to protect your data.
                        </p>
                    </section>

                    {/* Section 9 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">9. International Transfers</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            If external AI providers or infrastructure are located outside the EU, data may be transferred internationally using:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li>Standard Contractual Clauses (SCC)</li>
                            <li>Equivalent safeguards</li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed mt-4">
                            Where possible, EU-hosted services are used.
                        </p>
                    </section>

                    {/* Section 10 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">10. Children&apos;s Privacy</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            ChessVector is not intended for users under 13.
                            We do not knowingly collect data from minors.
                        </p>
                    </section>

                    {/* Section 11 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">11. Changes to This Policy</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We may update this Privacy Policy from time to time.
                            Changes will be posted with a new &ldquo;Last Updated&rdquo; date.
                        </p>
                    </section>

                    {/* Section 12 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">12. Contact Us</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            If you have questions, requests, or concerns:
                        </p>
                        <div className="bg-muted/50 rounded-lg p-4 mt-4 space-y-2">
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
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-6 text-sm text-muted-foreground">
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                            <Link href="/" className="hover:text-foreground">
                                ← Back to Home
                            </Link>
                            <div className="flex gap-6">
                                <Link href="/terms" className="hover:text-foreground">
                                    Terms of Service
                                </Link>
                                <Link href="/privacy" className="hover:text-foreground font-medium text-foreground">
                                    Privacy Policy
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

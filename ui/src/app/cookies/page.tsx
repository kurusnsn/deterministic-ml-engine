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
    title: "Cookie Policy — ChessVector",
    description: "ChessVector Cookie Policy - How we use cookies and similar technologies on our website.",
};

export default function CookiePolicyPage() {
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
                        Cookie Policy
                    </h1>
                    <p className="text-muted-foreground mt-4">
                        Last updated: {lastUpdated}
                    </p>
                </div>

                {/* Intro */}
                <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
                    <section>
                        <p className="text-muted-foreground leading-relaxed">
                            This Cookie Policy explains how ChessVector (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;) uses cookies and similar technologies when you visit our website or use our services (&ldquo;Service&rdquo;).
                        </p>
                        <p className="text-muted-foreground leading-relaxed mt-4">
                            By using ChessVector, you agree to this Cookie Policy.
                        </p>
                    </section>

                    {/* Section 1 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">1. What Are Cookies?</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Cookies are small text files stored on your device when you visit a website.
                            They allow websites to remember your actions and preferences.
                        </p>
                        <p className="text-muted-foreground leading-relaxed mt-4">
                            We also use related technologies such as:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li>LocalStorage</li>
                            <li>SessionStorage</li>
                            <li>Cache</li>
                            <li>Analytics tokens</li>
                            <li>Security tokens</li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed mt-4">
                            These function similarly to cookies.
                        </p>
                    </section>

                    {/* Section 2 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">2. Types of Cookies We Use</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            ChessVector uses three categories of cookies:
                        </p>

                        <h3 className="text-xl font-medium mt-6 mb-3">2.1 Strictly Necessary Cookies (Essential)</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            These cookies are required for ChessVector to function.
                            We use them for:
                        </p>

                        <div className="space-y-4 mt-4">
                            <div className="flex items-start gap-3">
                                <span className="text-primary">✔</span>
                                <div>
                                    <p className="font-medium">Authentication (Supabase)</p>
                                    <ul className="list-disc list-inside text-muted-foreground text-sm space-y-1 mt-1">
                                        <li>Maintaining user sessions</li>
                                        <li>Keeping you logged in</li>
                                        <li>Protecting your account</li>
                                    </ul>
                                    <p className="text-muted-foreground text-sm mt-2">
                                        <strong>Cookie names:</strong> <code className="text-xs bg-muted px-1 py-0.5 rounded">sb-*-auth-token</code>
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <span className="text-primary">✔</span>
                                <div>
                                    <p className="font-medium">Session Management</p>
                                    <ul className="list-disc list-inside text-muted-foreground text-sm space-y-1 mt-1">
                                        <li>Tracking your session across pages</li>
                                        <li>Maintaining application state</li>
                                        <li>Enabling core functionality</li>
                                    </ul>
                                    <p className="text-muted-foreground text-sm mt-2">
                                        <strong>Cookie name:</strong> <code className="text-xs bg-muted px-1 py-0.5 rounded">session_id</code>
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-muted/50 rounded-lg p-4 mt-6">
                            <p className="text-foreground font-medium">
                                These cookies cannot be disabled, because the service cannot operate without them.
                            </p>
                        </div>

                        <h3 className="text-xl font-medium mt-6 mb-3">2.2 Functional Cookies</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            These cookies improve your experience but are not strictly required.
                            Examples:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li>Saving theme (dark/light)</li>
                            <li>UI layout preferences</li>
                            <li>Recently analyzed games</li>
                            <li>Mobile responsiveness state</li>
                            <li>Feature toggles</li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed mt-4">
                            These do not track you across sites.
                        </p>

                        <h3 className="text-xl font-medium mt-6 mb-3">2.3 Analytics Cookies</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            We use PostHog for privacy-friendly analytics to understand how users interact with our service.
                            These cookies collect anonymized metrics such as:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li>Page visits</li>
                            <li>Feature usage</li>
                            <li>Button clicks</li>
                            <li>Device type</li>
                            <li>Session duration</li>
                        </ul>
                        <p className="text-muted-foreground text-sm mt-4">
                            <strong>Cookie names:</strong> <code className="text-xs bg-muted px-1 py-0.5 rounded">ph_*</code> (PostHog session and tracking cookies)
                        </p>
                        <p className="text-muted-foreground text-sm mt-2">
                            <strong>Host:</strong> EU-hosted PostHog instance (eu.posthog.com)
                        </p>

                        <div className="bg-muted/50 rounded-lg p-4 mt-6">
                            <p className="text-foreground font-medium">We DO NOT:</p>
                            <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                                <li>Use advertising cookies</li>
                                <li>Use third-party trackers for marketing</li>
                                <li>Share analytics data with third parties</li>
                                <li>Track you across other websites</li>
                            </ul>
                        </div>
                    </section>

                    {/* Section 3 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">3. Third-Party Cookies</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            ChessVector integrates with trusted service providers:
                        </p>

                        <div className="space-y-4 mt-4">
                            <div className="flex items-start gap-3">
                                <span className="text-primary">✔</span>
                                <div>
                                    <p className="font-medium">Supabase</p>
                                    <p className="text-muted-foreground text-sm">
                                        For authentication and session management.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <span className="text-primary">✔</span>
                                <div>
                                    <p className="font-medium">Stripe</p>
                                    <p className="text-muted-foreground text-sm">
                                        For handling payments and subscription management.
                                        May place cookies related to checkout, fraud prevention, and subscription status.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <span className="text-primary">✔</span>
                                <div>
                                    <p className="font-medium">PostHog</p>
                                    <p className="text-muted-foreground text-sm">
                                        For privacy-friendly analytics (EU-hosted).
                                        Only active with your consent.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-muted/50 rounded-lg p-4 mt-6">
                            <p className="text-foreground font-medium">
                                We do not allow third parties to use data for advertising.
                            </p>
                        </div>
                    </section>

                    {/* Section 4 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">4. Managing Cookies</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            You can control cookies through your browser:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                            <li>Block cookies</li>
                            <li>Delete cookies</li>
                            <li>Set site-specific rules</li>
                            <li>Send &ldquo;Do Not Track&rdquo; requests</li>
                        </ul>

                        <div className="bg-muted/50 rounded-lg p-4 mt-6">
                            <p className="text-foreground font-medium">If you disable essential cookies:</p>
                            <p className="text-muted-foreground text-sm mt-2">
                                ChessVector may not function correctly or may not allow login.
                            </p>
                        </div>
                    </section>

                    {/* Section 5 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">5. Changes to This Policy</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We may update this Cookie Policy from time to time.
                            Updates will be posted with a new &ldquo;Last Updated&rdquo; date.
                        </p>
                    </section>

                    {/* Section 6 */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">6. Contact Us</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            For questions related to this policy:
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
                                <Link href="/privacy" className="hover:text-foreground">
                                    Privacy Policy
                                </Link>
                                <Link href="/cookies" className="hover:text-foreground font-medium text-foreground">
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

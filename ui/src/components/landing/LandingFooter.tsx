"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Twitter, Instagram } from "lucide-react";

const ThreePawnIcon = dynamic(() => import("@/components/ThreePawnIcon"), {
    ssr: false,
    loading: () => <div className="h-8 w-8" />
});

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

export function LandingFooter() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30">
            <div className="max-w-6xl mx-auto px-4 md:px-6 py-12">
                <div className="grid gap-8 md:grid-cols-4">
                    {/* Brand */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 font-semibold text-lg">
                            <div className="h-8 w-8">
                                <ThreePawnIcon />
                            </div>
                            ChessVector
                        </div>
                        <p className="text-sm text-muted-foreground">
                            AI-powered chess analysis to elevate your game.
                        </p>
                    </div>

                    {/* Features */}
                    <div className="space-y-4">
                        <h4 className="font-semibold">Features</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li>
                                <Link href="/analyze" className="hover:text-foreground transition-colors">
                                    Game Analysis
                                </Link>
                            </li>
                            <li>
                                <Link href="/puzzles" className="hover:text-foreground transition-colors">
                                    Puzzles
                                </Link>
                            </li>
                            <li>
                                <Link href="/openings" className="hover:text-foreground transition-colors">
                                    Opening Trainer
                                </Link>
                            </li>
                            <li>
                                <Link href="/practice" className="hover:text-foreground transition-colors">
                                    Practice
                                </Link>
                            </li>
                            <li>
                                <Link href="/import" className="hover:text-foreground transition-colors">
                                    Import Games
                                </Link>
                            </li>
                            <li>
                                <Link href="/reports" className="hover:text-foreground transition-colors">
                                    Generate Reports
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Resources */}
                    <div className="space-y-4">
                        <h4 className="font-semibold">Resources</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li>
                                <Link href="/pricing" className="hover:text-foreground transition-colors">
                                    Pricing
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Legal */}
                    <div className="space-y-4">
                        <h4 className="font-semibold">Legal</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li>
                                <Link href="/privacy" className="hover:text-foreground transition-colors">
                                    Privacy Policy
                                </Link>
                            </li>
                            <li>
                                <Link href="/terms" className="hover:text-foreground transition-colors">
                                    Terms of Service
                                </Link>
                            </li>
                            <li>
                                <Link href="/cookies" className="hover:text-foreground transition-colors">
                                    Cookie Policy
                                </Link>
                            </li>
                            <li>
                                <Link href="/refund" className="hover:text-foreground transition-colors">
                                    Refund Policy
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <p>© {currentYear} ChessVector. All rights reserved.</p>
                        <p>Stockholm, Sweden</p>
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
        </footer>
    );
}

"use client";

import { useSession } from "next-auth/react";
import { HomeDashboard } from "@/features/home";
import { HeroSection, FeatureCards, PricingCards, FAQ, CallToAction, LandingFooter, ScrollProgress } from "@/components/landing";
import { Zap } from "lucide-react";

/**
 * Home page that conditionally renders:
 * - HomeDashboard for authenticated users
 * - Marketing landing page for unauthenticated users
 */
export default function HomePage() {
  const { data: session, status } = useSession();
  const pageHeading = <h1 className="sr-only">ChessVector</h1>;

  // Show nothing while checking auth (prevents flash)
  if (status === "loading") {
    return null;
  }

  // Authenticated users see the dashboard
  if (session?.user) {
    return (
      <>
        {pageHeading}
        <HomeDashboard />
      </>
    );
  }

  // Unauthenticated users see the landing page
  return (
    <div className="flex flex-col min-h-screen transition-colors duration-700 selection:bg-foreground selection:text-background">
      {pageHeading}
      {/* Scroll Progress Bar */}
      <ScrollProgress />

      {/* Hero Section */}
      <HeroSection />

      {/* Features Section */}
      <FeatureCards />

      {/* Pricing Section */}
      <PricingCards />

      {/* FAQ Section */}
      <FAQ />

      {/* Final CTA */}
      <CallToAction
        title="Ready to Elevate Your Chess Game?"
        description="Use ChessVector to analyze games, solve puzzles, and improve faster than ever before."
        buttonText="Start Analyzing Now"
        buttonHref="/analyze"
        icon={<Zap className="w-5 h-5 mr-2" />}
      />

      {/* Footer */}
      <LandingFooter />
    </div>
  );
}

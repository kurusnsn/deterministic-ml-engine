import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import Navbar from "@/components/Navbar";
import { ThemeProvider } from "@/components/theme-provider";
import QueryProvider from "@/components/QueryProvider";
import MockWorker from "@/components/MockWorker";
import ReactGrabLoader from "@/components/ReactGrabLoader";
import { Toaster } from "sonner";
import { LoaderProvider } from "@/hooks/useGlobalLoader";
import { DailyStreakProvider } from "@/components/streak/DailyStreakProvider";
import { WebVitalsReporter } from "@/components/WebVitalsReporter";
import { PostHogProvider } from "@/components/PostHogProvider";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import MockAuthProvider from "@/components/MockAuthProvider";

// Runtime kill-switch: silence non-error console methods in production
// Prevents 3rd-party libs from leaking logs to browser DevTools
if (typeof window !== "undefined" && process.env.NODE_ENV === "production") {
  console.log = () => { };
  console.info = () => { };
  console.warn = () => { };
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ChessVector - AI-Powered Chess Analysis",
  description: "Master chess with intelligent AI analysis, opening explorer, and personalized insights.",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const enableReactGrab =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_ENABLE_REACT_GRAB === "true";
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <MockWorker />
        {enableReactGrab ? <ReactGrabLoader /> : null}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <WebVitalsReporter />
          <MockAuthProvider />
          <QueryProvider>
            <SessionProvider>
              <PostHogProvider>
                <LoaderProvider>
                  <DailyStreakProvider>
                    <header>
                      <Navbar />
                    </header>
                    <main>{children}</main>
                    <footer className="sr-only">ChessVector footer</footer>
                    <div id="portal-root"></div>
                    <Toaster richColors position="top-right" />
                    <CookieConsentBanner />
                  </DailyStreakProvider>
                </LoaderProvider>
              </PostHogProvider>
            </SessionProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

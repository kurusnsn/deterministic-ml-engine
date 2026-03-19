'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Cookie, Shield, BarChart3, X } from 'lucide-react';
import { useCookieConsentStore } from '@/stores/useCookieConsentStore';
import Link from 'next/link';

export function CookieConsentBanner() {
  const {
    showBanner,
    preferences,
    isInitialized,
    initialize,
    acceptAll,
    acceptNecessaryOnly,
    updatePreferences,
  } = useCookieConsentStore();

  const [showDetails, setShowDetails] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(preferences?.analytics ?? false);

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Sync local state with store
  useEffect(() => {
    setAnalyticsEnabled(preferences?.analytics ?? false);
  }, [preferences?.analytics]);

  const handleSavePreferences = () => {
    updatePreferences({ analytics: analyticsEnabled });
  };

  if (!isInitialized || !showBanner) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6"
      >
        <Card className="max-w-2xl mx-auto shadow-lg border-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cookie className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Cookie Preferences</CardTitle>
              </div>
              {preferences && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={acceptNecessaryOnly}
                  className="h-8 w-8"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            <CardDescription>
              We use cookies to improve your experience. You can customize your preferences below.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {showDetails ? (
              <div className="space-y-4">
                {/* Necessary Cookies */}
                <div className="flex items-start justify-between gap-4 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-green-600 mt-0.5" />
                    <div>
                      <Label className="font-medium">Strictly Necessary</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Required for authentication, payments, and core functionality. Cannot be disabled.
                      </p>
                    </div>
                  </div>
                  <Switch checked disabled aria-label="Strictly necessary cookies (always enabled)" />
                </div>

                {/* Analytics Cookies */}
                <div className="flex items-start justify-between gap-4 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <BarChart3 className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <Label htmlFor="analytics-toggle" className="font-medium cursor-pointer">
                        Analytics
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Help us understand how you use the app so we can improve it. Data is anonymized.
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="analytics-toggle"
                    checked={analyticsEnabled}
                    onCheckedChange={setAnalyticsEnabled}
                    aria-label="Analytics cookies"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <Button onClick={handleSavePreferences} className="flex-1">
                    Save Preferences
                  </Button>
                  <Button variant="outline" onClick={() => setShowDetails(false)}>
                    Back
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  We use essential cookies for authentication and payments (always on),
                  and optional analytics cookies to improve our service.{' '}
                  <Link href="/privacy" className="underline hover:text-primary">
                    Learn more
                  </Link>
                </p>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={acceptAll} className="flex-1">
                    Accept All
                  </Button>
                  <Button variant="outline" onClick={acceptNecessaryOnly} className="flex-1">
                    Necessary Only
                  </Button>
                  <Button variant="ghost" onClick={() => setShowDetails(true)}>
                    Customize
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}

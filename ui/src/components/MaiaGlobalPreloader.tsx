"use client";

import { useEffect } from "react";

/**
 * Silent global preloader for Maia engine.
 * Starts loading in background as soon as user visits the site.
 * No UI - just kicks off the download.
 */
export function MaiaGlobalPreloader() {
    useEffect(() => {
        // Start loading Maia in background after a short delay
        // to not compete with initial page load resources
        const timer = setTimeout(async () => {
            try {
                const { initMaia, isMaiaReady } = await import("@/lib/engine/maiaEngine");
                if (!isMaiaReady()) {
                    // Start loading silently in background
                    initMaia().catch(console.error);
                }
            } catch (e) {
                // Ignore errors - this is just a background preload
                console.debug("Maia preload skipped:", e);
            }
        }, 2000); // Wait 2 seconds after page load to start preloading

        return () => clearTimeout(timer);
    }, []);

    // This component renders nothing
    return null;
}

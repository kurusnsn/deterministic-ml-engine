"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/**
 * Scroll progress bar that shows at the top of the page.
 * Theme-aware: white bar on dark mode, black bar on light mode.
 */
export function ScrollProgress() {
    const { scrollYProgress } = useScroll();
    const scaleX = useSpring(scrollYProgress, {
        stiffness: 100,
        damping: 30,
        restDelta: 0.001
    });

    return (
        <motion.div
            className="fixed top-0 left-0 right-0 h-[3px] origin-left z-[110] bg-foreground"
            style={{ scaleX }}
        />
    );
}

'use client';

import { Flame } from "lucide-react";
import { motion } from "framer-motion";



interface StreakNavButtonProps {
  streak: number;
  onClick: () => void;
}

export function StreakNavButton({ streak, onClick }: StreakNavButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-900 px-2 text-sm font-medium text-orange-900 shadow-xs transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-orange-500 bg-gradient-to-br from-orange-400 to-red-500 shrink-0">
        <Flame className="h-3.5 w-3.5 fill-white text-white" />
      </div>
      <div className="flex items-baseline gap-1">
        <motion.span
          key={streak}
          className="bg-gradient-to-br from-orange-500 to-red-500 bg-clip-text text-sm font-bold text-transparent"
          initial={{ scale: 1.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", duration: 0.5 }}
        >
          {streak}
        </motion.span>
        <span className="text-xs text-muted-foreground font-medium">{streak === 1 ? "day" : "days"}</span>
      </div>
    </motion.button>
  );
}

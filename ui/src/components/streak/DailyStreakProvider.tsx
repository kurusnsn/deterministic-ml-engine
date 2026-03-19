'use client';

import { createContext, useContext, type ReactNode } from "react";

import { useDailyVisitStreak } from "@/hooks/useDailyVisitStreak";

import { StreakPopup } from "./StreakPopup";

type DailyStreakValue = ReturnType<typeof useDailyVisitStreak>;

const DailyStreakContext = createContext<DailyStreakValue | null>(null);

export function DailyStreakProvider({ children }: { children: ReactNode }) {
  const streak = useDailyVisitStreak();

  return (
    <DailyStreakContext.Provider value={streak}>
      {children}
      {streak.ready && (
        <StreakPopup
          open={streak.open}
          onOpenChange={streak.setOpen}
          streak={streak.streak}
          visitedDays={streak.visitedDays}
        />
      )}
    </DailyStreakContext.Provider>
  );
}

export function useDailyStreak() {
  const context = useContext(DailyStreakContext);
  if (!context) {
    throw new Error("useDailyStreak must be used within DailyStreakProvider");
  }
  return context;
}

'use client';

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "chessvector-streak-visits";
const MAX_HISTORY_DAYS = 21;

interface StoredVisits {
  dates: string[];
}

interface StreakState {
  open: boolean;
  ready: boolean;
  streak: number;
  visitedDays: number[];
}

const DEFAULT_STATE: StreakState = {
  open: false,
  ready: false,
  streak: 0,
  visitedDays: [],
};

function formatDate(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  // Use local date parts to avoid UTC timezone issues
  const year = copy.getFullYear();
  const month = String(copy.getMonth() + 1).padStart(2, "0");
  const day = String(copy.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseStoredData(raw: string | null): StoredVisits {
  if (!raw) {
    return { dates: [] };
  }

  try {
    const parsed = JSON.parse(raw) as StoredVisits;
    if (!Array.isArray(parsed?.dates)) {
      return { dates: [] };
    }
    return { dates: parsed.dates.filter((value): value is string => typeof value === "string") };
  } catch {
    return { dates: [] };
  }
}

function writeStorage(dates: string[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ dates }));
}

function clampHistory(dates: string[]) {
  const unique = Array.from(new Set(dates)).sort();
  if (unique.length <= MAX_HISTORY_DAYS) {
    return unique;
  }
  return unique.slice(unique.length - MAX_HISTORY_DAYS);
}

function getVisitedDaysForCurrentWeek(dates: string[], reference: Date) {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());

  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  const result = new Set<number>();

  dates.forEach((dateStr) => {
    // Parse date parts directly to avoid timezone issues
    const parts = dateStr.split("-");
    if (parts.length !== 3) return;
    const date = new Date(
      parseInt(parts[0]!, 10),
      parseInt(parts[1]!, 10) - 1, // months are 0-indexed
      parseInt(parts[2]!, 10)
    );
    date.setHours(0, 0, 0, 0);
    if (date >= start && date < end) {
      result.add(date.getDay());
    }
  });

  return Array.from(result).sort((a, b) => a - b);
}

function calculateStreak(dates: Set<string>, today: Date) {
  const cursor = new Date(today);
  cursor.setHours(0, 0, 0, 0);
  let streak = 0;

  while (streak <= MAX_HISTORY_DAYS) {
    const key = formatDate(cursor);
    if (!dates.has(key)) {
      break;
    }
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function useDailyVisitStreak() {
  const [state, setState] = useState(DEFAULT_STATE);

  const refresh = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = parseStoredData(window.localStorage.getItem(STORAGE_KEY));
    const todayKey = formatDate(new Date());
    const alreadyRecordedToday = stored.dates.includes(todayKey);

    const nextDates = clampHistory(alreadyRecordedToday ? stored.dates : [...stored.dates, todayKey]);
    if (!alreadyRecordedToday || nextDates.length !== stored.dates.length) {
      writeStorage(nextDates);
    }

    const dateSet = new Set(nextDates);
    const now = new Date();

    setState({
      open: !alreadyRecordedToday,
      ready: true,
      streak: calculateStreak(dateSet, now),
      visitedDays: getVisitedDaysForCurrentWeek(nextDates, now),
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setOpen = useCallback((open: boolean) => {
    setState((prev) => ({ ...prev, open }));
  }, []);

  const reset = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(STORAGE_KEY);
    setState((prev) => ({ ...DEFAULT_STATE, ready: prev.ready }));
  }, []);

  return {
    open: state.open,
    ready: state.ready,
    streak: state.streak,
    visitedDays: state.visitedDays,
    refresh,
    reset,
    setOpen,
  };
}

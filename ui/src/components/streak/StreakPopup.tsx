'use client';

import { motion } from "framer-motion";
import { Flame } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";



interface StreakPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  streak: number;
  visitedDays: number[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function StreakPopup({ open, onOpenChange, streak, visitedDays }: StreakPopupProps) {
  const today = new Date().getDay();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center">Your Streak</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 lg:space-y-6 py-2 lg:py-4">
          {/* Flame icon - smaller on mobile */}
          <div className="flex justify-center">
            <motion.div
              className="flex h-20 w-20 lg:h-32 lg:w-32 items-center justify-center overflow-hidden rounded-full border-4 border-orange-500 bg-gradient-to-br from-orange-400 to-red-500"
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{
                scale: { repeat: Infinity, duration: 2, ease: "easeInOut" },
              }}
            >
              <Flame className="h-10 w-10 lg:h-16 lg:w-16 fill-white text-white" />
            </motion.div>
          </div>

          {/* Streak counter - smaller on mobile */}
          <div className="text-center">
            <div className="inline-flex items-baseline gap-2">
              <motion.span
                key={streak}
                className="bg-gradient-to-br from-orange-500 to-red-500 bg-clip-text text-4xl lg:text-6xl text-transparent"
                initial={{ scale: 0.5, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={{ type: "spring", duration: 0.6, bounce: 0.6 }}
              >
                {streak}
              </motion.span>
              <span className="text-muted-foreground text-sm lg:text-base">{streak === 1 ? "day" : "days"}</span>
            </div>
            <motion.p
              className="mt-1 lg:mt-2 text-sm lg:text-base text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {streak === 0 && "Start your streak today!"}
              {streak === 1 && "Great start! Keep it going!"}
              {streak >= 2 && streak < 5 && "You're on fire!"}
              {streak >= 5 && streak < 7 && "Amazing streak!"}
              {streak >= 7 && "Perfect week! 🎉"}
            </motion.p>
          </div>

          {/* Week days - smaller boxes on mobile */}
          <div>
            <p className="mb-2 lg:mb-3 text-center text-sm lg:text-base text-muted-foreground">This Week</p>
            <div className="grid grid-cols-7 gap-1 lg:gap-2">
              {DAYS.map((day, index) => {
                const isVisited = visitedDays.includes(index);
                const isToday = index === today;

                return (
                  <div key={day} className="flex flex-col items-center gap-1 lg:gap-2">
                    <motion.div
                      className={`flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg ${isVisited
                        ? "bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg"
                        : "bg-gray-100 text-gray-400"
                        } ${isToday ? "ring-2 ring-orange-300 ring-offset-1 lg:ring-offset-2" : ""}`}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        duration: 0.3,
                        delay: index * 0.05,
                        ease: "easeOut",
                      }}
                    >
                      {isVisited ? (
                        <Flame className="h-4 w-4 lg:h-6 lg:w-6 fill-white" />
                      ) : (
                        <div className="h-2 w-2 lg:h-3 lg:w-3 rounded-full bg-gray-300" />
                      )}
                    </motion.div>
                    <span className={`text-xs lg:text-sm ${isToday ? "font-medium text-orange-600" : "text-muted-foreground"}`}>{day}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer message - smaller padding on mobile */}
          <motion.div
            className="rounded-lg bg-gradient-to-br from-orange-50 to-red-50 p-3 lg:p-4 text-center"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <p className="text-sm lg:text-base text-muted-foreground">Come back tomorrow to keep your streak alive!</p>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

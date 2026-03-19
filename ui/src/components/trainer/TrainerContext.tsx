"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

type TimeControl = "auto" | "bullet" | "blitz" | "rapid" | "classical" | "all";
type Side = "both" | "white" | "black";

interface TrainerState {
    timeControl: TimeControl;
    side: Side;
    setTimeControl: (tc: TimeControl) => void;
    setSide: (s: Side) => void;
}

const TrainerContext = createContext<TrainerState | undefined>(undefined);

export function TrainerProvider({ children }: { children: ReactNode }) {
    const [timeControl, setTimeControl] = useState<TimeControl>("all");
    const [side, setSide] = useState<Side>("both");

    return (
        <TrainerContext.Provider
            value={{ timeControl, side, setTimeControl, setSide }}
        >
            {children}
        </TrainerContext.Provider>
    );
}

export function useTrainerContext() {
    const context = useContext(TrainerContext);
    if (!context) {
        throw new Error("useTrainerContext must be used within a TrainerProvider");
    }
    return context;
}

export type { TimeControl, Side };

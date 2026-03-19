"use client";

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import type { Repertoire } from "./repertoireStore";
import type { PracticeBoardRef } from "./PracticeBoard";

export type Mode = "maia" | "repertoire" | "select-openings";

interface MaiaConfig {
    side: "white" | "black" | "random";
    time: string;
    level: number;
    opening?: { san: string[]; name: string; eco?: string } | "random";
    speed?: "slow" | "normal" | "fast";
    temperature?: number;
}

interface TrainingData {
    lines: string[][];
    side: "white" | "black";
    openings: { eco?: string; name: string }[];
}

interface PracticeContextType {
    // Mode state
    mode: Mode;
    setMode: (m: Mode) => void;

    // Active state (board lock/unlock)
    active: boolean;
    setActive: (v: boolean) => void;

    // Status text
    statusText: string;
    setStatusText: (s: string) => void;

    // Selected repertoire
    selectedRep: Repertoire | null;
    setSelectedRep: (rep: Repertoire | null) => void;

    // Temporary training data (from custom openings)
    tempTrainingData: TrainingData | null;
    setTempTrainingData: (data: TrainingData | null) => void;

    // Maia settings
    maiaSide: "white" | "black";
    setMaiaSide: (s: "white" | "black") => void;
    maiaTime: string;
    setMaiaTime: (t: string) => void;
    maiaLevel: number;
    setMaiaLevel: (l: number) => void;
    maiaOpening: { san: string[]; name: string; eco?: string } | "random" | undefined;
    setMaiaOpening: (o: { san: string[]; name: string; eco?: string } | "random" | undefined) => void;
    maiaSpeed: "slow" | "normal" | "fast";
    setMaiaSpeed: (s: "slow" | "normal" | "fast") => void;
    maiaTemperature: number;
    setMaiaTemperature: (t: number) => void;

    // Board state
    boardSize: number;
    setBoardSize: (size: number) => void;

    // Timer state
    whiteTime: number;
    setWhiteTime: (t: number) => void;
    blackTime: number;
    setBlackTime: (t: number) => void;
    currentTurn: 'w' | 'b';
    setCurrentTurn: (t: 'w' | 'b') => void;

    // Progress state
    progress: { current: number; total: number };
    setProgress: (p: { current: number; total: number }) => void;

    // Board ref
    boardRef: React.RefObject<PracticeBoardRef | null>;

    // Handlers
    handleTimerUpdate: (w: number, b: number, turn: 'w' | 'b') => void;
    handleProgressChange: (current: number, total: number) => void;

    onStartMaia: (cfg: MaiaConfig) => void;
    onStartRepertoire: (rep: Repertoire) => void;
    onStartSelectOpenings: (data: TrainingData) => void;
    onModeChange: (m: Mode) => void;
    onResign: () => void;
    onAbandon: () => void;
    canAbandon: () => boolean;

    // UI state
    mounted: boolean;
    isDesktop: boolean;

    // Title for active panel
    title: string | undefined;
}

const PracticeContext = createContext<PracticeContextType | null>(null);

export function usePracticeContext() {
    const context = useContext(PracticeContext);
    if (!context) {
        throw new Error("usePracticeContext must be used within a PracticeProvider");
    }
    return context;
}

interface PracticeProviderProps {
    children: React.ReactNode;
    initialMode: Mode;
}

export function PracticeProvider({ children, initialMode }: PracticeProviderProps) {
    const [mode, setMode] = useState<Mode>(initialMode);
    const [active, setActive] = useState(false);
    const [statusText, setStatusText] = useState<string>("Locked — choose a mode to begin");
    const [selectedRep, setSelectedRep] = useState<Repertoire | null>(null);
    const [tempTrainingData, setTempTrainingData] = useState<TrainingData | null>(null);
    const [maiaSide, setMaiaSide] = useState<"white" | "black">("white");
    const [maiaTime, setMaiaTime] = useState<string>("5+0");
    const [maiaLevel, setMaiaLevel] = useState<number>(1500);
    const [maiaOpening, setMaiaOpening] = useState<{ san: string[]; name: string; eco?: string } | "random" | undefined>(undefined);
    const [maiaSpeed, setMaiaSpeed] = useState<"slow" | "normal" | "fast">("normal");
    const [maiaTemperature, setMaiaTemperature] = useState<number>(0.8);
    const [boardSize, setBoardSize] = useState<number>(500);
    const [mounted, setMounted] = useState(false);
    const [isDesktop, setIsDesktop] = useState(false);
    const [whiteTime, setWhiteTime] = useState<number>(300);
    const [blackTime, setBlackTime] = useState<number>(300);
    const [currentTurn, setCurrentTurn] = useState<'w' | 'b'>('w');
    const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

    const boardRef = useRef<PracticeBoardRef | null>(null);

    // Set mounted on client and track screen size
    useEffect(() => {
        setMounted(true);

        const handleResize = () => {
            setIsDesktop(window.innerWidth >= 1024);
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleTimerUpdate = useCallback((w: number, b: number, turn: 'w' | 'b') => {
        setWhiteTime(w);
        setBlackTime(b);
        setCurrentTurn(turn);
    }, []);

    const handleProgressChange = useCallback((current: number, total: number) => {
        setProgress({ current, total });
    }, []);

    const onStartMaia = useCallback((cfg: MaiaConfig) => {
        setMode("maia");
        const side: "white" | "black" = (cfg.side as any) === "random" ? (Math.random() < 0.5 ? "white" : "black") : (cfg.side as "white" | "black");
        setMaiaSide(side);
        setMaiaTime(cfg.time || "5+0");
        setMaiaLevel(cfg.level);
        setMaiaOpening(cfg.opening);
        setMaiaSpeed(cfg.speed || "normal");
        setMaiaTemperature(cfg.temperature ?? 0.8);
        setActive(true);
    }, []);

    const onStartRepertoire = useCallback((rep: Repertoire) => {
        setMode("repertoire");
        setSelectedRep(rep);
        setTempTrainingData(null);
        setActive(true);
    }, []);

    const onStartSelectOpenings = useCallback((data: TrainingData) => {
        setMode("select-openings");
        setTempTrainingData(data);
        setSelectedRep(null);
        setActive(true);
    }, []);

    const onModeChange = useCallback((m: Mode) => {
        setMode(m);
        setActive(false);
        setStatusText("Locked — configure the right panel to start");
    }, []);

    const onResign = useCallback(() => {
        boardRef.current?.resignGame();
    }, []);

    const onAbandon = useCallback(() => {
        boardRef.current?.abandonGame();
    }, []);

    const canAbandon = useCallback(() => {
        // User can abandon only if they haven't played any moves yet
        // getMoveCount returns total moves in the game
        // For user playing white: moves 1, 3, 5... are theirs
        // For user playing black: moves 2, 4, 6... are theirs
        const totalMoves = boardRef.current?.getMoveCount() ?? 0;
        const userIsWhite = maiaSide === 'white';
        // Calculate how many user moves have been played
        // White plays on odd move numbers (1, 3, 5...) which are indices 0, 2, 4...
        // Black plays on even move numbers (2, 4, 6...) which are indices 1, 3, 5...
        const userMoves = userIsWhite ? Math.ceil(totalMoves / 2) : Math.floor(totalMoves / 2);
        return userMoves === 0;
    }, [maiaSide]);

    // Compute title for active panel
    const title = mode === "repertoire" && selectedRep
        ? selectedRep.name
        : mode === "select-openings" && tempTrainingData
            ? tempTrainingData.openings.length === 1
                ? tempTrainingData.openings[0].name
                : `${tempTrainingData.openings.length} Selected Openings`
            : undefined;

    const value: PracticeContextType = {
        mode,
        setMode,
        active,
        setActive,
        statusText,
        setStatusText,
        selectedRep,
        setSelectedRep,
        tempTrainingData,
        setTempTrainingData,
        maiaSide,
        setMaiaSide,
        maiaTime,
        setMaiaTime,
        maiaLevel,
        setMaiaLevel,
        maiaOpening,
        setMaiaOpening,
        maiaSpeed,
        setMaiaSpeed,
        maiaTemperature,
        setMaiaTemperature,
        boardSize,
        setBoardSize,
        whiteTime,
        setWhiteTime,
        blackTime,
        setBlackTime,
        currentTurn,
        setCurrentTurn,
        progress,
        setProgress,
        boardRef,
        handleTimerUpdate,
        handleProgressChange,
        onStartMaia,
        onStartRepertoire,
        onStartSelectOpenings,
        onModeChange,
        onResign,
        onAbandon,
        canAbandon,
        mounted,
        isDesktop,
        title,
    };

    return (
        <PracticeContext.Provider value={value}>
            {children}
        </PracticeContext.Provider>
    );
}

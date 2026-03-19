"use client";

// Force dynamic rendering - Supabase credentials not available at build time
export const dynamic = 'force-dynamic';

import { PracticeShell } from "@/components/practice/PracticeShell";
import { MaiaPanel } from "@/components/practice/panels/MaiaPanel";

export default function PlayMaiaPage() {
    return (
        <>
            <h1 className="sr-only">Play Maia</h1>
            <PracticeShell mode="maia">
                <MaiaPanel />
            </PracticeShell>
        </>
    );
}

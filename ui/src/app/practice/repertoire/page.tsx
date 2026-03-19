"use client";

import { PracticeShell } from "@/components/practice/PracticeShell";
import { RepertoirePanel } from "@/components/practice/panels/RepertoirePanel";

export default function RepertoirePage() {
    return (
        <>
            <h1 className="sr-only">Practice Repertoire</h1>
            <PracticeShell mode="repertoire">
                <RepertoirePanel />
            </PracticeShell>
        </>
    );
}

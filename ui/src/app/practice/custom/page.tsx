"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PracticeShell } from "@/components/practice/PracticeShell";
import { CustomPanel } from "@/components/practice/panels/CustomPanel";

function CustomPageInner() {
    const searchParams = useSearchParams();
    const preselectedEco = searchParams.get("eco") || undefined;

    return (
        <>
            <h1 className="sr-only">Custom Openings Practice</h1>
            <PracticeShell mode="select-openings">
                <CustomPanel preselectedEco={preselectedEco} />
            </PracticeShell>
        </>
    );
}

export default function CustomPage() {
    return (
        <Suspense>
            <CustomPageInner />
        </Suspense>
    );
}

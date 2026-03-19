"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "./UpgradeModal";
import { cn } from "@/lib/utils";

interface PremiumLockProps {
    children: React.ReactNode;
    className?: string;
    isLocked?: boolean; // Optional prop to conditionally lock
}

export function PremiumLock({ children, className, isLocked = true }: PremiumLockProps) {
    const [showModal, setShowModal] = useState(false);

    if (!isLocked) {
        return <>{children}</>;
    }

    return (
        <div className={cn("relative group", className)}>
            {/* Content with blur effect */}
            <div className="blur-sm select-none pointer-events-none opacity-50 transition-all duration-300 group-hover:blur-md group-hover:opacity-40">
                {children}
            </div>

            {/* Overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-4">
                <div className="bg-background/80 backdrop-blur-sm p-6 rounded-xl border shadow-lg text-center max-w-sm animate-in fade-in zoom-in duration-300">
                    <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-3">
                        <Lock className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-bold text-lg mb-1">Premium Feature</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        Upgrade to Pro to unlock this feature and more.
                    </p>
                    <Button
                        onClick={() => setShowModal(true)}
                        className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white border-0"
                    >
                        Unlock Now
                    </Button>
                </div>
            </div>

            <UpgradeModal open={showModal} onOpenChange={setShowModal} />
        </div>
    );
}

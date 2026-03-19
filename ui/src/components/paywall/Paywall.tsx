"use client";

import { useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UpgradeModal } from "./UpgradeModal";

interface PaywallProps {
    title?: string;
    subtitle?: string;
    icon?: React.ElementType;
}

export function Paywall({
    title = "Premium Feature",
    subtitle = "Upgrade to access LLM analysis on your games.",
    icon: Icon = Sparkles
}: PaywallProps) {
    const [showModal, setShowModal] = useState(false);

    return (
        <>
            <Card className="w-full p-8 flex flex-col items-center justify-center text-center border-dashed border-2 bg-muted/30">
                <div className="bg-background p-4 rounded-full shadow-sm mb-4 ring-1 ring-border">
                    <Icon className="w-8 h-8 text-amber-500" />
                </div>

                <h3 className="text-xl font-bold mb-2">{title}</h3>
                <p className="text-muted-foreground max-w-md mb-6">
                    {subtitle}
                </p>

                <Button
                    onClick={() => setShowModal(true)}
                    size="lg"
                    className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white border-0 shadow-md hover:shadow-lg transition-all"
                >
                    <Lock className="w-4 h-4 mr-2" />
                    Upgrade Now
                </Button>
            </Card>

            <UpgradeModal open={showModal} onOpenChange={setShowModal} />
        </>
    );
}

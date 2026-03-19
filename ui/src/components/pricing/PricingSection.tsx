"use client";

import { PricingTable } from "./PricingTable";

export function PricingSection() {
    return (
        <section className="py-24 px-4 md:px-6 bg-background">
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-16 space-y-4">
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                        Simple, transparent pricing
                    </h2>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        Choose the plan that fits your chess journey. Upgrade anytime to unlock advanced AI insights.
                    </p>
                </div>

                <PricingTable />

                <div className="mt-12 text-center">
                    <p className="text-sm text-muted-foreground">
                        Questions? Contact our support team for help.
                    </p>
                </div>
            </div>
        </section>
    );
}

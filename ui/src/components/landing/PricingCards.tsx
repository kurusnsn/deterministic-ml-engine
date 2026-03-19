"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MovingBorder } from "@/components/ui/moving-border";

interface PricingPlan {
    tier: string;
    monthlyPrice: string;
    annualPrice: string;
    popular?: boolean;
    features: string[];
    cta: string;
    href: string;
}

const plans: PricingPlan[] = [
    {
        tier: "Free",
        monthlyPrice: "$0",
        annualPrice: "$0",
        features: [
            "5 Deep Analysis Games / day",
            "Basic Engine Evaluation",
            "Standard Puzzle Set",
            "7-Day Pro Trial"
        ],
        cta: "Get Started Free",
        href: "/analyze"
    },
    {
        tier: "Basic",
        monthlyPrice: "$1.99",
        annualPrice: "$1.59", // ~$19.10/yr
        features: [
            "Unlimited game review",
            "Essential engine analysis",
            "Opening explorer",
            "Cloud storage for 200 games"
        ],
        cta: "Go Basic",
        href: "/pricing"
    },
    {
        tier: "Plus",
        monthlyPrice: "$3.49",
        annualPrice: "$2.79", // ~$33.50/yr
        popular: true,
        features: [
            "Everything in Basic",
            "AI move explanations",
            "Advanced performance reports",
            "Unlimited cloud storage",
            "Priority support"
        ],
        cta: "Upgrade to Plus",
        href: "/pricing"
    }
];

export function PricingCards() {
    const [isAnnual, setIsAnnual] = useState(false);

    return (
        <section id="pricing" className="py-40 px-8 relative z-10 border-t border-border bg-background">
            {/* Section Header */}
            <div className="text-center mb-16">
                <h2 className="text-5xl md:text-7xl lg:text-[8rem] font-bold tracking-tighter mb-8">
                    Choose Your Level
                </h2>
                <p className="text-xl md:text-3xl font-light tracking-tight text-muted-foreground mb-12">
                    Scale your chess intelligence as you climb the ranks.
                </p>

                {/* Billing Toggle */}
                <div className="flex items-center justify-center gap-4">
                    <Label
                        htmlFor="billing-mode"
                        className={cn("text-lg cursor-pointer", !isAnnual ? "text-foreground font-bold" : "text-muted-foreground")}
                        onClick={() => setIsAnnual(false)}
                    >
                        Monthly
                    </Label>
                    <Switch
                        id="billing-mode"
                        checked={isAnnual}
                        onCheckedChange={setIsAnnual}
                    />
                    <Label
                        htmlFor="billing-mode"
                        className={cn("text-lg cursor-pointer flex items-center gap-2", isAnnual ? "text-foreground font-bold" : "text-muted-foreground")}
                        onClick={() => setIsAnnual(true)}
                    >
                        Annual
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-foreground/10 text-foreground border border-foreground/20">
                            Save 20%
                        </span>
                    </Label>
                </div>
            </div>

            {/* Pricing Cards */}
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 items-stretch">
                {plans.map((plan, i) => (
                    <div
                        key={i}
                        className={cn(
                            "relative group flex flex-col p-[1.5px] rounded-[2rem] transition-all duration-700 hover:translate-y-[-10px]",
                            plan.popular ? "z-10 md:scale-[1.05]" : ""
                        )}
                    >
                        {/* Moving border highlight - visible on hover */}
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <MovingBorder duration={3000} rx="2rem" ry="2rem">
                                {/* A thin segment that rotates (matching FeatureCards style) */}
                                <div className="h-[1.5px] w-16 bg-black dark:bg-white opacity-90" />
                            </MovingBorder>
                        </div>

                        {/* Card content container */}
                        <div className={cn(
                            "relative flex flex-col p-8 lg:p-10 h-full w-full rounded-[calc(2rem-1.5px)] border overflow-hidden z-10",
                            plan.popular
                                ? "border-foreground bg-foreground/[0.03]"
                                : "border-border bg-card"
                        )}>

                            {/* Tier Name */}
                            <span className="text-[12px] font-black uppercase tracking-[0.5em] mb-8 text-muted-foreground">
                                {plan.tier}
                            </span>

                            {/* Price */}
                            <div className="flex items-baseline gap-1 mb-8">
                                <span className="text-5xl lg:text-7xl font-bold tracking-tighter">
                                    {isAnnual ? plan.annualPrice : plan.monthlyPrice}
                                </span>
                                <span className="font-bold text-lg uppercase tracking-widest text-muted-foreground">
                                    /mo
                                </span>
                            </div>
                            {isAnnual && plan.monthlyPrice !== "$0" && (
                                <div className="text-sm text-muted-foreground -mt-6 mb-8 font-medium">
                                    Billed ${(parseFloat(plan.annualPrice.replace('$', '')) * 12).toFixed(2)} yearly
                                </div>
                            )}

                            {/* Features */}
                            <ul className="space-y-4 mb-12 flex-grow">
                                {plan.features.map((feature, j) => (
                                    <li key={j} className="flex items-start gap-3 text-base font-light text-muted-foreground">
                                        <div className="mt-1 w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 border-border bg-muted">
                                            <Check size={12} className="text-foreground" strokeWidth={3} />
                                        </div>
                                        {feature}
                                    </li>
                                ))}
                            </ul>

                            {/* CTA Button */}
                            <a
                                href={plan.href}
                                className={cn(
                                    "w-full py-4 rounded-xl font-black text-[11px] uppercase tracking-[0.3em] transition-all duration-500 text-center block",
                                    plan.popular
                                        ? "bg-foreground text-background hover:opacity-90"
                                        : "bg-muted text-foreground hover:bg-accent"
                                )}
                            >
                                {plan.cta}
                            </a>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
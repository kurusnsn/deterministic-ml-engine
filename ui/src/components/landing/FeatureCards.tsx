"use client";

import { Cpu, LineChart, Target, Zap } from "lucide-react";
import { MovingBorder } from "@/components/ui/moving-border";

interface FeatureCardProps {
    icon: typeof Cpu;
    title: string;
    desc: string;
}

function FeatureCard({ icon: Icon, title, desc }: FeatureCardProps) {
    return (
        <div className="relative rounded-[1.5rem] group h-full min-h-[220px] p-[1.5px] overflow-hidden">
            {/* Moving border highlight - visible on hover */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <MovingBorder duration={3000} rx="24px" ry="24px">
                    {/* A thin segment that rotates (1.5x border width) */}
                    <div className="h-[1.5px] w-16 bg-black dark:bg-white opacity-90" />
                </MovingBorder>
            </div>

            {/* Client content container sitting on top of moving border */}
            <div className="relative rounded-[calc(1.5rem-1.5px)] p-6 md:p-8 h-full flex flex-col justify-start bg-card border border-foreground/15 overflow-hidden z-10">
                {/* Background Icon - Upper Right Quadrant */}
                <div
                    className="absolute top-0 right-0 p-4 opacity-[0.06] transition-all duration-700 ease-out group-hover:opacity-15 group-hover:scale-105 pointer-events-none flex items-center justify-center text-foreground"
                    style={{ width: "40%", height: "50%" }}
                >
                    <Icon size="100%" strokeWidth={1} />
                </div>

                <div className="relative z-10 flex flex-col h-full">
                    {/* Icon Badge */}
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-6 border shadow-xl bg-foreground border-foreground">
                        <Icon size={18} className="text-background" />
                    </div>

                    {/* Content */}
                    <div className="mt-0">
                        <h3 className="text-xl md:text-2xl font-bold mb-3 tracking-tight transition-all group-hover:translate-x-1">
                            {title}
                        </h3>
                        <p className="text-sm md:text-base leading-relaxed font-light text-muted-foreground group-hover:text-foreground/70 transition-colors duration-500">
                            {desc}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

const features = [
    {
        icon: Cpu,
        title: "LLM Explanations",
        desc: "Moves aren't just evaluated by numbers, they're explained in plain language by our fine-tuned AI assistant."
    },
    {
        icon: LineChart,
        title: "Velocity Analytics",
        desc: "Visualize momentum shifts and generate detailed reports analyzing your playing style, time control performance, and strategic patterns."
    },
    {
        icon: Target,
        title: "Adaptive Training",
        desc: "The system identifies specific tactical weaknesses and generates dynamic puzzles tailored to you."
    },
    {
        icon: Zap,
        title: "Real-time Evaluation",
        desc: "Low-latency engine analysis running on edge-computing for instantaneous feedback."
    }
];

export function FeatureCards() {
    return (
        <section id="analysis" className="py-40 px-8 max-w-[1400px] mx-auto z-10 relative">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
                {/* Section Header - spans 2 columns */}
                <div className="md:col-span-2 flex flex-col justify-center py-6">
                    <h2 className="text-5xl md:text-[5.5rem] font-bold tracking-tight leading-[1.05] mb-2">
                        Intelligence for every
                    </h2>
                    <h2 className="text-5xl md:text-[5.5rem] font-bold tracking-tight leading-[1.05] mb-6 text-muted-foreground">
                        strategic maneuver.
                    </h2>
                    <p className="max-w-xl text-lg md:text-xl font-light leading-relaxed text-muted-foreground">
                        We've rebuilt chess analysis from the ground up using state-of-the-art transformer models to understand the "why" behind every move.
                    </p>
                </div>

                {/* First Feature Card */}
                <div className="md:col-span-1 self-end">
                    <FeatureCard {...features[0]} />
                </div>

                {/* Remaining Feature Cards */}
                {features.slice(1).map((feature, index) => (
                    <div key={index} className="md:col-span-1">
                        <FeatureCard {...feature} />
                    </div>
                ))}
            </div>
        </section>
    );
}

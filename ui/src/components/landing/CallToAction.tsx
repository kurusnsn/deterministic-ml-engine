"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";

interface CallToActionProps {
    title: string;
    description: string;
    buttonText: string;
    buttonHref: string;
    variant?: "primary" | "secondary" | "gradient";
    icon?: React.ReactNode;
}

export function CallToAction({
    title,
    description,
    buttonText,
    buttonHref,
    variant = "gradient",
    icon,
}: CallToActionProps) {
    return (
        <section className="py-16 px-4 md:px-6">
            <div className="max-w-4xl mx-auto">
                <div className="rounded-[1.5rem] p-8 md:p-12 text-center space-y-6 bg-card border border-border hover:border-muted-foreground/20 transition-all duration-700">
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                        {title}
                    </h2>

                    <p className={`text-lg md:text-xl max-w-2xl mx-auto ${variant === "gradient" ? "text-muted-foreground" : "opacity-90"
                        }`}>
                        {description}
                    </p>

                    <div className="pt-4">
                        <Link href={buttonHref}>
                            <Button
                                size="lg"
                                className="bg-foreground text-background hover:opacity-90 rounded-full px-8 py-6 font-bold uppercase tracking-wider transition-all shadow-xl hover:shadow-2xl"
                            >
                                {icon}
                                {buttonText}
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}

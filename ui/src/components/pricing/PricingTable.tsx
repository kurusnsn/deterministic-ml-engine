import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PricingFeature {
    name: string;
    included: boolean;
}

interface PricingPlan {
    name: string;
    price: string;
    period: string;
    description: string;
    features: PricingFeature[];
    popular?: boolean;
    buttonText: string;
    onButtonClick?: () => void;
}

export function PricingTable({
    plans,
    className
}: {
    plans?: PricingPlan[];
    className?: string;
}) {
    const defaultPlans: PricingPlan[] = [
        {
            name: "Basic",
            price: "$1.99",
            period: "/mo",
            description: "Core analysis features for steady improvement.",
            buttonText: "Choose Basic",
            features: [
                { name: "Unlimited Game Review", included: true },
                { name: "Essential Engine Analysis", included: true },
                { name: "Opening Explorer", included: true },
                { name: "Cloud Storage (200 games)", included: true },
                { name: "AI Move Explanations", included: false },
                { name: "Priority Support", included: false },
            ]
        },
        {
            name: "Plus",
            price: "$3.49",
            period: "/mo",
            description: "Deeper AI insights and advanced tooling.",
            popular: true,
            buttonText: "Choose Plus",
            features: [
                { name: "Everything in Basic", included: true },
                { name: "AI Move Explanations", included: true },
                { name: "Advanced Performance Reports", included: true },
                { name: "Unlimited Cloud Storage", included: true },
                { name: "Priority Support", included: true },
            ]
        }
    ];

    const displayPlans = plans || defaultPlans;

    return (
        <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-6", className)}>
            {displayPlans.map((plan) => (
                <div
                    key={plan.name}
                    className={cn(
                        "relative flex flex-col p-6 rounded-xl border bg-card text-card-foreground shadow-sm",
                        plan.popular && "border-zinc-400 dark:border-zinc-500 shadow-zinc-200/50 dark:shadow-zinc-800/50 ring-1 ring-zinc-300 dark:ring-zinc-600"
                    )}
                >
                    {plan.popular && (
                        <div className="absolute -top-3 left-0 right-0 flex justify-center">
                            <span className="bg-zinc-900 dark:bg-white dark:text-zinc-900 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                                MOST POPULAR
                            </span>
                        </div>
                    )}

                    <div className="mb-5">
                        <h3 className="text-lg font-semibold">{plan.name}</h3>
                        <div className="mt-2 flex items-baseline text-3xl font-bold">
                            {plan.price}
                            <span className="text-sm font-normal text-muted-foreground ml-1">{plan.period}</span>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
                    </div>

                    <ul className="flex-1 space-y-3 mb-6">
                        {plan.features.map((feature) => (
                            <li key={feature.name} className="flex items-start gap-3 text-sm">
                                {feature.included ? (
                                    <div className="mt-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 p-0.5 text-zinc-700 dark:text-zinc-300">
                                        <Check className="h-3.5 w-3.5" />
                                    </div>
                                ) : (
                                    <div className="mt-0.5 text-muted-foreground/50">
                                        <X className="h-4 w-4" />
                                    </div>
                                )}
                                <span className={cn(
                                    !feature.included && "text-muted-foreground line-through decoration-muted-foreground/50"
                                )}>
                                    {feature.name}
                                </span>
                            </li>
                        ))}
                    </ul>

                    <button
                        onClick={() => {
                            if (plan.onButtonClick) plan.onButtonClick();
                            else console.log("checkout placeholder");
                        }}
                        className={cn(
                            "w-full py-2.5 px-4 rounded-lg font-medium transition-all",
                            plan.popular
                                ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 shadow-md hover:shadow-lg"
                                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        )}
                    >
                        {plan.buttonText}
                    </button>

                    {plan.popular && (
                        <p className="mt-3 text-xs text-center text-muted-foreground">
                            Secure payment via Stripe
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
}

import {
    Brain,
    Zap,
    Search,
    Trophy,
    LineChart,
    BookOpen
} from "lucide-react";
import { Card } from "@/components/ui/card";

const features = [
    {
        icon: Brain,
        title: "AI Move Insights",
        description: "Get detailed explanations for every move, powered by advanced LLMs."
    },
    {
        icon: Zap,
        title: "Instant Analysis",
        description: "Cloud-powered engine analysis that runs instantly without draining your battery."
    },
    {
        icon: Search,
        title: "Opening Explorer",
        description: "Deep dive into millions of master games to find the best lines."
    },
    {
        icon: Trophy,
        title: "Tournament Mode",
        description: "Follow live tournaments with real-time AI commentary and evaluation."
    },
    {
        icon: LineChart,
        title: "Progress Tracking",
        description: "Visualize your improvement over time with detailed performance analytics."
    },
    {
        icon: BookOpen,
        title: "Personalized Study",
        description: "Create study sets from your mistakes and practice them with spaced repetition."
    }
];

export function FeatureHighlights() {
    return (
        <section className="py-24 px-4 md:px-6 bg-muted/30">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                        Everything you need to master the game
                    </h2>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        Powerful tools designed to help you understand chess deeper and play better.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {features.map((feature, index) => (
                        <Card key={index} className="p-6 border-none shadow-sm bg-background/50 hover:bg-background transition-colors">
                            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                                <feature.icon className="h-6 w-6 text-primary" />
                            </div>
                            <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                            <p className="text-muted-foreground">
                                {feature.description}
                            </p>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
    );
}

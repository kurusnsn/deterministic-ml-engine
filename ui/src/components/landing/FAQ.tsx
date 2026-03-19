"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FAQItem {
    question: string;
    answer: string;
}

const faqData: FAQItem[] = [
    {
        question: "What is ChessVector?",
        answer: "ChessVector is an advanced chess analysis platform that uses AI and powerful engines to help you improve your game. Analyze your games, solve puzzles, explore openings, and get personalized insights to take your chess to the next level."
    },
    {
        question: "How does the AI analysis work?",
        answer: "Our AI analysis uses state-of-the-art language models combined with chess engines like Stockfish to provide detailed explanations of moves, suggest improvements, and help you understand the strategic and tactical elements of each position."
    },
    {
        question: "Can I use ChessVector for free?",
        answer: "Yes! ChessVector offers a generous free tier that includes unlimited game review, basic engine analysis, and cloud storage for up to 50 games. Upgrade to Pro for advanced features like AI move explanations and unlimited storage."
    },
    {
        question: "What's included in the Pro plan?",
        answer: "Pro members get deep engine analysis, unlimited cloud storage, AI-powered move explanations, advanced opening explorer, auto-generated reports with personalized repertoires based on your games, and priority support. It's perfect for serious players looking to maximize their improvement."
    },
    {
        question: "How do I import my games?",
        answer: "You can import games from popular chess platforms like Chess.com and Lichess, or paste PGN notation directly. We also support FEN positions for analyzing specific board states."
    },
    {
        question: "Is my data secure?",
        answer: "Absolutely. We use industry-standard encryption and security practices to protect your data. Your games and analysis are stored securely in the cloud and are only accessible to you."
    },
    {
        question: "Can I cancel my subscription anytime?",
        answer: "Yes, you can cancel your Pro subscription at any time. You'll continue to have access to Pro features until the end of your billing period, and you can always resubscribe later."
    },
    {
        question: "Is there a mobile app?",
        answer: "Currently, ChessVector is a web-based platform optimized for both desktop and mobile browsers. You can add it to your home screen for an app-like experience. A native mobile app is in the works."
    }
];

export function FAQ() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const toggleQuestion = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <section id="faq" className="py-20 px-4 md:px-6 bg-zinc-50 dark:bg-zinc-900/30">
            <div className="max-w-4xl mx-auto space-y-12">
                <div className="text-center space-y-4">
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                        Frequently Asked Questions
                    </h2>
                    <p className="text-muted-foreground text-lg">
                        Everything you need to know about ChessVector
                    </p>
                </div>

                <div className="space-y-4">
                    {faqData.map((item, index) => (
                        <div
                            key={index}
                            className="bg-background rounded-lg border shadow-sm overflow-hidden transition-all hover:shadow-md"
                        >
                            <button
                                onClick={() => toggleQuestion(index)}
                                className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-accent/50 transition-colors"
                            >
                                <span className="font-semibold text-base md:text-lg">
                                    {item.question}
                                </span>
                                <ChevronDown
                                    className={cn(
                                        "w-5 h-5 text-muted-foreground transition-transform flex-shrink-0",
                                        openIndex === index && "rotate-180"
                                    )}
                                />
                            </button>

                            <div
                                className={cn(
                                    "overflow-hidden transition-all duration-300 ease-in-out",
                                    openIndex === index ? "max-h-96" : "max-h-0"
                                )}
                            >
                                <div className="px-6 pb-4 text-muted-foreground leading-relaxed">
                                    {item.answer}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-12 text-center">
                    <p className="text-muted-foreground mb-4">
                        Still have questions?
                    </p>
                    <a
                        href="mailto:support@chessvector.com"
                        className="text-primary hover:underline font-medium"
                    >
                        Contact our support team
                    </a>
                </div>
            </div>
        </section>
    );
}

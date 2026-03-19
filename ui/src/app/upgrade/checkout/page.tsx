"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, CreditCard, Lock } from "lucide-react";
import Link from "next/link";

export default function CheckoutPage() {
    return (
        <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
            <Card className="max-w-md w-full p-8 text-center space-y-6">
                <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center">
                    <CreditCard className="w-8 h-8 text-primary" />
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-bold">Checkout Coming Soon</h1>
                    <p className="text-muted-foreground">
                        We are currently finalizing our payment integration.
                    </p>
                </div>

                <div className="bg-muted p-4 rounded-lg flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Lock className="w-4 h-4" />
                    <span>Payments powered by Stripe</span>
                </div>

                <Button asChild variant="outline" className="w-full">
                    <Link href="/">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Return Home
                    </Link>
                </Button>
            </Card>
        </div>
    );
}

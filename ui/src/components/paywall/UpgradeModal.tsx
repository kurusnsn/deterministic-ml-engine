import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { PricingTable } from "@/components/pricing/PricingTable";
import { Sparkles } from "lucide-react";

interface UpgradeModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function UpgradeModal({ open, onOpenChange }: UpgradeModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="text-center pb-6">
                    <div className="mx-auto bg-amber-500/10 p-3 rounded-full w-fit mb-4">
                        <Sparkles className="w-8 h-8 text-amber-500" />
                    </div>
                    <DialogTitle className="text-3xl font-bold">Upgrade to Plus</DialogTitle>
                    <DialogDescription className="text-lg mt-2 max-w-md mx-auto">
                        Unlock deeper AI insights, advanced reports, and unlimited cloud storage.
                    </DialogDescription>
                </DialogHeader>

                <PricingTable />

            </DialogContent>
        </Dialog>
    );
}

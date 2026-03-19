import { Badge } from "@/components/ui/badge";
import { Crown } from "lucide-react";

export function PremiumBadge({ className }: { className?: string }) {
    return (
        <Badge
            variant="default"
            className={`bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white border-0 gap-1.5 px-2 py-0.5 ${className}`}
        >
            <Crown className="w-3 h-3 fill-current" />
            <span className="font-semibold tracking-wide text-[10px] uppercase">Pro</span>
        </Badge>
    );
}

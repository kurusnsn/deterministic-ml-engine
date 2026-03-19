"use client"

import { useState } from "react"
import { Menu, ChevronDown, ChevronRight } from "lucide-react"
import { NavigationLink } from "@/components/ui/NavigationLink"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import UserNav from "@/components/UserNav"

interface NavItem {
  href?: string;
  label: string;
  children?: { href: string; label: string }[];
}

const navItems: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/analyze", label: "Analyze" },
  {
    label: "Practice",
    children: [
      { href: "/practice/play-maia", label: "Play Maia" },
      { href: "/practice/repertoire", label: "Practice Repertoire" },
      { href: "/practice/custom", label: "Custom Openings" },
      { href: "/puzzles", label: "Puzzles" },
      { href: "/openings", label: "Openings" },
    ]
  },
  {
    label: "Study",
    children: [
      { href: "/game-review", label: "Game Review" },
      { href: "/import", label: "Import" },
      { href: "/reports", label: "Reports" },
    ]
  },
  // DISABLED: Tournaments feature temporarily hidden
  // { href: "/tournaments", label: "Tournaments" },
  { href: "/profile", label: "Profile" },
]

function MobileNavItem({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const [expanded, setExpanded] = useState(false);

  if (item.children) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full text-lg font-medium hover:text-primary transition-all px-3 py-2 rounded-md hover:bg-accent active:bg-accent/80 active:scale-[0.98]"
        >
          <span>{item.label}</span>
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        {expanded && (
          <div className="ml-4 mt-1 space-y-1">
            {item.children.map((child) => (
              <NavigationLink
                key={child.href}
                href={child.href}
                className="block text-base font-medium hover:text-primary transition-all px-3 py-2 rounded-md hover:bg-accent active:bg-accent/80 active:scale-[0.98]"
                onClick={onNavigate}
              >
                {child.label}
              </NavigationLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavigationLink
      href={item.href!}
      className="text-lg font-medium hover:text-primary transition-all px-3 py-2 rounded-md hover:bg-accent active:bg-accent/80 active:scale-[0.98]"
      onClick={onNavigate}
    >
      {item.label}
    </NavigationLink>
  );
}

export default function MobileNav() {
  const [open, setOpen] = useState(false);

  const handleNavigate = () => {
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-2 mt-6 px-2 flex-1">
          {navItems.map((item) => (
            <MobileNavItem key={item.label} item={item} onNavigate={handleNavigate} />
          ))}
        </nav>

        {/* Bottom section: Theme toggle and User menu */}
        <div className="border-t pt-4 mt-4 px-2 space-y-3">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm text-muted-foreground">Theme</span>
            <ModeToggle />
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm text-muted-foreground">Account</span>
            <UserNav />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

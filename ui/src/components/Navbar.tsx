"use client"



import UserNav from "@/components/UserNav"

import dynamic from "next/dynamic"

const ThreePawnIcon = dynamic(() => import("@/components/ThreePawnIcon"), {
  ssr: false,
  loading: () => <div className="h-10 w-10"></div>
})


import { ModeToggle } from "@/components/mode-toggle"
import MobileNav from "@/components/MobileNav"
import { NavigationLink } from "@/components/ui/NavigationLink"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"
import { useDailyStreak } from "@/components/streak/DailyStreakProvider"
import { StreakNavButton } from "@/components/streak/StreakNavButton"
import { useGlobalLoader } from "@/hooks/useGlobalLoader"
import { useState, useEffect } from "react"
import { Progress } from "@/components/ui/progress"

export default function Navbar() {
  const { ready: streakReady, streak, setOpen } = useDailyStreak()

  return (
    <nav className="relative border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <MobileNav />
          <NavigationLink href="/" className="font-semibold flex items-center gap-2">
            <div className="h-10 w-10">
              <ThreePawnIcon />
            </div>
            <span className="text-lg tracking-tight">ChessVector</span>
          </NavigationLink>


          <NavigationMenu className="hidden md:flex" viewport={false}>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                  <NavigationLink href="/">Home</NavigationLink>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                  <NavigationLink href="/analyze">Analyze</NavigationLink>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Practice</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[200px] gap-1 p-2">
                    <li>
                      <NavigationMenuLink asChild>
                        <NavigationLink
                          href="/practice/play-maia"
                          className="block select-none rounded-md p-2 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          Play Maia
                        </NavigationLink>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <NavigationLink
                          href="/practice/repertoire"
                          className="block select-none rounded-md p-2 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          Practice Repertoire
                        </NavigationLink>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <NavigationLink
                          href="/practice/custom"
                          className="block select-none rounded-md p-2 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          Custom Openings
                        </NavigationLink>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <NavigationLink
                          href="/puzzles"
                          className="block select-none rounded-md p-2 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          Puzzles
                        </NavigationLink>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <NavigationLink
                          href="/openings"
                          className="block select-none rounded-md p-2 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          Openings
                        </NavigationLink>
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuTrigger>Study</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[200px] gap-1 p-2">
                    <li>
                      <NavigationMenuLink asChild>
                        <NavigationLink
                          href="/game-review"
                          className="block select-none rounded-md p-2 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          Game Review
                        </NavigationLink>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <NavigationLink
                          href="/import"
                          className="block select-none rounded-md p-2 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          Import
                        </NavigationLink>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <NavigationLink
                          href="/reports"
                          className="block select-none rounded-md p-2 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          Reports
                        </NavigationLink>
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
              {/* DISABLED: Tournaments feature temporarily hidden
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                  <NavigationLink href="/tournaments">Tournaments</NavigationLink>
                </NavigationMenuLink>
              </NavigationMenuItem>
              */}

            </NavigationMenuList>
          </NavigationMenu>
        </div>
        <div className="flex items-center gap-2">
          {streakReady && (
            <StreakNavButton streak={streak} onClick={() => setOpen(true)} />
          )}
          <div className="hidden lg:flex items-center gap-2">
            <ModeToggle />
            <UserNav />
          </div>
        </div>
      </div>
      <NavbarProgress />
    </nav>
  )
}

function NavbarProgress() {
  const { isLoading } = useGlobalLoader()
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (isLoading) {
      setProgress(0)
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev
          const diff = Math.random() * 10
          return Math.min(prev + diff, 90)
        })
      }, 100)
      return () => clearInterval(interval)
    } else {
      setProgress(100)
      const timeout = setTimeout(() => setProgress(0), 200)
      return () => clearTimeout(timeout)
    }
  }, [isLoading])

  const isVisible = isLoading || progress > 0

  return (
    <div className={`absolute top-0 left-0 right-0 h-1 transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      <Progress value={progress} className="h-1 rounded-none bg-transparent" indicatorClassName="bg-primary duration-500" />
    </div>
  )
}

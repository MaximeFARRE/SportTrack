"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Calendar, CalendarClock, LayoutDashboard, Plus, UserRound } from "lucide-react"

import { cn } from "@/lib/utils"

const BOTTOM_NAV_ITEMS = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendrier", icon: Calendar },
  { href: "/activities/new", label: "Ajouter", icon: Plus, accent: true },
  { href: "/planning", label: "Planning", icon: CalendarClock },
  { href: "/profile", label: "Profil", icon: UserRound },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center border-t bg-card md:hidden">
      {BOTTOM_NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)

        if (item.accent) {
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className="flex flex-1 flex-col items-center justify-center gap-0.5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            </Link>
          )
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 pt-1 text-xs font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

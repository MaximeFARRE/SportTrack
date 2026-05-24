"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Menu } from "lucide-react"
import { useState } from "react"

import { NAV_ITEMS } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

export function TopBar({ email, displayName }: { email: string; displayName: string | null }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const initials = (displayName ?? email).slice(0, 2).toUpperCase()
  const currentItem = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  )

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4">
      <div className="flex items-center gap-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Ouvrir le menu</span>
              </Button>
            }
          />
          <SheetContent side="left" className="w-64 p-0">
            <SheetHeader className="border-b px-4 py-4">
              <SheetTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                SportTrack
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 p-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </SheetContent>
        </Sheet>

        <h1 className="text-base font-semibold">{currentItem?.label ?? "SportTrack"}</h1>
      </div>

      <Button variant="ghost" className="h-9 gap-2 px-2" asChild>
        <Link href="/profile">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm sm:inline">{displayName ?? email}</span>
        </Link>
      </Button>
    </header>
  )
}

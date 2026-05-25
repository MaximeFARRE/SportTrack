import {
  Activity,
  Calendar,
  CalendarClock,
  HeartPulse,
  LineChart,
  ListChecks,
  Plug,
  Settings,
  UserRound,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: Activity },
  { href: "/calendar", label: "Calendrier", icon: Calendar },
  { href: "/activities", label: "Activités", icon: ListChecks },
  { href: "/planning", label: "Planning", icon: CalendarClock },
  { href: "/progression", label: "Progression", icon: LineChart },
  { href: "/health", label: "Santé", icon: HeartPulse },
  { href: "/coaching", label: "Coaching & Groupes", icon: Users },
  { href: "/connections", label: "Connexions", icon: Plug },
  { href: "/profile", label: "Profil", icon: UserRound },
  { href: "/settings", label: "Paramètres", icon: Settings },
]

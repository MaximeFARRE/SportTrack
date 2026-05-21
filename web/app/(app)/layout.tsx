import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { BottomNav } from "@/components/nav/bottom-nav"
import { Sidebar } from "@/components/nav/sidebar"
import { TopBar } from "@/components/nav/top-bar"
import { Toaster } from "@/components/ui/sonner"
import { createClient } from "@/lib/supabase/server"

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle()

  return (
    <div className="flex min-h-svh bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar email={user.email ?? ""} displayName={profile?.display_name ?? null} />
        <main className="flex-1 overflow-auto p-4 pb-20 md:p-6 md:pb-6">{children}</main>
        <BottomNav />
      </div>
      <Toaster />
    </div>
  )
}

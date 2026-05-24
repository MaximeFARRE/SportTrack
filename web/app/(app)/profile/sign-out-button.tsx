"use client"

import { LogOut } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

export function SignOutButton() {
  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <Button variant="outline" onClick={signOut}>
      <LogOut className="mr-2 h-4 w-4" />
      Se déconnecter
    </Button>
  )
}

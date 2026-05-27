"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function ProgressionAutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    const refreshVisiblePage = () => {
      if (document.visibilityState === "visible") {
        router.refresh()
      }
    }

    window.addEventListener("focus", refreshVisiblePage)
    document.addEventListener("visibilitychange", refreshVisiblePage)
    const interval = window.setInterval(refreshVisiblePage, 60_000)

    return () => {
      window.removeEventListener("focus", refreshVisiblePage)
      document.removeEventListener("visibilitychange", refreshVisiblePage)
      window.clearInterval(interval)
    }
  }, [router])

  return null
}

import type { Metadata } from "next"
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"

import "./globals.css"

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "SportTrack — Gérez votre entraînement",
  description:
    "Suivi multi-sport avec détection de surentraînement, coach IA et intégrations Strava / Garmin.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SportTrack",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="fr"
      className={`${plusJakartaSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  )
}

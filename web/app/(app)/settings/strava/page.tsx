import { redirect } from "next/navigation"

export default async function StravaSettingsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  redirect(error ? `/settings?error=${encodeURIComponent(error)}` : "/settings")
}

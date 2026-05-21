import { createClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/types/database"

/**
 * Service-role Supabase client for server-side use only.
 * Bypasses RLS — never expose this to the browser.
 */
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

import { createClient } from "@supabase/supabase-js"

/**
 * Server-side only Supabase client — used exclusively by the NextAuth
 * Credentials provider to verify email/password via Supabase Auth.
 * Never imported in client components.
 */
export function createSupabaseServerClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set")
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  })
}

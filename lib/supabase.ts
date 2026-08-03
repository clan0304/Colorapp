import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * App-side Supabase client (publishable key, RLS enforced).
 *
 * Auth model (CLAUDE.md): Clerk Native Third-Party Auth — when auth lands,
 * pass Clerk's getToken so every request carries the Clerk session JWT and
 * RLS policies match auth.jwt()->>'sub'. Never use the deprecated JWT
 * template approach.
 */
export function createSupabaseClient(
  accessToken?: () => Promise<string | null>,
): SupabaseClient {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).',
    );
  }
  return createClient(url, key, {
    ...(accessToken ? { accessToken } : {}),
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

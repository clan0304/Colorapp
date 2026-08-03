import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client using the secret key (sb_secret_...), which
 * authenticates as the service_role — it bypasses RLS and may call
 * service_role-only RPCs like persist_completed_diagnosis().
 *
 * NEVER import this from app code; API routes and scripts only.
 */
export function getServiceClient(): SupabaseClient {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (see .env.example).');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

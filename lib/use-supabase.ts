import { useSession } from '@clerk/clerk-expo';
import * as React from 'react';
import { createSupabaseClient } from '@/lib/supabase';

/**
 * Supabase client bound to the current Clerk session (Native Third-Party
 * Auth): every request carries the Clerk session token, so RLS policies
 * matching auth.jwt()->>'sub' apply. Works signed-out too — requests then run
 * as anon and only public policies (e.g. designers) pass.
 */
export function useSupabase() {
  const { session } = useSession();
  const sessionId = session?.id ?? null;
  return React.useMemo(
    () => createSupabaseClient(async () => (await session?.getToken()) ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId],
  );
}

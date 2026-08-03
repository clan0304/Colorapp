# Supabase Setup (Phase 3)

## 1. Apply the schema

Open the Supabase dashboard → **SQL Editor** → paste the contents of
`migrations/0001_init.sql` → **Run**.

(Alternatively, with the Supabase CLI: `supabase link` then `supabase db push`.)

## 2. Connect Clerk (Native Third-Party Auth — NOT the deprecated JWT template)

1. Clerk dashboard → **Configure → Integrations → Supabase** → enable, copy the Clerk domain.
2. Supabase dashboard → **Authentication → Sign In / Up → Third Party Auth** → add **Clerk**,
   paste the Clerk domain.
3. In the app, create the Supabase client with an `accessToken` callback that returns the Clerk
   session token (wired in when auth lands in the app):

   ```ts
   // lib/supabase.ts — publishable key (sb_publishable_...), RLS enforced
   createSupabaseClient(async () => (await session?.getToken()) ?? null);
   ```

   Server code uses `lib/server/supabase.ts` with the secret key (`sb_secret_...`), which
   authenticates as `service_role` (bypasses RLS, may call the persist RPC).

> **Clerk setup check:** the Clerk session token's `role` claim must be `authenticated`,
> or the `TO authenticated` policies and function grants will not apply. Verify this in the
> Clerk Supabase integration settings.

## 3. Design notes

- All RLS policies match `auth.jwt()->>'sub'` (the Clerk user id) — never `auth.uid()`.
- **Writes are server-only**: `diagnoses` / `drape_responses` / `photos` have no client
  insert/update policies. The server persists a completed diagnosis atomically and
  idempotently via the `persist_completed_diagnosis(...)` RPC (service_role-only,
  concurrency-safe via `ON CONFLICT`). Before calling it, the save API recomputes the final
  result server-side from the analysis + raw picks — draping rounds are regenerated
  deterministically, so clients are never trusted with the outcome.
- **Diagnosis id / HMAC envelope lifecycle** (implemented with the save API):
  1. `/api/analyze` generates the diagnosis UUID and returns
     `{diagnosis_id, analysis, issued_at, version}` HMAC-signed alongside the analysis.
  2. The app sends the untouched envelope + the raw a/b picks to `/api/save`.
  3. `/api/save` verifies the signature, recomputes the result, and calls the RPC with the
     envelope's UUID — so network retries reuse the same id and stay idempotent.
- **RPC calls go through API routes**: `claim_diagnosis` / `soft_delete_diagnosis` raise
  plain Postgres errors (P0001). The app never calls them directly — API routes forward the
  user's token and map failures to the project's AppError shape (code/status/requestId).
- **The diagnosis UUID is a secret during MVP** (it's the guest-claim capability): never put
  it in share URLs, logs, analytics events, or Inngest event names.
- **Account policy**: re-signup reactivates a tombstoned `users` row (Clerk is the account
  source of truth; permanent deletion = delete the user in Clerk).
- **TODO**: pgTAP tests (RLS denial matrix, RPC rollback on bad rounds, claim races,
  soft-delete cascade) once local Supabase CLI is set up — `supabase test db`.
- **TODO (Phase 5, with claim tokens)**: revoke `authenticated` execute on
  `claim_diagnosis` — claims then go exclusively through the API with entitlement checks.
- Diagnoses are saved **once, complete** — final fields are NOT NULL by design; partial rows
  never exist. `photos.diagnosis_id` is nullable because photos are uploaded before a
  diagnosis exists.
- **Guest flow**: diagnoses run with `user_id is null`; after login the app calls
  `claim_diagnosis(uuid)` to attach the row to the Clerk user (the unguessable UUID is the
  ownership proof).
- `photos`: the R2 object is physically deleted right after analysis (bucket lifecycle rule
  as backstop); the DB row is only tombstoned (`deleted_at`).
- Soft delete only, on every table: use `soft_delete_diagnosis(uuid)` — nothing is ever
  hard-deleted.

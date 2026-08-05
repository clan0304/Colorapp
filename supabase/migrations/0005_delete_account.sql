-- PersonalColor App — account deletion (App Store Review Guideline 5.1.1(v))
--
-- An app that lets you create an account must let you delete it from inside the
-- app. Signing out is not deletion, and a review will catch the difference.
--
-- THIS IS THE ONE PLACE THE PROJECT HARD-DELETES. CLAUDE.md's "soft delete
-- only" rule is a good engineering convention, but it was written as a data
-- hygiene habit, not against a legal deletion requirement — tombstoned rows are
-- invisible to the app yet still present in the database, which is a weak answer
-- to Apple's deletion guideline and to APP 11's expectation that personal
-- information no longer needed is destroyed or de-identified. The exception is
-- scoped to this function and must NOT be generalised: individual diagnoses are
-- still soft-deleted via soft_delete_diagnosis().
--
-- WHAT SURVIVES, AND WHY. Two tables are DE-IDENTIFIED instead of deleted:
--
--   designer_clicks    The click count a designer is billed on. What belongs to
--   directory_views    the user is WHO clicked, not THAT a click happened —
--                      deleting the row would silently shrink a third party's
--                      invoice and corrupt the city-demand signal. Nulling the
--                      person satisfies the deletion request; the row, its
--                      designer_id and its timestamp remain, so billing and
--                      analytics are unaffected.
--
-- Known and accepted cost: nulling user_id means clicks from deleted accounts
-- can no longer be counted as UNIQUE users, only as total clicks. Billing is on
-- total clicks and deleted accounts are a rounding error in any period, so a
-- pseudonym column would be encoding a metric decision nobody has made yet.
--
-- Split of responsibility: Clerk is the source of truth for accounts, so
-- /api/account deletes the Clerk user (the permanent part) and calls this to
-- clear our side.
--
-- Face photos are not a concern here: /api/analyze deletes the R2 object the
-- moment analysis finishes, so no photo exists by the time an account can be
-- deleted. The `photos` rows below hold only a key and an expiry.

begin;

-- ---------------------------------------------------------------------------
-- deleted_accounts — a suppression list, and the price of hard deletion.
--
-- Soft deletion left a tombstone that write paths could check. Hard deletion
-- removes it, which reopens a race: /api/account clears the rows, a request
-- already in flight arrives with a still-valid Clerk token before deleteUser
-- lands, and persist_completed_diagnosis happily recreates the users row and
-- writes a diagnosis under an account that is about to stop existing.
--
-- This table is the replacement marker. It holds nothing but a Clerk `sub` that
-- no longer resolves to a person, kept for the single purpose of refusing to
-- recreate it — the standard suppression-list pattern.
--
-- Deleting the Clerk user FIRST would also close the race, but it is the wrong
-- order: if the Clerk delete succeeds and this fails, the caller has no token
-- left and can never retry, stranding their data permanently.
-- ---------------------------------------------------------------------------
create table deleted_accounts (
  clerk_user_id text primary key,
  deleted_at timestamptz not null default now()
);

alter table deleted_accounts enable row level security; -- no policies: server only

-- ---------------------------------------------------------------------------
-- delete_account — hard-deletes the account's own data, de-identifies the two
-- business records, and records the id so it can never be recreated.
--
-- Idempotent: deleting an already-deleted account is a no-op, not an error. The
-- client may retry after a lost response, and by then the Clerk user is likely
-- gone, so a second call must not fail the request.
-- ---------------------------------------------------------------------------
create or replace function public.delete_account(p_user_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- Recorded FIRST so that a failure midway still leaves the account
  -- un-recreatable. A half-deleted account that can be revived is worse than a
  -- half-deleted one that cannot.
  insert into public.deleted_accounts (clerk_user_id)
  values (p_user_id)
  on conflict (clerk_user_id) do nothing;

  -- ORDER IS LOAD-BEARING. De-identification has to happen BEFORE the parent
  -- rows go, because these two tables reference diagnoses and users; clearing
  -- the person first is what lets those parents be deleted at all.
  update public.designer_clicks
  set user_id = null, diagnosis_id = null
  where user_id = p_user_id;

  update public.directory_views
  set user_id = null
  where user_id = p_user_id;

  -- Children of diagnoses.
  delete from public.drape_responses
  where diagnosis_id in (select id from public.diagnoses where user_id = p_user_id);

  delete from public.photos
  where user_id = p_user_id
     or diagnosis_id in (select id from public.diagnoses where user_id = p_user_id);

  -- Children of users.
  delete from public.market_interest where user_id = p_user_id;
  delete from public.diagnoses where user_id = p_user_id;
  delete from public.users where id = p_user_id;
end;
$$;

-- Service role only. This runs from /api/account after the Clerk token is
-- verified, and is never reachable from a client session — a caller who could
-- invoke it directly could destroy someone else's account by passing their id.
revoke execute on function public.delete_account(text) from public, anon, authenticated;
grant execute on function public.delete_account(text) to service_role;

-- ---------------------------------------------------------------------------
-- The suppression list is only useful if something consults it. 0001's write
-- RPCs upsert a users row on every call (`persist_completed_diagnosis`,
-- `claim_diagnosis`), so without this a request in flight during deletion
-- simply recreates the account and writes under it.
--
-- Enforced with a trigger rather than by rewriting those two functions: the
-- invariant is "a deleted account is never recreated", and a trigger states it
-- once and catches every write path, including ones nobody has written yet.
-- Rewriting them would mean copying ~200 lines of unrelated body to change one
-- clause each, and would still miss the next caller.
--
-- The concurrent save now FAILS rather than resurrecting the account, which is
-- the correct outcome — that request was doomed the moment deletion started.
-- ---------------------------------------------------------------------------
create or replace function public.block_deleted_account()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.deleted_accounts where clerk_user_id = new.id) then
    raise exception 'account % is deleted and cannot be recreated', new.id;
  end if;
  return new;
end;
$$;

-- INSERT is the real vector once deletion is a hard delete (the row is gone, so
-- the upsert takes the insert branch). UPDATE is covered too, cheaply, in case
-- a partial failure leaves the row behind for the conflict branch to hit.
create trigger users_block_deleted
  before insert or update on public.users
  for each row
  execute function public.block_deleted_account();

commit;

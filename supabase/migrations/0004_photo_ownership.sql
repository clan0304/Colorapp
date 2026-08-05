-- PersonalColor App — bind uploaded photos to the account that requested them
--
-- /api/analyze accepted any key matching R2_KEY_PATTERN, read the object and
-- then deleted it, without checking whose it was — there was nothing to check
-- against, because /api/upload handed out a presigned URL and recorded nothing.
-- A leaked or guessed key therefore let one account have another's photo
-- analysed and destroyed. Exploitability was low (a v4 UUID inside a dated
-- path, and the object lives for seconds) but the binding costs almost nothing.
--
-- The privacy rule is unchanged: the R2 object is still deleted the instant
-- analysis finishes, success or failure. This adds an owner to the row that
-- names it, not a longer life for the photo.

begin;

alter table photos add column user_id text references users (id);

create index photos_user_key_idx on photos (user_id, r2_key)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- claim_photo_key — called by /api/upload BEFORE the presigned URL is handed
-- out, so the binding exists before the object can.
-- ---------------------------------------------------------------------------
create or replace function public.claim_photo_key(
  p_user_id text,
  p_r2_key text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Upload is reachable before any diagnosis exists, so the users row may not.
  perform public.ensure_user(p_user_id);
  insert into public.photos (user_id, r2_key, expires_at)
  values (p_user_id, p_r2_key, p_expires_at);
end;
$$;

revoke execute on function public.claim_photo_key(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_photo_key(text, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- owns_photo_key — checked by /api/analyze before it reads anything.
--
-- The caller answers a miss with not_found rather than forbidden, so probing
-- keys reveals nothing about whether one exists.
-- ---------------------------------------------------------------------------
create or replace function public.owns_photo_key(p_user_id text, p_r2_key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.photos
    where r2_key = p_r2_key and user_id = p_user_id and deleted_at is null
  );
$$;

revoke execute on function public.owns_photo_key(text, text) from public, anon, authenticated;
grant execute on function public.owns_photo_key(text, text) to service_role;

commit;

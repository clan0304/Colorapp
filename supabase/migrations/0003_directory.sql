-- PersonalColor App — Phase 4: designer directory
--
-- The 0001 `designers` table was a sketch and has never held a row, so this
-- reshapes it in place rather than migrating anything.
--
-- BUSINESS MODEL THIS ENCODES (decided 2026-08-05). Read this before adding a
-- table — several obvious-looking ones are deliberately absent.
--
--   * We never own the booking. Each designer has an outbound `booking_url`
--     pointing at whatever they already use (Fresha, Timely, Square). Salons do
--     not adopt a second booking system, which is the single most common way a
--     salon marketplace dies.
--   * Because of that we can observe a CLICK but never a BOOKING. Commission on
--     completed sessions is therefore structurally impossible — that door is
--     closed on purpose, not by oversight. Revenue is a listing fee.
--   * Money flows designer -> us, so this needs plain Stripe Billing. NOT
--     Stripe Connect; Connect is for paying third parties out, which we don't.
--     (The Phase 5 note in CLAUDE.md predates this decision.)
--   * Listing fee is charged only when we actually delivered traffic. The
--     threshold is NOT in this schema and must not be added until real click
--     volume exists — see the note on designer_clicks.
--
-- NOT BUILT, DELIBERATELY: commission ledger, bookings, Stripe Connect
-- accounts, billing/invoice tables, price tiers, click thresholds, PostGIS.
-- Every one of them encodes a number or a relationship nobody has measured yet.

begin;

-- ---------------------------------------------------------------------------
-- salons — the BILLING and grouping entity, not the search entity.
--
-- Nullable from designers on purpose: chair renters, mobile and home-based
-- stylists are common and have no salon to belong to. Location deliberately
-- does NOT live here — see designers below.
-- ---------------------------------------------------------------------------
create table salons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Billing jurisdiction. Charging is AU-only at launch for TAX reasons, not
  -- Stripe ones: Stripe bills cards worldwide from a supported merchant
  -- country, but VAT/GST on cross-border B2B invoicing differs per country.
  country text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table salons enable row level security;
-- Its read policy is defined AFTER designers below: the visibility rule depends
-- on designers.salon_id, and a `language sql` body is validated at CREATE time,
-- so it cannot be written before that column exists.

-- ---------------------------------------------------------------------------
-- designers — the MATCHING and search entity.
--
-- Designer-level rather than salon-level because clients follow a stylist
-- rather than a shop, booking URLs are frequently per-stylist, and a portfolio
-- (the only credible specialty signal we will ever have) belongs to a person.
-- ---------------------------------------------------------------------------
alter table designers
  -- Optional parent. A move between salons is one FK update, and the listing
  -- plus its whole click history survives it.
  add column salon_id uuid references salons (id),
  -- The whole product. Points at the designer's existing booking page; we hand
  -- off and stop. Not null once published — a listing without one is a dead end.
  add column booking_url text,
  -- Location lives HERE, not on salons, so an independent with no salon row is
  -- still findable. Three levels because users are global from day one and
  -- "region" could not express Sydney vs Seoul.
  add column country text,
  add column city text,
  add column suburb text,
  -- A display filter, not money. Intentionally a band rather than an amount:
  -- we do not take the payment, so any figure here would be unverifiable, and
  -- CLAUDE.md's integer-cents rule is for real transaction values.
  add column price_band text,
  -- Applications are open GLOBALLY; publication is gated. Splitting the two is
  -- what lets us accept supply from anywhere without diluting the curation
  -- that the whole value proposition rests on.
  add column status text not null default 'applied',
  -- Separate from status on purpose: a city should open with a handful of
  -- designers, not one. This is the operational lever that holds an approved
  -- designer back until their city is worth launching. NULL = not visible.
  add column published_at timestamptz;

alter table designers
  add constraint designers_status_check
    check (status in ('applied', 'approved', 'rejected')),
  -- The client opens this URL. Without a scheme restriction the DB would store
  -- `javascript:` or a custom app scheme just as happily, turning a listing
  -- into a redirect primitive aimed at our own users.
  add constraint designers_booking_url_https
    check (booking_url is null or booking_url ~ '^https://[^[:space:]]+$'),
  -- Blank and whitespace-only places silently create their own bucket, which
  -- splits a city's demand signal across values that look identical on screen.
  add constraint designers_place_not_blank
    check (
      (country is null or btrim(country) <> '')
      and (city is null or btrim(city) <> '')
      and (suburb is null or btrim(suburb) <> '')
    ),
  -- NOTE: a `published_at <= now()` CHECK is not possible — Postgres requires
  -- CHECK expressions to be IMMUTABLE and now() is STABLE, so it is rejected at
  -- creation. Handled in the read policy instead, which makes a future
  -- timestamp genuinely mean "scheduled" rather than "live immediately".
  -- Everything a published listing needs in order to be useful. Enforced here
  -- rather than in app code because publication is a manual operator action.
  add constraint designers_published_is_complete
    check (
      published_at is null
      or (
        status = 'approved'
        and booking_url is not null
        and country is not null
        and city is not null
      )
    );

-- The 0001 sketch modelled a salon as a bare string and location as one
-- "region" field. Both are superseded above.
alter table designers drop column salon_name;
alter table designers drop column region;
drop index if exists designers_region_idx;

-- SPECIALTIES ARE NOT A MATCHING KEY. The column stays as a slot, but the GIN
-- index is dropped because an index is an invitation to query, and this must
-- not be queried: specialties would be self-declared, and no colourist ever
-- declares themselves weak at a season — asked directly, every one of them
-- says yes to every tone. The tags would collapse to "everyone has every tag".
-- Matching is also a SCALE feature; with a founder-curated list of ~20 there is
-- nothing to narrow, and showing all of them sorted by location is correct.
-- When matching becomes real it will run on portfolio EVIDENCE — which of the
-- 16 hair colours in SEASON_RECOMMENDATIONS a designer has actually done —
-- and that needs a photo table, not this column.
drop index if exists designers_specialties_idx;

-- Search is by location, and only by location, for now.
create index designers_location_idx on designers (country, city, suburb)
  where deleted_at is null and published_at is not null;
create index designers_salon_idx on designers (salon_id)
  where deleted_at is null;

drop policy if exists "designers public read" on designers;
-- Unpublished applicants are invisible to everyone; the server reads them
-- through the service role for the review queue.
-- `published_at <= now()` rather than merely `is not null`, so a future
-- timestamp schedules a listing instead of publishing it at once. The partial
-- index below stays on `is not null` because index predicates, unlike policy
-- expressions, must be IMMUTABLE — it stays a valid superset for the planner.
create policy "designers public read published" on designers
  for select to anon, authenticated
  using (deleted_at is null and published_at is not null and published_at <= now());

-- RLS RESTRICTS ROWS, NOT COLUMNS — and that distinction is load-bearing here.
-- A policy alone would hand anon the whole published row including booking_url,
-- so any client could read the destination straight from PostgREST and navigate
-- there without ever calling the click endpoint. Since designer_clicks is what
-- the listing fee is billed on, that makes the meter trivially bypassable and
-- defeats the table it sits next to.
--
-- Column grants close it: the policy still picks the rows, these pick the
-- columns, and booking_url is served only by the click API — which logs first
-- and returns the URL second.
--
-- `contact_info` (from 0001) is withheld for the same reason. `specialties` is
-- withheld for a different one: it is not a matching key (see below), and
-- exposing it invites a client to build the matching we deliberately did not.
--
-- Never add a column here without asking whether a client reading it directly
-- breaks something.
revoke select on designers from anon, authenticated;
grant select (id, name, salon_id, country, city, suburb, price_band, published_at)
  on designers to anon, authenticated;

-- ---------------------------------------------------------------------------
-- salons read policy — deferred to here because it depends on designers.salon_id.
--
-- Scoped to salons that actually have a live listing. An unscoped policy would
-- publish the recruiting pipeline: a partner still under discussion, their name
-- and their billing country, readable before anything of theirs is published.
--
-- The lookup goes through a SECURITY DEFINER function rather than an inline
-- EXISTS over `designers`. A policy body that reads another table is evaluated
-- with the CALLER's privileges, and this one needs `designers.deleted_at` and
-- `.published_at` — neither of which anon is granted just above, and `designers`
-- carries its own RLS on top. Inlining it would make salon visibility depend on
-- that interaction; the function makes it explicit and testable on its own.
-- ---------------------------------------------------------------------------
create or replace function public.salon_has_published_designer(p_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.designers d
    where d.salon_id = p_salon_id
      and d.deleted_at is null
      and d.published_at is not null
      and d.published_at <= now()
  );
$$;

grant execute on function public.salon_has_published_designer(uuid) to anon, authenticated;

create policy "salons public read when published" on salons
  for select to anon, authenticated
  using (deleted_at is null and public.salon_has_published_designer(id));

-- RLS restricts ROWS; column grants restrict COLUMNS. `country` is a billing
-- attribute and has no reason to be public.
revoke select on salons from anon, authenticated;
grant select (id, name) on salons to anon, authenticated;

-- ---------------------------------------------------------------------------
-- designer_clicks — every outbound tap to a booking_url.
--
-- THIS TABLE IS THE BILLING BASIS, which is why it is service-role only and
-- written through an API route rather than by the client. A client that could
-- insert here could inflate a designer's invoice, and that is fraud against a
-- paying partner — the same tamper-proofing argument as diagnoses.
--
-- It is also the retention argument ("14 people opened your booking page last
-- month") and one of the three Phase 6 metrics. None of it can be reconstructed
-- after the fact, so it has to exist from the directory's first day.
--
-- Rows are kept individually rather than as a counter: showing a designer a
-- timestamped log is a completely different conversation from telling them a
-- number they cannot verify, and we are both the referee and the beneficiary
-- of that number.
--
-- No threshold column, no tier, no invoice. At ~20 designers the difference
-- between charging and not charging is a few hundred dollars a month, far less
-- than metering and dispute handling would cost to build — and the threshold
-- would be a number picked before ever seeing a click, which is exactly the
-- mistake the confidence constants in combine.ts already taught us.
-- ---------------------------------------------------------------------------
create table designer_clicks (
  id uuid primary key default gen_random_uuid(),
  designer_id uuid not null references designers (id),
  -- Nullable: reaching the directory requires an account today, but that gate
  -- is itself under review (see "Access tiers" in CLAUDE.md).
  user_id text references users (id),
  -- Which diagnosis sent them, when there was one. Lets us answer whether a
  -- season correlates with the designers people actually pick — the raw
  -- material for evidence-based matching later.
  diagnosis_id uuid references diagnoses (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index designer_clicks_designer_month_idx
  on designer_clicks (designer_id, created_at)
  where deleted_at is null;

alter table designer_clicks enable row level security; -- no policies: server only

-- ---------------------------------------------------------------------------
-- directory_views — passive log of every arrival at the directory.
--
-- Distinct from market_interest below, and the pair is the point. This one is
-- complete and frictionless; the opt-in is consented and scarce. The RATIO
-- between them is the signal: 400 arrivals with 240 opt-ins is a city worth
-- opening, 400 with 15 is not, and arrival counts alone cannot tell them apart.
--
-- `viewed_*` is the city being LOOKED AT, which is not always where the user
-- is. The filter is deliberately not locked to their location so someone
-- planning a trip can simply browse that city — which covers the travel case
-- with a UI affordance instead of a form asking about travel dates, and turns
-- their intent into an observation rather than a survey answer.
-- ---------------------------------------------------------------------------
create table directory_views (
  id uuid primary key default gen_random_uuid(),
  user_id text references users (id),
  viewed_country text not null,
  viewed_city text,
  -- Whether anything was actually there. An empty result is the majority
  -- experience for a long while — clips travel globally and designers do not —
  -- so it is a first-class outcome to measure, not an error case.
  result_count integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table directory_views
  add constraint directory_views_place_not_blank
    check (btrim(viewed_country) <> '' and (viewed_city is null or btrim(viewed_city) <> '')),
  add constraint directory_views_count_non_negative
    check (result_count >= 0);

create index directory_views_place_idx
  on directory_views (viewed_country, viewed_city, created_at)
  where deleted_at is null;

alter table directory_views enable row level security; -- no policies: server only

-- ---------------------------------------------------------------------------
-- market_interest — the opt-in waitlist.
--
-- Its purpose is NOT measurement; directory_views already gives that for free
-- and without asking. What this buys is PERMISSION TO COME BACK. A diagnosis is
-- one-and-done — a season does not change, so a user has no reason to reopen
-- the app — while the step that earns money is the designer connection. Without
-- a consented channel, measured demand simply evaporates.
--
-- It is nearly frictionless because the directory sits behind login, so the
-- email and the city are already known: this is one tap, not a form.
--
-- It doubles as the designer-recruiting pitch. "240 people in this city are
-- waiting" is a supply argument; a passive view count is not.
--
-- NOTE: nothing in this stack can send the notification yet — there is no
-- email provider wired up, and Clerk's auth mail is not usable for this. A
-- waitlist that cannot be notified is a dead table, so shipping the directory
-- means shipping a sender with it.
-- ---------------------------------------------------------------------------
create table market_interest (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users (id),
  country text not null,
  city text not null,
  -- Set when the "your city is open" mail goes out, so a second city launch
  -- or a retry cannot mail the same person twice.
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table market_interest
  add constraint market_interest_place_not_blank
    check (btrim(country) <> '' and btrim(city) <> '');

-- One standing request per person per city.
create unique index market_interest_user_place_idx
  on market_interest (user_id, country, city)
  where deleted_at is null;

-- The launch query: who is still waiting in this city.
create index market_interest_pending_idx
  on market_interest (country, city)
  where deleted_at is null and notified_at is null;

alter table market_interest enable row level security;

create policy "market_interest select own" on market_interest
  for select to authenticated
  using (user_id = (select auth.jwt()->>'sub') and deleted_at is null);

-- ---------------------------------------------------------------------------
-- ensure_user — the sanctioned way to create a users row.
--
-- Needed because the two tables above carry a users FK and are reachable
-- WITHOUT a diagnosis: browsing the directory and joining a waitlist both
-- happen before any diagnosis exists, while until now a users row only appeared
-- via persist_completed_diagnosis() or claim_diagnosis(). A signed-in user who
-- went straight to the directory would hit a foreign-key violation.
--
-- Deliberately `do nothing` rather than 0001's `do update set deleted_at = null`
-- — reviving a tombstone is the account-deletion race fixed in 0005.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_user(p_user_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    raise exception 'not authenticated';
  end if;
  insert into public.users (id) values (p_user_id) on conflict (id) do nothing;
end;
$$;

revoke execute on function public.ensure_user(text) from public, anon, authenticated;
grant execute on function public.ensure_user(text) to service_role;

commit;

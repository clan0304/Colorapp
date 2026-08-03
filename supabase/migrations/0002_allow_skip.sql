-- Allow "skip" ("not sure") as a draping answer. Skipped rounds are recorded
-- (a high skip rate flags a bad swatch pair for palette tuning) but count as
-- no vote in the combination logic.

begin;

do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'public.drape_responses'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%user_choice%';

  if v_constraint is null then
    raise exception 'user_choice check constraint not found on drape_responses';
  end if;

  execute format('alter table public.drape_responses drop constraint %I', v_constraint);
end;
$$;

alter table public.drape_responses
  add constraint drape_responses_user_choice_check
  check (user_choice in ('a', 'b', 'skip'));

commit;

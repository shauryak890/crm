-- =====================================================================
--  WHITES & BRIGHTS — STORE CRM  ·  CUSTOMER DEDUPE + PHONE UNIQUENESS
--  Run this once in: Supabase Dashboard → SQL Editor → New query → Run
--  (Safe to re-run.)
--
--  Fixes the "one phone, many customer rows" problem and prevents it
--  from ever happening again.
--
--  What it does:
--    1. Adds a normalised phone column (`phone_norm` = last 10 digits)
--       maintained by a trigger.
--    2. Merges existing duplicates within each outlet: keeps the oldest
--       customer row, re-points their orders to it, deletes the rest.
--    3. Adds a unique index on (outlet_id, phone_norm) so any future
--       duplicate insert is rejected by the database.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1.  phone_norm column + trigger to keep it in sync.
--     "Normalised" = digits-only, last 10 characters. So '+91 87579 38961',
--     '08757938961', and '8757938961' all collapse to '8757938961'.
-- ---------------------------------------------------------------------
alter table public.customers
  add column if not exists phone_norm text;

create or replace function public.set_customer_phone_norm()
returns trigger
language plpgsql
as $$
begin
  new.phone_norm := nullif(right(regexp_replace(coalesce(new.phone,''), '\D', '', 'g'), 10), '');
  return new;
end;
$$;

drop trigger if exists customers_phone_norm on public.customers;
create trigger customers_phone_norm
  before insert or update of phone on public.customers
  for each row execute function public.set_customer_phone_norm();

-- Backfill existing rows.
update public.customers
   set phone_norm = nullif(right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10), '')
 where phone_norm is distinct from nullif(right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10), '');

create index if not exists customers_phone_norm_idx
  on public.customers (phone_norm);

-- ---------------------------------------------------------------------
-- 2.  Merge existing duplicates within each outlet.
--     For each (outlet_id, phone_norm) group, keep the oldest row and
--     re-point every order pointing at the others to it, then delete
--     the duplicates.
-- ---------------------------------------------------------------------
do $$
declare rec record;
begin
  for rec in
    with norm as (
      select id, created_at, outlet_id, phone_norm
        from public.customers
       where phone_norm is not null and length(phone_norm) >= 10
    ),
    keepers as (
      select distinct on (outlet_id, phone_norm)
             id as keep_id, outlet_id, phone_norm
        from norm
       order by outlet_id, phone_norm, created_at asc
    )
    select n.id as dup_id, k.keep_id
      from norm n
      join keepers k
        on k.outlet_id = n.outlet_id
       and k.phone_norm = n.phone_norm
     where n.id <> k.keep_id
  loop
    -- Move any orders pointing at the duplicate to the keeper.
    update public.orders
       set customer_id = rec.keep_id
     where customer_id = rec.dup_id;
    -- Remove the duplicate customer row.
    delete from public.customers
     where id = rec.dup_id;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3.  Unique index so future duplicates are rejected by the DB.
--     Partial — only enforced when phone_norm is present.
-- ---------------------------------------------------------------------
create unique index if not exists customers_outlet_phone_uniq
  on public.customers (outlet_id, phone_norm)
  where phone_norm is not null;

-- ---------------------------------------------------------------------
-- 4.  Reload PostgREST schema cache so the new column is visible.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';

-- =====================================================================
--  WHITES & BRIGHTS — STORE CRM  ·  UNITS, WEIGHT & STATUS SYNC
--  Run this once in: Supabase Dashboard → SQL Editor → New query → Run
--  (Safe to re-run.)
--
--  Adds support for products priced by the kilogram (e.g. "Laundry &
--  Iron By KG"), in addition to the existing per-piece pricing.
--  Also: keeps `delivery_status` honest when order_status is 'Delivered'.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1.  PRODUCTS — a `unit` flag tells the POS how to price the product.
--     'piece' = qty * unit_price · 'kg' = weight_kg * unit_price.
-- ---------------------------------------------------------------------
alter table public.products
  add column if not exists unit text not null default 'piece';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_unit_chk'
  ) then
    alter table public.products
      add constraint products_unit_chk check (unit in ('piece','kg'));
  end if;
end $$;

-- Backfill: anything explicitly priced "by KG" / "per KG" becomes kg.
update public.products
   set unit = 'kg'
 where unit = 'piece'
   and (name ilike '%by kg%' or name ilike '%per kg%' or name ilike '%/kg%');

-- ---------------------------------------------------------------------
-- 2.  ORDER ITEMS — record what kind of unit was used, and the weight
--     (when relevant). `qty` becomes numeric so existing rows stay put
--     but new kg lines can carry a piece-count alongside the weight.
-- ---------------------------------------------------------------------
alter table public.order_items
  add column if not exists unit       text not null default 'piece',
  add column if not exists weight_kg  numeric(10,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_items_unit_chk'
  ) then
    alter table public.order_items
      add constraint order_items_unit_chk check (unit in ('piece','kg'));
  end if;
end $$;

-- qty: keep integer for piece-count semantics; weight_kg holds decimals
-- for kg-priced lines. (No data migration needed — existing rows are
-- piece-based and weight_kg stays null.)

-- ---------------------------------------------------------------------
-- 3.  Keep delivery_status in sync when an order is marked Delivered.
--     Without this, the kanban can say "Delivered" while the row's
--     delivery badge still reads "Pending" — confusing for staff.
-- ---------------------------------------------------------------------
create or replace function public.sync_delivery_status()
returns trigger
language plpgsql
as $$
begin
  if new.order_status = 'Delivered'
     and old.order_status is distinct from 'Delivered' then
    new.delivery_status := 'Delivered';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_sync_delivery on public.orders;
create trigger orders_sync_delivery
  before update of order_status on public.orders
  for each row execute function public.sync_delivery_status();

-- ---------------------------------------------------------------------
-- 4.  Tell PostgREST to reload its schema cache.
--     Without this, the new columns (products.unit, order_items.unit,
--     order_items.weight_kg) stay invisible to the REST API even though
--     they exist in Postgres — causing "column not found in schema cache".
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';

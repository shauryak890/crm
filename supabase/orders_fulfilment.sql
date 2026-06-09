-- =====================================================================
--  WHITES & BRIGHTS — STORE CRM  ·  ORDERS: FULFILMENT FIELDS
--  Run this once in: Supabase Dashboard → SQL Editor → New query → Run
--  (Safe to re-run.)
--
--  Adds three columns to `orders` so the POS can capture per-order:
--    • due_date    — when the order is ready / will be delivered
--    • fulfilment  — 'pickup' (customer collects) or 'delivery'
--    • address     — drop address (or contact address for pickup)
-- =====================================================================

alter table public.orders
  add column if not exists due_date   date,
  add column if not exists fulfilment text not null default 'pickup',
  add column if not exists address    text;

-- Constrain fulfilment to the two valid values.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_fulfilment_chk'
  ) then
    alter table public.orders
      add constraint orders_fulfilment_chk
      check (fulfilment in ('pickup', 'delivery'));
  end if;
end $$;

create index if not exists orders_due_date_idx   on public.orders (due_date);
create index if not exists orders_fulfilment_idx on public.orders (fulfilment);

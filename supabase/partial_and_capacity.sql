-- =====================================================================
--  WHITES & BRIGHTS — PARTIAL PAYMENTS  ·  DAILY CAPACITY
--  Run once in: Supabase Dashboard → SQL Editor → New query → Run
--  (Safe to re-run.)
--
--  1. amount_paid — how much the customer actually handed over. Lets an
--     order be "Partial" (advance paid now, balance on delivery) instead
--     of only fully Paid / Unpaid.
--  2. pieces — total garment count on the order, so the POS can sum how
--     many clothes are already booked for a given delivery day and stop
--     the plant being overloaded past its daily processing capacity.
-- =====================================================================

-- 1.  Amount collected so far on the order.
alter table public.orders
  add column if not exists amount_paid numeric(10,2) not null default 0;

-- Backfill: fully-paid orders have collected their whole total.
update public.orders
   set amount_paid = total
 where payment_status = 'Paid'
   and amount_paid = 0;

-- 2.  Garment count for daily-capacity planning.
alter table public.orders
  add column if not exists pieces integer not null default 0;

-- Backfill from existing line items (qty is the piece count for both
-- piece- and kg-priced lines).
update public.orders o
   set pieces = coalesce((
     select sum(oi.qty) from public.order_items oi where oi.order_id = o.id
   ), 0)
 where pieces = 0;

-- 3.  Reload the PostgREST schema cache so the new columns are visible
--     to the app immediately.
notify pgrst, 'reload schema';

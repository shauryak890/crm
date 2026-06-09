-- =====================================================================
--  WHITES & BRIGHTS — STORE CRM  ·  ORDER DAMAGE NOTES & PHOTOS
--  Run this once in: Supabase Dashboard → SQL Editor → New query → Run
--  (Safe to re-run.)
--
--  Adds two columns to `orders` and provisions a Storage bucket so the
--  POS can record prior-damage notes + photos at the counter.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1.  New columns on `orders`
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists damage_note text,
  add column if not exists image_urls  text[] not null default '{}';

-- ---------------------------------------------------------------------
-- 2.  Storage bucket for the photos.
--     Public read so the printed invoice / WhatsApp link can render the
--     images without signed URLs. Writes are restricted via RLS below.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('order-photos', 'order-photos', true)
on conflict (id) do update set public = excluded.public;

-- ---------------------------------------------------------------------
-- 3.  Storage RLS — any signed-in staff can upload / replace / delete
--     within the order-photos bucket. Reads are public (bucket setting),
--     so an explicit read policy isn't required.
-- ---------------------------------------------------------------------
drop policy if exists "order-photos: staff insert" on storage.objects;
drop policy if exists "order-photos: staff update" on storage.objects;
drop policy if exists "order-photos: staff delete" on storage.objects;

create policy "order-photos: staff insert" on storage.objects
  for insert
  with check (bucket_id = 'order-photos' and auth.uid() is not null);

create policy "order-photos: staff update" on storage.objects
  for update
  using (bucket_id = 'order-photos' and auth.uid() is not null)
  with check (bucket_id = 'order-photos' and auth.uid() is not null);

create policy "order-photos: staff delete" on storage.objects
  for delete
  using (bucket_id = 'order-photos' and auth.uid() is not null);

-- ---------------------------------------------------------------------
-- 4.  Auto-clear damage record once an order is marked Delivered.
--     The client also deletes the photos from Storage before this fires
--     (a trigger can't reach Storage), but this guarantees the row no
--     longer references them no matter how status is changed.
-- ---------------------------------------------------------------------
create or replace function public.clear_damage_on_delivered()
returns trigger
language plpgsql
as $$
begin
  if new.order_status = 'Delivered'
     and old.order_status is distinct from 'Delivered' then
    new.damage_note := null;
    new.image_urls  := '{}';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_clear_damage on public.orders;
create trigger orders_clear_damage
  before update of order_status on public.orders
  for each row execute function public.clear_damage_on_delivered();

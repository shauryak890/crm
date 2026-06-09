-- =====================================================================
--  WHITES & BRIGHTS — STORE CRM  ·  MULTI-OUTLET FOUNDATION
--  Run this once in: Supabase Dashboard → SQL Editor → New query → Run
--  (Safe to re-run.)
--
--  Adds full per-outlet data isolation so a future super-admin can sit
--  on top and read across every outlet, while staff and outlet admins
--  only ever see their own store.
--
--  This migration:
--    • Creates an `outlets` table and the first row "Patna - RK Puram".
--    • Adds outlet_id FKs to profiles, orders, customers, products,
--      expenses. (order_items inherits scope via its parent order.)
--    • Backfills every existing row to the first outlet so today's
--      data stays exactly where it is.
--    • Replaces RLS policies with outlet-scoped versions. A super_admin
--      role bypasses scoping.
--    • Defaults outlet_id on inserts to the caller's outlet — so the
--      app doesn't need to pass it explicitly.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1.  OUTLETS table.
-- ---------------------------------------------------------------------
create table if not exists public.outlets (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  name       text not null,
  address    text,
  phone      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- The first / seed outlet for the existing data.
insert into public.outlets (code, name, address, phone)
values ('PAT-RKP', 'Patna - RK Puram', 'RK Puram, Patna', '9308140181')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 2.  Add outlet_id to every scoped table and backfill to the first
--     outlet. Done inside a DO block so it's idempotent / re-runnable.
-- ---------------------------------------------------------------------
do $$
declare seed_id uuid;
begin
  select id into seed_id from public.outlets where code = 'PAT-RKP';

  alter table public.profiles  add column if not exists outlet_id uuid references public.outlets(id);
  alter table public.orders    add column if not exists outlet_id uuid references public.outlets(id);
  alter table public.customers add column if not exists outlet_id uuid references public.outlets(id);
  alter table public.expenses  add column if not exists outlet_id uuid references public.outlets(id);
  alter table public.products  add column if not exists outlet_id uuid references public.outlets(id);

  update public.profiles  set outlet_id = seed_id where outlet_id is null;
  update public.orders    set outlet_id = seed_id where outlet_id is null;
  update public.customers set outlet_id = seed_id where outlet_id is null;
  update public.expenses  set outlet_id = seed_id where outlet_id is null;
  update public.products  set outlet_id = seed_id where outlet_id is null;
end $$;

create index if not exists profiles_outlet_idx  on public.profiles  (outlet_id);
create index if not exists orders_outlet_idx    on public.orders    (outlet_id);
create index if not exists customers_outlet_idx on public.customers (outlet_id);
create index if not exists expenses_outlet_idx  on public.expenses  (outlet_id);
create index if not exists products_outlet_idx  on public.products  (outlet_id);

-- ---------------------------------------------------------------------
-- 3.  Keep the legacy `profiles.outlet` text column in sync with
--     outlets.name so the existing UI (header, Users table) keeps
--     rendering without code changes.
-- ---------------------------------------------------------------------
update public.profiles p
   set outlet = o.name
  from public.outlets o
 where p.outlet_id = o.id
   and (p.outlet is null or p.outlet <> o.name);

create or replace function public.sync_profile_outlet_name()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.outlet_id is not null then
    new.outlet := (select name from public.outlets where id = new.outlet_id);
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_sync_outlet_name on public.profiles;
create trigger profiles_sync_outlet_name
  before insert or update of outlet_id on public.profiles
  for each row execute function public.sync_profile_outlet_name();

-- ---------------------------------------------------------------------
-- 4.  RLS helpers.
--     Both are SECURITY DEFINER so they bypass RLS on the profiles
--     table they query — otherwise the policies that *use* them would
--     recurse.
-- ---------------------------------------------------------------------
create or replace function public.current_outlet_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select outlet_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select role = 'super_admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- is_admin() now treats super_admin as admin too (super_admin can do
-- anything an admin can, plus more).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select role in ('admin','super_admin') from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------
-- 5.  Auto-assign outlet on new auth signups. If signup metadata
--     carries an outlet_id we honour it (super_admin can specify which
--     outlet a new staff goes to); otherwise we default to the most
--     recently created outlet — which for fresh setups is Patna-RKP.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare default_outlet uuid;
begin
  default_outlet := nullif(new.raw_user_meta_data->>'outlet_id','')::uuid;
  if default_outlet is null then
    select id into default_outlet
      from public.outlets where active = true
      order by created_at asc limit 1;
  end if;

  insert into public.profiles (id, name, email, role, outlet_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.email,
    'staff',
    default_outlet
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 6.  Defaults & NOT NULL on outlet_id.
--     Defaults use current_outlet_id() so the client never has to send
--     outlet_id on inserts — it's stamped from the caller's profile.
-- ---------------------------------------------------------------------
alter table public.orders    alter column outlet_id set default public.current_outlet_id();
alter table public.customers alter column outlet_id set default public.current_outlet_id();
alter table public.expenses  alter column outlet_id set default public.current_outlet_id();
alter table public.products  alter column outlet_id set default public.current_outlet_id();

alter table public.profiles  alter column outlet_id set not null;
alter table public.orders    alter column outlet_id set not null;
alter table public.customers alter column outlet_id set not null;
alter table public.expenses  alter column outlet_id set not null;
alter table public.products  alter column outlet_id set not null;

-- ---------------------------------------------------------------------
-- 7.  RLS — replace the old "same-store" policies with outlet-scoped
--     versions. super_admin bypasses scoping everywhere.
-- ---------------------------------------------------------------------
alter table public.outlets enable row level security;
drop policy if exists "outlets read"  on public.outlets;
drop policy if exists "outlets write" on public.outlets;
create policy "outlets read" on public.outlets
  for select using (auth.uid() is not null);
create policy "outlets write" on public.outlets
  for all using (public.is_super_admin())
  with check (public.is_super_admin());

-- profiles — read everyone in own outlet (or all, for super_admin).
drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles update" on public.profiles;
create policy "profiles read" on public.profiles
  for select using (
    auth.uid() is not null
    and (outlet_id = public.current_outlet_id() or public.is_super_admin())
  );
create policy "profiles update" on public.profiles
  for update using (
    auth.uid() = id
    or (public.is_admin() and outlet_id = public.current_outlet_id())
    or public.is_super_admin()
  ) with check (
    auth.uid() = id
    or (public.is_admin() and outlet_id = public.current_outlet_id())
    or public.is_super_admin()
  );

-- products — read within outlet; admin (or super_admin) writes.
drop policy if exists "products read"  on public.products;
drop policy if exists "products write" on public.products;
create policy "products read" on public.products
  for select using (
    auth.uid() is not null
    and (outlet_id = public.current_outlet_id() or public.is_super_admin())
  );
create policy "products write" on public.products
  for all using (
    (public.is_admin() and outlet_id = public.current_outlet_id())
    or public.is_super_admin()
  ) with check (
    (public.is_admin() and outlet_id = public.current_outlet_id())
    or public.is_super_admin()
  );

-- customers, orders, expenses — full access within own outlet.
do $$
declare t text;
begin
  foreach t in array array['customers','orders','expenses']
  loop
    execute format('drop policy if exists "staff all" on public.%I;', t);
    execute format($p$
      create policy "staff all" on public.%I for all
        using (
          auth.uid() is not null
          and (outlet_id = public.current_outlet_id() or public.is_super_admin())
        )
        with check (
          outlet_id = public.current_outlet_id() or public.is_super_admin()
        );
    $p$, t);
  end loop;
end $$;

-- order_items — scope via the parent order's outlet_id.
drop policy if exists "staff all" on public.order_items;
create policy "staff all" on public.order_items for all
  using (
    exists (
      select 1 from public.orders o
       where o.id = order_items.order_id
         and (o.outlet_id = public.current_outlet_id() or public.is_super_admin())
    )
  )
  with check (
    exists (
      select 1 from public.orders o
       where o.id = order_items.order_id
         and (o.outlet_id = public.current_outlet_id() or public.is_super_admin())
    )
  );

-- ---------------------------------------------------------------------
-- 8.  Reload PostgREST schema cache so new columns / policies become
--     visible to the REST API immediately.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';

-- =====================================================================
--  ONE-TIME:  Promote your owner account to super_admin so they can
--  see across outlets when more are added.  Replace the email.
-- =====================================================================
-- update public.profiles set role = 'super_admin'
--  where email = 'you@example.com';

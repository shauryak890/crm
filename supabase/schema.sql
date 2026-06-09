-- =====================================================================
--  WHITES & BRIGHTS — STORE CRM  ·  DATABASE SCHEMA
--  Run this once in: Supabase Dashboard → SQL Editor → New query → Run
--  Safe to re-run (uses IF NOT EXISTS / OR REPLACE where possible).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
--  SEQUENCES  (human-friendly running numbers, continuing your old CRM)
-- ---------------------------------------------------------------------
create sequence if not exists order_no_seq      start with 244;   -- next invoice = #244
create sequence if not exists customer_code_seq start with 5011;  -- next client  = CL5011
create sequence if not exists expense_no_seq    start with 33;    -- next expense = EXP033

-- ---------------------------------------------------------------------
--  OUTLETS  (multi-store foundation — every other table is scoped to
--  one row in here. A super_admin can read/write across all outlets.)
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

-- Seed the first outlet so fresh installs aren't empty.
insert into public.outlets (code, name, address, phone)
values ('PAT-RKP', 'Patna - RK Puram', 'RK Puram, Patna', '9308140181')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
--  PROFILES  (one row per staff login — linked to Supabase Auth)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text,
  email       text,
  role        text not null default 'staff',          -- 'staff' | 'admin' | 'super_admin'
  outlet      text default 'Main Outlet',             -- denormalised name (synced via trigger below)
  outlet_id   uuid references public.outlets(id),
  created_at  timestamptz not null default now()
);
create index if not exists profiles_outlet_idx on public.profiles (outlet_id);

-- Auto-create a profile row whenever a new auth user signs up.
-- Always starts as 'staff' — promotion to 'admin' is done explicitly
-- via the System Users screen (an RLS-checked UPDATE), never via
-- signup metadata, so self-promotion is not possible.
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
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'staff',
    default_outlet
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Keep `profiles.outlet` (legacy text column) in sync with the joined
-- outlet name so the existing UI keeps rendering without changes.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
--  CUSTOMERS
-- ---------------------------------------------------------------------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null default ('CL' || nextval('customer_code_seq')),
  outlet_id   uuid references public.outlets(id),
  first_name  text not null,
  last_name   text default '',
  phone       text,
  phone_norm  text,                                  -- last 10 digits, set by trigger
  address     text,
  package     text default 'No Package',
  created_at  timestamptz not null default now()
);
create index if not exists customers_phone_idx      on public.customers (phone);
create index if not exists customers_name_idx       on public.customers (first_name, last_name);
create index if not exists customers_outlet_idx     on public.customers (outlet_id);
create index if not exists customers_phone_norm_idx on public.customers (phone_norm);

-- One customer per phone, per outlet. Partial — only enforced when a
-- phone is on file.
create unique index if not exists customers_outlet_phone_uniq
  on public.customers (outlet_id, phone_norm)
  where phone_norm is not null;

-- Keep phone_norm = digits-only, last 10 chars, of `phone`.
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

-- ---------------------------------------------------------------------
--  PRODUCTS  (your service catalogue / price list)
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  outlet_id   uuid references public.outlets(id),
  name        text not null,
  price       numeric(10,2) not null default 0,
  category    text default 'General',
  unit        text not null default 'piece'
                check (unit in ('piece','kg')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists products_active_idx on public.products (active);
create index if not exists products_outlet_idx on public.products (outlet_id);

-- ---------------------------------------------------------------------
--  ORDERS  (invoices — walk-in POS today, app/HQ channels later)
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  order_no        integer unique not null default nextval('order_no_seq'),
  outlet_id       uuid references public.outlets(id),
  customer_id     uuid references public.customers(id) on delete set null,
  customer_name   text not null default 'Walk-in client',
  phone           text,
  address         text,
  fulfilment      text not null default 'pickup'
                     check (fulfilment in ('pickup','delivery')),
  due_date        date,
  subtotal        numeric(10,2) not null default 0,
  discount_pct    numeric(5,2)  not null default 0,
  tax_pct         numeric(5,2)  not null default 0,
  total           numeric(10,2) not null default 0,
  payment_method  text not null default 'Cash',     -- Cash | Card | UPI | Cheque
  payment_status  text not null default 'Unpaid',   -- Paid | Unpaid
  delivery_status text not null default 'Pending',  -- Pending | Delivered
  order_status    text not null default 'Order Placed',
  channel         text not null default 'walk-in',  -- walk-in | app
  notes           text,
  damage_note     text,
  image_urls      text[] not null default '{}',
  created_at      timestamptz not null default now()
);
create index if not exists orders_created_idx    on public.orders (created_at desc);
create index if not exists orders_status_idx     on public.orders (order_status);
create index if not exists orders_due_date_idx   on public.orders (due_date);
create index if not exists orders_fulfilment_idx on public.orders (fulfilment);
create index if not exists orders_outlet_idx     on public.orders (outlet_id);

-- When an order reaches 'Delivered', mirror the delivery_status badge
-- so the two stay in sync regardless of where the status was changed.
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

-- When an order reaches the 'Delivered' state, clear the prior-damage
-- record so it isn't retained indefinitely. (Storage files are wiped by
-- the client before this fires; this trigger guarantees the columns are
-- emptied no matter how the status was changed.)
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

-- ---------------------------------------------------------------------
--  ORDER ITEMS  (line items per invoice)
-- ---------------------------------------------------------------------
create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  product_name  text not null,
  service_type  text default 'Laundry',
  express       boolean not null default false,
  qty           integer not null default 1,            -- piece count
  weight_kg     numeric(10,2),                          -- when unit='kg'
  unit          text not null default 'piece'
                  check (unit in ('piece','kg')),
  unit_price    numeric(10,2) not null default 0,
  line_total    numeric(10,2) not null default 0
);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------
--  EXPENSES
-- ---------------------------------------------------------------------
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  expense_no  text unique not null default ('EXP' || lpad(nextval('expense_no_seq')::text, 3, '0')),
  outlet_id   uuid references public.outlets(id),
  title       text not null,
  category    text default 'General',
  amount      numeric(10,2) not null default 0,
  spent_on    date not null default current_date,
  created_at  timestamptz not null default now()
);
create index if not exists expenses_date_idx   on public.expenses (spent_on desc);
create index if not exists expenses_outlet_idx on public.expenses (outlet_id);

-- =====================================================================
--  ROW LEVEL SECURITY  (multi-outlet, role-aware)
--  Three roles on `profiles`:
--    • 'staff'        — read/write within their own outlet only.
--    • 'admin'        — same scope as staff, plus can mutate products
--                       and change roles within their outlet.
--    • 'super_admin'  — bypasses outlet scoping; sees and edits all.
-- =====================================================================
alter table public.outlets     enable row level security;
alter table public.profiles    enable row level security;
alter table public.customers   enable row level security;
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.expenses    enable row level security;

-- Helpers (SECURITY DEFINER so they bypass RLS on profiles — otherwise
-- the policies that reference them would recurse).
create or replace function public.current_outlet_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$ select outlet_id from public.profiles where id = auth.uid(); $$;

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

-- outlets — read for any signed-in user, write only for super_admin.
drop policy if exists "outlets read"  on public.outlets;
drop policy if exists "outlets write" on public.outlets;
create policy "outlets read"  on public.outlets for select using (auth.uid() is not null);
create policy "outlets write" on public.outlets for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- profiles — read everyone in your outlet (super_admin sees all).
-- Users may update their own row; outlet admins may update peers in
-- their outlet; super_admin may update anyone. A trigger blocks role
-- changes by non-admins.
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

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'only admins can change roles';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- products — read within outlet; admin can write within own outlet.
drop policy if exists "staff all"      on public.products;
drop policy if exists "products read"  on public.products;
drop policy if exists "products write" on public.products;
create policy "products read" on public.products
  for select using (
    auth.uid() is not null
    and (outlet_id = public.current_outlet_id() or public.is_super_admin())
  );
create policy "products write" on public.products for all
  using (
    (public.is_admin() and outlet_id = public.current_outlet_id())
    or public.is_super_admin()
  ) with check (
    (public.is_admin() and outlet_id = public.current_outlet_id())
    or public.is_super_admin()
  );

-- customers, orders, expenses — read/write within own outlet.
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

-- order_items — scoped via parent order's outlet_id.
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

-- Stamp outlet_id on new rows automatically from the caller's outlet.
alter table public.orders    alter column outlet_id set default public.current_outlet_id();
alter table public.customers alter column outlet_id set default public.current_outlet_id();
alter table public.expenses  alter column outlet_id set default public.current_outlet_id();
alter table public.products  alter column outlet_id set default public.current_outlet_id();

-- =====================================================================
--  DONE.  Next:
--   1.  (optional) run  seed_catalogue.sql  to load your price list
--       for the first outlet (Patna - RK Puram).
--   2.  Create your first staff login in Authentication → Users.
--   3.  Promote that login to super_admin so they can manage outlets
--       and see across all of them:
--         update public.profiles set role = 'super_admin'
--          where email = 'you@example.com';
--       (Use 'admin' instead if you want it scoped to a single outlet.)
-- =====================================================================

-- =====================================================================
--  WHITES & BRIGHTS — STORE CRM  ·  ROLE-AWARE RLS MIGRATION
--  Run this once in: Supabase Dashboard → SQL Editor → New query → Run
--  (Safe to re-run.)
--
--  After this migration:
--   • Any signed-in user can read everything and run the POS.
--   • Only users with profiles.role = 'admin' can write to `products`
--     (i.e. add / edit / archive items in the catalogue).
--   • Only admins can change someone's role.
--   • Self-promotion via auth signup metadata is no longer possible.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1.  Helper: is the current user an admin?
--     SECURITY DEFINER so it can read profiles without recursing into
--     the RLS policies that use it.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------
-- 2.  PRODUCTS — read for any signed-in staff, write for admins only
-- ---------------------------------------------------------------------
drop policy if exists "staff all"      on public.products;
drop policy if exists "products read"  on public.products;
drop policy if exists "products write" on public.products;

create policy "products read" on public.products
  for select
  using (auth.uid() is not null);

create policy "products write" on public.products
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3.  PROFILES — anyone signed in can read; users can update their own
--     row; admins can update anyone. A trigger below forbids non-admins
--     from changing the `role` column on their own row.
-- ---------------------------------------------------------------------
drop policy if exists "profiles update" on public.profiles;
create policy "profiles update" on public.profiles
  for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Only enforce when the call has an API auth context (auth.uid() is set).
  -- Direct DB access (Supabase SQL editor, service_role) bypasses this so
  -- you can bootstrap the first admin.
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

-- ---------------------------------------------------------------------
-- 4.  Harden the signup trigger — never trust `role` from auth metadata.
--     New signups always start as 'staff'. Admins must promote
--     explicitly via the System Users screen (which UPDATEs profiles).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'staff'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- =====================================================================
-- 5.  ONE-TIME: promote your first login to admin.
--     Replace the email with the address of your owner/manager account,
--     then run just this one line. After that, you can manage roles
--     from the System Users screen inside the app.
-- =====================================================================
-- update public.profiles set role = 'admin' where email = 'you@example.com';

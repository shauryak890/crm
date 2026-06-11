-- =====================================================================
--  WHITES & BRIGHTS — STORE CRM  ·  HIDE SUPER-ADMIN ACCOUNTS
--  Run this once in: Supabase Dashboard → SQL Editor → New query → Run
--  (Safe to re-run.)
--
--  Makes super_admin profiles invisible to everyone except other
--  super_admins. This is enforced in the DATABASE (RLS), so the
--  accounts can't be discovered via the API either — not just hidden
--  in the UI.
--
--  Rules after this runs:
--    • A super_admin sees every profile (all outlets, all roles).
--    • A staff or outlet-admin sees only NON-super-admin profiles in
--      their own outlet.
--    • A user can always read their own row (so the app's own
--      "who am I" lookup keeps working even for a super_admin).
-- =====================================================================

drop policy if exists "profiles read" on public.profiles;

create policy "profiles read" on public.profiles
  for select using (
    -- You can always see your own profile row.
    auth.uid() = id
    -- Super admins see everyone.
    or public.is_super_admin()
    -- Everyone else: same outlet AND not a super_admin account.
    or (
      outlet_id = public.current_outlet_id()
      and role <> 'super_admin'
    )
  );

-- Reload PostgREST schema cache so the new policy takes effect at once.
notify pgrst, 'reload schema';

# Whites & Brights — Store CRM

A production-ready point-of-sale and store-management panel for the Whites & Brights
laundry & dry-clean outlet. Walk-in billing, order tracking, customers, expenses,
staff logins and reporting — all backed by a real database so data persists and is
shared across every device in the store.

Built with **React + Vite**, **Supabase** (Postgres + Auth) and **Tailwind / Recharts**.
The customer-app, driver and HQ super-admin panels are stubbed in as "App Channel"
sections and will switch on without a rebuild once those backends go live.

---

## What you need

- A free [Supabase](https://supabase.com) account (the database + login system)
- [Node.js 18+](https://nodejs.org) installed (only for running/building locally)
- A [Netlify](https://netlify.com) account for hosting (free tier is fine)

---

## 1 · Set up the database (Supabase)

1. Go to **supabase.com → New project**. Give it a name, a strong database password,
   and pick the region closest to your outlet (e.g. *Mumbai / ap-south-1*).
2. When it's ready, open **SQL Editor → New query**, paste the entire contents of
   **`supabase/schema.sql`**, and click **Run**. This creates every table, the
   running invoice/customer numbers, and the security rules.
3. *(Optional but recommended)* Run **`supabase/seed_catalogue.sql`** the same way to
   load your service price list so the POS is ready to use. Edit the prices first if
   they've changed.
4. Create your first login: **Authentication → Users → Add user** → enter your email
   and a password (tick *Auto Confirm User* so you can log in immediately). After you
   sign in once, you can add the rest of your staff from the in-app **System Users**
   screen.
5. **Promote that first login to admin.** New signups always start as `staff` (so
   nobody can self-promote). Open **SQL Editor → New query** and run, replacing the
   email with your own:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
   After that, you'll see the **Catalogue** and **System Users** menu items, and you
   can create additional admins from inside the app.
6. Copy your keys from **Project Settings → API**:
   - `Project URL`
   - `anon` `public` key

> **Already running an older version of this CRM?** Run **`supabase/role_policies.sql`**
> once in the SQL Editor — it upgrades an existing project to the role-aware policies
> without touching your data. Then do step 5 above to promote yourself.

---

## 2 · Run it on your computer

```bash
# install dependencies (first time only)
npm install

# create your .env file
cp .env.example .env
```

Open `.env` and paste your two Supabase values:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...your-anon-key...
```

Then start it:

```bash
npm run dev
```

Open the printed URL (usually `http://localhost:5173`) and sign in with the user you
created in step 4.

---

## 3 · Deploy to Netlify

You have two easy options.

### Option A — Connect your Git repo (recommended)

1. Push this folder to a GitHub/GitLab repository.
2. In Netlify: **Add new site → Import an existing project** → pick the repo.
3. Netlify reads `netlify.toml` automatically (build command `npm run build`,
   publish directory `dist`). Leave those as-is.
4. Add your environment variables under **Site settings → Environment variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. **Deploy site.** Every future `git push` redeploys automatically.

### Option B — Drag & drop

```bash
npm run build      # produces the dist/ folder
```

Drag the generated **`dist`** folder onto the Netlify dashboard.
(With this method, set the two environment variables in Netlify **before** building,
or rebuild after adding them, since Vite bakes them in at build time.)

### One required Supabase setting for the live site

In Supabase → **Authentication → URL Configuration**, add your Netlify URL
(e.g. `https://whites-brights.netlify.app`) to **Site URL** and **Redirect URLs** so
logins work from the deployed site.

---

## Roles: admin vs. staff

Two roles live on the `profiles` table:

| Capability                                | Staff | Admin |
| ----------------------------------------- | :---: | :---: |
| POS, Sales, Order Status, Delivery        |  ✅   |  ✅   |
| Customers, Expenses, Reports, Dashboard   |  ✅   |  ✅   |
| Edit own profile in Settings              |  ✅   |  ✅   |
| **Catalogue** — add / edit / archive prices |  ❌   |  ✅   |
| **System Users** — create staff, change roles |  ❌   |  ✅   |

Enforcement is at two layers:

- **UI** — the sidebar hides admin-only items for staff, and the admin-only routes
  show an "Admin only" panel if a staff user lands there.
- **Database** — Row-Level Security on Supabase blocks any attempt to mutate
  `products` or change someone's `role` unless the caller is an admin. Even a hand-
  crafted API call with a staff token will be rejected.

To upgrade someone from staff to admin: sign in as an admin → **System Users** →
"Add User" (with role = admin), or for existing accounts, run a one-line update in
Supabase SQL Editor.

---

## Project structure

```
whites-brights-crm/
├─ supabase/
│  ├─ schema.sql            # run once — tables, sequences, security
│  ├─ role_policies.sql     # upgrade existing DBs to role-aware RLS
│  └─ seed_catalogue.sql    # optional — your service price list
├─ src/
│  ├─ App.jsx               # shell: auth gate, layout, role-aware nav
│  ├─ theme.js              # brand palette & shared constants
│  ├─ lib/
│  │  ├─ supabase.js        # database client (reads your .env)
│  │  ├─ api.js             # all reads & writes
│  │  └─ aggregate.js       # dashboard / report calculations
│  ├─ components/ui.jsx     # buttons, cards, tables, modal
│  └─ pages/                # one file per screen
├─ netlify.toml             # Netlify build + routing
└─ .env.example             # copy to .env
```

## How the data works

- **Customers, Products, Orders, Order items, Expenses, Profiles** live in Postgres.
- Invoice numbers (`#244…`), customer codes (`CL5011…`) and expense numbers
  (`EXP033…`) auto-increment in the database, continuing from your previous system.
- A customer's *Total / Paid / Rest* is calculated live from their real invoices, so
  it always reconciles.
- **Row-Level Security is on.** Nothing is readable or writable without a valid staff
  login. Admin-only tables (the catalogue) are further locked to admins.

## Security notes

- The `anon` key is safe to ship in the browser — it only works together with a login
  because of Row-Level Security. Never put the `service_role` key in this app.
- Staff accounts are real Supabase Auth users. Remove someone's access from
  **Supabase → Authentication → Users**.

## Roadmap (already wired into the UI)

- **App Orders** — customer-app orders flow straight into this panel.
- **Live Tracking & Drivers** — pickup/delivery rider operations.
- **Super Admin (HQ)** — multi-outlet command centre, royalties, master catalogue.

These appear as "Under Construction" today and activate once their backends ship.

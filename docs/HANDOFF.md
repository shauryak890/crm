# Whites & Brights — Platform Handoff

> **Read this first.** This is the single source of truth for anyone (human or a
> fresh Claude Code session) continuing work on the Whites & Brights platform.
> It captures what is already built, the live database structure, every decision
> made so far, and exactly what to build next for the customer and driver apps.
>
> Pair this with `whites-and-brights-platform-blueprint.pdf` (the long-form
> strategy doc). This file is the **current-state truth**; the blueprint is the
> **plan**. Where they disagree, this file wins.

Last updated: 2026-06 (during CRM build).

---

## 1. The one-paragraph summary

Whites & Brights is a multi-outlet laundry/dry-clean franchise. The platform is
**one Supabase project (Postgres + Auth + RLS + Realtime + Storage)** with
multiple front-ends talking to it. **Two front-ends are built and live** (the
outlet CRM/POS and the corporate HQ panel). **Two are not yet built** (the
customer Android app and the driver app). All apps share the same database; an
order is just a row in `orders`, and every client reads/writes that same table.
Multi-tenancy is real: every record carries `outlet_id`, enforced by RLS.

---

## 2. What is BUILT (this repo)

This repo (`whites-brights-crm`) is a **React + Vite** web app. It is the
**Outlet Admin Panel + Walk-in POS** AND the **HQ Super-Admin panel** (the HQ
panel is a hidden route inside the same app).

**Stack:** React 18, Vite 5, plain CSS-in-JS (no component lib), Tailwind present
but mostly inline styles, `@supabase/supabase-js`, `recharts` (charts),
`jsbarcode` (barcodes), `lucide-react` (icons). No TypeScript. No router — view
switching is local state (`view`) in `src/App.jsx`.

### Pages (`src/pages/`)
- `Login.jsx` — Supabase email/password sign-in, split brand layout.
- `Dashboard.jsx` — outlet KPIs, sales charts, recent orders.
- `POS.jsx` — walk-in billing. Product grid + category filter, cart with
  edit/delete per line, inline customer (name/phone/address), pickup-vs-delivery,
  delivery date, damage notes + photo upload, payment, focus mode.
- `Sales.jsx` — invoice list, status dropdown, re-open invoice.
- `OrderStatus.jsx` — kanban-ish status board.
- `Delivery.jsx` — pickups vs deliveries due, split by `fulfilment`.
- `Customers.jsx` — customer directory with live Total/Paid/Rest.
- `Catalogue.jsx` — **admin-only** product/price management (per-piece OR per-kg).
- `Expenses.jsx` — expense tracking.
- `Reports.jsx` — sales/expense rollups.
- `Users.jsx` — **admin-only** System Users (create staff, set role). Hides
  `super_admin` accounts.
- `Settings.jsx` — own profile.
- `Construction.jsx` — "coming soon" placeholder used by App Orders + Live
  Tracking nav items. **These two stubs are the landing spots for the mobile
  apps' features.**
- `hq/HQPanel.jsx` — **the HQ super-admin panel.** Full-screen, cross-outlet
  rollups, per-outlet drill-down with revenue trend / payment mix / top services
  / profit / staff, and "Add outlet".

### Components (`src/components/`)
- `ui.jsx` — shared primitives: `Card`, `Btn`, `Badge`, `Modal`, `DataTable`,
  `PageHead`, `IconCircle`, `Trend`, `Logo`, plus style consts (`field`, `td`,
  `iconBtn`, `fieldLabel`).
- `Invoice.jsx` — printable invoice + per-garment barcode tag sheet (canvas→PNG
  barcodes so they print reliably). WhatsApp share button.
- `DeliveryAlert.jsx` — floating "due today" panel on every page.

### Lib (`src/lib/`)
- `supabase.js` — the Supabase client (reads `VITE_SUPABASE_URL` / `_ANON_KEY`).
- `api.js` — ALL reads/writes. Key exports: `fetchProducts`, `fetchAllProducts`,
  `fetchCustomers`, `fetchOrders`, `fetchExpenses`, `fetchProfiles`,
  `createOrder` (rolls back order if items insert fails), `updateOrderStatus`,
  `updateOrderFields`, `createCustomer` (handles phone unique-violation),
  `deleteCustomer`, `createExpense`, `deleteExpense`, `createProduct`,
  `updateProduct`, `deleteProduct`, `fetchOrderItems`, `fetchOrderItemsForOrder`,
  `uploadOrderPhoto`, `deleteOrderPhotos`, `fetchOutlets`, `createOutlet`,
  `updateOutlet`, `fetchAllOrderItems`, `rollupCustomer`.
- `aggregate.js` — `isToday`, `paymentTotals`, `buildYearData`, `topServices`.

### HQ access mechanism (important, non-obvious)
The HQ panel has **no nav link anywhere**. It opens only when the URL hash is
`#hq` **and** the signed-in user's role is `super_admin`. Anyone else who types
`#hq` is silently bounced back to the normal app. See the "HQ gate" block in
`src/App.jsx`. Security is enforced by DB RLS regardless of the frontend.

---

## 3. The DATABASE (the real backend — shared by ALL apps)

Supabase Postgres. **The local `supabase/*.sql` files are gitignored** (kept off
GitHub on purpose) and several were deleted from the repo earlier — but **the
live database has all migrations applied.** Treat the live DB as truth. If you
need the SQL, it's in the owner's Supabase SQL Editor tabs, or reconstruct from
this section.

### Roles (`profiles.role`)
- `staff` — read/write within their own outlet only.
- `admin` — staff powers + manage Catalogue + change roles, within their outlet.
- `super_admin` — bypasses outlet scoping; sees/edits ALL outlets; only role that
  can create outlets; hidden from System Users for everyone else.

### Tables (current)
- **`outlets`** — `id, code (unique), name, address, phone, active, created_at`.
  First/seed outlet: code `PAT-RKP`, name "Patna - RK Puram".
- **`profiles`** — `id (=auth.users.id), name, email, role, outlet (text, synced
  by trigger), outlet_id (FK), created_at`. Auto-created on signup via trigger;
  always starts `staff` + assigned to the oldest active outlet.
- **`customers`** — `id, code (CL####), outlet_id, first_name, last_name, phone,
  phone_norm (last 10 digits, trigger-maintained), address, package, created_at`.
  Unique index on `(outlet_id, phone_norm)` — one customer per phone per outlet.
- **`products`** — `id, outlet_id, name, price, category, unit ('piece'|'kg'),
  active, created_at`.
- **`orders`** — `id, order_no (unique seq from 244), outlet_id, customer_id,
  customer_name, phone, address, fulfilment ('pickup'|'delivery'), due_date,
  subtotal, discount_pct, tax_pct, total, amount_paid, payment_method, 
  payment_status ('Paid'|'Unpaid'), delivery_status, order_status, channel
  ('walk-in'|'app'), notes, damage_note, image_urls (text[]), created_at`.
- **`order_items`** — `id, order_id, product_name, service_type, express, qty
  (int piece-count), weight_kg, unit ('piece'|'kg'), unit_price, line_total`.
- **`expenses`** — `id, expense_no (EXP###), outlet_id, title, category, amount,
  spent_on, created_at`.

### RLS helpers (SECURITY DEFINER functions)
- `current_outlet_id()` → the caller's `profiles.outlet_id`.
- `is_super_admin()` → bool.
- `is_admin()` → true for `admin` OR `super_admin`.

### RLS pattern
Every scoped table: `using (outlet_id = current_outlet_id() OR is_super_admin())`.
`order_items` scopes via its parent order's `outlet_id`. `products` writes are
admin-only. `profiles read` hides `super_admin` rows from non-super-admins.
Inserts auto-stamp `outlet_id` via a column DEFAULT of `current_outlet_id()`.

### Triggers worth knowing
- `handle_new_user` — creates profile on auth signup (role=staff, default outlet).
- `sync_profile_outlet_name` — keeps `profiles.outlet` text = the outlet's name.
- `set_customer_phone_norm` — maintains `customers.phone_norm`.
- `guard_profile_role` — blocks non-admins from changing roles.
- `sync_delivery_status` — when `order_status`→'Delivered', set delivery_status.
- `clear_damage_on_delivered` — when delivered, null damage_note + image_urls.
- After every migration: `notify pgrst, 'reload schema';` (refresh REST cache).

### Storage
- Bucket `order-photos` (public read, auth-only write). Holds POS damage photos.

---

## 4. DECISIONS already made (from this build + blueprint §19)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Multi-tenancy | **Real, from day 1.** Every row has `outlet_id`. RLS-enforced. |
| 2 | Roles | staff / admin / super_admin (see §3). |
| 3 | Existing CRM | **Replaced**, not integrated. This repo IS the outlet POS. |
| 4 | Pricing model | **Both** per-piece and per-kg (set per product via `products.unit`). |
| 5 | Express service | Implemented as a 1.6× multiplier flag on the line item. |
| 6 | HQ access | Hidden `#hq` route, super_admin only. No discoverable link. |
| 7 | Super-admin visibility | Invisible in System Users (RLS + frontend filter). Full admin powers in store panel, labelled "Super Admin". |
| 8 | Customer identity | Phone (last-10 normalised) is the dedupe key per outlet. |
| 9 | Outlet onboarding | Via HQ "Add outlet" + SQL to assign staff (no full KYC flow yet). |

### Blueprint §19 decisions still RECOMMENDED (confirm before mobile build)
- Android-only at launch (iOS V2).
- React Native + **Expo** for customer & driver apps (NOT a screen in this Vite app).
- Pay: support UPI prepay + Pay-on-delivery.
- WhatsApp from beta. SMS OTP via MSG91. Push via Expo Push.
- HQ controls pricing; outlets request changes.
- Subscriptions: V2. B2B: V2.

---

## 5. HOW THE APPS CONNECT (architecture)

```
Customer App   Driver App    Outlet CRM(built)   HQ Panel(built)
 (Expo/RN)      (Expo/RN)     (this repo)         (#hq in this repo)
     └──────────────┴──────────────┬──────────────────┘
                                    ▼
                    Supabase (Postgres+Auth+RLS+Realtime+Storage)
```

**An app order is just an `orders` row with `channel = 'app'`.** The outlet CRM
already reads `orders`; adding a Supabase **Realtime** subscription makes new app
orders pop into the queue live. No separate backend needed for the MVP — Supabase
IS the backend (blueprint's "simpler architecture", §10).

### Order flow (end to end)
1. Customer app: detect location → pick the `outlet_id` whose service area covers
   them → insert `orders` row (`channel='app'`, `order_status='pending_pickup'`).
2. Outlet CRM (Realtime): new order appears live in the **App Orders** screen.
3. Manager taps **Assign driver** → insert `tasks` row `{driver_id, order_id,
   type:'pickup'}`.
4. Driver app (Realtime on `tasks` where driver_id = me): task appears → navigate
   → scan/photo → enter real item count → mark picked up → status updates.
5. Operator marks washing→ready in CRM. Driver delivers → status 'Delivered'.
6. Customer app (Realtime on their order): live status + rating prompt.

### Driver assignment
- **Phase 1 (launch):** manual — manager picks driver in CRM, writes `tasks`.
- **Phase 2:** Supabase Edge Function auto-assigns nearest free driver on insert.

---

## 6. WHAT TO BUILD NEXT (recommended order)

> Golden rule (blueprint §18): the CRM should *receive* app orders BEFORE the
> apps exist. Prove the pipe with a manually-inserted row first.

### Step 0 — In THIS repo (cheap, high value, do first)
- New tables: `tasks`, `drivers`, `customer_addresses`, `order_photos`, `bags`,
  `garment_tags` (see blueprint §9 for columns). Add `outlet_id` + RLS to each.
- Add `'pending_pickup'`, `'picked_up'`, `'at_outlet'`, `'out_for_delivery'`
  etc. as valid `order_status` values (extend KANBAN or add a parallel state set).
- Activate the **App Orders** screen: subscribe to `orders` (Realtime) for the
  outlet; show `channel='app'` orders; "Assign driver" button → writes `tasks`.
- Activate **Live Tracking**: list drivers + their current task.
- TEST: insert an `orders` row with `channel='app'` in the Supabase table editor
  and watch it pop into the CRM live. That proves the whole pipeline.

### Step 1 — Customer app (new folder, Expo)
- `npx create-expo-app whites-brights-customer`
- Same Supabase project (same URL + anon key in app config).
- Phone OTP auth (Supabase Auth + MSG91), location → outlet detection, service
  selection, item estimate, pickup slot, address, place order (insert `orders`).
- Order tracking screen (Realtime on their order). Push via Expo Push.

### Step 2 — Driver app (new folder, Expo — shares ~60% with customer)
- Task list (Realtime on `tasks`), navigate, QR scan, item count, photos,
  status transitions, proof-of-delivery.

### Reusable assets when building mobile
- **Reuse the DB and RLS as-is** — don't rebuild. The apps just insert/select.
- **Reuse the PriceCalculator logic** conceptually from `POS.jsx`/`Catalogue`
  (per-piece vs per-kg, express 1.6×). Consider extracting to a shared package
  if you later go monorepo.
- **Reuse barcode/tag logic** from `Invoice.jsx`.

---

## 7. STARTING A FRESH SESSION (the actual answer to "won't it lose context?")

A new Claude Code session in a new folder has no memory of prior chats — but it
doesn't need it. Everything is in files. Your first message should be:

> "Read `docs/HANDOFF.md` and `whites-and-brights-platform-blueprint.pdf` from
>  the CRM repo. We're building the customer app in this folder. It uses the same
>  Supabase project. Start by planning the order-placement flow: every screen,
>  every Supabase call, every table write. Show me the plan before coding."

Keep this file updated as things change (blueprint §21). Copy both this file and
the blueprint PDF into each new app's `docs/` folder so every session can see them.

### Env / secrets the new app needs
- `VITE_SUPABASE_URL` / `SUPABASE_URL` — same project as the CRM.
- `SUPABASE_ANON_KEY` — same anon key. (Never the service_role key in a client.)
- Find both in the CRM's `.env` (gitignored) or Supabase → Project Settings → API.

### Gotchas a new session must know
- The anon key is safe in clients **only because RLS is on**. Never disable RLS.
- New tables MUST get `outlet_id` + RLS mirroring the existing pattern, or app
  data will leak across outlets.
- After any schema change, run `notify pgrst, 'reload schema';` or the REST API
  won't see new columns ("column not found in schema cache").
- `super_admin` rows must stay hidden from non-super-admins (RLS already does it;
  don't regress it).
```

# Whites & Brights — CRM Feature Reference

A complete, in-depth reference of every feature in the Whites & Brights laundry/dry-cleaning CRM. Generated from a full source-code audit — every claim below is grounded in actual code, not assumption.

**Stack:** React 18 + Vite 5, Supabase (Postgres, Auth, RLS, Storage, Realtime), `recharts` (charts), `jsbarcode` (Code128 barcodes), `lucide-react` (icons). No router — the whole app is one `App.jsx` component switching a `view` string; HQ is reached only via a hidden URL hash.

---

## Table of Contents

1. [Auth & Roles](#1-auth--roles)
2. [Point of Sale (POS)](#2-point-of-sale-pos)
3. [Sales / Order Management](#3-sales--order-management)
4. [Order Status (Kanban) & Delivery](#4-order-status-kanban--delivery)
5. [Customers](#5-customers)
6. [Catalogue](#6-catalogue)
7. [Reorder Stock (Supplies)](#7-reorder-stock-supplies)
8. [Subscriptions](#8-subscriptions)
9. [Expenses](#9-expenses)
10. [Reports](#10-reports)
11. [Dashboard](#11-dashboard)
12. [System Users](#12-system-users)
13. [Settings](#13-settings)
14. [App Orders](#14-app-orders)
15. [Live Tracking](#15-live-tracking)
16. [HQ Panel (Super Admin)](#16-hq-panel-super-admin)
17. [Invoice & Tag Printing](#17-invoice--tag-printing)
18. [Multi-Outlet Architecture](#18-multi-outlet-architecture)
19. [Data Model / SQL Migrations](#19-data-model--sql-migrations)
20. [Known Limitations & Gaps](#20-known-limitations--gaps)

---

## 1. Auth & Roles

**Login.** Plain email/password form via Supabase Auth (`signInWithPassword`). No self-serve signup, no "forgot password" link, no social login. Split-screen layout — marketing copy on the left, the form on the right. Errors from Supabase surface inline.

**Role model.** Five roles exist in the system:
- **staff** / **admin** / **super_admin** — CRM users, stored as rows in `profiles`. All have `outlet_id` set except `super_admin`.
- **driver** — signs up through a separate "Rider app"; linked to a `drivers` row via join-code or manual-link flows. Not part of the CRM's own login.
- **customer** — signups from the customer-facing ordering app. Also live in `profiles` (role='customer', no outlet), explicitly excluded from System Users and instead surfaced in HQ → App Customers.

**Role gating:**
- `isSuperAdmin` = role is `super_admin`.
- `isAdmin` = role is `admin` **or** `isSuperAdmin` — a super admin automatically inherits outlet-admin rights too.
- Header chip shows "Super Admin" / "Admin" / "Staff."
- Two nav items are admin-only: **Catalogue** and **System Users**. Every other page (Dashboard, POS, Sales, Order Status, Delivery, Customers, Reorder Stock, Subscriptions, Expenses, Reports, App Orders, Live Tracking, Settings) is visible to plain staff too.
- Even if a non-admin forces their way to an admin-only view, an "Access Denied" screen renders instead — a client-side backstop on top of the real enforcement, which is database RLS.

**Hidden `#hq` route.** There is no button or link anywhere in the UI that reveals HQ exists. The app just watches the URL hash. If it's `#hq`:
- While the profile is still loading, a spinner shows instead of flashing the wrong screen.
- If the signed-in user is `super_admin`, the full-screen HQ Panel renders (replaces the entire normal app shell).
- Otherwise, the hash is silently stripped and the normal app loads — a non-super-admin who types `#hq` sees nothing, not even an error.
- Independently, every HQ-relevant database table enforces `is_super_admin()` in its Row-Level Security policy, so even a forged client request couldn't read or write HQ-only data.

**Super-admin invisibility.** Two migrations reinforce this role boundary at the database level:
- Super_admin profile *rows* are invisible via the API itself (not just hidden in the UI) to anyone except themselves or other super_admins.
- `profiles.outlet_id` is nullable; every super_admin is forced to `outlet_id = NULL, outlet = 'HQ'` — enforced by a trigger that fires automatically the moment any profile's role is set to `super_admin`, so promoting someone to super admin instantly detaches them from their store.

---

## 2. Point of Sale (POS)

The main counter screen: a product grid on the left, client details + cart on the right.

**Focus mode.** A toggle hides the sidebar and header for a distraction-free counter view. Exit via Escape, a floating "Exit focus" pill, or simply navigating away from POS.

**Outlet picker (super admin only).** A navy "Billing for outlet" dropdown must be set before the product grid populates or billing is allowed — a super admin has no home outlet, so every order needs one chosen explicitly.

**Cart mechanics:**
- Tapping a product opens a modal to pick Service type (Laundry / Ironing / Laundry & Ironing / Dry Clean / Other Services), a Normal/Express toggle, and quantity or weight.
- **Piece vs. kg pricing** — kg-priced items switch the form to a "Weight (kg)" + "No. of clothes" pair instead of a single quantity field. Weight must be a valid positive number.
- **Express multiplier** — exactly 1.6× applied to the whole line (base price + add-ons) when Express is selected.
- **Add-ons** — any other piece-priced product in the catalogue can be ticked onto the same garment (kg items and the item itself are excluded from the add-on list). Add-on prices sum into the line; the service label combines the base service + add-on names into one printed tag.
- Cart lines can be edited in place (reopens the same modal, pre-filled) or removed.
- A live "Est. line total" preview updates inside the modal as you type.

**Customer matching & suggestions:**
- Phone numbers are normalized to their last 10 digits, so `+91 87579 38961`, `08757938961`, and `8757938961` all match the same customer.
- While typing, if there's no exact match yet, up to 6 partial-match suggestions appear (matching on 4+ typed phone digits or 2+ typed name characters) in a dropdown — clicking one fills the form and resets the discount.
- A "Pick from list" button opens a full searchable customer browser (search by name, phone, or code).
- Auto-filled name/address only fill in if the field is currently blank — never overwrite what the cashier already typed.
- A matched customer shows an "Existing client · {code}" chip, plus a "Sell subscription" shortcut if they don't currently have an active plan.

**New-customer discount logic:**
- A customer counts as "new" if there's no phone match yet, and either a full 10-digit phone or a 2+ character name has been typed.
- The moment someone qualifies as new, the discount auto-sets to **25%** — capped hard at 25% for new customers (the input itself won't accept higher, and the total calculation re-enforces the cap as a second safety net).
- A green banner confirms: "New customer · 25% inaugural offer applied (max 25%)."
- Picking an existing/suggested customer immediately resets the discount to 0.

**Daily processing capacity.** The plant can process 250 garments per day. A live meter (green → amber near 85% → red over capacity) tracks how many garments are already booked for the chosen delivery date plus what's in the current cart. If the day is full, the system searches up to 60 days out for the earliest free day and offers a one-click "Use this date" button. Billing is only blocked when the day is genuinely full **and** a free day exists elsewhere — a single order too big for any one day is let through with a warning instead of blocked outright.

**Damage photo capture:**
- A free-text "Damage / notes" field.
- "Take photo" opens a live webcam capture modal (works with desktop webcams too) with capture, retake, and camera-switch controls.
- "Upload" lets you pick existing image files instead.
- Both paths stage photos locally with previews and a remove button; nothing uploads to storage until the order is actually billed.
- On delivery, the stored photos are deleted from storage and the damage note is cleared automatically (with a database-level safety net trigger as backup).

**Quick-add product (admin only).** A "+ New item" button next to search lets an admin create a brand-new catalogue product on the fly (name, per-piece/per-kg toggle, price, category), then immediately drops straight into the service-selection modal so it can be added to the current cart in one motion.

**Subscription integration — automatic bill-splitting.** If the matched customer has an active, unexpired subscription:
- Kg-priced cart lines are walked in order; each line's own effective ₹/kg rate (so Express pricing is respected) draws down the remaining subscription balance until it runs out, and any leftover kg is billed normally.
- The cart summary shows the subscription discount as its own line, and the final total is computed after that deduction, before percentage discount/tax are applied.
- A "Sell subscription" button (shown only when the matched customer has no active plan) opens a plan picker; selling one fires an automatic WhatsApp activation message with plan name, weight limit, and start/expiry dates.
- After a successful sale that drew from a subscription, the customer's `weight_used_kg` is persisted immediately.

**Checkout flow:**
- Required fields: customer name, phone, delivery date, address (super admin also needs a billing outlet chosen).
- An "Amount received" field: leave blank to record full payment; a lower amount marks the order **Partial**; zero or unset marks it **Unpaid**.
- Two commit buttons — **Pay & Bill** and **Save Unpaid** — plus a **Clear** button to empty the cart.
- On submit: the customer is matched or created, staged photos are uploaded, the order and its line items are saved together (rolling back the order if item insertion fails, so nothing is ever left half-written).
- On success, the whole form resets and an invoice pops up automatically.

---

## 3. Sales / Order Management

A searchable, paginated table of every order (Num, Date, Client, Due, Total, Status, Delivery, Method, Order Status, Actions).

- **"Edited" badge** — any order that's been edited shows an amber pill with a hover tooltip: when it was edited, by whom, how many times, and why.
- **Payment toggle** — clicking the payment badge cycles Paid ↔ Unpaid. Marking Paid sets the paid amount to the full total and stamps the exact date/time it happened; reverting to Unpaid zeroes it out and clears that timestamp.
- **Order Status dropdown** — a customer-cancelled order shows a static "Cancelled by customer" badge with no dropdown at all (terminal, can never be revived from the CRM). Every other order gets a live status dropdown using the correct vocabulary for its channel (the lowercase app-order lifecycle for app orders, the capitalized walk-in Kanban stages for everything else).
- **Delivery date column** shows the fulfilment type, the due date, and a button to open the delivery-date-change modal.
- **Invoice/Tags button** opens the invoice popup (see §17).
- **Edit button** (admin only, hidden on cancelled orders) opens the order editor.

**Edit-order flow — the "add-only" rule.** This is a deliberate, strictly enforced business rule:
- Every existing line item is locked at its original quantity/weight — it can be *increased* but never reduced below what was originally billed. A 🔒 icon replaces the delete button on original lines; they simply cannot be removed.
- New lines can be freely added and freely edited/removed, since they weren't part of the original bill.
- The discount percentage can only be **reduced**, never raised above the order's original discount — closing off a way to shrink an order via a bigger discount.
- A hard save-time guard rejects the whole edit if the new total would fall below the original total, with an explicit error message.
- Every edit is fully audited: old vs. new values are diffed and logged, along with who made the change, when, and how many times the order has been edited in total. Saving reconciles line items by updating existing rows and inserting new ones — **never** by deleting everything and reinserting, which was the source of a serious historical bug (an edit could wipe an order down to zero items if the reinsert step failed partway through). That bug is fixed and documented directly in the codebase.

**Delivery date change + WhatsApp notify.** Changing a delivery date requires picking a new date and a reason (a fixed list of common delay reasons, or free-text "Other"). After saving, the app offers to send the customer an apology message on WhatsApp with the new date and reason pre-filled — one click opens WhatsApp with the message ready to send, and marks the customer as notified once sent.

---

## 4. Order Status (Kanban) & Delivery

**Order Status:**
- A **barcode scan bar** — scan or type an order number and press Enter to advance that order exactly one stage forward in its lifecycle.
- **Two boards**: an "App orders" board (using the 8-stage app lifecycle, with a note that updates here reflect live in the customer and driver apps) appears above a "Walk-in orders" board (using the first six Kanban stages).
- Each card has its own status dropdown for direct reassignment — there's no drag-and-drop, just per-card dropdowns.

**Delivery.** Two side-by-side lists — "Pickup at store" and "Home delivery" — both showing only undelivered orders, sorted by due date (undated orders sink to the bottom). Each row shows customer, order number, due date, phone, delivery status, and (for delivery orders) the address. An "Export List" button triggers the browser's native print dialog.

---

## 5. Customers

The **Add Customer** form captures: First name (required), Last name, Phone, Address, and a **Package** label (a simple dropdown: No Package / Monthly Saver / 30kg per month / Premium Care).

The table shows Code, Name, Phone, Address, Total, Paid, Rest (outstanding), Package, and an action column. Total/Paid/Rest are computed by matching that customer's orders reliably by their internal customer link — a name-based fallback only ever applies to legacy orders that have no such link at all, never as an extra match against an order that's already correctly linked (this was fixed after a real bug where two different customers sharing the same name had their balances merged — see §20).

The only row action is a "Ledger" button, which currently does nothing when clicked (a placeholder for a future feature).

**Customers cannot be deleted.** There is no delete button anywhere on this page.

---

## 6. Catalogue

Admin-only. This is the master price list that drives POS.

**Product fields:** Name, Category (free text), Charged by (Per piece / Per kg — this single toggle controls whether POS shows a quantity field or a weight field for this product), Price, Description, an uploaded image, and a "Mark as Popular" highlight flag (feeds a "Recommended" section in the customer app).

**No hard delete.** "Archive" hides a product from POS without deleting it (past orders keep their own snapshot of the product's name and price, so archiving never affects historical invoices). Archived products only show when "Show archived" is ticked, and can be restored with one click.

---

## 7. Reorder Stock (Supplies)

Lets any outlet order chemicals and packaging supplies from a shared HQ-managed master catalogue, sent to HQ for approval and dispatch.

**Master catalogue.** A shared list of 38 items across Packaging (hangers, poly bags/rolls, butter paper, garment guards, clips, collar stays, etc.) and Chemical categories (Blankotex, Ferrol, Spotting Kit, CC-100, Extra Soft, Silk Care, Liquid Detergent, and more), each carrying a specification, a minimum order quantity, and a price set at the supplier's rate plus a 10% markup. A few items intentionally have no price yet — shown as "N/A" (amber) rather than a fake ₹0, both in the catalogue and the cart, with a clear note that HQ will confirm the cost. The estimated total only counts priced items.

**Ordering.** A simple quantity-stepper cart, a note field to HQ, and a "Send order to HQ" button. Super admins must pick which outlet the order is for before submitting.

**Workflow states:** Requested → Approved by HQ → Dispatched → Received, or Cancelled. An outlet can only cancel its own order while it's still in the Requested state — every other status change is HQ-only, and this is enforced at the database level (not just hidden in the UI), so an outlet couldn't fake-approve its own order even by calling the API directly.

---

## 8. Subscriptions

Monthly weight-based laundry plans, matching the ones advertised on the public website.

**Plan management (admin only).** Plans have a name, monthly price, weight limit in kg, and a short feature list. Plans are never hard-deleted — "Retire" hides a plan from new sales while every customer who already bought it keeps their exact original terms.

**Seeded plans** (matching the public website): Silver (₹650 / 10kg), Gold (₹1,100 / 15kg), Platinum (₹1,999 / 25kg), Elite Family Pack (₹2,999 / 40kg).

**Selling to customers.** A directory table lists every customer with their most recent subscription, its status, remaining/limit kg, and expiry date. Selling a plan snapshots its name, price, and weight limit onto that customer's subscription record, so later edits to the master plan never rewrite what a customer actually bought. A WhatsApp activation message fires automatically the moment a plan is sold.

**One active subscription per customer — enforced at the database level**, not just the UI. Trying to sell a second active plan to someone who already has one is blocked with a clear message.

**Expiry.** Every plan is valid for exactly 30 days from the date of purchase. The app treats an expired-but-not-yet-flipped subscription as effectively expired everywhere it's displayed or used for billing, so customers can't keep drawing on a plan past its real expiry date just because a background process hasn't run.

**Cancellation.** An active subscription can be cancelled outright (with a warning that any remaining balance is forfeited).

---

## 9. Expenses

Tracks the outlet's non-supply running costs: Rent, Salary, Utilities, Maintenance, and General. (Chemical and packaging purchases now go entirely through Reorder Stock — Expenses is deliberately scoped to everything else.)

Each entry has a title, category, date, and amount, and feeds directly into every profit calculation in the app: the Dashboard's Net Profit tile and Income-vs-Expense chart, the Reports page's totals and chart, the Custom Report export, and HQ's per-outlet Net Profit figure.

**Expenses cannot be deleted** once added. There is no delete button anywhere on this page.

---

## 10. Reports

**Stat tiles:** Total Sales (current year), Total Expenses, and total Customers on file.

**Sales & Expenses chart.** A Monthly/Yearly toggle over an area chart — "Yearly" plots all 12 months of the current year; "Monthly" narrows the same data down to just the current calendar month.

**Top Services.** A donut chart of the 10 most-ordered services by quantity, across all orders ever recorded.

**Custom Report — the headline feature.** Pick any date range with two date pickers (defaulting to the last 30 days), and see live totals update as you adjust the range: order count, total sales, total expenses, and net profit. Then download either:

- **Download PDF** — a fully formatted, professional report opened through the browser's print dialog (so you choose "Save as PDF" or print directly): store branding, the date range and a generation timestamp, four summary stat cards, a per-outlet breakdown table (super admin only), a complete itemized sales table (date, order #, outlet if applicable, customer, item count, payment status/method, total, amount collected, and — now — exactly when it was marked paid and when it was marked delivered), and a complete itemized expenses table.
- **Download Excel** — a CSV file (opens natively in Excel) with the same Summary, By-Outlet, Sales, and Expenses sections stacked as labeled blocks in one continuous sheet, correctly encoded so ₹ symbols display properly instead of garbled characters.

Both exports are built from the exact same underlying data, so the PDF and CSV numbers can never drift apart from each other.

---

## 11. Dashboard

**Period toggle (Daily / Monthly / Yearly)** drives a year-on-year comparison hero card: the current period's collected revenue and order count, side-by-side with the exact same period one year earlier, plus a percentage-change badge and a plain-English sentence ("You're ₹X ahead of / behind last year").

**Six stat tiles:**
1. **Order Worth** for the selected period — gross total, split into paid vs. outstanding.
2. **Total Sales (Paid)** — all-time, with a month-over-month trend indicator.
3. **Net Profit** for the selected period — income minus expenses, colored green or amber depending on sign.
4. **Today's Orders** — count and today's collected total.
5. **Outstanding** — total unpaid balance across every order, with a count of how many invoices have a balance.
6. **Customers** — total on file.

**Income vs. Expense chart.** A grouped bar chart across the current year, teal for income and amber for expenses, independent of the period toggle above it.

**Sales overview chart.** This one *does* follow the period toggle — a 14-day daily view when "Daily" is selected, otherwise the same 12-month view, with the current period's bar highlighted.

**Recent Transactions.** The last 6 orders in a compact table with a "View all" link into Sales.

**Payment channels.** A breakdown of collected revenue by payment method (UPI, Cash, Card, Cheque) as horizontal bars, plus a running total.

---

## 12. System Users

**Adding a new staff or admin login** creates a genuine Supabase Auth account — this isn't a stub, it's a real, working signup that gives someone actual login credentials. It's done through a throwaway, non-persistent auth client so creating a new login never disturbs the admin's own logged-in session. Role and outlet are set in a separate, permission-checked step right after signup — specifically so a newly created account can never grant itself extra privileges.

**Roles offered here:** Staff or Admin only. Super Admin accounts cannot be created through this screen.

**Outlet assignment.** Super admins see a required Outlet dropdown when adding a user, since they have no home outlet of their own to default new hires into. A regular admin's new hire is automatically assigned to that admin's own outlet, with no picker needed.

**Listing.** Shows Name, Email, Role, and Outlet for every staff/admin account — super_admin and customer-role accounts are filtered out entirely, both here and at the database level.

---

## 13. Settings

Two sections:

1. **Account** — edit your display name, view your email (read-only), and optionally set a new password.
2. **Outlet Hours** (hidden for super admins, who have no outlet of their own) — set your outlet's opening and closing time, which feeds the "Open now / Closed" indicator in the customer-facing app.

---

## 14. App Orders

Manages orders placed through the customer-facing app, separate from walk-in counter orders, with a full 9-stage lifecycle (from initial pickup request through to delivered).

**Live updates.** The page subscribes to real-time database changes, so new app orders and status changes from drivers/customers appear automatically without a manual refresh — a "Live" indicator confirms the connection, with a manual refresh button available too.

**Weigh-in step.** Before an app order can be marked "At outlet," staff must record the actual weight of each kg-priced item (pre-filled with the customer's own estimate). A live preview shows the recalculated total as weights are entered, with a warning if a discount would end up exceeding the new total.

**Driver assignment.** Pickup and delivery legs are each assigned to a driver from a simple picker (showing which drivers are currently busy), or a new driver can be added inline on the spot. Assignment logic is safe against duplicates — reassigning never creates a second task for the same job.

**Manual stage progression.** Once past the pickup-assignment step, staff can manually advance an order through the in-plant stages (picked up → at outlet → washing → ready → out for delivery → delivered) directly from a dropdown.

Cancelled and delivered orders are terminal — no further changes possible from the CRM.

---

## 15. Live Tracking

Driver fleet management for the outlet.

**Driver roster** shows every driver's status (Available / On task / Off duty), phone number, and their current task if any.

**Driver onboarding via join code.** The outlet gets a unique, copyable code to give new drivers, who enter it when signing up in the separate Rider app. New driver signups appear in a pending-approval queue; approving one instantly creates their driver profile and links their login — no manual data entry needed.

**Manual driver management.** Drivers can also be added by hand (name + optional phone, no login required) for cases where the app-based flow isn't used, with a fallback flow to manually link an existing unlinked driver-app account if needed.

---

## 16. HQ Panel (Super Admin)

The corporate command center — full-screen, distinct navy design, reached only via the hidden `#hq` route.

**Network overview** — the default view: total outlets, total collected revenue, total outstanding, and total orders across the entire company, a bar chart comparing collected revenue by outlet, and a full outlet table (today's orders, total orders, collected, outstanding, customers, staff) that drills into any outlet by clicking its row.

**New outlet creation.** A short code, name, phone, and address — that's it. Duplicate codes are caught and reported clearly.

**Outlet deactivation (not deletion).** Outlets are never hard-deleted, by design: too much real business history (orders, customers, staff, expenses, supply orders) references an outlet for a delete to ever be safe. Instead, "Deactivate outlet" flips a flag that immediately removes it from every "billing for outlet" picker across the entire app (POS, Reorder Stock, Subscriptions, Add User), while every historical order, customer record, and staff assignment tied to it stays completely intact and fully viewable in the drill-down. It can be reactivated at any time with one click.

**Outlet drill-down.** Revenue, expenses, net profit, and outstanding balance; order count and average ticket size; a 6-month revenue trend chart; a payment-method breakdown; top services by volume; the 12 most recent orders; and a full staff roster for that outlet.

**Supply orders from outlets.** A live feed of every outlet's stock reorder requests, expandable to show line items, with a status dropdown to move each one through Approved → Dispatched → Received (or leave it cancelled), plus a badge counting how many are still awaiting approval.

**App Customers.** Every customer who signed up through the ordering app, with their total order count, lifetime spend, and last order date — expandable to see their individual order history.

**Offers & Banners.** Promotional banners for the customer app, each with an image, a short description, and a genuinely working coupon code (flat ₹ or percentage discount, with optional maximum discount and minimum order thresholds). This is one of the only places in the entire app where hard deletion is actually offered — deleting an offer is permanent and explicitly warns as much.

---

## 17. Invoice & Tag Printing

A single popup with two tabs: **Invoice** and **Tags**.

**Invoice.** Store branding, invoice number and date, full customer details, pickup/delivery type, an itemized table of everything ordered, and — when relevant — a dedicated green subscription panel showing exactly what plan the order was billed against, how much of it this order used, the plan's total limit, and the customer's **live, current** remaining balance (not a frozen number from when the order was placed, so it's always accurate even if they've used more of the plan since). Below that: payment status and method, any subscription/percentage discount and tax applied, the total, amount paid, remaining balance, and the customer's outstanding balance from all their *other* orders. Any prior damage notes and photos are shown too, followed by delivery details, a scannable barcode, and a thank-you note.

**Garment tags.** One physical sticker is printed **per individual garment**, not per line item — a 5-piece order prints 5 separate tags, and a bag weighed as a single kg-line still prints one tag per garment inside it, each carrying the bag's total weight so every sticker is self-describing on its own. Two print formats are available: a narrow thermal sticker-roll format, or a standard A4 sheet laid out two tags per row.

**WhatsApp messaging.** One click sends the customer a complete, formatted order summary via WhatsApp — itemized breakdown, totals, any subscription discount and remaining balance, payment status, and pickup/delivery instructions — pre-filled and ready to send.

**How printing actually works.** Both invoices and reports use the browser's own native print dialog (opened in a small popup window) rather than generating a PDF file server-side — so "Print" or "Download PDF" both mean "use your browser's Save-as-PDF option." If your browser blocks the popup, you'll need to allow pop-ups for the site.

---

## 18. Multi-Outlet Architecture

Every table that belongs to a specific store — orders, customers, products, expenses, staff accounts, subscriptions, supply orders, delivery tasks, drivers — is scoped to that outlet at the database level, not just filtered in the app. A handful of tables are deliberately shared across every outlet instead: subscription plans, the supply-item master catalogue, and promotional offers, since those are HQ-managed and meant to be identical everywhere.

This scoping is enforced by Row-Level Security policies baked into the database itself: a regular staff or admin account can only ever see and write rows belonging to their own outlet, while a super admin's identical requests transparently return **everything**, company-wide — with no special-case code needed anywhere in the app to make that happen.

Because a super admin has no outlet of their own, every screen where they'd normally act on behalf of "their" outlet instead makes them choose one explicitly first — this is why the outlet picker shows up in POS, Reorder Stock, Subscriptions, and Add User, but only for super admins.

---

## 19. Data Model / SQL Migrations

The `supabase/` folder holds incremental, hand-run migration scripts layered on a base schema that isn't included in this snapshot (core tables like `profiles`, `outlets`, `orders`, and the key permission-checking functions are defined elsewhere and simply assumed to exist).

| File | What it does |
|---|---|
| `subscriptions.sql` | Creates the subscription plans and customer-subscriptions tables, the one-active-plan-per-customer rule, and seeds the four published plans. |
| `supply_orders.sql` | Creates the supply-item master catalogue and the outlet-to-HQ ordering workflow tables, seeds the 38-item catalogue. |
| `super_admin_no_outlet.sql` | Detaches every super admin from having a home outlet, permanently and automatically. |
| `hide_super_admin.sql` | Makes super-admin accounts invisible to everyone except themselves and other super admins, enforced at the database level. |
| `order_action_timestamps.sql` | Adds the columns that record exactly when an order was marked delivered and exactly when it was marked paid. |
| `delivered_status_case_insensitive.sql` | Fixes a bug where automatic cleanup (clearing damage photos/notes on delivery) only worked for walk-in orders and silently skipped app orders due to a capitalization mismatch. |
| `find_orphaned_orders.sql` | A diagnostic script to find and manually clean up any historical orders that lost their line items due to a now-fixed editing bug. |
| `seed_catalogue_full.sql` | Loads a complete printed price list for one specific outlet. |
| `order_edits_and_audit.sql` | Currently empty — the audit-trail table it should define lives outside this folder. |

---

## 20. Known Limitations & Gaps

Documented honestly, so nothing here is a surprise later:

- **No edit or delete for existing staff/admin accounts.** Once a login is created in System Users, there's currently no way to change their role, reassign their outlet, or remove them from the app itself — that requires going directly into the database.
- **The "Ledger" button on the Customers page does nothing yet** — it's a placeholder for a feature that hasn't been built.
- **The Customers page's "Package" field is disconnected from the real Subscriptions system.** It looks like an earlier, simpler idea that was superseded by the full subscription feature but never removed — nothing reads this field for actual billing.
- **Dashboard's "Payment channels" card is labeled "This month" but actually shows all-time totals** — the label doesn't match what's displayed.
- **Two bugs are fixed and specifically worth knowing about, since they affected real invoices before the fix:** two different customers who happened to share the exact same name could have their order totals and outstanding balances merged together on invoices (now fixed — matching is done by the customer's actual record, not their name); and an earlier version of the order-editing feature could, in rare failure cases, wipe an order down to zero items (now fixed — edits update items in place instead of deleting and reinserting them).
- **The Reports page's "Monthly" toggle only ever shows the current calendar month**, not a scrollable or selectable month-by-month history — for a real date-range view, use the Custom Report section instead.
- **"Download Excel" produces a CSV file, not a true multi-sheet `.xlsx` workbook.** It opens perfectly in Excel, but it's one continuous sheet with labeled sections rather than separate tabs.
- **"Download PDF" and invoice printing both work through your browser's print dialog**, not a dedicated PDF generator — reliable, but it does mean pop-ups must be allowed for the site.
- **Outlets can be created and deactivated, but not edited** — there's currently no way to change an existing outlet's name, code, address, or phone number after it's created (only its opening/closing hours can be edited afterward, from Settings).
- **The full underlying database schema isn't version-controlled in this project** — the SQL files here are incremental patches on top of a foundation that was set up directly in the Supabase dashboard and isn't captured as code anywhere.

---

*This document reflects the state of the codebase as of the most recent full audit. Features are added and refined continuously — treat this as a snapshot, not a permanently fixed specification.*

import { supabase } from "./supabase";
import { collected } from "../theme";

/* ------------------------------------------------------------------ */
/*  Read helpers                                                       */
/* ------------------------------------------------------------------ */
export async function fetchProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data;
}

export async function fetchAllProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("name");
  if (error) throw error;
  return data;
}

export async function fetchCustomers() {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("order_no", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchExpenses() {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("spent_on", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/* Customer-paid totals are derived from orders, not stored, so they
   always reconcile with real invoices. */
export function rollupCustomer(cust, orders) {
  const mine = orders.filter(
    (o) => o.customer_id === cust.id || o.customer_name === `${cust.first_name} ${cust.last_name}`.trim()
  );
  const total = mine.reduce((a, o) => a + Number(o.total), 0);
  const paid = mine.reduce((a, o) => a + collected(o), 0);
  return { total, paid, rest: total - paid };
}

/* ------------------------------------------------------------------ */
/*  Mutations                                                          */
/* ------------------------------------------------------------------ */
// The ONLY columns that exist on order_items. Any other key (UI flags
// like `key`, `original`, `addons`, the row `id`, `created_at`, …) must
// be dropped before insert/update or PostgREST rejects the whole batch
// with "Could not find the 'X' column in the schema cache".
const ORDER_ITEM_COLS = [
  "product_name", "service_type", "express", "qty",
  "weight_kg", "unit", "unit_price", "line_total",
];
function sanitizeOrderItem(it, orderId) {
  const row = { order_id: orderId };
  for (const c of ORDER_ITEM_COLS) {
    if (it[c] !== undefined) row[c] = it[c];
  }
  return row;
}

export async function createOrder({ order, items }) {
  const { data: created, error } = await supabase
    .from("orders")
    .insert(order)
    .select()
    .single();
  if (error) throw error;

  if (items?.length) {
    const rows = items.map((i) => sanitizeOrderItem(i, created.id));
    const { error: e2 } = await supabase.from("order_items").insert(rows);
    if (e2) {
      // Roll back the order so we don't leave an orphan visible in Sales.
      await supabase.from("orders").delete().eq("id", created.id);
      throw e2;
    }
  }
  return created;
}

export async function updateOrderStatus(id, order_status) {
  const { error } = await supabase
    .from("orders")
    .update({ order_status })
    .eq("id", id);
  if (error) throw error;
}

export async function updateOrderFields(id, fields) {
  const { error } = await supabase.from("orders").update(fields).eq("id", id);
  if (error) throw error;
}

// All line items for ONE order, with the fields the weigh-in modal needs.
export async function fetchItemsForOrder(orderId) {
  const { data, error } = await supabase
    .from("order_items")
    .select("id, product_name, unit, express, qty, weight_kg, est_weight_kg, unit_price, line_total")
    .eq("order_id", orderId)
    .order("id");
  if (error) throw error;
  return data;
}

// Weigh-in at the outlet: submit actual kg for each kg item. The RPC
// recomputes each line + the order subtotal/total (re-applying any coin/
// coupon discount), stamps weighed_at, and notifies the customer.
// items = [{ id, weight_kg }]
export async function applyActualWeights(orderId, items) {
  const { data, error } = await supabase.rpc("apply_actual_weights", {
    p_order_id: orderId,
    p_items: items,
  });
  if (error) throw error;
  if (data && data.success === false) throw new Error(data.error || "Could not save weights");
  return data;
}

/* ------------------------------------------------------------------ */
/*  Order editing + audit                                              */
/* ------------------------------------------------------------------ */

// Build a [{field, from, to}] diff of two flat objects, for the audit log.
export function diffFields(before, after, labels = {}) {
  const out = [];
  Object.keys(after).forEach((k) => {
    const a = before?.[k];
    const b = after[k];
    if (String(a ?? "") !== String(b ?? "")) {
      out.push({ field: labels[k] || k, from: a ?? null, to: b ?? null });
    }
  });
  return out;
}

// Write one audit row. `editor` = { id, name }.
// Best-effort: if the audit insert fails (e.g. RLS, or the order_edits
// table/migration isn't present), we DON'T blow up the core action that
// already succeeded. We log a console warning instead.
export async function logOrderEdit({ order_id, editor, kind = "edit", changes = [], note = null }) {
  try {
    const { error } = await supabase.from("order_edits").insert({
      order_id,
      edited_by: editor?.id || null,
      editor_name: editor?.name || null,
      kind,
      changes,
      note,
    });
    if (error) console.warn("order_edits log skipped:", error.message);
  } catch (e) {
    console.warn("order_edits log skipped:", e?.message || e);
  }
}

// Fetch the edit history for one order (newest first).
export async function fetchOrderEdits(orderId) {
  const { data, error } = await supabase
    .from("order_edits")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Full edit of an existing sale: replace fields + (optionally) line items,
// stamp the audit columns, and write an order_edits row. `editor`={id,name}.
export async function updateOrderFull({ id, before, fields, items, editor }) {
  const changes = diffFields(before, fields, ORDER_FIELD_LABELS);

  const stamped = {
    ...fields,
    edited_at: new Date().toISOString(),
    edited_by: editor?.id || null,
    edited_by_name: editor?.name || null,
    edit_count: (Number(before?.edit_count) || 0) + 1,
  };
  const { error } = await supabase.from("orders").update(stamped).eq("id", id);
  if (error) throw error;

  // Reconcile line items if a new set was supplied. We UPDATE existing
  // rows in place and INSERT only genuinely new ones — no delete-then-
  // insert, so a failure can never wipe an order down to zero items.
  if (Array.isArray(items)) {
    const existing = items.filter((i) => i.id);          // had a real DB id
    const fresh = items.filter((i) => !i.id);            // added this edit
    const keepIds = existing.map((i) => i.id);

    // 1) Delete any original rows the editor removed (kept set excludes them).
    let del = supabase.from("order_items").delete().eq("order_id", id);
    if (keepIds.length) del = del.not("id", "in", `(${keepIds.join(",")})`);
    const { error: delErr } = await del;
    if (delErr) throw delErr;

    // 2) Update each surviving original row (qty / price may have changed).
    for (const it of existing) {
      const row = sanitizeOrderItem(it, id);
      const { error: upErr } = await supabase.from("order_items").update(row).eq("id", it.id);
      if (upErr) throw upErr;
    }

    // 3) Insert the brand-new rows.
    if (fresh.length) {
      const rows = fresh.map((i) => sanitizeOrderItem(i, id));
      const { error: insErr } = await supabase.from("order_items").insert(rows);
      if (insErr) throw insErr;
    }

    changes.push({ field: "items", from: "(previous)", to: `${items.length} item(s)` });
  }

  await logOrderEdit({ order_id: id, editor, kind: "edit", changes });
}

// Change just the delivery date, with a reason — logged separately.
export async function changeDeliveryDate({ id, before, due_date, reason, editor }) {
  const stamped = {
    due_date,
    delivery_changed_at: new Date().toISOString(),
    delivery_change_reason: reason || null,
    edited_at: new Date().toISOString(),
    edited_by: editor?.id || null,
    edited_by_name: editor?.name || null,
    edit_count: (Number(before?.edit_count) || 0) + 1,
  };
  const { error } = await supabase.from("orders").update(stamped).eq("id", id);
  if (error) throw error;
  await logOrderEdit({
    order_id: id,
    editor,
    kind: "delivery_date",
    changes: [{ field: "Delivery date", from: before?.due_date || null, to: due_date }],
    note: reason || null,
  });
}

// Mark that a delay notice was sent to the customer.
export async function markDelayNotified(id) {
  const { error } = await supabase
    .from("orders")
    .update({ delay_notified_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteOrder({ id, editor }) {
  // Log first (the cascade delete would otherwise remove the order_edits
  // row too), into a non-cascading note is impossible — so we just delete.
  // order_items cascade-delete via FK.
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) throw error;
}

const ORDER_FIELD_LABELS = {
  customer_name: "Customer", phone: "Phone", address: "Address",
  fulfilment: "Fulfilment", due_date: "Delivery date",
  subtotal: "Subtotal", discount_pct: "Discount %", tax_pct: "Tax %",
  total: "Total", amount_paid: "Amount paid",
  payment_method: "Payment method", payment_status: "Payment status",
  order_status: "Order status", notes: "Notes",
};

export async function createCustomer(c) {
  const { data, error } = await supabase
    .from("customers")
    .insert(c)
    .select()
    .single();
  if (!error) return data;
  // 23505 = unique_violation on (outlet_id, phone_norm). Someone (or
  // another tab / a stale customers list) already created this person —
  // fetch them and return so the POS upsert flow keeps moving.
  if (error.code === "23505" && c.phone) {
    const phoneNorm = String(c.phone).replace(/\D/g, "").slice(-10);
    if (phoneNorm.length === 10) {
      const { data: existing } = await supabase
        .from("customers")
        .select("*")
        .eq("phone_norm", phoneNorm)
        .limit(1)
        .maybeSingle();
      if (existing) return existing;
    }
  }
  throw error;
}

export async function deleteCustomer(id) {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
}

export async function createExpense(e) {
  const { data, error } = await supabase
    .from("expenses")
    .insert(e)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteExpense(id) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}

export async function createProduct(p) {
  const { data, error } = await supabase
    .from("products")
    .insert(p)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProduct(id, fields) {
  const { error } = await supabase
    .from("products")
    .update(fields)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteProduct(id) {
  const { error } = await supabase
    .from("products")
    .update({ active: false })
    .eq("id", id);
  if (error) throw error;
}

export async function fetchOrderItems() {
  const { data, error } = await supabase
    .from("order_items")
    .select("product_name, qty");
  if (error) throw error;
  return data;
}

// HQ: every line item with its parent order_id, so we can attribute
// services to outlets (via orders.outlet_id). Super_admin gets all rows.
export async function fetchAllOrderItems() {
  const { data, error } = await supabase
    .from("order_items")
    .select("order_id, product_name, service_type, qty, weight_kg, unit, line_total");
  if (error) throw error;
  return data;
}

export async function fetchOrderItemsForOrder(orderId) {
  const { data, error } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("id");
  if (error) throw error;
  return data;
}

// Upload a File to the order-photos bucket and return its public URL.
export async function uploadOrderPhoto(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("order-photos")
    .upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("order-photos").getPublicUrl(path);
  return data.publicUrl;
}

// Upload a service/product image to the public service-images bucket and
// return its public URL (stored on products.image_url). Powers the
// customer app's service cards / detail page / recommended row.
export async function uploadServiceImage(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("service-images")
    .upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("service-images").getPublicUrl(path);
  return data.publicUrl;
}

// Permanently delete the listed photos from the order-photos bucket.
// Accepts the public URLs we store in `orders.image_urls`.
export async function deleteOrderPhotos(urls) {
  if (!Array.isArray(urls) || !urls.length) return;
  const marker = "/order-photos/";
  const paths = urls
    .map((u) => {
      const i = String(u || "").indexOf(marker);
      return i >= 0 ? u.slice(i + marker.length) : null;
    })
    .filter(Boolean);
  if (!paths.length) return;
  const { error } = await supabase.storage.from("order-photos").remove(paths);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/*  HQ / multi-outlet (super_admin only — RLS enforces this)           */
/* ------------------------------------------------------------------ */
export async function fetchOutlets() {
  const { data, error } = await supabase
    .from("outlets")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createOutlet({ code, name, address, phone }) {
  const { data, error } = await supabase
    .from("outlets")
    .insert({ code, name, address, phone })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateOutlet(id, fields) {
  const { error } = await supabase.from("outlets").update(fields).eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/*  Supply / stock ordering (outlet → HQ)                              */
/* ------------------------------------------------------------------ */

// The global master supply catalogue (chemicals + packaging).
export async function fetchSupplyItems() {
  const { data, error } = await supabase
    .from("supply_items")
    .select("*")
    .eq("active", true)
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data;
}

// Supply orders. RLS scopes: outlet sees its own, super_admin sees all.
export async function fetchSupplyOrders() {
  const { data, error } = await supabase
    .from("supply_orders")
    .select("*, outlet:outlets(name, code)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchSupplyOrderItems(orderId) {
  const { data, error } = await supabase
    .from("supply_order_items")
    .select("*")
    .eq("supply_order_id", orderId);
  if (error) throw error;
  return data;
}

// Raise a new supply order for the caller's outlet. `outletId` is only
// needed for a super_admin (who has no home outlet).
export async function createSupplyOrder({ items, note, requester, outletId }) {
  const total = items.reduce((a, i) => a + Number(i.line_total || 0), 0);
  const order = { requester: requester || null, note: note || null, total };
  if (outletId) order.outlet_id = outletId;   // super_admin path
  const { data: created, error } = await supabase
    .from("supply_orders").insert(order).select().single();
  if (error) throw error;

  const rows = items.map((i) => ({
    supply_order_id: created.id,
    item_name: i.item_name,
    category: i.category || null,
    unit: i.unit || null,
    qty: Number(i.qty) || 0,
    unit_price: Number(i.unit_price) || 0,
    line_total: Number(i.line_total) || 0,
  }));
  const { error: e2 } = await supabase.from("supply_order_items").insert(rows);
  if (e2) {
    await supabase.from("supply_orders").delete().eq("id", created.id);
    throw e2;
  }
  return created;
}

// HQ moves the order through the workflow (or an outlet cancels its own).
export async function updateSupplyOrderStatus(id, status, hq_note) {
  const patch = { status };
  if (hq_note !== undefined) patch.hq_note = hq_note;
  const { error } = await supabase.from("supply_orders").update(patch).eq("id", id);
  if (error) throw error;
}

// A super_admin's normal fetchOrders/fetchCustomers/fetchExpenses/
// fetchProfiles already return EVERY outlet's rows (RLS grants the
// bypass), so HQ reuses those — no separate "all outlets" query needed.

/* ------------------------------------------------------------------ */
/*  App channel — customer-app orders, drivers, tasks (Step 0)         */
/* ------------------------------------------------------------------ */

// App-placed orders (channel='app'). RLS already scopes to the outlet.
export async function fetchAppOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("channel", "app")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Live subscription to app orders for this outlet. Returns the channel so
// the caller can unsubscribe on unmount. `onChange` fires on any insert/
// update/delete to an `orders` row — the caller re-fetches to stay simple
// (RLS guarantees we only ever receive our own outlet's rows).
export function subscribeAppOrders(onChange) {
  const channel = supabase
    .channel("app-orders")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      (payload) => onChange(payload)
    )
    .subscribe();
  return channel;
}

export function unsubscribe(channel) {
  if (channel) supabase.removeChannel(channel);
}

export async function fetchDrivers() {
  const { data, error } = await supabase
    .from("drivers")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

// Driver-role accounts (people who signed up in the driver app). Used by
// the legacy "Link driver app" modal. RLS lets a super_admin/admin read
// profiles; we filter to role='driver'.
export async function fetchDriverAccounts() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email")
    .eq("role", "driver")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Driver signups awaiting approval AT THIS OUTLET (scoped server-side by
// the driver's chosen outlet code → requested_outlet_id; migration 0018).
// Excludes anyone already linked to a drivers row. Legacy no-code signups
// surface to every outlet as a fallback.
export async function fetchPendingDriverAccounts() {
  const { data, error } = await supabase.rpc("pending_driver_accounts");
  if (error) throw error;
  return data ?? [];
}

// The caller's own outlet (code + name) — for showing staff the join code
// to share with new drivers. (migration 0018)
export async function fetchMyOutlet() {
  const { data, error } = await supabase.rpc("my_outlet");
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}

// Link a drivers row to a driver-app auth account. Uses the
// link_driver_account RPC (migration 0016) which sets drivers.user_id AND
// backfills the driver's name/phone from their signup profile (only filling
// blanks), so the driver app — which reads the drivers row — shows their
// real details.
export async function linkDriverAccount(driverId, userId) {
  const { error } = await supabase.rpc("link_driver_account", {
    p_driver_id: driverId,
    p_user_id: userId,
  });
  if (error) throw error;
}

export async function createDriver({ name, phone }) {
  const { data, error } = await supabase
    .from("drivers")
    .insert({ name, phone })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Approve a driver-app signup in one click: creates a drivers row for this
// outlet, copies the signup name/phone, and links it to the auth account
// (RPC approve_driver_account, migration 0017). Idempotent. Returns the
// drivers.id.
export async function approveDriverAccount(userId) {
  const { data, error } = await supabase.rpc("approve_driver_account", {
    p_user_id: userId,
  });
  if (error) throw error;
  return data;
}

// Tasks for the outlet, newest first, with the linked order's basics so
// Live Tracking can show "Driver → order #" without a second query.
export async function fetchTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*, order:orders(order_no, customer_name, address, order_status)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Manager assigns a driver to an app order (manual assignment — the
// launch model). Writes a tasks row. For a PICKUP we nudge the order into
// pickup_assigned so the apps reflect it; for a DELIVERY we leave the
// status alone (it's 'ready' — the driver advances it to out_for_delivery
// when they collect from the outlet). outlet_id is stamped by the column
// DEFAULT (current_outlet_id()), so we don't send it.
export async function assignDriver({ order_id, driver_id, type = "pickup" }) {
  // Idempotent: if an OPEN task of this type already exists for this order,
  // don't create a duplicate (prevents flooding the driver with repeated
  // assignments + duplicate notifications when "Assign" is clicked twice).
  const { data: existing } = await supabase
    .from("tasks")
    .select("id, driver_id")
    .eq("order_id", order_id)
    .eq("type", type)
    .not("status", "in", "(done,cancelled)")
    .limit(1);

  let task = existing?.[0] ?? null;
  if (task) {
    // Already assigned. Allow re-pointing it to a different driver, but
    // never create a second row.
    if (driver_id && task.driver_id !== driver_id) {
      await supabase.from("tasks").update({ driver_id }).eq("id", task.id);
    }
  } else {
    const { data: created, error } = await supabase
      .from("tasks")
      .insert({ order_id, driver_id, type })
      .select()
      .single();
    if (error) throw error;
    task = created;
  }

  // Best-effort status bump (pickup only) + driver flag.
  if (type === "pickup") {
    await supabase.from("orders").update({ order_status: "pickup_assigned" }).eq("id", order_id);
  }
  if (driver_id) await supabase.from("drivers").update({ status: "on_task" }).eq("id", driver_id);
  return task;
}

export async function updateTaskStatus(id, status) {
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/*  Offers / promo banners (HQ-managed, global — super_admin only)      */
/* ------------------------------------------------------------------ */

// Upload a banner image to the public offer-banners bucket, return its URL.
export async function uploadOfferBanner(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("offer-banners")
    .upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("offer-banners").getPublicUrl(path);
  return data.publicUrl;
}

export async function fetchOffers() {
  const { data, error } = await supabase
    .from("offers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Create an offer. Expects all fields (the HQ form makes them mandatory):
// { image_url, description, coupon_code, discount_type, discount_value,
//   max_discount, min_order, is_active }
export async function createOffer(offer) {
  const { data, error } = await supabase
    .from("offers")
    .insert({ ...offer, coupon_code: String(offer.coupon_code || "").trim().toUpperCase() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateOffer(id, patch) {
  const next = { ...patch };
  if (next.coupon_code != null) next.coupon_code = String(next.coupon_code).trim().toUpperCase();
  const { data, error } = await supabase
    .from("offers")
    .update(next)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteOffer(id) {
  const { error } = await supabase.from("offers").delete().eq("id", id);
  if (error) throw error;
}

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
export async function createOrder({ order, items }) {
  const { data: created, error } = await supabase
    .from("orders")
    .insert(order)
    .select()
    .single();
  if (error) throw error;

  if (items?.length) {
    // Strip undefined fields so installs without the latest migration
    // (i.e. without `unit` / `weight_kg`) don't get tripped by the
    // PostgREST schema cache. Keys present but null/0 are kept.
    const rows = items.map((i) => {
      const row = { ...i, order_id: created.id };
      Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
      return row;
    });
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

// Driver-role accounts (people who signed up in the driver app). Used to
// link a driver login to a `drivers` row. RLS lets a super_admin/admin
// read profiles; we filter to role='driver'.
export async function fetchDriverAccounts() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email")
    .eq("role", "driver")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Link a drivers row to a driver-app auth account (sets drivers.user_id).
export async function linkDriverAccount(driverId, userId) {
  const { error } = await supabase
    .from("drivers")
    .update({ user_id: userId })
    .eq("id", driverId);
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
// launch model). Writes a tasks row and nudges the order into the
// pickup_assigned state so the app/CRM reflect it. outlet_id is stamped
// by the column DEFAULT (current_outlet_id()), so we don't send it.
export async function assignDriver({ order_id, driver_id, type = "pickup" }) {
  const { data: task, error } = await supabase
    .from("tasks")
    .insert({ order_id, driver_id, type })
    .select()
    .single();
  if (error) throw error;
  // Best-effort status bump + driver flag; don't fail the assignment if
  // these secondary updates hiccup.
  await supabase.from("orders").update({ order_status: "pickup_assigned" }).eq("id", order_id);
  if (driver_id) await supabase.from("drivers").update({ status: "on_task" }).eq("id", driver_id);
  return task;
}

export async function updateTaskStatus(id, status) {
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) throw error;
}

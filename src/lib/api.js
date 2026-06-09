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

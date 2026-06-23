import React, { useState, useEffect } from "react";
import { Printer, FileText, Pencil, Trash2, CalendarClock, History, X, MessageCircle } from "lucide-react";
import { C, KANBAN, APP_LIFECYCLE, APP_LIFECYCLE_LABEL, PAYMENT_METHODS, DELAY_REASONS, STORE, inr, balanceDue } from "../theme";
import { PageHead, Btn, Badge, DataTable, Modal, td, iconBtn, field, fieldLabel } from "../components/ui";
import * as api from "../lib/api";

const fmt = (s) => s ? new Date(s).toLocaleDateString("en-GB") : "—";
const fmtDateTime = (s) => s ? new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function Sales({
  orders, loading, products = [], isAdmin,
  onStatus, onTogglePaid, onOpenInvoice,
  onEditOrder, onDeleteOrder, onChangeDeliveryDate, onMarkDelayNotified, onQuickAddProduct,
}) {
  const [editOrder, setEditOrder] = useState(null);     // full edit
  const [dateOrder, setDateOrder] = useState(null);     // delivery-date change

  return (
    <div>
      <PageHead title="Sales" sub={`${orders.length} invoices · all channels`}>
        <Btn variant="outline" icon={Printer} small onClick={() => window.print()}>Print</Btn>
      </PageHead>
      <DataTable
        loading={loading}
        columns={["Num", "Date", "Client", "Due", "Total", "Status", "Delivery", "Method", "Order Status", ""]}
        data={orders}
        searchKeys={["customer_name", "order_no", "payment_method", "phone"]}
        placeholder="Search by client / num / phone…"
        renderRow={(o) => (
          <tr key={o.id}>
            <td style={{ ...td, fontWeight: 800, color: C.navy }}>
              #{o.order_no}
              {o.edited_at && (
                <span title={editTitle(o)} className="inline-flex items-center gap-1"
                  style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: C.amber, background: C.amberLt, padding: "2px 6px", borderRadius: 99, cursor: "help", verticalAlign: "middle" }}>
                  <History size={9} /> Edited
                </span>
              )}
            </td>
            <td style={{ ...td, color: C.textMute }}>{new Date(o.created_at).toLocaleDateString("en-GB")}</td>
            <td style={td}>
              <div style={{ fontWeight: 600 }}>{o.customer_name}</div>
              {o.phone && <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>{o.phone}</div>}
            </td>
            <td style={td}>
              <Badge tone={o.fulfilment === "delivery" ? "info" : "muted"}>
                {o.fulfilment === "delivery" ? "Delivery" : "Pickup"}
              </Badge>
              <div className="flex items-center gap-1" style={{ fontSize: 11.5, color: C.textMute, marginTop: 4 }}>
                {o.due_date ? new Date(o.due_date).toLocaleDateString("en-GB") : "—"}
                <button onClick={() => setDateOrder(o)} title="Change delivery date"
                  style={{ border: "none", background: "transparent", cursor: "pointer", color: C.tealDark, padding: 0, display: "inline-flex" }}>
                  <CalendarClock size={13} />
                </button>
              </div>
            </td>
            <td style={{ ...td, fontWeight: 800 }}>{inr(o.total)}</td>
            <td style={td}>
              <button onClick={() => onTogglePaid(o)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
                <Badge tone={o.payment_status === "Paid" ? "success" : o.payment_status === "Partial" ? "warn" : "danger"}>
                  {o.payment_status === "Partial" ? `Partial · ${inr(balanceDue(o))} due` : o.payment_status}
                </Badge>
              </button>
            </td>
            <td style={td}><Badge tone={o.delivery_status === "Delivered" ? "success" : "warn"}>{o.delivery_status}</Badge></td>
            <td style={td}><Badge tone="navy">{o.payment_method}</Badge></td>
            <td style={td}>
              {(() => {
                // A customer-cancelled order is terminal — the CRM must not
                // be able to revive it. Show a static badge, no dropdown.
                if (o.order_status === "cancelled") {
                  return <Badge tone="danger">Cancelled by customer</Badge>;
                }
                // App orders use the lowercase lifecycle vocabulary; walk-ins
                // use the KANBAN labels. Pick the right option set per channel
                // so an app order's status (e.g. "pending_pickup") is editable.
                const isApp = o.channel === "app" || APP_LIFECYCLE.includes(o.order_status);
                const opts = isApp ? APP_LIFECYCLE : KANBAN;
                const label = (s) => (isApp ? (APP_LIFECYCLE_LABEL[s] || s) : s);
                // If the current value isn't in the option set, surface it so
                // the select still shows the real status rather than snapping.
                const options = opts.includes(o.order_status) ? opts : [o.order_status, ...opts];
                return (
                  <select value={o.order_status} onChange={(e) => onStatus(o.id, e.target.value)}
                    style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "7px 10px", fontSize: 12.5, fontWeight: 600, color: C.navy, background: "#fff", maxWidth: 190 }}>
                    {options.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                  </select>
                );
              })()}
            </td>
            <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
              <div className="inline-flex items-center gap-1">
                <button onClick={() => onOpenInvoice && onOpenInvoice(o)} title="Invoice / Tags"
                  style={iconBtn(C.tealLight, C.tealDark)}><FileText size={14} /></button>
                {isAdmin && (
                  <>
                    <button onClick={() => setEditOrder(o)} title="Edit sale (admin)"
                      style={iconBtn(C.bg, C.navy)}><Pencil size={14} /></button>
                    <button onClick={() => onDeleteOrder(o)} title="Delete sale (admin)"
                      style={iconBtn(C.redLt, C.red)}><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            </td>
          </tr>
        )}
      />

      {editOrder && (
        <EditSaleModal order={editOrder} products={products} onQuickAddProduct={onQuickAddProduct}
          onClose={() => setEditOrder(null)}
          onSave={async (payload) => { const ok = await onEditOrder(payload); if (ok) setEditOrder(null); }} />
      )}

      {dateOrder && (
        <DeliveryDateModal order={dateOrder}
          onClose={() => setDateOrder(null)}
          onSave={onChangeDeliveryDate}
          onMarkNotified={onMarkDelayNotified} />
      )}
    </div>
  );
}

function editTitle(o) {
  const who = o.edited_by_name || "staff";
  const reason = o.delivery_change_reason ? ` · reason: ${o.delivery_change_reason}` : "";
  return `Last edited ${fmtDateTime(o.edited_at)} by ${who} (${o.edit_count || 1}×)${reason}`;
}

/* ─────────────── Edit sale (admin) ─────────────── */
function EditSaleModal({ order, products, onClose, onSave, onQuickAddProduct }) {
  const [quickAdd, setQuickAdd] = useState(false);
  const [form, setForm] = useState({
    customer_name: order.customer_name || "",
    phone: order.phone || "",
    address: order.address || "",
    fulfilment: order.fulfilment || "pickup",
    due_date: order.due_date || "",
    discount_pct: order.discount_pct || 0,
    tax_pct: order.tax_pct || 0,
    payment_method: order.payment_method || "Cash",
    payment_status: order.payment_status || "Unpaid",
    amount_paid: order.amount_paid || 0,
  });
  const [items, setItems] = useState(null); // null until loaded
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    api.fetchOrderItemsForOrder(order.id).then((rows) => {
      if (alive) setItems(rows.map((r, i) => ({ ...r, key: r.id || i })));
    }).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [order.id]);

  const sub = (items || []).reduce((a, i) => a + Number(i.line_total || 0), 0);
  const total = Math.max(0, Math.round(sub - (sub * form.discount_pct) / 100 + (sub * form.tax_pct) / 100));

  const setItem = (key, patch) => setItems((cur) => cur.map((i) => {
    if (i.key !== key) return i;
    const next = { ...i, ...patch };
    // Recompute the line total from qty/weight × unit price.
    const up = Number(next.unit_price) || 0;
    next.line_total = next.unit === "kg"
      ? Math.round(up * (Number(next.weight_kg) || 0))
      : Math.round(up * (Number(next.qty) || 1));
    return next;
  }));
  const removeItem = (key) => setItems((cur) => cur.filter((i) => i.key !== key));
  const addItem = (p) => {
    if (!p) return;
    setItems((cur) => [...cur, {
      key: "new-" + Date.now(),
      product_name: p.name, service_type: "Laundry", express: false,
      qty: 1, weight_kg: p.unit === "kg" ? 1 : null, unit: p.unit || "piece",
      unit_price: Number(p.price) || 0,
      line_total: p.unit === "kg" ? Number(p.price) || 0 : Number(p.price) || 0,
    }]);
  };

  const save = async () => {
    setErr("");
    if (!form.customer_name.trim()) { setErr("Customer name is required."); return; }
    if (!items || items.length === 0) { setErr("An order needs at least one item."); return; }
    setBusy(true);
    const fields = {
      ...form,
      subtotal: sub,
      total,
      amount_paid: form.payment_status === "Paid" ? total : Number(form.amount_paid) || 0,
    };
    await onSave({ id: order.id, before: order, fields, items });
    setBusy(false);
  };

  return (
    <Modal title={`Edit Order #${order.order_no}`} sub="Admin edit — every change is logged" onClose={onClose} width={620}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><label style={fieldLabel}>Customer *</label><input style={field} value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
        <div><label style={fieldLabel}>Phone</label><input style={field} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
      </div>
      <div style={{ marginTop: 12 }}><label style={fieldLabel}>Address</label><input style={field} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: 12 }}>
        <div><label style={fieldLabel}>Fulfilment</label>
          <select style={field} value={form.fulfilment} onChange={(e) => setForm({ ...form, fulfilment: e.target.value })}>
            <option value="pickup">Pickup</option><option value="delivery">Delivery</option>
          </select>
        </div>
        <div><label style={fieldLabel}>Delivery date</label><input style={field} type="date" value={form.due_date || ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
        <div><label style={fieldLabel}>Payment</label>
          <select style={field} value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Line items */}
      <div style={{ marginTop: 16, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", background: C.bg, fontSize: 12, fontWeight: 700, color: C.navy }}>Items</div>
        <div style={{ maxHeight: 220, overflowY: "auto" }}>
          {items === null ? (
            <div style={{ padding: 20, textAlign: "center", color: C.textFaint, fontSize: 13 }}>Loading items…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: C.textFaint, fontSize: 13 }}>No items. Add one below.</div>
          ) : items.map((i) => (
            <div key={i.key} className="flex items-center gap-2" style={{ padding: "10px 14px", borderTop: `1px solid ${C.borderSoft}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.product_name}</p>
                <p style={{ fontSize: 11, color: C.textFaint }}>{inr(i.unit_price)}{i.unit === "kg" ? "/kg" : " ea"}</p>
              </div>
              {i.unit === "kg" ? (
                <input type="number" step="0.1" min="0" value={i.weight_kg ?? ""} onChange={(e) => setItem(i.key, { weight_kg: e.target.value })}
                  style={{ ...field, width: 70, padding: "6px 8px" }} title="kg" />
              ) : (
                <input type="number" step="1" min="1" value={i.qty} onChange={(e) => setItem(i.key, { qty: Math.max(1, +e.target.value || 1) })}
                  style={{ ...field, width: 60, padding: "6px 8px" }} title="qty" />
              )}
              <span style={{ width: 70, textAlign: "right", fontWeight: 700, fontSize: 13, color: C.navy }}>{inr(i.line_total)}</span>
              <button onClick={() => removeItem(i.key)} style={iconBtn(C.redLt, C.red)}><X size={13} /></button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2" style={{ padding: "10px 14px", borderTop: `1px solid ${C.borderSoft}`, background: C.bg }}>
          <select value="" onChange={(e) => {
              if (e.target.value === "__new") { setQuickAdd(true); }
              else { const p = products.find((x) => x.id === e.target.value); addItem(p); }
              e.target.value = "";
            }}
            style={{ ...field, flex: 1, padding: "8px 10px" }}>
            <option value="">+ Add a product…</option>
            {onQuickAddProduct && <option value="__new">＋ New item (not in catalogue)…</option>}
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {inr(p.price)}{p.unit === "kg" ? "/kg" : ""}</option>)}
          </select>
        </div>
      </div>

      {/* Totals */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: 14, alignItems: "end" }}>
        <div><label style={fieldLabel}>Discount %</label><input style={field} type="number" min="0" value={form.discount_pct} onChange={(e) => setForm({ ...form, discount_pct: +e.target.value || 0 })} /></div>
        <div><label style={fieldLabel}>Tax %</label><input style={field} type="number" min="0" value={form.tax_pct} onChange={(e) => setForm({ ...form, tax_pct: +e.target.value || 0 })} /></div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 11.5, color: C.textMute }}>New total</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>{inr(total)}</p>
        </div>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 12 }}>
        <div><label style={fieldLabel}>Payment status</label>
          <select style={field} value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value })}>
            <option>Unpaid</option><option>Partial</option><option>Paid</option>
          </select>
        </div>
        {form.payment_status === "Partial" && (
          <div><label style={fieldLabel}>Amount paid</label><input style={field} type="number" min="0" value={form.amount_paid} onChange={(e) => setForm({ ...form, amount_paid: +e.target.value || 0 })} /></div>
        )}
      </div>

      {err && <div style={{ background: C.redLt, color: C.red, fontSize: 12.5, fontWeight: 600, padding: "9px 12px", borderRadius: 9, marginTop: 14 }}>{err}</div>}
      <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
        <Btn variant="outline" small onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" small icon={Pencil} onClick={save} disabled={busy}>Save changes</Btn>
      </div>

      {quickAdd && (
        <QuickItem
          onClose={() => setQuickAdd(false)}
          onSave={async (payload) => {
            const created = await onQuickAddProduct(payload);
            if (created) { addItem(created); setQuickAdd(false); }
            return created;
          }} />
      )}
    </Modal>
  );
}

/* Minimal new-product form used inside the edit-sale modal. */
function QuickItem({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("piece");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    const nm = name.trim(); const pr = Number(price);
    if (!nm) { setErr("Name is required."); return; }
    if (!Number.isFinite(pr) || pr < 0) { setErr("Enter a valid price."); return; }
    setBusy(true);
    const created = await onSave({ name: nm, price: pr, category: "General", unit });
    setBusy(false);
    if (!created) setErr("Could not save.");
  };
  return (
    <Modal title="New item" sub="Saved to the catalogue and added to this order" onClose={onClose} width={400}>
      <div><label style={fieldLabel}>Item name *</label><input style={field} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
        <div><label style={fieldLabel}>Charged by</label>
          <select style={field} value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="piece">Per piece</option><option value="kg">Per kg</option>
          </select>
        </div>
        <div><label style={fieldLabel}>Price (₹) *</label><input style={field} type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
      </div>
      {err && <div style={{ background: C.redLt, color: C.red, fontSize: 12.5, fontWeight: 600, padding: "9px 12px", borderRadius: 9, marginTop: 14 }}>{err}</div>}
      <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
        <Btn variant="outline" small onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" small onClick={save} disabled={busy}>Add</Btn>
      </div>
    </Modal>
  );
}

/* ─────────────── Change delivery date + notify ─────────────── */
function DeliveryDateModal({ order, onClose, onSave, onMarkNotified }) {
  // Normalise any timestamp form down to YYYY-MM-DD for <input type=date>.
  const [date, setDate] = useState(String(order.due_date || "").slice(0, 10));
  const [reason, setReason] = useState(DELAY_REASONS[0]);
  const [otherReason, setOtherReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const finalReason = reason === "Other" ? (otherReason.trim() || "Other") : reason;

  const save = async () => {
    if (!date) return;
    setBusy(true);
    const ok = await onSave({ id: order.id, before: order, due_date: date, reason: finalReason });
    setBusy(false);
    if (ok) setSaved(true); // reveal the "notify customer" step
  };

  const notifyWhatsApp = () => {
    const num = String(order.phone || "").replace(/\D/g, "");
    if (!num) { alert("No phone number on this order."); return; }
    const newDate = new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    const msg = [
      `*${STORE.name}*`,
      `Dear ${order.customer_name},`,
      ``,
      `We're sorry — your order *#${order.order_no}* will be ready a little later than planned.`,
      `*New delivery date: ${newDate}*`,
      `Reason: ${finalReason}.`,
      ``,
      `We sincerely apologise for the inconvenience and appreciate your patience. 🙏`,
      `— Team ${STORE.name}`,
    ].join("\n");
    const wa = num.length === 10 ? "91" + num : num;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank");
    onMarkNotified && onMarkNotified(order.id);
  };

  return (
    <Modal title={`Change delivery date · #${order.order_no}`} sub={`Current: ${fmt(order.due_date)}`} onClose={onClose} width={440}>
      <div><label style={fieldLabel}>New delivery date *</label>
        <input style={field} type="date" value={date || ""} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div style={{ marginTop: 14 }}><label style={fieldLabel}>Reason for the change *</label>
        <select style={field} value={reason} onChange={(e) => setReason(e.target.value)}>
          {DELAY_REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>
      {reason === "Other" && (
        <div style={{ marginTop: 12 }}><label style={fieldLabel}>Specify</label>
          <input style={field} value={otherReason} onChange={(e) => setOtherReason(e.target.value)} placeholder="Type the reason…" />
        </div>
      )}

      {!saved ? (
        <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
          <Btn variant="outline" small onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" small icon={CalendarClock} onClick={save} disabled={busy || !date}>Update date</Btn>
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          <div style={{ background: C.greenLt, color: C.green, fontSize: 12.5, fontWeight: 600, padding: "10px 12px", borderRadius: 9, marginBottom: 14 }}>
            Date updated. Let the customer know about the delay?
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="outline" small onClick={onClose}>Skip</Btn>
            <Btn variant="success" small icon={MessageCircle} onClick={() => { notifyWhatsApp(); onClose(); }}>Send apology on WhatsApp</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

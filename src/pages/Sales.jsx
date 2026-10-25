import React, { useState, useEffect, useMemo } from "react";
import { Printer, FileText, Pencil, CalendarClock, History, X, MessageCircle, Wallet, Phone, Trash2, Camera } from "lucide-react";
import { C, KANBAN, APP_LIFECYCLE, APP_LIFECYCLE_LABEL, PAYMENT_METHODS, DELAY_REASONS, STORE, inr, balanceDue, collected, orderRef, isValidPhone, localIsoDate,
  isCancelled, isDelivered, fmtDate, fmtDay, waLink } from "../theme";
import { PageHead, Btn, Badge, DataTable, Modal, td, iconBtn, field, fieldLabel, printPage } from "../components/ui";
import { PeriodStepper, usePeriod, FilterChips, Drawer, KV, SectionTitle, usePersistentState, SkeletonBlock } from "../components/kit";
import { inPeriod, periodLabel, currentPeriod, toDate } from "../lib/period";
import * as api from "../lib/api";

const fmt = (s) => fmtDate(s);
const fmtDateTime = (s) => s ? new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

// Quick filters. Each is a predicate over one order; counts are shown on
// the chips for the selected period so problems are visible up front.
const CHIPS = [
  { key: "all", label: "All", test: () => true },
  { key: "unpaid", label: "Unpaid", tone: "danger", test: (o) => !isCancelled(o) && o.payment_status === "Unpaid" && Number(o.total) > 0 },
  { key: "partial", label: "Partial", tone: "warn", test: (o) => !isCancelled(o) && o.payment_status === "Partial" },
  { key: "overdue", label: "Overdue", tone: "danger", test: (o) => !isCancelled(o) && !isDelivered(o) && o.due_date && o.due_date < localIsoDate() },
  { key: "open", label: "Not delivered", test: (o) => !isCancelled(o) && !isDelivered(o) },
  { key: "app", label: "App orders", test: (o) => o.channel === "app" },
  { key: "cancelled", label: "Cancelled", test: (o) => isCancelled(o) },
];

const payTone = (o) => (o.payment_status === "Paid" ? "success" : o.payment_status === "Partial" ? "warn" : "danger");
const dayKey = (o) => localIsoDate(0, new Date(o.created_at));

export default function Sales({
  orders, loading, products = [], isAdmin, isSuperAdmin = false, outlets = [], intent,
  onStatus, onCollectPayment, onResetPayment, onOpenInvoice, onDeleteOrder,
  onEditOrder, onChangeDeliveryDate, onMarkDelayNotified, onQuickAddProduct,
}) {
  const [editOrder, setEditOrder] = useState(null);     // full edit
  const [dateOrder, setDateOrder] = useState(null);     // delivery-date change
  const [payOrder, setPayOrder] = useState(null);       // collect payment
  const [detailId, setDetailId] = useState(null);       // side drawer
  const [storedPeriod, setPeriod] = usePeriod("sales", "day");
  const [chip, setChip] = useState(intent?.chip || "all");
  const [outletId, setOutletId] = usePersistentState("sales:outlet", "");
  // A dashboard / report link may ask for a specific window.
  const [intentPeriod, setIntentPeriod] = useState(intent?.period || null);
  const period = intentPeriod || storedPeriod;
  const changePeriod = (p) => { setIntentPeriod(null); setPeriod(p); };

  const scoped = useMemo(
    () => orders.filter((o) => (!outletId || o.outlet_id === outletId) && inPeriod(o.created_at, period)),
    [orders, outletId, period]
  );
  const chips = CHIPS.map((c) => ({ ...c, count: scoped.filter(c.test).length }));
  const active = CHIPS.find((c) => c.key === chip) || CHIPS[0];
  const rows = useMemo(() => scoped.filter(active.test), [scoped, active]);
  const detail = detailId ? orders.find((o) => o.id === detailId) : null;
  const outletName = (id) => outlets.find((x) => x.id === id)?.name?.replace(/^Patna\s*-\s*/i, "") || "—";

  const totals = (list) => {
    const live = list.filter((o) => !isCancelled(o));
    return {
      billed: live.reduce((a, o) => a + Number(o.total || 0), 0),
      collected: live.reduce((a, o) => a + collected(o), 0),
      due: live.reduce((a, o) => a + balanceDue(o), 0),
      n: list.length,
    };
  };

  return (
    <div>
      <PageHead title="Sales" sub={`${periodLabel(period)} · ${scoped.length} order${scoped.length === 1 ? "" : "s"}`}>
        {isSuperAdmin && (
          <select value={outletId} onChange={(e) => setOutletId(e.target.value)}
            style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", fontSize: 12.5, fontWeight: 600, color: C.navy, background: "#fff" }}>
            <option value="">All outlets</option>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        <PeriodStepper value={period} onChange={changePeriod} />
        <Btn variant="outline" icon={Printer} small onClick={printPage}>Print</Btn>
      </PageHead>
      <DataTable
        loading={loading}
        entriesKey="sales"
        defaultEntries={25}
        columns={["Num", "Time", "Client", "Due", "Total", "Payment", "Delivery", "Order Status"]}
        data={rows}
        searchKeys={["customer_name", orderRef, "payment_method", "phone"]}
        placeholder="Search by client / num / phone…"
        emptyText={chip === "all" ? `No orders in ${periodLabel(period)}.` : `No ${active.label.toLowerCase()} orders in ${periodLabel(period)}.`}
        toolbar={
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <FilterChips chips={chips} value={chip} onChange={setChip} />
            {period.mode !== "all" && chip !== "all" && (
              <button onClick={() => changePeriod({ ...currentPeriod("all") })} style={{ border: "none", background: "transparent", color: C.tealDark, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                See {active.label.toLowerCase()} for all time →
              </button>
            )}
          </div>
        }
        groupBy={dayKey}
        renderGroup={(k, list) => {
          const t = totals(list);
          return (
            <div className="flex items-center justify-between flex-wrap gap-2" style={{ fontSize: 12.5 }}>
              <span style={{ fontWeight: 700, color: C.navy }}>
                {toDate(k).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                <span style={{ color: C.textFaint, fontWeight: 500 }}> · {t.n} order{t.n === 1 ? "" : "s"}</span>
              </span>
              <span style={{ color: C.textMute }}>
                <b style={{ color: C.navy }}>{inr(t.billed)}</b> billed · <b style={{ color: C.green }}>{inr(t.collected)}</b> collected
                {t.due > 0 && <> · <b style={{ color: C.red }}>{inr(t.due)}</b> due</>}
              </span>
            </div>
          );
        }}
        footer={(list) => {
          const t = totals(list);
          return (
            <div className="flex items-center justify-between flex-wrap gap-2" style={{ fontSize: 13 }}>
              <span style={{ color: C.textMute }}>{t.n} order{t.n === 1 ? "" : "s"}{chip !== "all" ? ` · ${active.label}` : ""} · {periodLabel(period)}</span>
              <span className="flex items-center gap-4">
                <span>Billed <b style={{ color: C.navy }}>{inr(t.billed)}</b></span>
                <span>Collected <b style={{ color: C.green }}>{inr(t.collected)}</b></span>
                <span>Due <b style={{ color: t.due ? C.red : C.textFaint }}>{inr(t.due)}</b></span>
              </span>
            </div>
          );
        }}
        renderRow={(o) => (
          <tr key={o.id} className="wb-row" tabIndex={0} onClick={() => setDetailId(o.id)} onKeyDown={(e) => e.key === "Enter" && setDetailId(o.id)}
            style={{ opacity: isCancelled(o) ? 0.55 : 1 }}>
            <td style={{ ...td, fontWeight: 800, color: C.navy, whiteSpace: "nowrap" }}>
              #{orderRef(o)}
              {o.edited_at && (
                <span title={editTitle(o)} className="inline-flex items-center gap-1"
                  style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: C.amber, background: C.amberLt, padding: "2px 6px", borderRadius: 99, verticalAlign: "middle" }}>
                  <History size={9} /> Edited
                </span>
              )}
              {isSuperAdmin && !outletId && <div style={{ fontSize: 11, color: C.textFaint, fontWeight: 500 }}>{outletName(o.outlet_id)}</div>}
            </td>
            <td style={{ ...td, color: C.textMute, whiteSpace: "nowrap" }}>
              {new Date(o.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </td>
            <td style={td}>
              <div style={{ fontWeight: 600 }}>{o.customer_name}</div>
              {o.phone && <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>{o.phone}</div>}
            </td>
            <td style={td}>
              <Badge tone={o.fulfilment === "delivery" ? "info" : "muted"}>{o.fulfilment === "delivery" ? "Delivery" : "Pickup"}</Badge>
              <div style={{ fontSize: 11.5, marginTop: 4, fontWeight: 600,
                color: !isDelivered(o) && !isCancelled(o) && o.due_date && o.due_date < localIsoDate() ? C.red : C.textMute }}>
                {fmtDay(o.due_date)}
              </div>
            </td>
            <td style={{ ...td, fontWeight: 800 }}>{inr(o.total)}</td>
            <td style={td} onClick={(e) => e.stopPropagation()}>
              {isCancelled(o) ? <Badge tone="muted">Cancelled</Badge> : (
                <button onClick={() => setPayOrder(o)} title={o.payment_status === "Paid" ? "Payment details" : "Collect payment"}
                  style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
                  <Badge tone={payTone(o)}>
                    {o.payment_status === "Partial" ? `Partial · ${inr(balanceDue(o))} due` : o.payment_status}
                  </Badge>
                </button>
              )}
              {o.payment_status !== "Unpaid" && o.payment_method && (
                <div style={{ fontSize: 11, color: C.textFaint, marginTop: 3 }}>{o.payment_method}</div>
              )}
            </td>
            <td style={td}>{o.delivery_status
              ? <Badge tone={o.delivery_status === "Delivered" ? "success" : o.delivery_status === "Cancelled" ? "muted" : "warn"}>{o.delivery_status}</Badge>
              : <span style={{ color: C.textFaint }}>—</span>}</td>
            <td style={td} onClick={(e) => e.stopPropagation()}>
              <StatusSelect o={o} onStatus={onStatus} />
            </td>
          </tr>
        )}
      />

      {detail && (
        <OrderDrawer o={detail} isAdmin={isAdmin} outletName={isSuperAdmin ? outletName : null}
          onClose={() => setDetailId(null)}
          onCollect={() => setPayOrder(detail)}
          onInvoice={() => onOpenInvoice && onOpenInvoice(detail)}
          onEdit={() => setEditOrder(detail)}
          onChangeDate={() => setDateOrder(detail)}
          onStatus={onStatus}
          onDelete={isAdmin && onDeleteOrder ? async () => { await onDeleteOrder(detail); setDetailId(null); } : null} />
      )}

      {editOrder && (
        <EditSaleModal order={editOrder} products={products} onQuickAddProduct={onQuickAddProduct}
          onClose={() => setEditOrder(null)}
          onSave={async (payload) => { const ok = await onEditOrder(payload); if (ok) setEditOrder(null); }} />
      )}

      {payOrder && (
        <CollectPaymentModal order={orders.find((x) => x.id === payOrder.id) || payOrder} isAdmin={isAdmin}
          onClose={() => setPayOrder(null)}
          onCollect={async (payload) => { const ok = await onCollectPayment(payload); if (ok) setPayOrder(null); }}
          onReset={async () => { const ok = await onResetPayment(payOrder); if (ok) setPayOrder(null); }} />
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

/* Order-status dropdown (shared by the table and the drawer). */
export function StatusSelect({ o, onStatus, full }) {
  // A customer-cancelled order is terminal — the CRM must not be able to
  // revive it. Show a static badge, no dropdown.
  if (isCancelled(o)) return <Badge tone="danger">Cancelled{o.channel === "app" ? " by customer" : ""}</Badge>;
  // App orders use the lowercase lifecycle vocabulary; walk-ins use the
  // KANBAN labels. Pick the right option set per channel.
  const isApp = o.channel === "app" || APP_LIFECYCLE.includes(o.order_status);
  const opts = isApp ? APP_LIFECYCLE : KANBAN;
  const label = (s) => (isApp ? (APP_LIFECYCLE_LABEL[s] || s) : s);
  // If the current value isn't in the option set, surface it so the select
  // still shows the real status rather than snapping.
  const options = opts.includes(o.order_status) ? opts : [o.order_status, ...opts];
  return (
    <select value={o.order_status} onChange={(e) => onStatus(o.id, e.target.value)}
      style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "7px 10px", fontSize: 12.5, fontWeight: 600, color: C.navy, background: "#fff", maxWidth: full ? "100%" : 190, width: full ? "100%" : undefined }}>
      {options.map((s) => <option key={s} value={s}>{label(s)}</option>)}
    </select>
  );
}

/* ─────────────── Order details drawer ─────────────── */
function OrderDrawer({ o, isAdmin, outletName, onClose, onCollect, onInvoice, onEdit, onChangeDate, onStatus, onDelete }) {
  const [items, setItems] = useState(null);
  const [edits, setEdits] = useState(null);
  useEffect(() => {
    let alive = true;
    setItems(null); setEdits(null);
    api.fetchOrderItemsForOrder(o.id).then((r) => alive && setItems(r)).catch(() => alive && setItems([]));
    api.fetchOrderEdits(o.id).then((r) => alive && setEdits(r)).catch(() => alive && setEdits([]));
    return () => { alive = false; };
  }, [o.id]);

  const due = balanceDue(o);
  const ready = waLink(o.phone, [
    `*${STORE.name}*`, `Dear ${o.customer_name},`, ``,
    `Your order *#${orderRef(o)}* is ready for ${o.fulfilment === "delivery" ? "delivery" : "pickup"}.`,
    due > 0 ? `Amount due: *${inr(due)}*` : `It's fully paid — thank you!`, ``, `— Team ${STORE.name}`,
  ].join("\n"));
  const remind = due > 0 ? waLink(o.phone, [
    `*${STORE.name}*`, `Dear ${o.customer_name},`, ``,
    `A gentle reminder that *${inr(due)}* is pending on order *#${orderRef(o)}*.`,
    `You can pay at the counter or by UPI. Thank you!`, ``, `— Team ${STORE.name}`,
  ].join("\n")) : null;

  return (
    <Drawer title={`Order #${orderRef(o)}`} onClose={onClose}
      sub={<span className="flex items-center gap-2 flex-wrap">
        <span>{o.customer_name}</span>
        {isCancelled(o) ? <Badge tone="muted">Cancelled</Badge> : <Badge tone={payTone(o)}>{o.payment_status}</Badge>}
        {isDelivered(o) && <Badge tone="success">Delivered</Badge>}
      </span>}
      footer={
        <div className="flex items-center gap-2 flex-wrap">
          {!isCancelled(o) && due > 0 && <Btn variant="success" small icon={Wallet} onClick={onCollect}>Collect {inr(due)}</Btn>}
          {!isCancelled(o) && due === 0 && <Btn variant="outline" small icon={Wallet} onClick={onCollect}>Payment</Btn>}
          <Btn variant="outline" small icon={FileText} onClick={onInvoice}>Invoice / Tags</Btn>
          {isAdmin && !isCancelled(o) && <Btn variant="outline" small icon={Pencil} onClick={onEdit}>Edit</Btn>}
          {!isCancelled(o) && !isDelivered(o) && <Btn variant="outline" small icon={CalendarClock} onClick={onChangeDate}>Change date</Btn>}
          {onDelete && <Btn variant="ghost" small icon={Trash2} onClick={onDelete}>Delete</Btn>}
        </div>
      }>
      <div style={{ background: C.bg, borderRadius: 12, padding: "8px 14px" }}>
        <KV k="Total" v={inr(o.total)} />
        <KV k="Paid" v={`${inr(collected(o))}${o.payment_method && o.payment_status !== "Unpaid" ? ` · ${o.payment_method}` : ""}`} color={C.green} />
        <KV k="Balance due" v={inr(due)} color={due ? C.red : C.textFaint} />
        {o.paid_at && <KV k="Paid on" v={fmtDateTime(o.paid_at)} />}
      </div>

      <SectionTitle>Status</SectionTitle>
      <StatusSelect o={o} onStatus={onStatus} full />

      <SectionTitle>Details</SectionTitle>
      <KV k="Billed" v={fmtDateTime(o.created_at)} />
      <KV k={o.fulfilment === "delivery" ? "Delivery on" : "Pickup on"} v={fmt(o.due_date)}
        color={!isDelivered(o) && !isCancelled(o) && o.due_date && o.due_date < localIsoDate() ? C.red : undefined} />
      {o.delivered_at && <KV k="Delivered" v={fmtDateTime(o.delivered_at)} />}
      {outletName && <KV k="Outlet" v={outletName(o.outlet_id)} />}
      <KV k="Channel" v={o.channel === "app" ? "Customer app" : "Walk-in"} />
      {o.pieces != null && <KV k="Pieces" v={o.pieces} />}
      {Number(o.discount_pct) > 0 && <KV k="Discount" v={`${o.discount_pct}%`} />}
      {Number(o.subscription_discount) > 0 && <KV k="Covered by plan" v={inr(o.subscription_discount)} color={C.green} />}

      <SectionTitle>Customer</SectionTitle>
      <KV k="Phone" v={o.phone ? <a href={`tel:${o.phone}`} style={{ color: C.tealDark }}>{o.phone}</a> : "—"} />
      {o.address && <KV k="Address" v={o.address} />}
      {(ready || remind) && (
        <div className="flex gap-2 flex-wrap" style={{ marginTop: 8 }}>
          {ready && !isDelivered(o) && !isCancelled(o) && <a href={ready} target="_blank" rel="noreferrer"><Btn variant="outline" small icon={MessageCircle}>“Ready” on WhatsApp</Btn></a>}
          {remind && <a href={remind} target="_blank" rel="noreferrer"><Btn variant="outline" small icon={MessageCircle}>Payment reminder</Btn></a>}
          {o.phone && <a href={`tel:${o.phone}`}><Btn variant="ghost" small icon={Phone}>Call</Btn></a>}
        </div>
      )}

      <SectionTitle>Items</SectionTitle>
      {items === null ? <SkeletonBlock h={60} /> : items.length === 0 ? <p style={{ fontSize: 13, color: C.textFaint }}>No items recorded.</p> : (
        <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 12, overflow: "hidden" }}>
          {items.map((i) => (
            <div key={i.id} className="flex items-center justify-between" style={{ padding: "9px 12px", borderTop: `1px solid ${C.borderSoft}`, fontSize: 13, gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 600, color: C.navy }}>{i.product_name}</p>
                <p style={{ fontSize: 11.5, color: C.textFaint }}>{i.service_type}{i.express ? " · Express" : ""} · {i.unit === "kg" ? `${i.weight_kg} kg (${i.qty} pcs)` : `×${i.qty}`}</p>
              </div>
              <b style={{ color: C.navy, whiteSpace: "nowrap" }}>{inr(i.line_total)}</b>
            </div>
          ))}
        </div>
      )}

      {(o.damage_note || o.image_urls?.length > 0) && (
        <>
          <SectionTitle>Damage noted at intake</SectionTitle>
          {o.damage_note && <p style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>{o.damage_note}</p>}
          <div className="flex gap-2 flex-wrap">
            {(o.image_urls || []).map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" style={{ width: 64, height: 64, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}`, display: "block" }}>
                <img src={u} alt="Damage photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </a>
            ))}
            {!o.image_urls?.length && <span style={{ fontSize: 12, color: C.textFaint }} className="inline-flex items-center gap-1"><Camera size={12} /> no photos</span>}
          </div>
        </>
      )}

      <SectionTitle>History</SectionTitle>
      {edits === null ? <SkeletonBlock h={30} /> : edits.length === 0 ? <p style={{ fontSize: 12.5, color: C.textFaint }}>No edits since billing.</p> : (
        <div className="flex flex-col gap-2">
          {edits.map((e) => (
            <div key={e.id} style={{ fontSize: 12.5, background: C.bg, borderRadius: 10, padding: "8px 10px" }}>
              <p style={{ fontWeight: 600, color: C.navy }}>{e.kind === "delivery_date" ? "Delivery date changed" : "Edited"} · {fmtDateTime(e.created_at)}{e.editor_name ? ` · ${e.editor_name}` : ""}</p>
              {(e.changes || []).slice(0, 6).map((c, i) => (
                <p key={i} style={{ color: C.textMute, marginTop: 2 }}>{c.field}: {String(c.from ?? "—")} → {String(c.to ?? "—")}</p>
              ))}
              {e.note && <p style={{ color: C.textMute, marginTop: 2, fontStyle: "italic" }}>“{e.note}”</p>}
            </div>
          ))}
        </div>
      )}
    </Drawer>
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
  // Baseline of the original items keyed by id → so we can enforce
  // "add-only": existing lines can't be removed and their qty/weight can
  // only increase. New lines added in this session are freely editable.
  const [baseline, setBaseline] = useState({}); // { key: { qty, weight_kg } }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    api.fetchOrderItemsForOrder(order.id).then((rows) => {
      if (!alive) return;
      const mapped = rows.map((r, i) => ({ ...r, key: r.id || i, original: true }));
      setItems(mapped);
      const base = {};
      mapped.forEach((r) => { base[r.key] = { qty: Number(r.qty) || 0, weight_kg: Number(r.weight_kg) || 0 }; });
      setBaseline(base);
    }).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [order.id]);

  // Kg already covered by the customer's subscription at billing time is
  // free — keep it deducted, exactly as the POS did, so an edit never
  // re-charges for weight the plan already paid for.
  const subscriptionCover = Number(order.subscription_discount) || 0;
  const gross = (items || []).reduce((a, i) => a + Number(i.line_total || 0), 0);
  const sub = Math.max(0, gross - subscriptionCover);
  const total = Math.max(0, Math.round(sub - (sub * form.discount_pct) / 100 + (sub * form.tax_pct) / 100));

  const setItem = (key, patch) => setItems((cur) => cur.map((i) => {
    if (i.key !== key) return i;
    const next = { ...i, ...patch };
    // The add-only floor is enforced on blur and at save — not per
    // keystroke, which snapped the box back mid-typing ("1" of "12").
    // Recompute the line total from qty/weight × unit price.
    const up = Number(next.unit_price) || 0;
    next.line_total = next.unit === "kg"
      ? Math.round(up * (Number(next.weight_kg) || 0))
      : Math.round(up * (Number(next.qty) || 1));
    return next;
  }));
  // Add-only: an original line's qty/weight can't drop below the baseline
  // it was opened with. Applied when the field loses focus.
  const clampItem = (key) => setItems((cur) => cur.map((i) => {
    const b = baseline[key];
    if (i.key !== key) return i;
    const next = { ...i };
    if (i.unit === "kg") {
      const w = Number(i.weight_kg);
      next.weight_kg = !Number.isFinite(w) || w < (b?.weight_kg || 0) ? (b?.weight_kg || 1) : w;
    } else {
      const q = Math.floor(Number(i.qty));
      next.qty = !Number.isFinite(q) || q < (b ? Math.max(1, b.qty) : 1) ? (b ? Math.max(1, b.qty) : 1) : q;
    }
    const up = Number(next.unit_price) || 0;
    next.line_total = next.unit === "kg" ? Math.round(up * Number(next.weight_kg)) : Math.round(up * Number(next.qty));
    return next;
  }));
  // Only NEW lines (added this session) may be removed; originals are locked.
  const removeItem = (key) => setItems((cur) => cur.filter((i) => i.key !== key || i.original));
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
    const shrunk = items.find((i) => {
      const b = baseline[i.key];
      return b && (i.unit === "kg" ? Number(i.weight_kg) < b.weight_kg : Number(i.qty) < b.qty);
    });
    if (shrunk) { setErr(`${shrunk.product_name}: existing items can only be increased.`); return; }
    if (items.some((i) => (i.unit === "kg" ? !(Number(i.weight_kg) > 0) : !(Number(i.qty) >= 1)))) {
      setErr("Every item needs a quantity / weight."); return;
    }
    if (form.phone.trim() && !isValidPhone(form.phone)) { setErr("Enter a valid 10-digit mobile number."); return; }
    // Add-only rule: the edited total can never be LESS than the original.
    // (You can add items / raise qty / reduce discount — never shrink it.)
    const origTotal = Number(order.total) || 0;
    if (total < origTotal) {
      setErr(`Edits can only increase the order. Total can't go below the original ${inr(origTotal)}.`);
      return;
    }
    setBusy(true);
    const fields = {
      ...form,
      subtotal: sub,
      total,
      amount_paid: form.payment_status === "Paid" ? total : form.payment_status === "Unpaid" ? 0 : Number(form.amount_paid) || 0,
      paid_at: form.payment_status === "Paid" ? (order.payment_status === "Paid" && order.paid_at ? order.paid_at : new Date().toISOString()) : null,
    };
    await onSave({ id: order.id, before: order, fields, items });
    setBusy(false);
  };

  return (
    <Modal title={`Edit Order #${orderRef(order)}`} sub="Add-only — you can add items or increase quantities, not reduce them. Every change is logged." onClose={onClose} width={620}>
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
          ) : items.map((i) => {
            const b = baseline[i.key];
            const minQty = b ? Math.max(1, b.qty) : 1;
            const minWt = b ? b.weight_kg : 0;
            return (
            <div key={i.key} className="flex items-center gap-2" style={{ padding: "10px 14px", borderTop: `1px solid ${C.borderSoft}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.product_name}</p>
                <p style={{ fontSize: 11, color: C.textFaint }}>{inr(i.unit_price)}{i.unit === "kg" ? "/kg" : " ea"}{i.original ? " · existing" : ""}</p>
              </div>
              {i.unit === "kg" ? (
                <input type="number" step="0.1" min={minWt} value={i.weight_kg ?? ""} onChange={(e) => setItem(i.key, { weight_kg: e.target.value })} onBlur={() => clampItem(i.key)}
                  style={{ ...field, width: 70, padding: "6px 8px" }} title={i.original ? `Can only increase (was ${minWt} kg)` : "kg"} />
              ) : (
                <input type="number" step="1" min={minQty} value={i.qty} onChange={(e) => setItem(i.key, { qty: e.target.value })} onBlur={() => clampItem(i.key)}
                  style={{ ...field, width: 60, padding: "6px 8px" }} title={i.original ? `Can only increase (was ${minQty})` : "qty"} />
              )}
              <span style={{ width: 70, textAlign: "right", fontWeight: 700, fontSize: 13, color: C.navy }}>{inr(i.line_total)}</span>
              {i.original
                ? <span style={{ width: 36, textAlign: "center", color: C.textFaint, fontSize: 16 }} title="Existing item — can't be removed">🔒</span>
                : <button onClick={() => removeItem(i.key)} style={iconBtn(C.redLt, C.red)} title="Remove (newly added)"><X size={13} /></button>}
            </div>
            );
          })}
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
        <div><label style={fieldLabel}>Discount %</label>
          <input style={field} type="number" min="0" max={order.discount_pct || 0} value={form.discount_pct}
            title={`Can't raise discount above the original ${order.discount_pct || 0}%`}
            onChange={(e) => {
              // Discount can only be reduced (never increased), so the order
              // value can't be lowered via a bigger discount.
              let v = +e.target.value || 0;
              if (v < 0) v = 0;
              if (v > (Number(order.discount_pct) || 0)) v = Number(order.discount_pct) || 0;
              setForm({ ...form, discount_pct: v });
            }} /></div>
        <div><label style={fieldLabel}>Tax %</label><input style={field} type="number" min="0" value={form.tax_pct} onChange={(e) => setForm({ ...form, tax_pct: +e.target.value || 0 })} /></div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 11.5, color: C.textMute }}>New total</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>{inr(total)}</p>
          {subscriptionCover > 0 && (
            <p style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>incl. −{inr(subscriptionCover)} subscription</p>
          )}
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

/* ─────────────── Collect payment ─────────────── */
// Records money received against an order: how much, and how it was paid.
// Replaces the old one-click Paid/Unpaid badge toggle, which flipped an
// order to fully Paid on a stray click and wiped any recorded advance
// when clicked back. Undo is admin-only and asks first.
export function CollectPaymentModal({ order, isAdmin, onClose, onCollect, onReset }) {
  const already = collected(order);
  const due = balanceDue(order);
  const [amount, setAmount] = useState(String(due || ""));
  const [method, setMethod] = useState(PAYMENT_METHODS.includes(order.payment_method) && order.payment_status !== "Unpaid" ? order.payment_method : "Cash");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const amt = Number(amount);

  const submit = async () => {
    setErr("");
    if (!Number.isFinite(amt) || amt <= 0) { setErr("Enter the amount received."); return; }
    if (amt > due) { setErr(`That's more than the ${inr(due)} due.`); return; }
    setBusy(true);
    await onCollect({ order, amount: amt, method });
    setBusy(false);
  };

  const row = (k, v, color = C.navy) => (
    <div className="flex items-center justify-between" style={{ fontSize: 13, padding: "4px 0" }}>
      <span style={{ color: C.textMute }}>{k}</span><span style={{ fontWeight: 700, color }}>{v}</span>
    </div>
  );

  return (
    <Modal title={`Payment · #${orderRef(order)}`} sub={order.customer_name} onClose={onClose} width={420}>
      <div style={{ background: C.bg, borderRadius: 12, padding: "10px 14px", marginBottom: 16 }}>
        {row("Order total", inr(order.total))}
        {row("Already paid", inr(already), C.green)}
        {row("Balance due", inr(due), due > 0 ? C.red : C.textFaint)}
        {order.paid_at && row("Paid on", fmtDateTime(order.paid_at), C.textMute)}
      </div>
      {due > 0 ? (
        <>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div><label style={fieldLabel}>Amount received (₹)</label>
              <input style={field} type="number" min="0" max={due} value={amount} autoFocus
                onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
            </div>
            <div><label style={fieldLabel}>Paid by</label>
              <select style={field} value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          {amt > 0 && amt < due && (
            <p style={{ fontSize: 12, color: C.amber, fontWeight: 600, marginTop: 10 }}>{inr(due - amt)} will still be due — order stays Partial.</p>
          )}
        </>
      ) : (
        <p style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>Fully paid{order.payment_method ? ` · ${order.payment_method}` : ""}.</p>
      )}
      {err && <div style={{ background: C.redLt, color: C.red, fontSize: 12.5, fontWeight: 600, padding: "9px 12px", borderRadius: 9, marginTop: 14 }}>{err}</div>}
      <div className="flex items-center justify-between gap-2" style={{ marginTop: 18 }}>
        <div>
          {isAdmin && already > 0 && (
            <Btn variant="ghost" small onClick={() => {
              if (confirm(`Reset #${orderRef(order)} to Unpaid? This clears the ${inr(already)} recorded as received.`)) onReset();
            }}>Reset to unpaid</Btn>
          )}
        </div>
        <div className="flex gap-2">
          <Btn variant="outline" small onClick={onClose}>{due > 0 ? "Cancel" : "Close"}</Btn>
          {due > 0 && <Btn variant="success" small onClick={submit} disabled={busy}>Record payment</Btn>}
        </div>
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
      `We're sorry — your order *#${orderRef(order)}* will be ready a little later than planned.`,
      `*New delivery date: ${newDate}*`,
      `Reason: ${finalReason}.`,
      ``,
      `We sincerely apologise for the inconvenience and appreciate your patience.`,
      `— Team ${STORE.name}`,
    ].join("\n");
    const wa = num.length === 10 ? "91" + num : num;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank");
    onMarkNotified && onMarkNotified(order.id);
  };

  return (
    <Modal title={`Change delivery date · #${orderRef(order)}`} sub={`Current: ${fmt(order.due_date)}`} onClose={onClose} width={440}>
      <div><label style={fieldLabel}>New delivery date *</label>
        <input style={field} type="date" value={date || ""} min={localIsoDate()} onChange={(e) => setDate(e.target.value)} />
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

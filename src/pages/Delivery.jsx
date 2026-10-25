import React, { useMemo, useState } from "react";
import { Package, Printer, MapPin, Phone, Calendar, CheckCircle2, Wallet, MessageCircle, Send, FileText } from "lucide-react";
import { C, DISPLAY, STORE, orderRef, inr, balanceDue, isCancelled, isDelivered, localIsoDate, fmtDay, waLink } from "../theme";
import { Card, PageHead, Btn, Badge, Modal, printPage } from "../components/ui";
import { PeriodStepper, Segmented } from "../components/kit";
import { periodLabel } from "../lib/period";
import { CollectPaymentModal } from "./Sales";

const daysLate = (due, today) => Math.round((new Date(today + "T00:00:00") - new Date(due + "T00:00:00")) / 86400000);

// WhatsApp templates. "ready" for orders waiting at the counter / going
// out today; "late" apologises for an overdue one; both add the amount due.
function message(kind, o) {
  const due = balanceDue(o);
  const lines = [`*${STORE.name}*`, `Dear ${o.customer_name},`, ``];
  if (kind === "late") lines.push(`Your order *#${orderRef(o)}* is ready and waiting for you — sorry for keeping you waiting.`);
  else if (o.fulfilment === "delivery") lines.push(`Your order *#${orderRef(o)}* will be delivered today.`);
  else lines.push(`Your order *#${orderRef(o)}* is ready for pickup.`);
  lines.push(due > 0 ? `Amount due: *${inr(due)}* (cash / UPI at handover)` : `It's fully paid — thank you!`, ``, `— Team ${STORE.name}`);
  return lines.join("\n");
}

function Col({ title, items, empty, today, outletName, onDeliver, onCollect, onInvoice, msgKind }) {
  return (
    <Card pad={false}>
      <div className="flex items-center justify-between" style={{ padding: "18px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
        <h3 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 16, color: C.navy }}>{title} <span style={{ color: C.textMute, fontWeight: 600, fontSize: 13 }}>· {items.length}</span></h3>
        {items.length > 0 && <span style={{ fontSize: 12, color: C.textMute }}>{inr(items.reduce((a, o) => a + balanceDue(o), 0))} to collect</span>}
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, minHeight: 220 }}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center" style={{ padding: "44px 0", color: C.textFaint, gap: 8 }}>
            <Package size={28} />
            <span style={{ fontSize: 13 }}>{empty}</span>
          </div>
        ) : items.map((o) => {
          const due = balanceDue(o);
          const late = o.due_date && o.due_date < today ? daysLate(o.due_date, today) : 0;
          const wa = waLink(o.phone, message(msgKind(o), o));
          return (
            <div key={o.id} className="rounded-xl" style={{ padding: "14px 16px", background: "#F7FAFB", border: `1px solid ${late ? C.red + "55" : C.borderSoft}` }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 6, gap: 8 }}>
                <p style={{ fontWeight: 700, color: C.navy, fontSize: 14 }}>{o.customer_name}</p>
                <div className="flex items-center gap-1">
                  {outletName && <Badge tone="muted">{outletName(o.outlet_id)}</Badge>}
                  <button onClick={() => onInvoice(o)} title="Invoice / tags" style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}><Badge tone="info">#{orderRef(o)}</Badge></button>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: 12, color: C.textMute }}>
                <span className="flex items-center gap-1" style={{ color: late ? C.red : undefined, fontWeight: late ? 700 : 400 }}>
                  <Calendar size={12} /> {fmtDay(o.due_date)}{late ? ` · ${late}d late` : ""}
                </span>
                {o.phone && <a href={`tel:${o.phone}`} className="flex items-center gap-1" style={{ color: C.textMute }}><Phone size={12} /> {o.phone}</a>}
                <Badge tone="warn">{o.order_status}</Badge>
                {o.pieces != null && <span>{o.pieces} pcs</span>}
              </div>
              {o.address && (
                <div className="flex items-start gap-1" style={{ marginTop: 8, fontSize: 12, color: C.text, lineHeight: 1.4 }}>
                  <MapPin size={12} style={{ marginTop: 3, color: C.textFaint, flexShrink: 0 }} />
                  <span>{o.address}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 flex-wrap wb-no-print" style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.border}` }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: due ? C.red : C.green }}>
                  {due ? `${inr(due)} to collect` : "Paid"}
                </span>
                <div className="flex items-center gap-1">
                  {wa && <a href={wa} target="_blank" rel="noreferrer" title="Send 'ready' message on WhatsApp" style={{ display: "inline-flex", padding: 7, borderRadius: 9, background: C.greenLt, color: C.green }}><MessageCircle size={14} /></a>}
                  {due > 0 && <Btn variant="outline" small icon={Wallet} onClick={() => onCollect(o)}>Collect</Btn>}
                  <Btn variant="success" small icon={CheckCircle2} onClick={() => onDeliver(o)}>{o.fulfilment === "delivery" ? "Delivered" : "Handed over"}</Btn>
                </div>
              </div>
              {/* Print-only: what to collect, since the buttons are hidden */}
              {due > 0 && <p className="wb-print-only" style={{ display: "none", fontSize: 12, fontWeight: 700 }}>Collect {inr(due)}</p>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Sort by due_date ascending; orders without a date fall to the bottom.
const byDue = (a, b) => {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
};

/* Walk through a list sending one WhatsApp message each. Browsers block
   a burst of pop-ups, so this opens them one click at a time. */
function NotifyAll({ list, kind, onClose }) {
  const sendable = list.filter((o) => waLink(o.phone));
  const [i, setI] = useState(0);
  const [sent, setSent] = useState(0);
  const o = sendable[i];
  return (
    <Modal title="Notify customers on WhatsApp" sub={`${sendable.length} with a valid number${list.length > sendable.length ? ` · ${list.length - sendable.length} skipped (no / bad number)` : ""}`} onClose={onClose} width={480}>
      {!o ? (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <CheckCircle2 size={28} color={C.green} />
          <p style={{ fontWeight: 700, color: C.navy, marginTop: 8 }}>Done — {sent} message{sent === 1 ? "" : "s"} opened.</p>
          <div style={{ marginTop: 14 }}><Btn variant="outline" small onClick={onClose}>Close</Btn></div>
        </div>
      ) : (
        <>
          <div style={{ height: 6, borderRadius: 99, background: C.bg, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ width: `${(i / sendable.length) * 100}%`, height: "100%", background: C.green }} />
          </div>
          <p style={{ fontSize: 12, color: C.textMute }}>{i + 1} of {sendable.length}</p>
          <p style={{ fontWeight: 700, color: C.navy, fontSize: 15, marginTop: 2 }}>{o.customer_name} · #{orderRef(o)}</p>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12.5, background: C.bg, borderRadius: 10, padding: 12, marginTop: 10, color: C.text }}>{message(kind(o), o)}</pre>
          <div className="flex justify-between gap-2" style={{ marginTop: 14 }}>
            <Btn variant="ghost" small onClick={() => setI(i + 1)}>Skip</Btn>
            <Btn variant="success" small icon={Send} onClick={() => {
              window.open(waLink(o.phone, message(kind(o), o)), "_blank");
              setSent(sent + 1); setI(i + 1);
            }}>Send &amp; next</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

export default function Delivery({ orders, onStatus, onCollectPayment, onResetPayment, isAdmin, isSuperAdmin = false, outlets = [], intent, onOpenInvoice }) {
  const today = localIsoDate();
  const [payOrder, setPayOrder] = useState(null);
  const [notifying, setNotifying] = useState(false);
  // "Day" view steps through dates (tomorrow's list can be prepared the
  // evening before); Overdue / Upcoming are open-ended.
  const [tab, setTab] = useState(intent?.tab === "overdue" ? "overdue" : intent?.tab === "upcoming" ? "upcoming" : null);
  const [day, setDay] = useState({ mode: "day", anchor: today });

  const open = useMemo(() => orders.filter((o) => !isDelivered(o) && !isCancelled(o) && o.delivery_status !== "Cancelled"), [orders]);
  const counts = {
    overdue: open.filter((o) => o.due_date && o.due_date < today).length,
    day: open.filter((o) => o.due_date === day.anchor).length,
    upcoming: open.filter((o) => !o.due_date || o.due_date > today).length,
  };
  // Default tab: the selected day if it has work, else Overdue.
  const effTab = tab || (counts.day || !counts.overdue ? "day" : "overdue");
  const list = (effTab === "overdue" ? open.filter((o) => o.due_date && o.due_date < today)
    : effTab === "upcoming" ? open.filter((o) => !o.due_date || o.due_date > today)
    : open.filter((o) => o.due_date === day.anchor)).slice().sort(byDue);
  const pickups = list.filter((o) => o.fulfilment !== "delivery");
  const deliveries = list.filter((o) => o.fulfilment === "delivery");
  const toCollect = list.reduce((a, o) => a + balanceDue(o), 0);
  const outletName = isSuperAdmin
    ? (id) => outlets.find((x) => x.id === id)?.name?.replace(/^Patna\s*-\s*/i, "") || "—"
    : null;
  const msgKind = (o) => (o.due_date && o.due_date < today ? "late" : "ready");

  const deliver = (o) => onStatus(o.id, o.channel === "app" ? "delivered" : "Delivered");
  const heading = effTab === "overdue" ? "Overdue" : effTab === "upcoming" ? "Upcoming" : periodLabel(day);

  return (
    <div>
      <PageHead title="Delivery List" sub={`${heading} · ${list.length} order${list.length === 1 ? "" : "s"} · ${inr(toCollect)} to collect`}>
        {list.length > 0 && effTab !== "upcoming" && <Btn variant="success" icon={Send} small onClick={() => setNotifying(true)}>Notify all ({list.length})</Btn>}
        <Btn variant="navy" icon={Printer} small onClick={printPage}>Print list</Btn>
      </PageHead>

      <div className="flex items-center gap-3 flex-wrap wb-no-print" style={{ marginBottom: 16 }}>
        <button onClick={() => setTab("overdue")} className="wb-press"
          style={{ padding: "8px 14px", borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: "pointer",
            border: effTab === "overdue" ? "none" : `1px solid ${counts.overdue ? C.red + "55" : C.border}`,
            background: effTab === "overdue" ? C.red : "#fff", color: effTab === "overdue" ? "#fff" : counts.overdue ? C.red : C.textMute }}>
          Overdue · {counts.overdue}
        </button>
        <div className="flex items-center gap-2" style={{ padding: 3, borderRadius: 14, background: effTab === "day" ? C.navy : "transparent" }}>
          <button onClick={() => setTab("day")} style={{ border: "none", background: "transparent", color: effTab === "day" ? "#fff" : C.textMute, fontWeight: 600, fontSize: 13, cursor: "pointer", padding: "0 6px" }}>
            Day · {counts.day}
          </button>
          <PeriodStepper value={day} onChange={(p) => { setDay({ mode: "day", anchor: p.anchor || today }); setTab("day"); }} modes={["day"]} allowFuture />
        </div>
        <button onClick={() => setTab("upcoming")} className="wb-press"
          style={{ padding: "8px 14px", borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: "pointer",
            border: effTab === "upcoming" ? "none" : `1px solid ${C.border}`,
            background: effTab === "upcoming" ? C.navy : "#fff", color: effTab === "upcoming" ? "#fff" : C.textMute }}>
          Upcoming · {counts.upcoming}
        </button>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <Col title="Pickup at store" items={pickups} today={today} outletName={outletName} msgKind={msgKind}
          empty={effTab === "overdue" ? "Nothing overdue" : "No pickups"} onDeliver={deliver} onCollect={setPayOrder} onInvoice={(o) => onOpenInvoice && onOpenInvoice(o)} />
        <Col title="Home delivery" items={deliveries} today={today} outletName={outletName} msgKind={msgKind}
          empty={effTab === "overdue" ? "Nothing overdue" : "No deliveries"} onDeliver={deliver} onCollect={setPayOrder} onInvoice={(o) => onOpenInvoice && onOpenInvoice(o)} />
      </div>

      {notifying && <NotifyAll list={list} kind={msgKind} onClose={() => setNotifying(false)} />}

      {payOrder && (
        <CollectPaymentModal order={orders.find((x) => x.id === payOrder.id) || payOrder} isAdmin={isAdmin}
          onClose={() => setPayOrder(null)}
          onCollect={async (payload) => { const ok = await onCollectPayment(payload); if (ok) setPayOrder(null); }}
          onReset={async () => { const ok = await onResetPayment(payOrder); if (ok) setPayOrder(null); }} />
      )}
    </div>
  );
}

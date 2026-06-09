import React, { useMemo, useState } from "react";
import { Truck, X, MapPin, Phone, Bell, ChevronRight, ShoppingBag } from "lucide-react";
import { C } from "../theme";

const isSameDay = (s) => {
  if (!s) return false;
  const d = new Date(s); const n = new Date();
  return d.getFullYear() === n.getFullYear()
      && d.getMonth() === n.getMonth()
      && d.getDate() === n.getDate();
};

export default function DeliveryAlert({ orders, onJump }) {
  const due = useMemo(
    () => orders
      .filter((o) => isSameDay(o.due_date) && o.delivery_status !== "Delivered")
      .sort((a, b) => (b.fulfilment === "delivery") - (a.fulfilment === "delivery")),
    [orders]
  );
  const [collapsed, setCollapsed] = useState(false);

  if (due.length === 0) return null;

  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)}
        className="wb-press wb-toast-in"
        style={{ position: "fixed", right: 24, bottom: 24, background: C.navy, color: "#fff",
          border: "none", padding: "12px 18px", borderRadius: 99, fontSize: 13,
          fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
          boxShadow: "0 18px 40px -16px rgba(15,42,59,.4)", zIndex: 55 }}>
        <span style={{ position: "relative", display: "inline-flex" }}>
          <Truck size={15} />
          <span style={{ position: "absolute", top: -4, right: -6, background: C.teal, color: "#fff",
            fontSize: 10, fontWeight: 700, minWidth: 16, height: 16, borderRadius: 99, padding: "0 5px",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: `2px solid ${C.navy}` }}>{due.length}</span>
        </span>
        Due today
      </button>
    );
  }

  return (
    <div className="wb-toast-in"
      style={{ position: "fixed", right: 24, bottom: 24, width: 360, maxWidth: "calc(100vw - 32px)",
        background: "#fff", borderRadius: 16,
        boxShadow: "0 24px 60px -18px rgba(15,42,59,.35)",
        border: `1px solid ${C.border}`, zIndex: 55, overflow: "hidden" }}>

      <div className="flex items-center justify-between" style={{ padding: "14px 18px",
        background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyDeep} 100%)`, color: "#fff" }}>
        <div className="flex items-center gap-2">
          <Bell size={15} color={C.tealMid} />
          <div>
            <p style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1 }}>Due today</p>
            <p style={{ fontSize: 10.5, color: "#9FB5C5", marginTop: 3, fontWeight: 500 }}>
              {due.length} order{due.length === 1 ? "" : "s"} to hand over
            </p>
          </div>
        </div>
        <button onClick={() => setCollapsed(true)} aria-label="Minimise"
          style={{ background: "rgba(255,255,255,.12)", color: "#fff", border: "none",
            width: 28, height: 28, borderRadius: 8, cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ maxHeight: 340, overflowY: "auto" }}>
        {due.map((o) => {
          const delivery = o.fulfilment === "delivery";
          return (
            <div key={o.id} style={{ padding: "12px 18px", borderTop: `1px solid ${C.borderSoft}` }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center rounded-full"
                    style={{ width: 28, height: 28, background: delivery ? C.tealLight : C.bg, color: delivery ? C.tealDark : C.textMute }}>
                    {delivery ? <Truck size={13} /> : <ShoppingBag size={13} />}
                  </div>
                  <p style={{ fontWeight: 600, fontSize: 13.5, color: C.navy }}>{o.customer_name}</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600,
                  color: delivery ? C.tealDark : C.textMute,
                  background: delivery ? C.tealLight : C.bg,
                  padding: "3px 9px", borderRadius: 99 }}>
                  {delivery ? "Delivery" : "Pickup"}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: 11.5, color: C.textFaint, paddingLeft: 36 }}>
                <span style={{ fontWeight: 600, color: C.textMute }}>#{o.order_no}</span>
                {o.phone && <span className="inline-flex items-center gap-1"><Phone size={11} /> {o.phone}</span>}
              </div>
              {delivery && o.address && (
                <div className="flex items-start gap-1" style={{ marginTop: 5, paddingLeft: 36, fontSize: 11.5, color: C.textMute, lineHeight: 1.45 }}>
                  <MapPin size={11} style={{ marginTop: 2, flexShrink: 0, color: C.textFaint }} />
                  <span>{o.address}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={() => { onJump(); setCollapsed(true); }}
        className="wb-press"
        style={{ width: "100%", background: C.tealSoft, color: C.tealDark,
          border: "none", borderTop: `1px solid ${C.borderSoft}`,
          padding: "12px 18px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        Open delivery list <ChevronRight size={13} />
      </button>
    </div>
  );
}

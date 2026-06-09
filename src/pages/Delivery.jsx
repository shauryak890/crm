import React from "react";
import { Package, Download, MapPin, Phone, Calendar } from "lucide-react";
import { C, DISPLAY } from "../theme";
import { Card, PageHead, Btn, Badge } from "../components/ui";

const fmtDate = (s) => s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—";

function Col({ title, items, empty, action }) {
  return (
    <Card pad={false}>
      <div className="flex items-center justify-between" style={{ padding: "18px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
        <h3 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 16, color: C.navy }}>{title} <span style={{ color: C.textMute, fontWeight: 600, fontSize: 13 }}>· {items.length}</span></h3>
        {action}
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, minHeight: 220 }}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center" style={{ padding: "44px 0", color: C.textFaint, gap: 8 }}>
            <Package size={28} />
            <span style={{ fontSize: 13 }}>{empty}</span>
          </div>
        ) : items.map((o) => (
          <div key={o.id} className="rounded-xl" style={{ padding: "14px 16px", background: "#F7FAFB", border: `1px solid ${C.borderSoft}` }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <p style={{ fontWeight: 700, color: C.navy, fontSize: 14 }}>{o.customer_name}</p>
              <Badge tone="info">#{o.order_no}</Badge>
            </div>
            <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: 12, color: C.textMute }}>
              <span className="flex items-center gap-1"><Calendar size={12} /> {fmtDate(o.due_date)}</span>
              {o.phone && <span className="flex items-center gap-1"><Phone size={12} /> {o.phone}</span>}
              <Badge tone={o.delivery_status === "Delivered" ? "success" : "warn"}>{o.delivery_status}</Badge>
            </div>
            {o.address && (
              <div className="flex items-start gap-1" style={{ marginTop: 8, fontSize: 12, color: C.text, lineHeight: 1.4 }}>
                <MapPin size={12} style={{ marginTop: 3, color: C.textFaint, flexShrink: 0 }} />
                <span>{o.address}</span>
              </div>
            )}
          </div>
        ))}
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

export default function Delivery({ orders }) {
  const open = orders.filter((o) => o.delivery_status !== "Delivered");
  const pickups    = open.filter((o) => o.fulfilment !== "delivery").sort(byDue);
  const deliveries = open.filter((o) => o.fulfilment === "delivery").sort(byDue);
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return (
    <div>
      <PageHead title="Delivery List" sub={`Pickups & deliveries · ${today}`} />
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Col title="Pickup at store" items={pickups} empty="No pickups scheduled" />
        <Col title="Home delivery" items={deliveries} empty="No deliveries scheduled"
          action={<Btn variant="navy" icon={Download} small onClick={() => window.print()}>Export List</Btn>} />
      </div>
    </div>
  );
}

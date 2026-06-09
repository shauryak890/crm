import React, { useState } from "react";
import { ScanLine, Shirt } from "lucide-react";
import { C, DISPLAY, KANBAN } from "../theme";
import { Card, PageHead, Badge } from "../components/ui";

export default function OrderStatus({ orders, onStatus }) {
  const [scan, setScan] = useState("");
  const COLS = KANBAN.slice(0, 6);

  const onScan = (e) => {
    if (e.key !== "Enter" || !scan.trim()) return;
    const num = scan.replace(/[^0-9]/g, "");
    const match = orders.find((o) => String(o.order_no) === num);
    if (match) {
      const idx = KANBAN.indexOf(match.order_status);
      const next = KANBAN[Math.min(idx + 1, KANBAN.length - 1)];
      onStatus(match.id, next);
    }
    setScan("");
  };

  return (
    <div>
      <PageHead title="Order Status" sub="Track every garment from intake to dispatch" />
      <Card style={{ marginBottom: 18 }}>
        <div className="flex items-center gap-3">
          <ScanLine size={20} color={C.tealDark} />
          <span style={{ fontWeight: 700, color: C.navy, fontSize: 14 }}>Scan Barcode</span>
          <input value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={onScan}
            placeholder="Scan or type order # then press Enter — advances it one stage…"
            style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 14px", fontSize: 13.5, outline: "none" }} />
        </div>
      </Card>
      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
        {COLS.map((col) => {
          const items = orders.filter((o) => o.order_status === col);
          return (
            <div key={col} style={{ minWidth: 270, flex: "0 0 270px" }}>
              <div className="flex items-center justify-between rounded-xl" style={{ background: C.navy, padding: "12px 14px", marginBottom: 12 }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{col}</span>
                <span className="flex items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,.15)", color: "#fff", fontSize: 12, fontWeight: 800, minWidth: 24, height: 22, padding: "0 7px" }}>{items.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {items.map((o) => (
                  <Card key={o.id} style={{ padding: 14, borderRadius: 14 }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, color: C.navy, fontSize: 13.5 }}>{o.customer_name}</span>
                      <Badge tone="info">#{o.order_no}</Badge>
                    </div>
                    <div className="flex items-center gap-2" style={{ marginBottom: 10, color: C.textMute, fontSize: 12 }}>
                      <Shirt size={14} /> {new Date(o.created_at).toLocaleDateString("en-GB")}
                    </div>
                    <select value={o.order_status} onChange={(e) => onStatus(o.id, e.target.value)}
                      style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", fontSize: 12.5, fontWeight: 700, color: C.tealDark, background: C.tealLight }}>
                      {KANBAN.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </Card>
                ))}
                {items.length === 0 && <div style={{ padding: "26px 0", textAlign: "center", color: C.textFaint, fontSize: 12.5, border: `1.5px dashed ${C.border}`, borderRadius: 12 }}>Empty</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

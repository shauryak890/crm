import React, { useState } from "react";
import { ScanLine, Shirt, Smartphone } from "lucide-react";
import { C, DISPLAY, KANBAN, APP_LIFECYCLE, APP_LIFECYCLE_LABEL } from "../theme";
import { Card, PageHead, Badge } from "../components/ui";

export default function OrderStatus({ orders, onStatus }) {
  const [scan, setScan] = useState("");

  // App orders (channel='app') use the app lifecycle vocabulary so outlet
  // status changes flow live to the customer + driver apps. Walk-in/CRM
  // orders keep the plant Kanban. Split them into two boards.
  const appOrders = orders.filter((o) => o.channel === "app");
  const shopOrders = orders.filter((o) => o.channel !== "app");

  const onScan = (e) => {
    if (e.key !== "Enter" || !scan.trim()) return;
    const num = scan.replace(/[^0-9]/g, "");
    const match = orders.find((o) => String(o.order_no) === num);
    if (match) {
      // Advance one stage along whichever lifecycle this order belongs to.
      const flow = match.channel === "app" ? APP_LIFECYCLE : KANBAN;
      const idx = flow.indexOf(match.order_status);
      const next = idx >= 0 ? flow[Math.min(idx + 1, flow.length - 1)] : flow[0];
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

      {/* App-order board (only when there are app orders) — app lifecycle */}
      {appOrders.length > 0 && (
        <div style={{ marginBottom: 26 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
            <Smartphone size={16} color={C.tealDark} />
            <h3 style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 800, color: C.navy }}>App orders</h3>
            <span style={{ fontSize: 12, color: C.textMute }}>· status here updates the customer & driver apps live</span>
          </div>
          <Board
            cols={APP_LIFECYCLE}
            colLabel={(s) => APP_LIFECYCLE_LABEL[s] || s}
            options={APP_LIFECYCLE}
            optionLabel={(s) => APP_LIFECYCLE_LABEL[s] || s}
            orders={appOrders}
            onStatus={onStatus}
          />
        </div>
      )}

      {/* Walk-in / CRM order board — plant Kanban (unchanged vocabulary) */}
      {appOrders.length > 0 && (
        <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
          <Shirt size={16} color={C.tealDark} />
          <h3 style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 800, color: C.navy }}>Walk-in orders</h3>
        </div>
      )}
      <Board
        cols={KANBAN.slice(0, 6)}
        colLabel={(s) => s}
        options={KANBAN}
        optionLabel={(s) => s}
        orders={shopOrders}
        onStatus={onStatus}
      />
    </div>
  );
}

// A horizontal Kanban board over a given set of columns/options.
function Board({ cols, colLabel, options, optionLabel, orders, onStatus }) {
  return (
    <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
      {cols.map((col) => {
        const items = orders.filter((o) => o.order_status === col);
        return (
          <div key={col} style={{ minWidth: 270, flex: "0 0 270px" }}>
            <div className="flex items-center justify-between rounded-xl" style={{ background: C.navy, padding: "12px 14px", marginBottom: 12 }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{colLabel(col)}</span>
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
                    {options.map((s) => <option key={s} value={s}>{optionLabel(s)}</option>)}
                  </select>
                </Card>
              ))}
              {items.length === 0 && <div style={{ padding: "26px 0", textAlign: "center", color: C.textFaint, fontSize: 12.5, border: `1.5px dashed ${C.border}`, borderRadius: 12 }}>Empty</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

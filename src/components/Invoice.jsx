import React, { useEffect, useState } from "react";
import JsBarcode from "jsbarcode";
import { Printer, X, MessageCircle, Tag as TagIcon, FileText } from "lucide-react";
import { C, DISPLAY, STORE, inr, collected } from "../theme";
import { Logo, Btn, iconBtn } from "./ui";
import * as api from "../lib/api";
import { rollupCustomer } from "../lib/api";

/* Render a Code128 barcode to an offscreen canvas, then drop the PNG
   data-URL into an <img>. SVGs render fine on screen but some browser
   print pipelines drop them; a rasterised image always survives the
   print pass. */
function Barcode({ value, height = 56, width = 1.8, displayValue = true }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!value) { setSrc(""); return; }
    try {
      const canvas = document.createElement("canvas");
      JsBarcode(canvas, String(value), {
        format: "CODE128",
        height,
        width,
        fontSize: 14,
        textMargin: 2,
        margin: 4,
        displayValue,
        background: "#ffffff",
        lineColor: "#000000",
      });
      setSrc(canvas.toDataURL("image/png"));
    } catch (e) { setSrc(""); }
  }, [value, height, width, displayValue]);
  if (!src) return null;
  return <img src={src} alt={String(value)} style={{ display: "block", maxWidth: "100%", imageRendering: "crisp-edges" }} />;
}

const fmtDate  = (s) => s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (s) => s ? new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function Invoice({ order, customers = [], orders = [], onClose, initialMode = "invoice" }) {
  const [mode, setMode] = useState(initialMode); // 'invoice' | 'tags'
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.fetchOrderItemsForOrder(order.id).then((data) => {
      if (alive) { setItems(data); setLoading(false); }
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [order.id]);

  const customer = customers.find((c) => c.id === order.customer_id) || null;
  // Previous outstanding = customer's rest (Total - Paid across ALL their
  // orders) minus this order's contribution if it's unpaid.
  const prevAmount = (() => {
    if (!customer) return 0;
    const others = orders.filter((o) => o.id !== order.id);
    return rollupCustomer(customer, others).rest;
  })();
  const paidNow = collected(order);
  const balance = Number(order.total) - paidNow;

  // One physical tag PER garment, for every item type — so a 10-piece
  // order prints 10 stickers, one to stick on each cloth.
  //   • piece-priced item → `qty` tags.
  //   • kg-priced item    → `qty` tags too (qty = no. of clothes in the
  //     bag), each carrying the bag's total weight so the set is
  //     self-describing.
  const tagUnits = items.flatMap((it) => {
    const count = Math.max(1, Math.floor(Number(it.qty) || 1));
    const isKg = it.unit === "kg";
    const weightLabel = isKg && it.weight_kg != null
      ? `${Number(it.weight_kg).toFixed(2)} kg total`
      : null;
    return Array.from({ length: count }, (_, k) => ({
      key: `${it.id}-${k}`,
      product_name: it.product_name,
      service_type: it.service_type,
      sublabel: weightLabel,
      kg: isKg,
    }));
  });
  const totalTags = tagUnits.length;

  const onPrint = () => window.print();
  const onWhatsApp = () => {
    if (!order.phone) { alert("No phone number on this order."); return; }
    const lines = [
      `*${STORE.name}* — Invoice #${order.order_no}`,
      `Dear ${order.customer_name},`,
      `Your order of ${items.length} item(s) totalling ${inr(order.total)} is recorded.`,
      `Ready by: ${fmtDate(order.due_date)}`,
      `${order.fulfilment === "delivery" ? "We will deliver to: " + (order.address || "") : "Please collect from the store."}`,
      `Payment: ${order.payment_status} · ${order.payment_method}`,
      `Thank you!`,
    ].filter(Boolean).join("\n");
    const num = String(order.phone).replace(/\D/g, "");
    const url = `https://wa.me/${num.length === 10 ? "91" + num : num}?text=${encodeURIComponent(lines)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="wb-invoice-overlay flex items-center justify-center"
      style={{ position: "fixed", inset: 0, background: "rgba(10,34,49,.55)", zIndex: 60, padding: 16, overflowY: "auto" }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="wb-invoice-card"
        style={{ background: "#fff", borderRadius: 18, width: 640, maxWidth: "100%", boxShadow: "0 30px 80px -20px rgba(10,34,49,.5)", display: "flex", flexDirection: "column", maxHeight: "92vh" }}>

        {/* header (hidden when printing) */}
        <div className="wb-no-print flex items-center justify-between" style={{ padding: "14px 18px", borderBottom: `1px solid ${C.borderSoft}` }}>
          <div className="flex items-center gap-2">
            <button onClick={() => setMode("invoice")} style={tabStyle(mode === "invoice")}>
              <FileText size={14} /> Invoice
            </button>
            <button onClick={() => setMode("tags")} style={tabStyle(mode === "tags")}>
              <TagIcon size={14} /> Tags ({totalTags || "…"})
            </button>
          </div>
          <button onClick={onClose} style={iconBtn("#EEF2F5", C.textMute)}><X size={16} /></button>
        </div>

        {/* printable area */}
        <div className="wb-print-area" style={{ padding: 22, overflowY: "auto" }}>
          {mode === "invoice" ? (
            <InvoiceBody order={order} items={items} loading={loading}
              prevAmount={prevAmount} paidNow={paidNow} balance={balance} />
          ) : (
            <TagsBody order={order} units={tagUnits} customer={customer} loading={loading} />
          )}
        </div>

        {/* footer (hidden when printing) */}
        <div className="wb-no-print flex items-center justify-between flex-wrap gap-2" style={{ padding: "12px 18px", borderTop: `1px solid ${C.borderSoft}`, background: "#FAFBFC" }}>
          <span style={{ fontSize: 11.5, color: C.textFaint }}>Tip: use your browser's "Save as PDF" in the print dialog.</span>
          <div className="flex items-center gap-2">
            <Btn variant="outline" small onClick={onClose}>Close</Btn>
            <Btn variant="success" small icon={MessageCircle} onClick={onWhatsApp}>WhatsApp</Btn>
            <Btn variant="primary" small icon={Printer} onClick={onPrint}>Print</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

const tabStyle = (active) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "8px 12px", borderRadius: 10, border: "none", cursor: "pointer",
  background: active ? C.navy : "#EEF2F5", color: active ? "#fff" : C.textMute,
  fontSize: 12.5, fontWeight: 700,
});

/* ---------------- Invoice body ---------------- */
function InvoiceBody({ order, items, loading, prevAmount, paidNow, balance }) {
  return (
    <div style={{ color: "#000" }}>
      <div className="flex flex-col items-center" style={{ marginBottom: 16 }}>
        <div className="flex items-center justify-center rounded-2xl" style={{ background: C.navy, width: 76, height: 76, marginBottom: 8 }}>
          <Logo size={48} />
        </div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 18, color: C.navy }}>{STORE.name}</div>
        <div style={{ fontSize: 11, color: C.textMute, letterSpacing: ".08em", textTransform: "uppercase", marginTop: 2 }}>{STORE.tagline}</div>
      </div>

      <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 22, textAlign: "center", margin: "6px 0 16px" }}>Invoice #{order.order_no}</h2>

      <div style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "10px 0", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
        <div><b>Invoice Date:</b> {fmtDateTime(order.created_at)}</div>
        <div><b>Customer Name:</b> {order.customer_name}</div>
        <div><b>Phone:</b> {order.phone || "—"}</div>
        <div><b>Customer Address:</b> {order.address || "—"}</div>
      </div>

      <div style={{ background: "#F2F6F9", textAlign: "center", padding: "10px 0", borderRadius: 8, fontFamily: DISPLAY, fontWeight: 800, fontSize: 18, color: C.navy, marginBottom: 14 }}>
        {order.fulfilment === "delivery" ? "Home Delivery" : "Store Pickup"}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 14 }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${C.border}` }}>
            <th style={cellH}>#</th>
            <th style={{ ...cellH, textAlign: "left" }}>Product</th>
            <th style={cellH}>Quantity</th>
            <th style={cellH}>Total</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={4} style={{ padding: "20px 0", textAlign: "center", color: C.textFaint }}>Loading…</td></tr>
          ) : items.length === 0 ? (
            <tr><td colSpan={4} style={{ padding: "20px 0", textAlign: "center", color: C.textFaint }}>No items.</td></tr>
          ) : items.map((it, i) => {
            const isKg = it.unit === "kg";
            const qtyLabel = isKg ? `${Number(it.weight_kg).toFixed(2)} kg (${it.qty} pc)` : `${it.qty}`;
            return (
              <tr key={it.id} style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
                <td style={cell}>{i + 1}</td>
                <td style={{ ...cell, textAlign: "left" }}>{it.product_name} <span style={{ color: C.textFaint, fontSize: 11.5 }}>({it.service_type}{it.express ? " · Express" : ""})</span></td>
                <td style={cell}>{qtyLabel}</td>
                <td style={cell}>{inr(it.line_total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 14 }}>
        <tbody>
          <Row label="Payment Status" value={<b>{order.payment_status}</b>} />
          <Row label="Payment Method" value={order.payment_method} />
          {Number(order.discount_pct) > 0 && <Row label={`Discount (${order.discount_pct}%)`} value="" />}
          {Number(order.tax_pct) > 0 && <Row label={`Tax (${order.tax_pct}%)`} value="" />}
          <Row label="Total"   value={<b>{inr(order.total)}</b>} />
          <Row label="Paid"    value={inr(paidNow)} />
          <Row label="Balance" value={<b style={{ color: balance > 0 ? C.red : C.green }}>{inr(balance)}</b>} />
          <Row label="Previous Outstanding" value={inr(prevAmount)} />
        </tbody>
      </table>

      {(order.damage_note || (order.image_urls?.length || 0) > 0) && (
        <div style={{ background: "#FFF7E8", border: `1px solid ${C.amberLt}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: C.amber, fontSize: 12.5, marginBottom: 6 }}>Prior damage / notes</div>
          {order.damage_note && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.text }}>{order.damage_note}</div>}
          {!!(order.image_urls?.length) && (
            <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
              {order.image_urls.map((u, i) => (
                <img key={i} src={u} alt="" style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}` }} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-start justify-between" style={{ marginTop: 10, fontSize: 13 }}>
        <div>
          <div><b>Delivery Date:</b> {fmtDate(order.due_date)}</div>
          <div><b>Pickup Date:</b> {fmtDate(order.created_at)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, color: C.navy }}>{STORE.name}</div>
          {STORE.phone && <div style={{ fontSize: 12, color: C.textMute }}>📞 {STORE.phone}</div>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 14 }}>
        <Barcode value={order.order_no} height={48} />
        <p style={{ fontSize: 14, fontWeight: 700, marginTop: 4, letterSpacing: ".05em" }}>#{order.order_no}</p>
      </div>

      <p style={{ marginTop: 16, padding: "0 14px", color: "#5C6B78", fontSize: 11.5, textAlign: "center", fontStyle: "italic", lineHeight: 1.5 }}>
        "Thank you for trusting us with your laundry. We take pride in our work
        and appreciate the opportunity to serve you. We hope you're satisfied
        with your clean clothes!"
      </p>

      {STORE.address && (
        <p style={{ marginTop: 10, color: "#5C6B78", fontSize: 11, textAlign: "center", letterSpacing: ".05em" }}>
          {STORE.address}
        </p>
      )}
    </div>
  );
}

const cellH = { padding: "6px 4px", fontSize: 12, fontWeight: 800, color: "#000" };
const cell  = { padding: "8px 4px", textAlign: "center" };

function Row({ label, value }) {
  return (
    <tr style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
      <td style={{ padding: "8px 4px" }}>{label}</td>
      <td style={{ padding: "8px 4px", textAlign: "right" }}>{value}</td>
    </tr>
  );
}

/* ---------------- Tag body ---------------- */
function TagsBody({ order, units, customer, loading }) {
  if (loading) return <div style={{ padding: 40, textAlign: "center", color: C.textFaint }}>Loading tags…</div>;
  if (!units.length) return <div style={{ padding: 40, textAlign: "center", color: C.textFaint }}>No items to tag.</div>;
  const total = units.length;
  return (
    <div className="wb-tag-sheet" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
      {units.map((u, i) => (
        <div key={u.key} className="wb-tag"
          style={{ border: "1px solid #000", borderRadius: 6, padding: "10px 12px", textAlign: "center", color: "#000",
            breakInside: "avoid", pageBreakInside: "avoid", display: "flex", flexDirection: "column", gap: 4, background: "#fff" }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Order ID · {order.order_no}</div>
          <div style={{ fontWeight: 700, fontSize: 11.5 }}>
            Customer · ({customer?.code || "CL—"})
          </div>
          <div style={{ fontSize: 10.5 }}>{fmtDate(order.created_at)}</div>
          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>Delivery · {fmtDate(order.due_date)}</div>
          <div style={{ borderTop: "1px solid #000", borderBottom: "1px solid #000", padding: "5px 0", margin: "6px 0", fontWeight: 800, fontSize: 13, textTransform: "uppercase" }}>
            {u.product_name}
          </div>
          {u.sublabel && (
            <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: -2 }}>{u.sublabel}</div>
          )}
          <div style={{ display: "flex", justifyContent: "center", margin: "2px 0" }}>
            <Barcode value={`${order.order_no}-${i + 1}`} height={36} width={1.4} displayValue />
          </div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{i + 1}/{total}</div>
          <div style={{ fontSize: 9.5, color: "#444", letterSpacing: ".06em" }}>{STORE.name.toUpperCase()}</div>
        </div>
      ))}
    </div>
  );
}

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

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Make a Code128 barcode PNG data-URL (no React/DOM needed).
function barcodePng(value, { height = 60, width = 2.4 } = {}) {
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, String(value), {
      format: "CODE128", height, width, fontSize: 14, textMargin: 2,
      margin: 4, displayValue: true, background: "#ffffff", lineColor: "#000000",
    });
    return canvas.toDataURL("image/png");
  } catch { return ""; }
}

// Open a clean popup window with `headHtml` (styles) + `bodyHtml`, wait
// for it to lay out, then print. Printer-independent: A4, PDF and thermal
// rolls all behave the same because the document contains ONLY the tags.
function printDoc({ head = "", body = "", title = "Print" }) {
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) { alert("Please allow pop-ups for this site so tags can print."); return; }
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${head}</head><body>${body}</body></html>`);
  w.document.close();
  // Give the barcode images a moment to decode, then print + close.
  const go = () => { try { w.focus(); w.print(); } catch {} setTimeout(() => { try { w.close(); } catch {} }, 400); };
  if (w.document.readyState === "complete") setTimeout(go, 300);
  else w.onload = () => setTimeout(go, 300);
}

/* Build & print the per-garment sticker tags in a standalone document. */
function printTags({ order, customer, units, size }) {
  if (!units.length) { alert("No items to tag."); return; }
  const total = units.length;
  const thermal = size === "thermal";
  // 50mm thermal label, or 2-up on A4.
  const pageCss = thermal
    ? `@page { size: 50mm auto; margin: 0; }`
    : `@page { size: A4; margin: 8mm; }`;
  const tagW = thermal ? "48mm" : "90mm";
  const fontBase = thermal ? 11 : 11;

  const tagHtml = units.map((u, i) => `
    <div class="tag">
      <div class="big">Order #${esc(order.order_no)}</div>
      <div class="mid">Customer · ${esc(customer?.code || "CL—")}</div>
      <div class="row"><span>In: ${esc(fmtDate(order.created_at))}</span><span>Due: ${esc(fmtDate(order.due_date))}</span></div>
      <div class="name">${esc(u.product_name)}</div>
      ${u.service_type ? `<div class="svc">${esc(u.service_type)}</div>` : ""}
      ${u.sublabel ? `<div class="sub">${esc(u.sublabel)}</div>` : ""}
      <div class="bc"><img src="${barcodePng(`${order.order_no}-${i + 1}`, { height: thermal ? 64 : 40, width: thermal ? 2.4 : 1.6 })}"/></div>
      <div class="count">${i + 1} / ${total}</div>
      <div class="store">${esc(STORE.name.toUpperCase())}</div>
    </div>`).join("");

  const css = `<style>
    ${pageCss}
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #000; }
    .sheet { ${thermal ? "" : "display:flex;flex-wrap:wrap;gap:6mm;"} }
    .tag {
      width: ${tagW}; ${thermal ? "" : "flex:0 0 " + tagW + ";"}
      border: 2px solid #000; border-radius: 6px;
      padding: ${thermal ? "10px 8px" : "8px 10px"};
      text-align: center; background: #fff;
      page-break-inside: avoid; break-inside: avoid;
      ${thermal ? "margin: 0 auto;" : ""}
    }
    ${thermal ? ".tag + .tag { page-break-before: always; break-before: page; }" : ""}
    .big   { font-weight: 800; font-size: ${thermal ? 22 : 14}px; line-height: 1.1; }
    .mid   { font-weight: 700; font-size: ${thermal ? 14 : 11.5}px; margin-top: 3px; }
    .row   { display:flex; justify-content:center; gap:${thermal ? 12 : 6}px; font-size:${fontBase}px; font-weight:600; margin-top:3px; }
    .name  { border-top:2px solid #000; border-bottom:2px solid #000; padding:${thermal ? 7 : 5}px 0; margin:${thermal ? 7 : 5}px 0; font-weight:800; font-size:${thermal ? 22 : 13}px; text-transform:uppercase; line-height:1.15; }
    .svc   { font-weight:700; font-size:${thermal ? 13 : 10.5}px; margin:2px 0; line-height:1.2; }
    .sub   { font-weight:700; font-size:${thermal ? 15 : 11.5}px; margin:-2px 0 4px; }
    .bc    { display:flex; justify-content:center; margin:${thermal ? 4 : 2}px 0; }
    .bc img{ max-width:100%; image-rendering: crisp-edges; }
    .count { font-weight:800; font-size:${thermal ? 24 : 14}px; }
    .store { font-size:${thermal ? 11 : 9}px; letter-spacing:.08em; font-weight:700; }
  </style>`;

  printDoc({ head: css, body: `<div class="sheet">${tagHtml}</div>`, title: `Tags · #${order.order_no}` });
}

export default function Invoice({ order, customers = [], orders = [], onClose, initialMode = "invoice" }) {
  const [mode, setMode] = useState(initialMode); // 'invoice' | 'tags'
  const [tagSize, setTagSize] = useState("thermal"); // 'thermal' | 'sheet'
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

  const onPrint = () => {
    if (mode === "tags") { printTags({ order, customer, units: tagUnits, size: tagSize }); return; }
    // Invoice: clone the rendered invoice body into a clean A4 popup.
    const area = document.querySelector(".wb-print-area");
    if (!area) return;
    const css = `<style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #111; }
      img { max-width: 100%; }
      table { width: 100%; border-collapse: collapse; }
    </style>`;
    printDoc({ head: css, body: `<div style="max-width:640px;margin:0 auto;">${area.innerHTML}</div>`, title: `Invoice · #${order.order_no}` });
  };
  const onWhatsApp = () => {
    if (!order.phone) { alert("No phone number on this order."); return; }

    // Itemised breakdown — one line per garment with qty/weight & amount.
    const itemLines = items.map((it, i) => {
      const qtyLabel = it.unit === "kg"
        ? `${Number(it.weight_kg).toFixed(2)}kg`
        : `x${it.qty}`;
      const svc = it.service_type ? ` (${it.service_type}${it.express ? " · Express" : ""})` : "";
      return `${i + 1}. ${it.product_name}${svc} — ${qtyLabel} = ${inr(it.line_total)}`;
    });

    const disc = Number(order.discount_pct) || 0;
    const tax = Number(order.tax_pct) || 0;
    const grossSub = items.reduce((a, it) => a + Number(it.line_total || 0), 0);
    const subDiscount = Number(order.subscription_discount) || 0;
    const sub = Number(order.subtotal) || grossSub;
    const bal = Math.max(0, Number(order.total || 0) - collected(order));
    const totalPieces = items.reduce((a, it) => a + Number(it.qty || 0), 0);

    const lines = [
      `*${STORE.name}*`,
      `Invoice *#${order.order_no}*`,
      `Dear ${order.customer_name},`,
      ``,
      `*Your order:*`,
      ...itemLines,
      `--------------------`,
      `Total items: ${totalPieces} pc${totalPieces === 1 ? "" : "s"}`,
      subDiscount > 0 ? `Item total: ${inr(grossSub)}` : null,
      subDiscount > 0 ? `Subscription discount: -${inr(subDiscount)}` : null,
      `Subtotal: ${inr(sub)}`,
      disc > 0 ? `Discount (${disc}%): -${inr(Math.round(sub * disc / 100))}` : null,
      tax > 0 ? `Tax (${tax}%): +${inr(Math.round(sub * tax / 100))}` : null,
      `*Total: ${inr(order.total)}*`,
      order.payment_status !== "Paid" && bal > 0 ? `Balance due: ${inr(bal)}` : null,
      `Payment: ${order.payment_status} · ${order.payment_method}`,
      ``,
      `Ready by: ${fmtDate(order.due_date)}`,
      order.fulfilment === "delivery"
        ? `We'll deliver to: ${order.address || "your address"}`
        : `Please collect from the store.`,
      ``,
      `Thank you for choosing ${STORE.name}!`,
    ].filter((l) => l !== null && l !== undefined).join("\n");

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
        <div className="wb-no-print flex items-center justify-between flex-wrap gap-2" style={{ padding: "14px 18px", borderBottom: `1px solid ${C.borderSoft}` }}>
          <div className="flex items-center gap-2">
            <button onClick={() => setMode("invoice")} style={tabStyle(mode === "invoice")}>
              <FileText size={14} /> Invoice
            </button>
            <button onClick={() => setMode("tags")} style={tabStyle(mode === "tags")}>
              <TagIcon size={14} /> Tags ({totalTags || "…"})
            </button>
          </div>
          <div className="flex items-center gap-2">
            {mode === "tags" && (
              <div className="flex items-center" style={{ background: "#EEF2F5", borderRadius: 9, padding: 3 }}>
                <button onClick={() => setTagSize("thermal")} style={segStyle(tagSize === "thermal")}>Sticker roll</button>
                <button onClick={() => setTagSize("sheet")} style={segStyle(tagSize === "sheet")}>A4 sheet</button>
              </div>
            )}
            <button onClick={onClose} style={iconBtn("#EEF2F5", C.textMute)}><X size={16} /></button>
          </div>
        </div>

        {/* printable area */}
        <div className="wb-print-area" style={{ padding: 22, overflowY: "auto" }}>
          {mode === "invoice" ? (
            <InvoiceBody order={order} items={items} loading={loading}
              prevAmount={prevAmount} paidNow={paidNow} balance={balance} />
          ) : (
            <TagsBody order={order} units={tagUnits} customer={customer} loading={loading} size={tagSize} />
          )}
        </div>

        {/* footer (hidden when printing) */}
        <div className="wb-no-print flex items-center justify-between flex-wrap gap-2" style={{ padding: "12px 18px", borderTop: `1px solid ${C.borderSoft}`, background: "#FAFBFC" }}>
          <span style={{ fontSize: 11.5, color: C.textFaint }}>Print opens a clean window — allow pop-ups. "Sticker roll" = thermal labels, "A4 sheet" = a full page.</span>
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

const segStyle = (active) => ({
  border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: 7,
  fontSize: 12, fontWeight: 700,
  background: active ? "#fff" : "transparent",
  color: active ? C.navy : C.textMute,
  boxShadow: active ? "0 1px 2px rgba(15,42,59,.12)" : "none",
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
function TagsBody({ order, units, customer, loading, size = "thermal" }) {
  if (loading) return <div style={{ padding: 40, textAlign: "center", color: C.textFaint }}>Loading tags…</div>;
  if (!units.length) return <div style={{ padding: 40, textAlign: "center", color: C.textFaint }}>No items to tag.</div>;
  const total = units.length;
  const thermal = size === "thermal";

  // Thermal = one big tag per sticker, stacked. Sheet = 2-up A4 grid.
  const wrapStyle = thermal
    ? { display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }
    : { display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 };

  return (
    <div className={`wb-tag-sheet ${thermal ? "wb-tag-thermal" : "wb-tag-grid"}`} style={wrapStyle}>
      {units.map((u, i) => (
        <div key={u.key} className="wb-tag"
          style={{
            border: "2px solid #000", borderRadius: 8, color: "#000", background: "#fff",
            breakInside: "avoid", pageBreakInside: "avoid",
            display: "flex", flexDirection: "column", textAlign: "center",
            padding: thermal ? "14px 12px" : "10px 12px",
            gap: thermal ? 6 : 4,
            width: thermal ? "min(100%, 320px)" : "auto",
          }}>
          <div style={{ fontWeight: 800, fontSize: thermal ? 22 : 14, lineHeight: 1.1 }}>
            Order #{order.order_no}
          </div>
          <div style={{ fontWeight: 700, fontSize: thermal ? 15 : 11.5 }}>
            Customer · {customer?.code || "CL—"}
          </div>
          <div className="flex items-center justify-center" style={{ gap: thermal ? 14 : 6, fontSize: thermal ? 13 : 10.5, fontWeight: 600 }}>
            <span>In: {fmtDate(order.created_at)}</span>
            <span>Due: {fmtDate(order.due_date)}</span>
          </div>
          <div style={{
            borderTop: "2px solid #000", borderBottom: "2px solid #000",
            padding: thermal ? "8px 0" : "5px 0", margin: thermal ? "8px 0" : "6px 0",
            fontWeight: 800, fontSize: thermal ? 24 : 13, textTransform: "uppercase", lineHeight: 1.15,
          }}>
            {u.product_name}
          </div>
          {u.sublabel && (
            <div style={{ fontSize: thermal ? 16 : 11.5, fontWeight: 700, marginTop: -2 }}>{u.sublabel}</div>
          )}
          <div style={{ display: "flex", justifyContent: "center", margin: thermal ? "6px 0 2px" : "2px 0" }}>
            <Barcode
              value={`${order.order_no}-${i + 1}`}
              height={thermal ? 70 : 36}
              width={thermal ? 2.6 : 1.4}
              displayValue
            />
          </div>
          <div style={{ fontWeight: 800, fontSize: thermal ? 26 : 14 }}>{i + 1} / {total}</div>
          <div style={{ fontSize: thermal ? 12 : 9.5, color: "#000", letterSpacing: ".08em", fontWeight: 700 }}>{STORE.name.toUpperCase()}</div>
        </div>
      ))}
    </div>
  );
}

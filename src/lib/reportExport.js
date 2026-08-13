import { STORE, collected, inr } from "../theme";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtDate = (s) => s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (s) => s ? new Date(s).toLocaleDateString("en-GB") : "—";
const fmtWhen = (s) => s ? new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// Inclusive [from, to] filter on a date string / timestamptz column.
function inRange(iso, from, to) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= new Date(from + "T00:00:00").getTime() && t <= new Date(to + "T23:59:59").getTime();
}

// Shape the raw orders/expenses into everything a report needs: filtered
// rows, grand totals, and (for HQ) a per-outlet breakdown. Both the PDF
// and Excel exporters consume this same shape so the two outputs never
// drift apart.
export function buildReportData({ orders, expenses, outlets = [], from, to, isSuperAdmin }) {
  const outletName = (id) => outlets.find((o) => o.id === id)?.name || "—";

  const salesRows = orders
    .filter((o) => inRange(o.created_at, from, to))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((o) => ({
      date: fmtDateTime(o.created_at),
      order_no: o.order_no,
      outlet: isSuperAdmin ? outletName(o.outlet_id) : undefined,
      customer: o.customer_name || "—",
      items: o.pieces != null ? `${o.pieces} pcs` : "—",
      payment_status: o.payment_status,
      payment_method: o.payment_method,
      total: Number(o.total) || 0,
      collected: collected(o),
      paid_at: fmtWhen(o.paid_at),
      delivered_at: fmtWhen(o.delivered_at),
    }));

  const expenseRows = expenses
    .filter((e) => inRange(e.spent_on, from, to))
    .sort((a, b) => new Date(a.spent_on) - new Date(b.spent_on))
    .map((e) => ({
      date: fmtDate(e.spent_on),
      title: e.title,
      outlet: isSuperAdmin ? outletName(e.outlet_id) : undefined,
      category: e.category,
      amount: Number(e.amount) || 0,
    }));

  const totalSales = salesRows.reduce((a, r) => a + r.collected, 0);
  const totalExpenses = expenseRows.reduce((a, r) => a + r.amount, 0);

  let byOutlet = null;
  if (isSuperAdmin) {
    const m = {};
    for (const r of salesRows) {
      m[r.outlet] = m[r.outlet] || { outlet: r.outlet, sales: 0, expenses: 0, orders: 0 };
      m[r.outlet].sales += r.collected;
      m[r.outlet].orders += 1;
    }
    for (const r of expenseRows) {
      m[r.outlet] = m[r.outlet] || { outlet: r.outlet, sales: 0, expenses: 0, orders: 0 };
      m[r.outlet].expenses += r.amount;
    }
    byOutlet = Object.values(m).sort((a, b) => b.sales - a.sales);
  }

  return {
    from, to, isSuperAdmin,
    salesRows, expenseRows, byOutlet,
    summary: {
      totalSales, totalExpenses,
      netProfit: totalSales - totalExpenses,
      orderCount: salesRows.length,
    },
  };
}

/* ── PDF (browser print → Save as PDF), matches the invoice popup pattern ── */
function printDoc({ head = "", body = "", title = "Report" }) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) { alert("Please allow pop-ups for this site so the report can print."); return; }
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${head}</head><body>${body}</body></html>`);
  w.document.close();
  const go = () => { try { w.focus(); w.print(); } catch {} };
  if (w.document.readyState === "complete") setTimeout(go, 250);
  else w.onload = () => setTimeout(go, 250);
}

export function downloadReportPdf(data) {
  const { from, to, summary, salesRows, expenseRows, byOutlet, isSuperAdmin } = data;

  const css = `<style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #163A52; margin: 0; padding: 28px 34px; }
    h1 { font-size: 20px; margin: 0 0 2px; }
    .sub { color: #6B8294; font-size: 12px; margin-bottom: 18px; }
    .summary { display: flex; gap: 12px; margin-bottom: 22px; }
    .stat { flex: 1; border: 1px solid #E3EAEE; border-radius: 10px; padding: 12px 14px; }
    .stat .lbl { font-size: 10.5px; color: #6B8294; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
    .stat .val { font-size: 18px; font-weight: 800; margin-top: 4px; }
    .green { color: #1FA971; } .red { color: #E0484D; } .navy { color: #163A52; }
    h2 { font-size: 14px; margin: 22px 0 10px; border-bottom: 2px solid #163A52; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { text-align: left; background: #F2F6F8; color: #6B8294; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; font-size: 9.5px; padding: 7px 8px; border-bottom: 1px solid #E3EAEE; }
    td { padding: 6px 8px; border-bottom: 1px solid #EEF2F5; }
    tr:nth-child(even) td { background: #FAFCFD; }
    .r { text-align: right; }
    .foot { margin-top: 30px; text-align: center; color: #A9BBC7; font-size: 10px; }
    @page { size: A4; margin: 14mm; }
  </style>`;

  const summaryHtml = `
    <div class="summary">
      <div class="stat"><div class="lbl">Total Sales</div><div class="val green">${inr(summary.totalSales)}</div></div>
      <div class="stat"><div class="lbl">Total Expenses</div><div class="val red">${inr(summary.totalExpenses)}</div></div>
      <div class="stat"><div class="lbl">Net Profit</div><div class="val ${summary.netProfit >= 0 ? "green" : "red"}">${inr(summary.netProfit)}</div></div>
      <div class="stat"><div class="lbl">Orders</div><div class="val navy">${summary.orderCount}</div></div>
    </div>`;

  const outletHtml = isSuperAdmin && byOutlet?.length ? `
    <h2>By Outlet</h2>
    <table>
      <thead><tr><th>Outlet</th><th class="r">Orders</th><th class="r">Sales</th><th class="r">Expenses</th><th class="r">Net</th></tr></thead>
      <tbody>${byOutlet.map((o) => `
        <tr><td>${esc(o.outlet)}</td><td class="r">${o.orders}</td><td class="r">${inr(o.sales)}</td><td class="r">${inr(o.expenses)}</td><td class="r">${inr(o.sales - o.expenses)}</td></tr>
      `).join("")}</tbody>
    </table>` : "";

  const salesHtml = `
    <h2>Sales (${salesRows.length})</h2>
    <table>
      <thead><tr>
        <th>Date</th><th>Order #</th>${isSuperAdmin ? "<th>Outlet</th>" : ""}<th>Customer</th><th>Items</th><th>Payment</th><th class="r">Total</th><th class="r">Collected</th><th>Paid At</th><th>Delivered At</th>
      </tr></thead>
      <tbody>${salesRows.length ? salesRows.map((r) => `
        <tr>
          <td>${esc(r.date)}</td><td>#${r.order_no}</td>${isSuperAdmin ? `<td>${esc(r.outlet)}</td>` : ""}
          <td>${esc(r.customer)}</td><td>${esc(r.items)}</td><td>${esc(r.payment_status)} · ${esc(r.payment_method)}</td>
          <td class="r">${inr(r.total)}</td><td class="r">${inr(r.collected)}</td><td>${esc(r.paid_at)}</td><td>${esc(r.delivered_at)}</td>
        </tr>
      `).join("") : `<tr><td colspan="${isSuperAdmin ? 10 : 9}" style="text-align:center;color:#A9BBC7;padding:16px;">No sales in this range.</td></tr>`}</tbody>
    </table>`;

  const expenseHtml = `
    <h2>Expenses (${expenseRows.length})</h2>
    <table>
      <thead><tr><th>Date</th><th>Title</th>${isSuperAdmin ? "<th>Outlet</th>" : ""}<th>Category</th><th class="r">Amount</th></tr></thead>
      <tbody>${expenseRows.length ? expenseRows.map((r) => `
        <tr><td>${esc(r.date)}</td><td>${esc(r.title)}</td>${isSuperAdmin ? `<td>${esc(r.outlet)}</td>` : ""}<td>${esc(r.category)}</td><td class="r">${inr(r.amount)}</td></tr>
      `).join("") : `<tr><td colspan="${isSuperAdmin ? 5 : 4}" style="text-align:center;color:#A9BBC7;padding:16px;">No expenses in this range.</td></tr>`}</tbody>
    </table>`;

  const body = `
    <h1>${esc(STORE.name)} — Sales &amp; Expense Report</h1>
    <div class="sub">${esc(fmtDate(from))} – ${esc(fmtDate(to))} · generated ${esc(new Date().toLocaleString("en-GB"))}</div>
    ${summaryHtml}
    ${outletHtml}
    ${salesHtml}
    ${expenseHtml}
    <div class="foot">${esc(STORE.name)} · confidential internal report</div>
  `;

  printDoc({ head: css, body, title: `Report ${from} to ${to}` });
}

/* ── Excel-compatible export (.csv) — no external dependency.
   CSV can't hold multiple sheets, so Summary / By Outlet / Sales /
   Expenses are stacked as labeled sections in one file; Excel opens
   this natively with each section still readable as its own table. ── */
const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvRow = (cells) => cells.map(csvCell).join(",");

export function downloadReportExcel(data) {
  const { from, to, summary, salesRows, expenseRows, byOutlet, isSuperAdmin } = data;
  const lines = [];

  lines.push(csvRow([`${STORE.name} — Sales & Expense Report`]));
  lines.push(csvRow([`${from} to ${to}`]));
  lines.push("");
  lines.push(csvRow(["Total Sales", summary.totalSales]));
  lines.push(csvRow(["Total Expenses", summary.totalExpenses]));
  lines.push(csvRow(["Net Profit", summary.netProfit]));
  lines.push(csvRow(["Orders", summary.orderCount]));

  if (isSuperAdmin && byOutlet?.length) {
    lines.push("");
    lines.push(csvRow(["By Outlet"]));
    lines.push(csvRow(["Outlet", "Orders", "Sales", "Expenses", "Net"]));
    byOutlet.forEach((o) => lines.push(csvRow([o.outlet, o.orders, o.sales, o.expenses, o.sales - o.expenses])));
  }

  const salesHeader = isSuperAdmin
    ? ["Date", "Order #", "Outlet", "Customer", "Items", "Payment Status", "Payment Method", "Total", "Collected", "Paid At", "Delivered At"]
    : ["Date", "Order #", "Customer", "Items", "Payment Status", "Payment Method", "Total", "Collected", "Paid At", "Delivered At"];
  lines.push("");
  lines.push(csvRow(["Sales"]));
  lines.push(csvRow(salesHeader));
  salesRows.forEach((r) => lines.push(csvRow(isSuperAdmin
    ? [r.date, r.order_no, r.outlet, r.customer, r.items, r.payment_status, r.payment_method, r.total, r.collected, r.paid_at, r.delivered_at]
    : [r.date, r.order_no, r.customer, r.items, r.payment_status, r.payment_method, r.total, r.collected, r.paid_at, r.delivered_at])));

  const expHeader = isSuperAdmin ? ["Date", "Title", "Outlet", "Category", "Amount"] : ["Date", "Title", "Category", "Amount"];
  lines.push("");
  lines.push(csvRow(["Expenses"]));
  lines.push(csvRow(expHeader));
  expenseRows.forEach((r) => lines.push(csvRow(isSuperAdmin
    ? [r.date, r.title, r.outlet, r.category, r.amount]
    : [r.date, r.title, r.category, r.amount])));

  // Prefix a UTF-8 BOM so Excel renders the ₹/— characters correctly
  // instead of mojibake.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `WB-Report_${from}_to_${to}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

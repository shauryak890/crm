import { C, collected, revenueDate } from "../theme";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/* ── Money in / money out ─────────────────────────────────────────────
   Every revenue and cost figure in the app (Dashboard, Reports, HQ) is
   built from these two event lists, so they can't drift apart.

   Money in:
     • order payments — collected(o), dated by revenueDate(o): the day it
       was fully paid, else the day it was billed (advances / legacy rows)
     • subscription plan sales — price_paid on the day the plan was sold
   Money out:
     • expenses — on spent_on
     • supply orders HQ has delivered (status 'received') — their total */
export function revenueEvents(orders = [], subscriptions = []) {
  const out = [];
  for (const o of orders) {
    const amount = collected(o);
    if (amount > 0) out.push({ date: revenueDate(o), amount, method: o.payment_method || "—", outlet_id: o.outlet_id, kind: "order" });
  }
  for (const s of subscriptions) {
    if (s.status === "cancelled") continue;
    const amount = Number(s.price_paid) || 0;
    if (amount > 0) out.push({ date: s.purchased_at || s.created_at, amount, method: "Plan sales", outlet_id: s.outlet_id, kind: "subscription" });
  }
  return out;
}

export function costEvents(expenses = [], supplyOrders = []) {
  const out = expenses.map((e) => ({ date: e.spent_on, amount: Number(e.amount) || 0, outlet_id: e.outlet_id, kind: "expense" }));
  for (const s of supplyOrders) {
    if (s.status !== "received") continue;
    out.push({ date: s.received_at || s.updated_at || s.created_at, amount: Number(s.total) || 0, outlet_id: s.outlet_id, kind: "supplies" });
  }
  return out;
}

export const sumEvents = (events, pred = () => true) =>
  events.reduce((a, e) => (pred(new Date(e.date)) ? a + e.amount : a), 0);

export function paymentTotals(revenue) {
  const t = { UPI: 0, Cash: 0, Card: 0, Cheque: 0, Other: 0, "Plan sales": 0, Total: 0 };
  for (const e of revenue) {
    const k = e.method in t ? e.method : "Other";
    t[k] += e.amount;
    t.Total += e.amount;
  }
  return t;
}

export function buildYearData(revenue, costs, year = new Date().getFullYear()) {
  const rows = MONTHS.map((m) => ({ m, sales: 0, exp: 0 }));
  revenue.forEach((e) => {
    const d = new Date(e.date);
    if (d.getFullYear() === year) rows[d.getMonth()].sales += e.amount;
  });
  costs.forEach((e) => {
    const d = new Date(e.date);
    if (d.getFullYear() === year) rows[d.getMonth()].exp += e.amount;
  });
  rows.forEach((r) => { r.sales = Math.round(r.sales); r.exp = Math.round(r.exp); });
  return rows;
}

// Day-by-day rows for one calendar month (the Reports "Monthly" view).
export function buildMonthData(revenue, costs, ref = new Date()) {
  const y = ref.getFullYear(), m = ref.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const rows = Array.from({ length: days }, (_, i) => ({ m: String(i + 1), sales: 0, exp: 0 }));
  const inMonth = (d) => d.getFullYear() === y && d.getMonth() === m;
  revenue.forEach((e) => { const d = new Date(e.date); if (inMonth(d)) rows[d.getDate() - 1].sales += e.amount; });
  costs.forEach((e) => { const d = new Date(e.date); if (inMonth(d)) rows[d.getDate() - 1].exp += e.amount; });
  rows.forEach((r) => { r.sales = Math.round(r.sales); r.exp = Math.round(r.exp); });
  return rows;
}

const PIE_COLORS = [C.teal, C.navy, C.tealMid, C.amber, C.green, "#6B8294", "#A9BBC7", "#8FA6B4", "#C7D4DD", "#DBE4EA"];

// Most-requested services by number of garments. Pass `excludeOrderIds`
// (cancelled orders) so voided work doesn't count.
export function topServices(orderItems, excludeOrderIds) {
  const counts = {};
  orderItems.forEach((i) => {
    if (excludeOrderIds && excludeOrderIds.has(i.order_id)) return;
    counts[i.product_name] = (counts[i.product_name] || 0) + Number(i.qty || 1);
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value], i) => ({ name, value, color: PIE_COLORS[i % PIE_COLORS.length] }));
}

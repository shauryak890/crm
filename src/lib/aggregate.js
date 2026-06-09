import { C, collected } from "../theme";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export function paymentTotals(orders) {
  // Count money actually collected (full or partial) against the method
  // it was collected through.
  const sum = (m) =>
    orders
      .filter((o) => o.payment_method === m)
      .reduce((a, o) => a + collected(o), 0);
  return {
    Cash: sum("Cash"),
    Cheque: sum("Cheque"),
    Card: sum("Card"),
    UPI: sum("UPI"),
    Total: orders.reduce((a, o) => a + collected(o), 0),
  };
}

export function buildYearData(orders, expenses, year = new Date().getFullYear()) {
  const rows = MONTHS.map((m) => ({ m, sales: 0, exp: 0 }));
  orders.forEach((o) => {
    const d = new Date(o.created_at);
    if (d.getFullYear() === year) rows[d.getMonth()].sales += collected(o);
  });
  expenses.forEach((e) => {
    const d = new Date(e.spent_on);
    if (d.getFullYear() === year) rows[d.getMonth()].exp += Number(e.amount);
  });
  return rows;
}

const PIE_COLORS = [C.teal, C.navy, C.tealMid, C.amber, C.green, "#6B8294", "#A9BBC7", "#8FA6B4", "#C7D4DD", "#DBE4EA"];

export function topServices(orderItems) {
  const counts = {};
  orderItems.forEach((i) => { counts[i.product_name] = (counts[i.product_name] || 0) + Number(i.qty || 1); });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value], i) => ({ name, value, color: PIE_COLORS[i % PIE_COLORS.length] }));
}

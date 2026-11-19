// Questions that aren't about a price: today's numbers, a customer by
// name, the outlet's address, "show me the whole list", and offers that
// change a quote's total. Each helper looks at the raw message and either
// returns an answer or null (so the price engine carries on).

const lc = (s) => String(s || "").toLowerCase();
const cancelled = (o) => lc(o.order_status) === "cancelled";
const delivered = (o) => lc(o.order_status) === "delivered" || o.delivery_status === "Delivered";
const paid = (o) => (cancelled(o) ? 0 : o.payment_status === "Paid" ? Number(o.total || 0) : Number(o.amount_paid || 0));
const balance = (o) => (cancelled(o) ? 0 : Math.max(0, Number(o.total || 0) - paid(o)));
const dayOf = (v) => {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* ── Offers that change the total ─────────────────────────────────── */

const OFFERS = [
  { re: /\b(new customer|naya customer|naye customer|first order|pehla order|pahla order|first time|new cust)\b/i, pct: 25, label: "First-order offer" },
  { re: /\b(birthday|bday|b'day|janamdin|janmdin)\b/i, pct: 15, label: "Birthday offer" },
  { re: /\b(anniversary|salgirah|saalgirah)\b/i, pct: 10, label: "Anniversary offer" },
];

// "new customer 2 saree heavy" → quote for 2 heavy sarees with 25% off.
export function stripOffer(raw) {
  for (const o of OFFERS) {
    if (o.re.test(raw)) {
      return { text: raw.replace(o.re, " ").replace(/\b(ke liye|ka|ki|ke|for|with|offer|discount|wala|wali)\b/gi, " ").replace(/\s+/g, " ").trim(), offer: { pct: o.pct, label: o.label } };
    }
  }
  return { text: raw, offer: null };
}

/* ── "Show me all of them" ────────────────────────────────────────── */

const LIST_RE = /\b(all|sab|sabhi|saare|sare|list|rate ?card|rate ?list|price ?list)\b/i;
export function wantsList(raw) {
  if (!LIST_RE.test(raw)) return null;
  return raw.replace(/\b(all|sab|sabhi|saare|sare|list|rate ?card|rate ?list|price ?list|items?|rates?|prices?|dikhao|dikha do|batao|show|me|ke|ka|ki)\b/gi, " ").replace(/\s+/g, " ").trim();
}

/* ── Today's numbers ──────────────────────────────────────────────── */

const DAY = "(aaj|aj|today|todays|today's)";
const SALE = "(sale|sales|order|orders|collection|bikri|business|billing|bill|kamai|hisab|hisaab|total|kitna hua|kitne aaye|report|summary)";
const RE_SUMMARY = new RegExp(`\\b${DAY}\\b.*\\b${SALE}\\b|\\b${SALE}\\b.*\\b${DAY}\\b|\\b(daily report|day summary|din ka hisab)\\b`, "i");
const RE_DUE = /\b(due today|today'?s? deliver(y|ies)|aaj (ki|ka|ke) deliver(y|ies)|aaj dena|aaj kya dena|aaj ka due|aaj due|deliver today|today due|aaj kitne dene)\b/i;
const RE_OVERDUE = /\b(overdue|over due|late orders?|pending orders?|pending deliver(y|ies)|pending kitne|der se|delay(ed)? orders?|purane orders?|not delivered)\b/i;
const RE_UNPAID = /\b(unpaid|un paid|outstanding|baki (kitna|paisa|payment|list)|baaki (kitna|paisa|payment|list)|kitna baki|kitna baaki|udhar (kitna|list)|udhaar (kitna|list)|paisa (lena|baki)|payment pending|pending payment|dues|kis(ka|ki|ke) baki)\b/i;

export function dataIntent(raw, ctx) {
  const orders = ctx.orders || [];
  const today = ctx.today || dayOf(new Date());
  const live = orders.filter((o) => !cancelled(o));
  const open = live.filter((o) => !delivered(o));
  const statusLabel = (st) => String(st || "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const brief = (o) => ({ id: o.id, label: o.order_label || String(o.order_no ?? ""), name: o.customer_name || "", due: o.due_date, total: Number(o.total || 0), balance: balance(o), status: statusLabel(o.order_status) });

  if (RE_DUE.test(raw)) {
    const list = open.filter((o) => o.due_date === today);
    return { type: "stats", kind: "due", title: "Due today", count: list.length, toCollect: list.reduce((a, o) => a + balance(o), 0), orders: list.slice(0, 8).map(brief), go: "delivery" };
  }
  if (RE_OVERDUE.test(raw)) {
    const list = open.filter((o) => o.due_date && o.due_date < today).sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
    return { type: "stats", kind: "overdue", title: "Overdue (not handed over yet)", count: list.length, toCollect: list.reduce((a, o) => a + balance(o), 0), orders: list.slice(0, 8).map(brief), go: "delivery" };
  }
  if (RE_UNPAID.test(raw)) {
    const list = live.filter((o) => balance(o) > 0).sort((a, b) => balance(b) - balance(a));
    return { type: "stats", kind: "unpaid", title: "Money still to collect", count: list.length, toCollect: list.reduce((a, o) => a + balance(o), 0), orders: list.slice(0, 8).map(brief), go: "sales" };
  }
  if (RE_SUMMARY.test(raw)) {
    const billed = live.filter((o) => dayOf(o.created_at) === today);
    const collectedToday = live.filter((o) => dayOf(o.payment_status === "Paid" && o.paid_at ? o.paid_at : o.created_at) === today).reduce((a, o) => a + paid(o), 0);
    const dueToday = open.filter((o) => o.due_date === today);
    const overdue = open.filter((o) => o.due_date && o.due_date < today);
    return {
      type: "stats", kind: "summary", title: "Today so far", go: "dashboard",
      tiles: [
        { k: "Bills made", v: String(billed.length), sub: `₹${billed.reduce((a, o) => a + Number(o.total || 0), 0).toLocaleString("en-IN")} billed` },
        { k: "Collected", v: `₹${Math.round(collectedToday).toLocaleString("en-IN")}`, sub: "on orders (plan sales not included)" },
        { k: "Due today", v: String(dueToday.length), sub: `₹${dueToday.reduce((a, o) => a + balance(o), 0).toLocaleString("en-IN")} to collect` },
        { k: "Overdue", v: String(overdue.length), sub: "not handed over yet" },
      ],
    };
  }
  return null;
}

/* ── The outlet's own details ─────────────────────────────────────── */

const RE_OUTLET = /\b(address|adress|pata kya|shop ka pata|outlet ka pata|location|kahan hai shop|shop kahan|shop number|outlet number|contact number|phone number|dukan ka number|shop ka number|outlet phone|outlet address)\b/i;
export function outletIntent(raw, ctx) {
  if (!RE_OUTLET.test(raw)) return null;
  // HQ isn't tied to one outlet: show them all.
  const list = ctx.outlet ? [ctx.outlet] : (ctx.allOutlets || []);
  if (!list.length) return null;
  return { type: "outlet", outlet: list[0], outlets: list };
}

/* ── A customer by name ───────────────────────────────────────────── */

// "rahul ka order", "priya singh ka balance", "customer amit"
const RE_NAME = /^\s*(?:customer\s+)?([a-z][a-z .]{2,40}?)\s+(?:ka|ki|ke|ke liye)?\s*(?:order|orders|bill|bills|balance|baki|baaki|status|hisab|hisaab|due|payment|kapde)\b/i;
const RE_NAME2 = /^\s*customer\s+([a-z][a-z .]{2,40})\s*$/i;
export function customerByName(raw, ctx) {
  const m = raw.match(RE_NAME) || raw.match(RE_NAME2);
  if (!m) return null;
  const name = lc(m[1]).replace(/\b(ji|sir|madam|mam|mr|mrs|ms)\b/g, " ").replace(/\s+/g, " ").trim();
  if (name.length < 3) return null;
  const orders = (ctx.orders || []).filter((o) => lc(o.customer_name).includes(name));
  if (!orders.length) return null;
  const byPhone = new Map();
  for (const o of orders) {
    const ph = String(o.phone || "").replace(/\D/g, "").slice(-10) || "—";
    const g = byPhone.get(ph) || { phone: ph, name: o.customer_name, orders: [] };
    g.orders.push(o);
    byPhone.set(ph, g);
  }
  const people = [...byPhone.values()].map((g) => ({ ...g, orders: g.orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), due: g.orders.reduce((a, o) => a + balance(o), 0) }));
  if (people.length === 1) return { type: "customer", phone: people[0].phone, orders: people[0].orders };
  people.sort((a, b) => new Date(b.orders[0].created_at) - new Date(a.orders[0].created_at));
  return { type: "customers", name: m[1].trim(), people: people.slice(0, 6).map((g) => ({ name: g.name, phone: g.phone, count: g.orders.length, due: g.due })) };
}

// Questions that aren't about a price: today's numbers, a customer by
// name, the outlet's address, "show me the whole list", and offers that
// change a quote's total. Each helper looks at the raw message and either
// returns an answer or null (so the price engine carries on).

import { bucket, needsAction, missedAppPickup } from "../leads";

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

/* ── Leads to call, and app orders whose pickup was missed ────────────── */

// "how do I…" questions about leads are answered by the how-to rules instead.
const RE_HOWTO = /\b(kaise|kese|kaisa|how|kya karu|kya kare|kya karna|kya hai|matlab|add|banaye|banana|dale|daale|cancel|delete|log karna|mark|kaha|kahan|kahaan|kidhar|where)\b/i;
// "call" in Hindi script reads back as "kol" ("किसको कॉल करना है" → "kisako kol karanaa hai").
const RE_LEADS = /\b(leads?|lead list|kis(a)? ?ko (call|kol)|kise (call|kol)|kinko (call|kol)|(call|kol) kar(a)?naa? (hai|h|he)|call list|callbacks?|call backs?|follow ?ups?|booked pickups?|pickups? booked|aaj ke pickups?|aaj ka pickup|pickups? aaj)\b/i;
const RE_MISSED = /\b(missed pickups?|pickups? missed|pickup miss|pickup chhut|pickup chut|pickup nahi hua|missed app)\b/i;

export function leadsIntent(raw, ctx) {
  if (RE_HOWTO.test(raw)) return null;
  const now = ctx.now || Date.now();
  if (RE_MISSED.test(raw)) {
    const list = (ctx.orders || []).filter((o) => missedAppPickup(o, now))
      .sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || "")));
    return {
      type: "stats", kind: "missed", title: "App orders with a missed pickup", count: list.length,
      orders: list.slice(0, 8).map((o) => ({
        id: o.id, label: o.order_label || String(o.order_no ?? ""), name: o.customer_name || "", due: o.due_date, total: Number(o.total || 0), balance: 0,
        sub: `pickup was ${o.due_date ? new Date(`${String(o.due_date).slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "not set"}${o.pickup_slot ? " · " + o.pickup_slot : ""}`,
        right: `₹${Number(o.total || 0).toLocaleString("en-IN")}`,
      })),
      note: list.length ? "Call each customer. Still want it: book the pickup again. No answer after 3 tries: Can't reach them (cancels the order)." : null,
      go: "apporders",
    };
  }
  if (!RE_LEADS.test(raw)) return null;
  const leads = ctx.leads || [];
  const by = (b) => leads.filter((l) => bucket(l, now) === b);
  const toCall = by("call"), later = by("later"), booked = by("booked");
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const bookedToday = booked.filter((l) => l.pickup_at && new Date(l.pickup_at).getTime() <= end.getTime());
  const missed = (ctx.orders || []).filter((o) => missedAppPickup(o, now)).length;
  const due = leads.filter((l) => needsAction(l, now))
    .sort((a, b) => new Date(a.status === "booked" ? a.pickup_at : (a.next_action_at || a.created_at)) - new Date(b.status === "booked" ? b.pickup_at : (b.next_action_at || b.created_at)));
  const line = (l) => {
    if (l.status === "booked") return `pickup ${new Date(l.pickup_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`;
    if (l.status === "new") return l.first_contact_at ? "reopened · call again" : "new · not called yet";
    return `call again${l.attempts ? ` · ${l.attempts} tr${l.attempts === 1 ? "y" : "ies"} so far` : ""}`;
  };
  return {
    type: "stats", kind: "leads", title: "Leads & Pickups", unit: "lead", count: due.length,
    tiles: [
      { k: "To call now", v: String(toCall.length), sub: `${toCall.filter((l) => l.status === "new").length} new` },
      { k: "Call later", v: String(later.length), sub: "time set" },
      { k: "Pickups today", v: String(bookedToday.length), sub: `${booked.length} booked in all` },
      { k: "Missed app pickups", v: String(missed), sub: "call or cancel" },
    ],
    leads: due.slice(0, 8).map((l) => ({ id: l.id, name: l.name || "Name not known", phone: String(l.phone || "").replace(/\D/g, "").slice(-10), line: line(l), urgent: l.status !== "booked" })),
    go: "leads",
  };
}

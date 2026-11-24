// Leads & Pickups: the rules, kept apart from the screens so they can be
// tested on their own. A lead moves new → follow_up / booked → won / lost,
// and every call adds an event to its timeline.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export const KINDS = [
  ["pickup", "Pickup"],
  ["enquiry", "Price enquiry"],
  ["bulk", "Bulk / B2B"],
  ["other", "Other"],
];
export const SOURCES = [
  ["whatsapp", "WhatsApp"],
  ["call", "Phone call"],
  ["walk_in", "Walk-in"],
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["google", "Google"],
  ["referral", "Referral"],
  ["app", "App"],
  ["other", "Other"],
];
export const kindLabel = (k) => (KINDS.find((x) => x[0] === k) || [k, k || "—"])[1];
export const sourceLabel = (s) => (SOURCES.find((x) => x[0] === s) || [s, s || "—"])[1];

// What staff can record after a call. `status` is where the lead goes.
export const OUTCOMES = {
  not_answering:  { label: "Not answering",          status: "follow_up", needs: "retry" },
  call_back:      { label: "Call back later",        status: "follow_up", needs: "when" },
  booked:         { label: "Pickup booked",          status: "booked",    needs: "pickup" },
  won:            { label: "Order placed",           status: "won" },
  enquiry:        { label: "Just an enquiry",        status: "lost", reason: "Only wanted prices" },
  not_interested: { label: "Not interested",         status: "lost", reason: "Not interested" },
  wrong_number:   { label: "Wrong / invalid number", status: "lost", reason: "Wrong or invalid number" },
  unreachable:    { label: "Can't reach them",       status: "lost", reason: "Customer not reachable" },
  note:           { label: "Add a note only" },
};
export const outcomeLabel = (o) => OUTCOMES[o]?.label || ({ created: "Lead added", reopened: "Reopened" }[o]) || o;

// The phone number as ten digits (the last ten, so +91 / 0 prefixes match).
export const leadPhone = (s) => {
  const d = String(s || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
};
export const validLeadPhone = (s) => /^[6-9]\d{9}$/.test(leadPhone(s));

const t = (v) => (v ? new Date(v).getTime() : NaN);
const isOpen = (l) => l.status === "new" || l.status === "follow_up" || l.status === "booked";
export { isOpen as leadIsOpen };

// Which list a lead belongs on right now.
//   call   — needs a call now (new, or a follow-up that's due)
//   later  — follow-up scheduled for later
//   booked — pickup agreed
//   won / lost
export function bucket(lead, now = Date.now()) {
  if (lead.status === "won") return "won";
  if (lead.status === "lost") return "lost";
  if (lead.status === "booked") return "booked";
  if (lead.status === "follow_up") {
    const at = t(lead.next_action_at);
    return Number.isNaN(at) || at <= now ? "call" : "later";
  }
  return "call";
}

// Needs a call now, or a booked pickup that's due today or already late.
export function needsAction(lead, now = Date.now()) {
  const b = bucket(lead, now);
  if (b === "call") return true;
  if (b === "booked") {
    const at = t(lead.pickup_at);
    if (Number.isNaN(at)) return false;
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return at <= end.getTime();
  }
  return false;
}

// How long a new lead has waited for its first call, in minutes.
export const waitingMinutes = (lead, now = Date.now()) =>
  lead.first_contact_at ? 0 : Math.max(0, Math.round((now - t(lead.created_at)) / MIN));

// Quick retry times offered after "not answering".
export function retryChoices(now = Date.now()) {
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(10, 0, 0, 0);
  return [
    { key: "10m", label: "In 10 min", at: new Date(now + 10 * MIN).toISOString() },
    { key: "1h", label: "In 1 hour", at: new Date(now + HOUR).toISOString() },
    { key: "tomorrow", label: "Tomorrow 10 am", at: tomorrow.toISOString() },
  ];
}

// Turn a call outcome into the lead update and the timeline event.
// opts: { note, next_action_at, pickup_at, area, order_id, by_name }
// Returns { error } when something required is missing.
export function applyOutcome(lead, outcome, opts = {}, now = Date.now()) {
  const def = OUTCOMES[outcome];
  if (!def) return { error: "Pick what happened on the call." };
  const note = String(opts.note || "").trim() || null;
  const iso = new Date(now).toISOString();

  if (outcome === "note") {
    if (!note) return { error: "Write the note first." };
    return { patch: { last_note: note }, event: { outcome, note, by_name: opts.by_name || null } };
  }

  const patch = { status: def.status, last_outcome: outcome, last_note: note };
  if (!lead.first_contact_at) patch.first_contact_at = iso;
  // Every real call counts as an attempt; "order placed" is recorded after the call.
  if (outcome !== "won") patch.attempts = Number(lead.attempts || 0) + 1;

  if (def.needs === "retry" || def.needs === "when") {
    const at = t(opts.next_action_at);
    if (Number.isNaN(at)) return { error: "Choose when to call again." };
    if (outcome === "call_back" && at < now - MIN) return { error: "The call-back time is in the past." };
    patch.next_action_at = new Date(at).toISOString();
    patch.pickup_at = null;
    patch.closed_at = null;
    patch.lost_reason = null;
  } else if (def.needs === "pickup") {
    const at = t(opts.pickup_at);
    if (Number.isNaN(at)) return { error: "Choose the pickup date and time." };
    patch.pickup_at = new Date(at).toISOString();
    patch.next_action_at = null;
    patch.closed_at = null;
    patch.lost_reason = null;
    if (opts.area != null && String(opts.area).trim()) patch.area = String(opts.area).trim();
  } else {
    // won / lost close the lead.
    patch.next_action_at = null;
    patch.closed_at = iso;
    patch.lost_reason = def.status === "lost" ? def.reason : null;
    if (outcome === "won" && opts.order_id) patch.order_id = opts.order_id;
  }

  return {
    patch,
    event: {
      outcome, note,
      next_action_at: patch.next_action_at || patch.pickup_at || null,
      by_name: opts.by_name || null,
    },
  };
}

// Reopen a closed lead so it goes back on the call list.
export function reopen(lead, by_name) {
  return {
    patch: { status: "new", closed_at: null, lost_reason: null, next_action_at: null, last_outcome: "reopened" },
    event: { outcome: "reopened", note: null, by_name: by_name || null },
  };
}

// An order for the same phone at the same outlet, placed after the lead
// came in — so a lead counts as converted even if nobody marked it.
export function matchingOrder(lead, orders = []) {
  const ph = leadPhone(lead.phone);
  if (ph.length !== 10) return null;
  const from = t(lead.created_at) - 5 * MIN;
  let best = null;
  for (const o of orders) {
    if (!o || o.outlet_id !== lead.outlet_id) continue;
    if (String(o.order_status || "").toLowerCase() === "cancelled") continue;
    if (leadPhone(o.phone) !== ph) continue;
    const at = t(o.created_at);
    if (Number.isNaN(at) || at < from) continue;
    if (!best || at < t(best.created_at)) best = o;
  }
  return best;
}

export const isConverted = (lead, orders) => lead.status === "won" || (lead.status !== "lost" && !!matchingOrder(lead, orders));

// An open lead for this phone at this outlet already (to avoid duplicates).
export function openDuplicate(leads, phone, outletId) {
  const ph = leadPhone(phone);
  return leads.find((l) => isOpen(l) && l.outlet_id === outletId && leadPhone(l.phone) === ph) || null;
}

// Per-outlet numbers for HQ.
export function leadStats(leads, orders = [], now = Date.now()) {
  const s = { total: leads.length, open: 0, toCall: 0, booked: 0, won: 0, lost: 0, contacted: 0, fastFirst: 0, firstMins: [], conversion: 0, medianFirst: null };
  for (const l of leads) {
    const b = bucket(l, now);
    if (isOpen(l)) s.open++;
    if (b === "call") s.toCall++;
    if (b === "booked") s.booked++;
    if (isConverted(l, orders)) s.won++;
    else if (l.status === "lost") s.lost++;
    if (l.first_contact_at) {
      s.contacted++;
      const m = (t(l.first_contact_at) - t(l.created_at)) / MIN;
      if (!Number.isNaN(m)) { s.firstMins.push(Math.max(0, m)); if (m <= 60) s.fastFirst++; }
    }
  }
  const decided = s.won + s.lost;
  s.conversion = s.total ? Math.round((s.won / s.total) * 100) : 0;
  s.decided = decided;
  if (s.firstMins.length) {
    const a = [...s.firstMins].sort((x, y) => x - y);
    s.medianFirst = Math.round(a[Math.floor((a.length - 1) / 2)]);
  }
  return s;
}

// "12 min", "3 h", "2 days"
export function ago(v, now = Date.now()) {
  const m = Math.floor((now - t(v)) / MIN);
  if (Number.isNaN(m)) return "—";
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
export function minsLabel(m) {
  if (m == null) return "—";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 6) / 10;
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

// datetime-local value in local time ("2026-11-20T14:30").
export function toLocalInput(v) {
  const d = v ? new Date(v) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromLocalInput = (s) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/* ── App orders whose pickup was missed ───────────────────────────────── */

const OPEN_APP = new Set(["pending_pickup", "pickup_assigned"]);
export const appOrderOpen = (o) => !!o && o.channel === "app" && OPEN_APP.has(String(o.order_status || "").toLowerCase());

// End of the booked pickup window (due_date + "18:00–20:00"), as a time.
// No window → end of the pickup day. No date → null.
export function pickupWindowEnd(o) {
  if (!o?.due_date || !/^\d{4}-\d{2}-\d{2}/.test(o.due_date)) return null;
  const d = new Date(`${String(o.due_date).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const m = String(o.pickup_slot || "").match(/(\d{1,2})[:.](\d{2})\s*(?:[-–—]|to)\s*(\d{1,2})[:.](\d{2})/i);
  if (m) d.setHours(Number(m[3]), Number(m[4]), 0, 0);
  else d.setHours(23, 59, 0, 0);
  return d.getTime();
}

// Hours after the pickup window before it becomes a lead to call; orders
// with no pickup date become one 24 hours after they were placed.
export const MISSED_GRACE_HOURS = 2;
export function missedAppPickup(o, now = Date.now()) {
  if (!appOrderOpen(o)) return false;
  const end = pickupWindowEnd(o);
  if (end != null) return now >= end + MISSED_GRACE_HOURS * HOUR;
  const placed = t(o.created_at);
  return !Number.isNaN(placed) && now >= placed + 24 * HOUR;
}

// The lead a missed app pickup turns into.
export function leadFromAppOrder(o, ref) {
  const when = o.due_date ? `${String(o.due_date).slice(0, 10)}${o.pickup_slot ? " · " + o.pickup_slot : ""}` : "not set";
  return {
    outlet_id: o.outlet_id,
    phone: leadPhone(o.phone) || String(o.phone || ""),
    name: o.customer_name || null,
    area: o.address || null,
    kind: "pickup",
    source: "app",
    app_order_id: o.id,
    note: `App order #${ref || o.order_label || o.order_no || ""}: pickup (${when}) not done yet. Call to re-book or cancel.`,
    created_by_name: "Auto · missed app pickup",
  };
}

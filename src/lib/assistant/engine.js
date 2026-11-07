// Brighty's brain (the W&B assistant). No outside AI service: it reads the staff
// member's message (Hindi / Hinglish / English, typos and all), finds the
// matching items in the price list, asks a tap-to-answer question when it
// needs a grade or service, and explains where every number came from.
// It tries hard to answer by itself (price list → counter catalogue →
// HQ's past answers → a safe size-based estimate) so HQ is the last stop.
import { tokenize, nameTokens, hasDevanagari, GRADE_WORDS, SERVICE_WORDS, AUDIENCE_WORDS } from "./language";

export const EXPRESS_MULTIPLIER = 1.6; // what the billing screen charges today

const SERVICE_KEY = { "Dry Clean": "dryclean", "Steam Press": "press", Polish: "polish", Starching: "starch", "Wash & Iron": "washiron", Laundry: "laundry" };
const GARMENT_SERVICES = new Set(Object.values(SERVICE_KEY));
const SERVICE_ORDER = ["dryclean", "press", "washiron", "polish", "starch", "laundry"];
const svcRank = (k) => { const i = SERVICE_ORDER.indexOf(k); return i < 0 ? 99 : i; };
const MODIFIERS = new Set(["urgent", "kg", "rs"]);
const GENERIC = new Set(["set", "whole", "each", "per", "the", "offer", "regular", "cover"]);
export const SERVICE_LABEL = { dryclean: "Dry Clean", press: "Steam Press", polish: "Polish", starch: "Starching", washiron: "Wash & Iron", laundry: "Laundry (per kg)", other: "Cleaning" };
const AUDIENCE_LABEL = { men: "Men", women: "Women", kids: "Kids" };

/* ── Knowledge index ─────────────────────────────────────────────── */

function rowServiceKey(r) {
  if (r.service === "Laundry") return /iron/i.test(r.item) ? "washiron" : "laundry";
  if (/steam press/i.test(r.item)) return "press";
  return SERVICE_KEY[r.service] || "other";
}

export function buildIndex(rows = []) {
  const prices = [];
  const policies = [];
  const vocab = new Set();
  for (const r of rows) {
    if (!r || r.active === false) continue;
    if (r.kind === "policy") {
      const kws = (r.keywords || []).map((k) => String(k).toLowerCase().trim()).filter(Boolean);
      if (kws.length && r.answer) policies.push({ ...r, kws });
      continue;
    }
    if (!r.item) continue;
    const svcKey = rowServiceKey(r);
    let audience = r.audience || "";
    const core = new Set();
    const grades = new Set();
    for (const w of nameTokens([r.item, ...(r.aliases || [])].join(" "))) {
      if (AUDIENCE_WORDS[w]) { audience = audience || AUDIENCE_WORDS[w]; continue; }
      if (SERVICE_WORDS[w] || GENERIC.has(w)) continue;
      if (isGradeLike(w)) grades.add(w);
      core.add(w);
      vocab.add(w);
    }
    if (!core.size && !(r.unit === "kg" && GARMENT_SERVICES.has(svcKey))) {
      // Nothing to match on except the service (e.g. "Wash & Iron" per kg) is
      // fine; anything else with no usable words is skipped.
      if (svcKey === "other") continue;
    }
    // "Trouser / Pant" is two names for one item: score against the best one.
    // Aliases count as extra names.
    // Words in brackets ("Suit bottom (salwar / pant)") describe the item but
    // aren't another name for it.
    const names = String(r.item).replace(/\([^)]*\)/g, (m) => (/\d\s*piece/i.test(m) ? m : " ")).split("/")
      .map((x) => nameTokens(x).filter((w) => core.has(w))).filter((x) => x.length);
    // Shared words: "Ladies woollen top / kurti / suit" → woollen top, woollen
    // kurti, woollen suit; "Patiala / Salwar suit" → patiala suit, salwar suit.
    if (names.length > 1) {
      const first = names[0], last = names[names.length - 1];
      if (first.length > 1 && names.slice(1).every((n) => n.length === 1)) {
        for (let i = 1; i < names.length; i++) names[i] = [...first.slice(0, -1), ...names[i]];
      } else if (last.length > 1 && names.slice(0, -1).every((n) => n.length === 1)) {
        for (let i = 0; i < names.length - 1; i++) names[i] = [...names[i], ...last.slice(1)];
      }
    }
    const parts = [...names, ...(r.aliases || []).map((x) => nameTokens(x).filter((w) => core.has(w))).filter((x) => x.length)];
    const vtok = nameTokens(r.variant);
    for (const w of vtok) { vocab.add(w); if (isGradeLike(w)) grades.add(w); }
    prices.push({ ...r, svcKey, audience, core, parts: parts.length ? parts : [[...core]], vtok: new Set(vtok), grades, label: r.variant ? `${r.item} · ${r.variant}` : r.item });
  }
  return { prices, policies, vocab };
}

/* ── Reading a message ───────────────────────────────────────────── */

const isModifier = (w) => MODIFIERS.has(w) || SERVICE_WORDS[w] || AUDIENCE_WORDS[w] || GRADE_WORDS.has(w);

// Split a message into one segment per item. Handles both
// "120 shirt 60 pant" (number first) and "shirt 3, pant 2" (number after).
function segment(tokens) {
  const segs = [];
  const fresh = () => ({ words: [], qty: null, kg: null });
  let cur = fresh();
  const hasItem = (c) => c.words.some((w) => !isModifier(w));
  const push = () => { if (cur.words.length || cur.qty != null || cur.kg != null) segs.push(cur); cur = fresh(); };
  const numberFirst = tokens.length && tokens[0].num != null;
  for (const t of tokens) {
    if (t.sep) { push(); continue; }
    if (t.num != null) {
      if (!hasItem(cur)) {
        if (t.kg) cur.kg = t.num; else if (cur.qty == null) cur.qty = t.num;
      } else if (numberFirst || (t.kg ? cur.kg != null : cur.qty != null)) {
        push();
        if (t.kg) cur.kg = t.num; else cur.qty = t.num;
      } else {
        // "shirt 3" — the number belongs to the item just named.
        if (t.kg) cur.kg = t.num; else cur.qty = t.num;
        push();
      }
      continue;
    }
    if (t.word === "kg") continue;
    cur.words.push(t.word);
  }
  push();
  // A trailing "urgent" / service word on its own belongs to the last item.
  return segs.filter((s, i) => !(i > 0 && !s.words.some((w) => !isModifier(w)) && s.qty == null && s.kg == null && (segs[i - 1].words.push(...s.words), true)));
}

function readSegment(seg, shared) {
  const g = [], grades = [];
  let svc = null, aud = null, urgent = false;
  for (const w of seg.words) {
    if (w === "urgent") { urgent = true; continue; }
    if (MODIFIERS.has(w)) continue;
    if (SERVICE_WORDS[w]) { svc = w; continue; }
    if (AUDIENCE_WORDS[w]) { aud = AUDIENCE_WORDS[w]; continue; }
    if (GENERIC.has(w)) continue;
    if (isGradeLike(w)) grades.push(w);
    g.push(w);
  }
  return { garments: g, grades, svc: svc || shared.svc, aud: aud || shared.aud, urgent: urgent || shared.urgent, qty: seg.qty, kg: seg.kg };
}

// "3piece" says which kind of suit, like a grade does.
const isGradeLike = (w) => GRADE_WORDS.has(w) || /^\d+piece$/.test(w);
const itemWords = (q) => q.garments.filter((w) => !isGradeLike(w));

function scoreRow(r, q) {
  const garmentWords = itemWords(q);
  let hits = 0, vhits = 0;
  for (const w of garmentWords) {
    if (r.core.has(w)) hits++;
    else if (r.vtok.has(w)) vhits++;
  }
  // How much of the item's own name the message covers (best alias part).
  // Grade words ("heavy", "3piece") don't count against the cover: "frock"
  // covers "Kids heavy frock" as well as "Kids frock".
  const coverI = Math.max(0, ...r.parts.map((p) => {
    const pc = p.filter((w) => !isGradeLike(w));
    return pc.length ? pc.filter((w) => q.garments.includes(w)).length / pc.length : 0;
  }));
  let s;
  if (garmentWords.length) {
    if (!hits) {
      // "silk" alone can still find "Saree · Silk" style rows via grade words.
      return -Infinity;
    }
    s = 6 * ((hits + vhits) / garmentWords.length) + 2 * coverI;
  } else {
    // Only a service / kg given ("5 kg wash & iron") — match on service.
    if (!q.svc && q.kg == null) return -Infinity;
    if (q.svc && r.svcKey !== q.svc) return -Infinity;
    if (r.unit !== "kg") return -Infinity;
    s = 8;
  }
  if (q.svc) {
    if (r.svcKey === q.svc) s += 5;
    else if (GARMENT_SERVICES.has(r.svcKey)) s -= 9;
  }
  if (q.kg != null && r.unit === "kg") s += 2;
  if (q.aud) {
    if (r.audience === q.aud) s += 3;
    else if (r.audience) s -= 6;
  } else if (r.audience === "kids") s -= 2;
  for (const gw of q.grades) {
    if (r.grades.has(gw) || r.core.has(gw)) s += 3;
    else if (r.vtok.size) s -= 2;
  }
  if (r.price == null && !r.price_text) s -= 3;
  return s;
}

const TIE = 0.75, MIN_SCORE = 5;

function candidates(index, q) {
  if (!index) return { best: -Infinity, ties: [] };
  const scored = index.prices.map((r) => ({ r, s: scoreRow(r, q) })).filter((x) => x.s > -Infinity);
  if (!scored.length) return { best: -Infinity, ties: [] };
  scored.sort((a, b) => b.s - a.s);
  const best = scored[0].s;
  // A bare noun ("joote", "jacket") should list every kind of it.
  const tie = itemWords(q).length === 1 && !q.grades.length ? 1.6 : TIE;
  const ties = scored.filter((x) => x.s >= best - tie).map((x) => x.r);
  return { best, ties };
}

/* ── Narrowing: which tap-question to ask next ───────────────────── */

const distinct = (rows, f) => [...new Set(rows.map(f))];
const priceOf = (r) => (r.price != null && r.price !== "" && Number.isFinite(Number(r.price)) ? Number(r.price) : null);
export const unitLabel = (u) => ({ kg: "/kg", set: "/set", pair: "/pair", panel: "/panel", "sq ft": "/sq ft", month: "/month" }[u] || "");
export const fmtPrice = (r) => (priceOf(r) != null ? `₹${priceOf(r).toLocaleString("en-IN")}${unitLabel(r.unit)}` : r.price_text || "—");
function rangeLabel(rows) {
  const ps = rows.map(priceOf).filter((p) => p != null);
  if (!ps.length) return rows[0]?.price_text || "";
  const lo = Math.min(...ps), hi = Math.max(...ps);
  const u = distinct(rows, (r) => r.unit).length === 1 ? unitLabel(rows[0].unit) : "";
  return lo === hi ? `₹${lo.toLocaleString("en-IN")}${u}` : `₹${lo.toLocaleString("en-IN")}–${hi.toLocaleString("en-IN")}${u}`;
}

// Order variants plain → heavy → bridal so the tap row reads naturally.
const GRADE_ORDER = ["normal", "single", "small", "silk", "woollen", "designer", "heavy", "double", "large", "bridal", "leather"];
const variantRank = (r) => {
  if (!r.variant) return -1;
  const i = GRADE_ORDER.findIndex((g) => r.grades.has(g));
  return i < 0 ? 50 + (priceOf(r) || 0) / 1e4 : i;
};

export function narrow(rows) {
  if (!rows || rows.length <= 1) return null;
  const svcs = distinct(rows, (r) => r.svcKey);
  if (svcs.length > 1) {
    const opts = svcs.sort((a, b) => svcRank(a) - svcRank(b)).map((k) => {
      const sub = rows.filter((r) => r.svcKey === k);
      const label = k === "other" ? distinct(sub, (r) => r.service || "Other").join(" / ") : SERVICE_LABEL[k] || k;
      return { dim: "svcKey", value: k, label, sub: rangeLabel(sub) };
    });
    return { dim: "svcKey", question: "Which service?", options: opts };
  }
  const auds = distinct(rows, (r) => r.audience || "");
  if (auds.length > 1) {
    const order = ["men", "women", "", "kids"];
    const opts = auds.sort((a, b) => order.indexOf(a) - order.indexOf(b))
      .map((a) => ({ dim: "audience", value: a, label: AUDIENCE_LABEL[a] || "Any", sub: rangeLabel(rows.filter((r) => (r.audience || "") === a)) }));
    return { dim: "audience", question: "For whom?", options: opts };
  }
  const items = distinct(rows, (r) => r.item);
  if (items.length > 1) {
    return {
      dim: "item",
      question: "Which one?",
      options: items.slice(0, 8).map((it) => ({ dim: "item", value: it, label: it, sub: rangeLabel(rows.filter((r) => r.item === it)) })),
    };
  }
  const sorted = [...rows].sort((a, b) => (priceOf(a) ?? 1e9) - (priceOf(b) ?? 1e9) || variantRank(a) - variantRank(b));
  return {
    dim: "id",
    question: "Which type?",
    hint: "Not sure? Ask the customer, or check the work on the garment.",
    options: sorted.map((r) => ({ dim: "id", value: r.id, label: r.variant || "Standard", sub: fmtPrice(r), grades: [...r.grades] })),
  };
}

export function applyPick(rows, dim, value) {
  return (rows || []).filter((r) => (dim === "id" ? r.id === value : (r[dim] || "") === value));
}

// For a multi-item quote: settle a variant choice without asking.
function defaultPick(rows) {
  const svcPref = [...rows].sort((a, b) => svcRank(a.svcKey) - svcRank(b.svcKey));
  const svc = svcPref[0].svcKey;
  let r = rows.filter((x) => x.svcKey === svc);
  if (distinct(r, (x) => x.audience || "").length > 1) r = r.filter((x) => x.audience !== "kids");
  // Prefer the plain item over a special kind nobody asked for
  // ("pant" → Trouser / Pant, not Woollen trouser).
  const special = (x) => [...x.core].filter((w) => isGradeLike(w)).length;
  r.sort((a, b) => special(a) - special(b) || variantRank(a) - variantRank(b) || (priceOf(a) ?? 1e9) - (priceOf(b) ?? 1e9));
  return r[0];
}

/* ── Evidence: the counter catalogue and past bills ─────────────── */

export function productService(p) {
  const c = `${p.category || ""} ${p.name || ""}`.toLowerCase();
  if (/polish/.test(c)) return "polish";
  if (/starch|kalaf/.test(c)) return "starch";
  if (/steam|press|iron/.test(c) && !/dry/.test(c)) return /wash/.test(c) ? "washiron" : "press";
  if (p.unit === "kg" || /laundry|wash/.test(c)) return /iron/.test(c) ? "washiron" : "laundry";
  if (/dry|clin|clean/.test(c)) return "dryclean";
  return "other";
}

export function matchProduct(row, products = []) {
  if (!row?.core || !products?.length) return null;
  let best = null, bestS = 0;
  const core = [...row.core];
  if (!core.length) return null;
  for (const p of products) {
    if (!p?.name) continue;
    const pt = new Set(nameTokens(p.name).filter((w) => !SERVICE_WORDS[w]));
    const hit = core.filter((w) => pt.has(w)).length;
    if (!hit || (hit < Math.min(core.length, 2) && hit < core.length)) continue;
    let s = (hit / core.length) * 10 - Math.max(0, pt.size - hit) * 1.2;
    const ps = productService(p);
    if (ps === row.svcKey) s += 4; else if (GARMENT_SERVICES.has(ps) && GARMENT_SERVICES.has(row.svcKey)) s -= 8;
    for (const g of row.grades) if (pt.has(g)) s += 2;
    if ((p.unit === "kg") !== (row.unit === "kg")) s -= 6;
    if (s > bestS) { bestS = s; best = p; }
  }
  return bestS >= 7 ? best : null;
}

export function pastBills(productName, orderItems = [], days = 90) {
  if (!productName) return null;
  const since = Date.now() - days * 864e5;
  const prices = [];
  for (const i of orderItems) {
    if (i.product_name !== productName) continue;
    if (i.created_at && new Date(i.created_at).getTime() < since) continue;
    const p = Number(i.unit_price);
    if (p > 0) prices.push(p);
  }
  if (!prices.length) return null;
  const freq = new Map();
  prices.forEach((p) => freq.set(p, (freq.get(p) || 0) + 1));
  const [mode] = [...freq].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return { count: prices.length, usual: mode, min: Math.min(...prices), max: Math.max(...prices) };
}

/* ── Second sources: the counter catalogue and HQ's past answers ── */

const PRODUCT_SERVICE_NAME = { dryclean: "Dry Clean", press: "Steam Press", polish: "Polish", starch: "Starching", washiron: "Wash & Iron", laundry: "Laundry", other: "Other" };

export function productRows(products = []) {
  return products
    .filter((p) => p?.name && Number(p.price) > 0 && p.name.trim().length > 1)
    .map((p) => ({ id: `p-${p.id}`, kind: "price", item: p.name.trim(), service: PRODUCT_SERVICE_NAME[productService(p)], unit: p.unit === "kg" ? "kg" : "piece", price: Number(p.price), source: "crm" }));
}

export function answeredRows(questions = []) {
  const out = [];
  const answeredItems = new Set();
  for (const q of questions) {
    if (q.status === "answered" && q.answer_price != null && Number(q.answer_price) > 0 && (q.item || q.question)) {
      answeredItems.add(String(q.item || q.question).toLowerCase());
      out.push({
        id: `q-${q.id}`, kind: "price", item: q.item || q.question, variant: q.variant || null, service: q.service || "Other",
        unit: q.unit || "piece", price: Number(q.answer_price), note: q.answer || null, source: "hq_reply", answered_at: q.answered_at,
        aliases: q.item ? [q.question] : [],
      });
    }
  }
  // Learning from itself: an item billed earlier (at a safe price, or while
  // waiting for HQ) is known next time — until HQ gives a real answer.
  for (const q of questions) {
    if (q.kind !== "price_to_confirm" || !["auto", "open"].includes(q.status) || !q.item || !(Number(q.suggested_price) > 0)) continue;
    if (answeredItems.has(String(q.item).toLowerCase())) continue;
    answeredItems.add(String(q.item).toLowerCase());
    out.push({
      id: `b-${q.id}`, kind: "price", item: q.item, variant: q.variant || null, service: q.service || "Other", unit: q.unit || "piece",
      price: Number(q.suggested_price), source: "billed_before", answered_at: q.created_at, aliases: [q.question],
      note: q.status === "open" ? "HQ hasn't confirmed this price yet." : null,
    });
  }
  return out;
}

/* ── Learning from staff choices ─────────────────────────────────── */

// The words that matter in a question, in a fixed order, so "heavy lehenga"
// and "lehenga bhari" share one key.
export function learnKey(q) {
  if (!q) return null;
  const words = [...new Set([...itemWords(q), ...(q.grades || [])])].sort();
  if (!words.length) return null;
  return `${words.join(" ")}|${q.svc || ""}|${q.aud || ""}`;
}

// rows: [{ phrase, knowledge_id, picks }] → Map phrase → [{ knowledge_id, picks }] best first
export function buildLearned(rows = []) {
  const m = new Map();
  for (const r of rows) {
    if (!r?.phrase || !r.knowledge_id) continue;
    const list = m.get(r.phrase) || [];
    list.push({ knowledge_id: r.knowledge_id, picks: Number(r.picks) || 1 });
    m.set(r.phrase, list);
  }
  for (const list of m.values()) list.sort((a, b) => b.picks - a.picks);
  return m;
}

const LEARN_MIN = 3, LEARN_SHARE = 0.8;
function learnedFor(q, ctx) {
  const key = learnKey(q);
  const list = key && ctx.learned?.get(key);
  if (!list?.length) return null;
  const total = list.reduce((a, x) => a + x.picks, 0);
  return { key, list, total, top: list[0], sure: list[0].picks >= LEARN_MIN && list[0].picks / total >= LEARN_SHARE };
}

/* ── Building an answer ──────────────────────────────────────────── */

export function lineFor(row, q, ctx, extra = {}) {
  const product = row.source === "crm" ? null : matchProduct(row, ctx?.products);
  const isKg = row.unit === "kg";
  const qty = Math.max(1, Math.round(Number(q?.qty) || 1));
  const weight = isKg ? Math.max(0.1, Number(q?.kg) || (q?.qty && !q?.kg ? Number(q.qty) : 1)) : null;
  const unitPrice = priceOf(row);
  const m = q?.urgent ? EXPRESS_MULTIPLIER : 1;
  const total = unitPrice == null ? null : Math.round((isKg ? unitPrice * weight : unitPrice * qty) * m);
  return {
    row, q: q || {}, product, qty: isKg ? (q?.qty && q?.kg ? qty : 1) : qty, weight, urgent: !!q?.urgent, unitPrice, total,
    past: pastBills(row.source === "crm" ? row.item : product?.name, ctx?.orderItems), ...extra,
  };
}

function policyHits(text, index) {
  const t = ` ${String(text).toLowerCase().replace(/[^a-z0-9₹%& ]+/g, " ").replace(/\s+/g, " ")} `;
  return index.policies
    .map((p) => ({ p, n: p.kws.filter((k) => t.includes(` ${k} `)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
}

const GREETING = /^\s*(hi+|hello+|hey+|namaste|namaskar|good (morning|afternoon|evening)|help|madad|kya kar sakte|what can you do)\b/i;
const THANKS = /^\s*(thanks?|thank you|thx|ty|shukriya|dhanyavaad|dhanyavad|ok+|okay|theek hai|thik hai|done|great|nice|👍)\W*$/i;

const STATUS_WORDS = new Set(`ka ki ke kab kahan kaha kya hai hain h hua hui ho hoga hogi ready status ready? delivered deliver mila mili milega milegi gaya gayi
  tak abhi tak bata batao check dekho please pls sir ji where is my the of when will be done payment paid baki due balance kitna`.split(/\s+/));

/* Orders & customers — "#RKP-1073 kab ready hoga", "9876543210 ka order" */
function lookup(text, ctx) {
  const orders = ctx.orders || [];
  if (!orders.length) return null;
  const raw = String(text);
  const prefixes = new Set(orders.map((o) => String(o.order_label || "").split("-")[0]).filter(Boolean).map((p) => p.toUpperCase()));
  // RKP-1073 / rkp 1073 / psf62
  for (const m of raw.matchAll(/\b([a-z]{2,4})[\s-]?(\d{1,6})\b/gi)) {
    const pre = m[1].toUpperCase();
    if (prefixes.has(pre)) {
      const found = orders.filter((o) => o.order_label === `${pre}-${Number(m[2])}`);
      if (found.length) return { type: "order", orders: found };
    }
  }
  // #1073 or "order 1073" / "bill 1073"
  let hash = raw.match(/#\s?(\d{1,6})\b/);
  if (!hash) {
    // "order 1073 kab ready hoga" — but not "order 2 shirt" (that's a quantity).
    const m = raw.match(/\b(?:order|bill|receipt|parchi|token)\s*(?:no\.?|number|#)?\s*(\d{1,6})\b(.*)$/i);
    const rest = m ? m[2].toLowerCase().match(/[a-z]+/g) || [] : [];
    if (m && rest.every((w) => STATUS_WORDS.has(w))) hash = m;
  }
  if (hash) {
    const n = hash[1];
    const found = orders.filter((o) => String(o.outlet_order_no) === n);
    const list = found.length ? found : orders.filter((o) => String(o.order_no) === n);
    if (list.length) return { type: "order", orders: list.slice(0, 4) };
    return { type: "order", orders: [], ref: n };
  }
  // A 10-digit mobile number → that customer's orders.
  const ph = raw.replace(/[\s-]/g, "").match(/(?:\+?91)?([6-9]\d{9})(?!\d)/);
  if (ph) {
    const ten = ph[1];
    const theirs = orders.filter((o) => String(o.phone || "").replace(/\D/g, "").slice(-10) === ten)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { type: "customer", phone: ten, orders: theirs };
  }
  return null;
}

/**
 * Answer one message.
 * ctx = { index, fallback, products, orderItems, orders, prev }
 *   fallback: index built from the counter catalogue + HQ's past answers
 *   prev:     the last item asked about, for follow-ups ("aur heavy wala?")
 */
export function answer(text, ctx) {
  const raw = String(text || "").trim();
  const { index } = ctx;
  if (!raw) return { type: "greet" };
  if (hasDevanagari(raw) && !/[a-z]/i.test(raw)) return { type: "script" };
  if (THANKS.test(raw)) return { type: "thanks" };

  const found0 = lookup(raw, ctx);
  if (found0) return found0;

  const tokens = tokenize(raw, new Set([...index.vocab, ...(ctx.fallback?.vocab || [])]));
  const fuzzy = tokens.some((t) => t.fixed);
  const corrections = tokens.filter((t) => t.fixed).map((t) => ({ from: t.raw, to: t.word }));
  const allWords = tokens.filter((t) => t.word).map((t) => t.word);
  const shared = {
    svc: allWords.find((w) => SERVICE_WORDS[w]) || null,
    aud: AUDIENCE_WORDS[allWords.find((w) => AUDIENCE_WORDS[w])] || null,
    urgent: allWords.includes("urgent"),
  };
  let segs = segment(tokens).map((s) => readSegment(s, shared)).filter((s) => s.garments.length || s.kg != null || s.svc);
  const pol = policyHits(raw, index);

  // Follow-up: only a grade / service / qty / "urgent", no item — apply it
  // to the item asked about last ("aur heavy wala?", "steam press me?", "5 pcs").
  let followUp = false;
  const onlyModifiers = segs.length <= 1 && (!segs.length || !itemWords(segs[0]).length);
  const hasModifier = segs.length || tokens.some((t) => t.num != null) || shared.urgent;
  // "urgent" alone after an item means "that item, express" — not the rule.
  const polBlocks = pol.some((x) => !x.p.kws.includes("express"));
  if (onlyModifiers && hasModifier && ctx.prev?.garments?.length && !polBlocks) {
    const s = segs[0] || { grades: [], qty: null, kg: null };
    const num = tokens.find((t) => t.num != null);
    segs = [{
      garments: [...itemWords(ctx.prev), ...(s.grades.length ? s.grades : ctx.prev.grades || [])],
      grades: s.grades.length ? s.grades : ctx.prev.grades || [],
      svc: s.svc || shared.svc || ctx.prev.svc || null,
      aud: s.aud || shared.aud || ctx.prev.aud || null,
      urgent: shared.urgent || !!ctx.prev.urgent,
      qty: s.qty ?? (num && !num.kg ? num.num : ctx.prev.qty ?? null),
      kg: s.kg ?? (num?.kg ? num.num : ctx.prev.kg ?? null),
    }];
    followUp = true;
  }

  if (!segs.length) {
    if (pol.length) return { type: "policy", policy: pol[0].p, also: pol.slice(1, 3).map((x) => x.p) };
    if (THANKS.test(raw)) return { type: "thanks" };
    if (GREETING.test(raw) || !allWords.length) return { type: "greet" };
    return { type: "unknown", words: allWords, suggestions: [], tiers: tiersFor(index, null) };
  }

  let found = segs.map((q) => ({ q, ...candidates(index, q), source: "list" }));
  // Anything the price list doesn't know: try the counter catalogue and
  // HQ's earlier answers before giving up.
  found = found.map((f) => {
    if (f.best >= MIN_SCORE || !ctx.fallback) return f;
    const fb = candidates(ctx.fallback, f.q);
    return fb.best >= MIN_SCORE ? { q: f.q, ...fb, source: "fallback" } : f;
  });
  const strong = found.filter((f) => f.best >= MIN_SCORE);

  // A rule question that also names a garment ("pickup for 2 shirts") —
  // the rule wins when nothing priced matched well, or only offers/rules did.
  const onlyRules = strong.length && strong.every((f) => f.ties.every((r) => priceOf(r) == null));
  if (pol.length && (!strong.length || onlyRules)) return { type: "policy", policy: pol[0].p, also: pol.slice(1, 3).map((x) => x.p) };
  if (!strong.length) {
    const q0 = segs[0];
    const learned = segs.length === 1 && learnedFor(q0, ctx);
    if (learned && learned.top.picks >= 2) {
      const row = index.prices.find((r) => r.id === learned.top.knowledge_id);
      if (row) return { type: "answer", lines: [lineFor(row, q0, ctx)], confidence: learned.sure ? "high" : "medium", memo: memoForRow(row, q0), learned: { picks: learned.top.picks, total: learned.total }, fuzzy, corrections, policyNote: null, followUp };
    }
    const sugg = nearest(index, q0);
    return { type: "unknown", words: itemWords(q0).length ? itemWords(q0) : q0.garments, suggestions: sugg, tiers: tiersFor(index, q0.svc), q: q0 };
  }

  const policyNote = shared.urgent ? index.policies.find((p) => p.kws.includes("express")) : null;
  const base = { fuzzy, corrections, policyNote, followUp };

  if (found.length === 1) {
    const f = found[0];
    const learned = learnedFor(f.q, ctx);
    if (learned?.sure) {
      // Staff have picked the same thing for these words again and again.
      const row = f.ties.find((r) => r.id === learned.top.knowledge_id) || index.prices.find((r) => r.id === learned.top.knowledge_id);
      if (row) return { type: "answer", lines: [lineFor(row, f.q, ctx)], confidence: "high", memo: memoForRow(row, f.q), learned: { picks: learned.top.picks, total: learned.total }, ...base };
    }
    const step = narrow(f.ties);
    if (step) return { type: "clarify", q: f.q, rows: f.ties, step, usual: learned ? Object.fromEntries(learned.list.map((x) => [x.knowledge_id, x.picks])) : null, ...base, fromFallback: f.source === "fallback" };
    const conf = f.source === "fallback" || fuzzy ? "medium" : "high";
    return { type: "answer", lines: [lineFor(f.ties[0], f.q, ctx)], confidence: conf, memo: memoOf(f.q), ...base, fromFallback: f.source === "fallback" };
  }

  // Several items → a quote. Ask one shared service question if the items
  // could be several services; otherwise pick the plain grade and say so.
  const unresolved = found.filter((f) => f.best < MIN_SCORE);
  const svcAmbiguous = !shared.svc && strong.some((f) => distinct(f.ties, (r) => r.svcKey).length > 1);
  if (svcAmbiguous) {
    const common = SERVICE_ORDER.filter((k) => strong.every((f) => f.ties.some((r) => r.svcKey === k)));
    if (common.length > 1) {
      return { type: "clarify-quote", text: raw, step: { question: "Which service for these items?", options: common.map((k) => ({ dim: "svcKey", value: k, label: SERVICE_LABEL[k] })) }, ...base };
    }
  }
  const assumed = [];
  const lines = strong.map((f) => {
    let rows = f.ties;
    if (shared.svc && rows.some((r) => r.svcKey === shared.svc)) rows = rows.filter((r) => r.svcKey === shared.svc);
    const pick = rows.length > 1 ? defaultPick(rows) : rows[0];
    if (rows.length > 1) assumed.push(pick.label);
    return lineFor(pick, f.q, ctx, { alternatives: rows.length > 1 ? rows : null });
  });
  return {
    type: "answer", lines, confidence: assumed.length || fuzzy || unresolved.length || strong.some((f) => f.source === "fallback") ? "medium" : "high", assumed,
    missing: unresolved.map((f) => itemWords(f.q).join(" ") || f.q.garments.join(" ")), ...base,
  };
}

const memoOf = (q) => ({ garments: q.garments, grades: q.grades, svc: q.svc, aud: q.aud, urgent: q.urgent, qty: q.qty, kg: q.kg });
export const memoForRow = (row, q = {}) => ({
  garments: [...(row.parts?.[0] || row.core || [])], grades: [...(row.grades || [])], svc: GARMENT_SERVICES.has(row.svcKey) ? row.svcKey : null,
  aud: row.audience || null, urgent: !!q.urgent, qty: q.qty ?? null, kg: q.kg ?? null,
});

// Re-run a multi-item quote with the service the staff member tapped.
export function answerWithService(text, svcKey, ctx) {
  return answer(`${text} ${svcKey}`, ctx);
}

// Closest items when nothing matched: share a word, or nearly do.
function nearest(index, q) {
  const words = itemWords(q);
  if (!words.length) return [];
  const scored = [];
  for (const r of index.prices) {
    let s = 0;
    for (const w of words) {
      for (const c of r.core) {
        if (c === w) s += 3;
        else if (c.length > 3 && w.length > 3 && (c.startsWith(w.slice(0, 4)) || w.startsWith(c.slice(0, 4)))) s += 1.5;
      }
    }
    if (q.svc && r.svcKey === q.svc) s += 0.5;
    if (s > 0) scored.push({ r, s });
  }
  scored.sort((a, b) => b.s - a.s);
  const seen = new Set();
  return scored.map((x) => x.r).filter((r) => (seen.has(r.label) ? false : seen.add(r.label))).slice(0, 4);
}

/* ── Unknown items: size-based safe estimate ─────────────────────── */

// Reference items per size, looked up in the live price list so the
// estimate follows HQ's prices. Staff pick the size; the bill uses the top
// of that size's range so the outlet never undercharges.
const TIER_DEF = [
  { key: "small", label: "Small", eg: "like a tie, cap or dupatta", refs: ["Tie", "Cap / topi", "Dupatta", "Muffler / Stole", "Leggings"] },
  { key: "medium", label: "Medium", eg: "like a shirt, kurta or jeans", refs: ["Shirt", "T-Shirt", "Kurta", "Kurti", "Jeans", "Trouser / Pant"] },
  { key: "large", label: "Large", eg: "like a blazer, saree or long coat", refs: ["Blazer / Jacket / Coat", "Saree", "Long coat (ladies)", "Winter jacket"] },
  { key: "xl", label: "Extra large", eg: "like a blanket, razai or heavy lehenga", refs: ["Blanket", "Razai / Quilt / Comforter", "Lehenga", "Curtain (per panel)"] },
];
const FALLBACK_TIER = { small: [49, 99], medium: [109, 149], large: [249, 399], xl: [349, 599] };
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];

export function tiersFor(index, svc) {
  const want = svc && GARMENT_SERVICES.has(svc) ? svc : "dryclean";
  let prevLo = 0, prevHi = 0, thin = false;
  const out = TIER_DEF.map((t) => {
    const refs = new Set(t.refs.map((x) => x.toLowerCase()));
    const ps = index.prices
      .filter((r) => r.svcKey === want && r.unit !== "kg" && priceOf(r) != null && refs.has(String(r.item).toLowerCase()) && r.audience !== "kids")
      .map(priceOf).sort((a, b) => a - b);
    if (ps.length < 2) thin = true;
    let [lo, hi] = ps.length >= 2 ? [pct(ps, 0.25), pct(ps, 0.9)] : FALLBACK_TIER[t.key];
    // Sizes must climb: a bigger size never costs less than a smaller one.
    lo = Math.max(lo, prevLo);
    hi = Math.max(hi, prevHi, lo);
    prevLo = lo; prevHi = hi;
    return { ...t, svc: want, lo, hi, safe: hi };
  });
  // Not enough reference items for this service: use dry clean sizes.
  return thin && want !== "dryclean" ? tiersFor(index, "dryclean") : out;
}

// A safe price to bill an unknown item at: the top of the closest items'
// prices, so the outlet never undercharges while HQ confirms.
export function safeEstimate(rows) {
  const ps = (rows || []).map(priceOf).filter((p) => p != null);
  return ps.length ? Math.max(...ps) : null;
}

/* ── Turning answers into bill lines and WhatsApp quotes ────────── */

const BILL_SERVICE = { dryclean: "Dry Clean", press: "Ironing", washiron: "Laundry & Ironing", laundry: "Laundry", polish: "Other Services", starch: "Other Services", other: "Other Services" };

export function toCartLine(line, extra = {}) {
  const r = line.row;
  const isKg = r.unit === "kg";
  const unit_price = line.unitPrice != null ? Number(line.unitPrice) : Number(extra.price) || 0;
  const product_name = line.product?.name || (r.variant ? `${r.item} (${r.variant})` : r.item);
  const qty = Math.max(1, Math.round(Number(line.qty) || 1));
  const weight = isKg ? Number(line.weight) || 1 : null;
  const m = line.urgent ? EXPRESS_MULTIPLIER : 1;
  return {
    product_name,
    service_type: BILL_SERVICE[r.svcKey] || "Other Services",
    addons: [],
    express: !!line.urgent,
    qty,
    weight_kg: weight,
    unit: isKg ? "kg" : "piece",
    unit_price,
    line_total: Math.round((isKg ? unit_price * weight : unit_price * qty) * m),
    ...(extra.qid ? { qid: extra.qid, ptc: true } : {}),
  };
}

export function quoteText(lines, { outletName } = {}) {
  const rows = lines.filter((l) => l.total != null).map((l) => {
    const what = l.row.unit === "kg" ? `${l.weight} kg` : `${l.qty} ×`;
    const svc = SERVICE_LABEL[l.row.svcKey] && l.row.svcKey !== "other" ? ` (${SERVICE_LABEL[l.row.svcKey]})` : "";
    return `• ${what} ${l.row.label}${svc}${l.urgent ? " · express" : ""}: ₹${(l.total || 0).toLocaleString("en-IN")}`;
  });
  const total = lines.reduce((a, l) => a + (l.total || 0), 0);
  return [
    `*Whites & Brights${outletName ? ` · ${outletName}` : ""}*`,
    "Your quote:",
    ...rows,
    rows.length > 1 ? `*Total: ₹${total.toLocaleString("en-IN")}*` : null,
    "",
    "New customer? Get 25% off your first order.",
  ].filter((x) => x !== null).join("\n");
}

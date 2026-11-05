// Birthday & anniversary offers.
//
// Change the percentages / windows here — everything else (POS banner,
// Customers filter, WhatsApp wishes, Dashboard card) reads from this.
import { STORE, localIsoDate } from "../theme";

export const OCCASIONS = {
  birthday:    { label: "Birthday",    emoji: "🎂", pct: 15, before: 3, after: 7 },
  anniversary: { label: "Anniversary", emoji: "💐", pct: 10, before: 3, after: 7 },
};
// The offer is usable from `before` days ahead of the day until `after`
// days after it. Wishes are suggested for anything in the next WISH_AHEAD
// days (or still inside the offer window).
export const WISH_AHEAD = 7;

const DAY = 86400000;
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Where the customer is relative to their occasion, or null if no date.
//   days   — 0 on the day, 3 = in three days, -2 = two days ago
//   year   — the year of that occurrence (offer key = `${kind}-${year}`)
//   date   — that occurrence as a Date
//   inOffer— true while the discount can be used
export function occasionInfo(kind, value, today = new Date()) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const month = +m[2] - 1, day = +m[3];
  const t = midnight(today);
  // Try last year's, this year's and next year's occurrence; keep the closest.
  let best = null;
  for (const y of [t.getFullYear() - 1, t.getFullYear(), t.getFullYear() + 1]) {
    // 29 Feb in a non-leap year falls on 28 Feb.
    const lastDay = new Date(y, month + 1, 0).getDate();
    const d = new Date(y, month, Math.min(day, lastDay));
    const days = Math.round((d - t) / DAY);
    if (!best || Math.abs(days) < Math.abs(best.days)) best = { days, year: y, date: d };
  }
  const cfg = OCCASIONS[kind];
  return { ...best, kind, key: `${kind}-${best.year}`, inOffer: best.days <= cfg.before && best.days >= -cfg.after,
    validTill: new Date(best.date.getTime() + cfg.after * DAY) };
}

// Every occasion of a customer that's coming up soon or still in its
// offer window — used for the "Occasions" filter, wishes and Dashboard.
export function upcomingOccasions(c, today = new Date()) {
  return ["birthday", "anniversary"]
    .map((k) => occasionInfo(k, c[k], today))
    .filter((o) => o && ((o.days >= 0 && o.days <= WISH_AHEAD) || o.inOffer));
}

export const wishedThisYear = (c, o) => Number(c[`${o.kind}_wished_year`]) === o.year;

const fmtLong = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
// Shown in forms / profiles: "14 May" (or "14 May 1990" when the year is known).
export function fmtOccasion(value) {
  if (!value) return "";
  const d = new Date(String(value).slice(0, 10) + "T00:00:00");
  return d.getFullYear() === 2000 ? fmtLong(d) : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// The WhatsApp wish, with the offer pitched in. Wording adapts to "today",
// "in a few days" or "belated".
export function wishMessage(c, o) {
  const cfg = OCCASIONS[o.kind];
  const name = c.first_name || "there";
  const till = fmtLong(o.validTill);
  const greeting = o.kind === "birthday"
    ? (o.days < 0 ? `Belated happy birthday, ${name}! ${cfg.emoji}` : o.days === 0 ? `Happy Birthday, ${name}! ${cfg.emoji}` : `Your birthday is coming up, ${name}! ${cfg.emoji}`)
    : (o.days < 0 ? `Belated happy anniversary, ${name}! ${cfg.emoji}` : o.days === 0 ? `Happy Anniversary, ${name}! ${cfg.emoji}` : `Your anniversary is coming up, ${name}! ${cfg.emoji}`);
  const wish = o.kind === "birthday"
    ? "Wishing you a wonderful year ahead from all of us."
    : "Wishing you both many more happy years together.";
  return [
    `*${STORE.name}*`,
    greeting,
    ``,
    wish,
    `As our gift, enjoy *${cfg.pct}% off* your next order — valid till *${till}*.`,
    o.kind === "anniversary" ? `Perfect time to freshen up that special outfit or saree ✨` : `Get your party clothes looking their best ✨`,
    ``,
    `Just show this message at the counter or mention it when you book a pickup.`,
    `— Team ${STORE.name}`,
  ].join("\n");
}

// Turn day + month (+ optional year) into the stored date string.
export function toOccasionDate(day, month, year) {
  if (!day || !month) return null;
  const y = year && String(year).length === 4 ? year : 2000;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const todayKeyYear = () => Number(localIsoDate().slice(0, 4));

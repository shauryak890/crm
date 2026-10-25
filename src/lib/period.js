// Period model shared by every page that shows "a slice of time":
//   { mode: "day" | "week" | "month" | "year" | "all" | "custom",
//     anchor: "YYYY-MM-DD",            // any date inside the period
//     from?: "YYYY-MM-DD", to?: "YYYY-MM-DD" }   // custom only
// Pages open on the CURRENT period (today / this month) and step back
// and forth with the PeriodStepper.
import { localIsoDate } from "../theme";

// Date-only strings ("2026-10-16") are parsed as LOCAL midnight; `new
// Date("2026-10-16")` would be UTC midnight and can land on the wrong day.
export function toDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + "T00:00:00");
  return new Date(v);
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const PERIOD_MODES = [
  ["day", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Year"], ["all", "All time"], ["custom", "Custom"],
];

export const currentPeriod = (mode = "month") => ({ mode, anchor: localIsoDate() });

// [start, end) as local Dates, or null for "all".
export function periodRange(p) {
  if (!p || p.mode === "all") return null;
  if (p.mode === "custom") {
    return [toDate(p.from || p.anchor), addDays(toDate(p.to || p.from || p.anchor), 1)];
  }
  const a = toDate(p.anchor);
  if (p.mode === "day") return [startOfDay(a), addDays(a, 1)];
  if (p.mode === "week") {
    const monday = addDays(a, -((a.getDay() + 6) % 7));     // weeks run Mon–Sun
    return [monday, addDays(monday, 7)];
  }
  if (p.mode === "month") return [new Date(a.getFullYear(), a.getMonth(), 1), new Date(a.getFullYear(), a.getMonth() + 1, 1)];
  return [new Date(a.getFullYear(), 0, 1), new Date(a.getFullYear() + 1, 0, 1)];
}

export function inPeriod(value, p) {
  const r = periodRange(p);
  if (!r) return true;
  if (!value) return false;
  const t = toDate(value).getTime();
  return t >= r[0].getTime() && t < r[1].getTime();
}

export function stepPeriod(p, dir) {
  if (p.mode === "all") return p;
  if (p.mode === "custom") {
    const [s, e] = periodRange(p);
    const days = Math.round((e - s) / 86400000);
    return { ...p, from: localIsoDate(dir * days, s), to: localIsoDate(dir * days - 1, e) };
  }
  const a = toDate(p.anchor);
  const n = p.mode === "day" ? addDays(a, dir)
    : p.mode === "week" ? addDays(a, 7 * dir)
    : p.mode === "month" ? new Date(a.getFullYear(), a.getMonth() + dir, 1)
    : new Date(a.getFullYear() + dir, 0, 1);
  return { ...p, anchor: localIsoDate(0, n) };
}

// The same-length window just before `p` — for "vs previous period".
export const previousPeriod = (p) => (p.mode === "all" ? null : stepPeriod(p, -1));

// True when the period contains today (the stepper's ">" is disabled
// beyond it — there's nothing in the future to look at).
export function isCurrentOrFuture(p) {
  const r = periodRange(p);
  return !r || r[1].getTime() > Date.now();
}

const fmt = (d, o) => d.toLocaleDateString("en-GB", o);
export function periodLabel(p) {
  if (!p || p.mode === "all") return "All time";
  const [s, e] = periodRange(p);
  const last = addDays(e, -1);
  if (p.mode === "day") {
    const today = localIsoDate();
    if (p.anchor === today) return "Today";
    if (p.anchor === localIsoDate(-1)) return "Yesterday";
    if (p.anchor === localIsoDate(1)) return "Tomorrow";
    return fmt(s, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  }
  if (p.mode === "month") return fmt(s, { month: "long", year: "numeric" });
  if (p.mode === "year") return String(s.getFullYear());
  const sameYear = s.getFullYear() === last.getFullYear();
  return `${fmt(s, { day: "2-digit", month: "short", ...(sameYear ? {} : { year: "numeric" }) })} – ${fmt(last, { day: "2-digit", month: "short", year: "numeric" })}`;
}

// A noun for "vs previous …" captions.
export const periodNoun = (p) => ({ day: "previous day", week: "previous week", month: "previous month", year: "previous year", custom: "previous period" }[p?.mode] || "");

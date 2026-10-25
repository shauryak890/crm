// Shared building blocks for list pages: period stepper, filter chips,
// summary strip, side drawer, segmented toggle, skeleton rows, and
// usePersistentState (per-browser remembered view preferences).
import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X, CalendarDays } from "lucide-react";
import { C, localIsoDate } from "../theme";
import { useEscape, iconBtn } from "./ui";
import { PERIOD_MODES, periodLabel, stepPeriod, isCurrentOrFuture, currentPeriod, periodRange } from "../lib/period";

/* ── Remembered preferences ───────────────────────────────────────────
   localStorage can throw (private mode, blocked storage) — every access
   is wrapped and falls back to the default, so the page still works. */
export function usePersistentState(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const raw = localStorage.getItem("wb:" + key);
      return raw == null ? (typeof initial === "function" ? initial() : initial) : JSON.parse(raw);
    } catch { return typeof initial === "function" ? initial() : initial; }
  });
  useEffect(() => {
    try { localStorage.setItem("wb:" + key, JSON.stringify(v)); } catch { /* storage blocked */ }
  }, [key, v]);
  return [v, setV];
}

// A remembered period that always re-opens on the CURRENT window of the
// remembered mode (the mode is a preference; last week's date is not).
export function usePeriod(key, defaultMode = "month") {
  const [mode, setMode] = usePersistentState(key + ":mode", defaultMode);
  const [p, setP] = useState(() => (mode === "custom" ? currentPeriod("month") : currentPeriod(mode)));
  const set = (next) => { setP(next); if (next.mode !== "custom") setMode(next.mode); };
  return [p, set];
}

/* ── Period stepper  ‹ October 2026 › ─────────────────────────────── */
export function PeriodStepper({ value, onChange, modes = ["day", "week", "month", "year", "all", "custom"], allowFuture = false, dark = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const canStep = value.mode !== "all";
  const nextDisabled = !allowFuture && isCurrentOrFuture(value);
  const fg = dark ? "#fff" : C.navy;
  const bg = dark ? "rgba(255,255,255,.08)" : "#fff";
  const bd = dark ? "rgba(255,255,255,.14)" : C.border;
  const arrow = (dir, disabled) => (
    <button type="button" disabled={disabled} onClick={() => onChange(stepPeriod(value, dir))}
      aria-label={dir < 0 ? "Previous period" : "Next period"}
      style={{ ...iconBtn("transparent", fg), width: 32, height: 34, opacity: disabled ? 0.3 : 1, cursor: disabled ? "default" : "pointer" }}>
      {dir < 0 ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
    </button>
  );
  const range = periodRange(value);
  const isNow = range && Date.now() >= range[0].getTime() && Date.now() < range[1].getTime();

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center", background: bg, border: `1px solid ${bd}`, borderRadius: 11 }}>
      {canStep && arrow(-1, false)}
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ border: "none", background: "transparent", color: fg, fontWeight: 700, fontSize: 13, padding: "8px 6px", cursor: "pointer",
          minWidth: 132, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" }}>
        <CalendarDays size={14} style={{ opacity: 0.6 }} /> {periodLabel(value)}
      </button>
      {canStep && arrow(1, nextDisabled)}
      {open && (
        <div className="wb-fade-in" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40, background: "#fff", border: `1px solid ${C.border}`,
          borderRadius: 12, boxShadow: "0 18px 40px -18px rgba(15,42,59,.3)", padding: 10, width: 260, maxWidth: "calc(100vw - 24px)" }}>
          <div className="grid gap-1" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            {PERIOD_MODES.filter(([m]) => modes.includes(m)).map(([m, label]) => (
              <button key={m} type="button"
                onClick={() => {
                  if (m === "custom") onChange({ mode: "custom", anchor: localIsoDate(), from: localIsoDate(-29), to: localIsoDate() });
                  else { onChange(currentPeriod(m)); setOpen(false); }
                }}
                style={{ border: "none", borderRadius: 8, padding: "7px 0", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: value.mode === m ? C.navy : C.bg, color: value.mode === m ? "#fff" : C.textMute }}>{label}</button>
            ))}
          </div>
          {value.mode === "custom" && (
            <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 10 }}>
              {[["from", "From"], ["to", "To"]].map(([k, l]) => (
                <label key={k} style={{ fontSize: 11, fontWeight: 600, color: C.textMute }}>{l}
                  <input type="date" value={value[k] || ""} max={k === "from" ? value.to : (allowFuture ? undefined : localIsoDate())}
                    min={k === "to" ? value.from : undefined}
                    onChange={(e) => e.target.value && onChange({ ...value, [k]: e.target.value })}
                    style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 6px", fontSize: 12, marginTop: 3 }} />
                </label>
              ))}
            </div>
          )}
          {!isNow && value.mode !== "all" && value.mode !== "custom" && (
            <button type="button" onClick={() => { onChange(currentPeriod(value.mode)); setOpen(false); }}
              style={{ marginTop: 10, width: "100%", border: `1px solid ${C.border}`, background: "#fff", borderRadius: 8, padding: "7px 0", fontSize: 12, fontWeight: 600, color: C.tealDark, cursor: "pointer" }}>
              Jump to current {value.mode}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Filter chips with counts ─────────────────────────────────────── */
// chips: [{ key, label, count?, tone? }] — tone "danger"|"warn" tints the
// count when it's non-zero so problems stand out before you click.
export function FilterChips({ chips, value, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {chips.map((c) => {
        const active = value === c.key;
        const alert = !active && c.count > 0 && (c.tone === "danger" || c.tone === "warn");
        const tint = c.tone === "danger" ? C.red : C.amber;
        return (
          <button key={c.key} type="button" onClick={() => onChange(c.key)} className="wb-press"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 99, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              border: active ? "none" : `1px solid ${alert ? tint + "55" : C.border}`,
              background: active ? C.navy : "#fff", color: active ? "#fff" : alert ? tint : C.textMute }}>
            {c.label}
            {c.count != null && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                background: active ? "rgba(255,255,255,.18)" : alert ? tint + "18" : C.bg }}>{c.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Summary strip — totals for whatever is currently filtered ────── */
// items: [{ label, value, sub?, tone?: "green"|"red"|"amber"|"navy", onClick? }]
export function SummaryStrip({ items, style }) {
  const color = { green: C.green, red: C.red, amber: C.amber, navy: C.navy, teal: C.tealDark };
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(170px, 1fr))`, marginBottom: 16, ...style }}>
      {items.map((it) => {
        const Tag = it.onClick ? "button" : "div";
        return (
          <Tag key={it.label} onClick={it.onClick} className={it.onClick ? "wb-lift" : undefined}
            style={{ textAlign: "left", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 16px", cursor: it.onClick ? "pointer" : "default" }}>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: C.textMute }}>{it.label}</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: color[it.tone] || C.navy, marginTop: 2, letterSpacing: "-.01em" }}>{it.value}</p>
            {it.sub && <p style={{ fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>{it.sub}</p>}
          </Tag>
        );
      })}
    </div>
  );
}

/* ── Segmented toggle ─────────────────────────────────────────────── */
export function Segmented({ options, value, onChange, small }) {
  return (
    <div className="flex items-center" style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: 2 }}>
      {options.map(([k, label]) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          style={{ border: "none", cursor: "pointer", padding: small ? "5px 10px" : "6px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            background: value === k ? C.navy : "transparent", color: value === k ? "#fff" : C.textMute, whiteSpace: "nowrap" }}>{label}</button>
      ))}
    </div>
  );
}

/* ── Side drawer — details slide in from the right ────────────────── */
export function Drawer({ title, sub, onClose, children, footer, width = 480 }) {
  useEscape(onClose);
  return (
    <div className="wb-fade-in" style={{ position: "fixed", inset: 0, background: "rgba(15,42,59,.32)", zIndex: 50 }} onClick={onClose}>
      <aside onClick={(e) => e.stopPropagation()} className="wb-drawer-in"
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, width, maxWidth: "100vw", background: "#fff",
          boxShadow: "-24px 0 60px -24px rgba(15,42,59,.4)", display: "flex", flexDirection: "column" }}>
        <div className="flex items-start justify-between" style={{ padding: "18px 20px", borderBottom: `1px solid ${C.borderSoft}`, gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontWeight: 700, fontSize: 17, color: C.navy, letterSpacing: "-.01em" }}>{title}</h3>
            {sub && <div style={{ fontSize: 12.5, color: C.textMute, marginTop: 3 }}>{sub}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={iconBtn(C.bg, C.textMute)}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>{children}</div>
        {footer && <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.borderSoft}`, background: C.paper }}>{footer}</div>}
      </aside>
    </div>
  );
}

// Label/value row for drawers.
export function KV({ k, v, color }) {
  return (
    <div className="flex items-start justify-between" style={{ fontSize: 13, padding: "5px 0", gap: 12 }}>
      <span style={{ color: C.textMute, flexShrink: 0 }}>{k}</span>
      <span style={{ fontWeight: 600, color: color || C.navy, textAlign: "right" }}>{v}</span>
    </div>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <div className="flex items-center justify-between" style={{ margin: "18px 0 8px" }}>
      <p className="wb-eyebrow">{children}</p>{right}
    </div>
  );
}

/* ── Skeleton placeholder rows (instead of "Loading…") ────────────── */
export function SkeletonRows({ rows = 5, cols = 5 }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r}>
      {Array.from({ length: cols }, (_, c) => (
        <td key={c} style={{ padding: "16px 18px", borderBottom: `1px solid ${C.borderSoft}` }}>
          <div className="wb-skel" style={{ height: 12, width: `${50 + ((r * 7 + c * 13) % 45)}%` }} />
        </td>
      ))}
    </tr>
  ));
}
export const SkeletonBlock = ({ h = 14, w = "100%", style }) => <div className="wb-skel" style={{ height: h, width: w, ...style }} />;

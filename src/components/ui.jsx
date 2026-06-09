import React, { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { C, DISPLAY } from "../theme";

export function Logo({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <path d="M24 9.5c0-2.2 1.9-4 4.1-4 2.1 0 3.9 1.8 3.9 4" stroke={C.teal} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M24 9.5v2.6" stroke={C.teal} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M24 12.5 8.5 27c-1.4 1.3-.5 2.6 1 3l14.5 3.6 14.5-3.6c1.5-.4 2.4-1.7 1-3L24 12.5Z" fill="#fff" />
      <path d="M7.5 33c5.5-3.6 12-4.6 18-2.4 6 2.2 9.6 5.4 9.6 5.4-6.2-2-12.3-2.8-18-1.4-5.6 1.4-9.6 .9-9.6-1.6Z" fill={C.teal} />
      <circle cx="29" cy="34" r="1.5" fill="#fff" />
    </svg>
  );
}

export function Badge({ tone = "muted", children }) {
  const map = {
    success: { bg: C.greenLt, fg: C.green },
    danger: { bg: C.redLt, fg: C.red },
    warn: { bg: C.amberLt, fg: C.amber },
    info: { bg: C.tealLight, fg: C.tealDark },
    navy: { bg: "#E8EEF2", fg: C.navy },
    muted: { bg: "#EEF2F5", fg: C.textMute },
  }[tone];
  return (
    <span className="inline-flex items-center gap-1 rounded-full"
      style={{ background: map.bg, color: map.fg, fontSize: 11.5, fontWeight: 700, padding: "4px 10px", letterSpacing: ".01em" }}>
      {children}
    </span>
  );
}

export function Btn({ variant = "primary", icon: Icon, children, onClick, full, small, type = "button", disabled }) {
  const styles = {
    primary: { background: C.teal,  color: "#fff", border: "none" },
    navy:    { background: C.navy,  color: "#fff", border: "none" },
    outline: { background: "#fff", color: C.navy, border: `1px solid ${C.border}` },
    ghost:   { background: "transparent", color: C.textMute, border: "none" },
    danger:  { background: C.redLt, color: C.red, border: "none" },
    success: { background: C.green, color: "#fff", border: "none" },
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`wb-press inline-flex items-center justify-center gap-2 rounded-xl ${full ? "w-full" : ""}`}
      style={{ ...styles, padding: small ? "8px 14px" : "10px 18px", fontWeight: 600, fontSize: small ? 12.5 : 13.5, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1, whiteSpace: "nowrap" }}>
      {Icon && <Icon size={small ? 15 : 16} />}
      {children}
    </button>
  );
}

export function Card({ children, pad = true, style, hover = false }) {
  return (
    <div className={hover ? "wb-lift" : undefined}
      style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: "0 1px 2px rgba(15,42,59,.02)", padding: pad ? 22 : 0, ...style }}>
      {children}
    </div>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-3" style={{ marginBottom: 24 }}>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: C.navy, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{title}</h1>
        {sub && <p style={{ color: C.textMute, fontSize: 13.5, marginTop: 6, maxWidth: 560, lineHeight: 1.5 }}>{sub}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

// Soft-circle icon background — used by stat cards & list items.
export function IconCircle({ icon: Icon, tone = "teal", size = 42 }) {
  const palette = {
    teal:  { bg: C.tealSoft, fg: C.tealDark },
    navy:  { bg: "#EEF2F5",  fg: C.navy },
    green: { bg: C.greenLt,  fg: C.green },
    red:   { bg: C.redLt,    fg: C.red },
    amber: { bg: C.amberLt,  fg: C.amber },
  }[tone] || { bg: C.tealSoft, fg: C.tealDark };
  return (
    <div className="flex items-center justify-center rounded-full"
      style={{ width: size, height: size, background: palette.bg, color: palette.fg, flexShrink: 0 }}>
      <Icon size={Math.round(size * 0.46)} strokeWidth={1.8} />
    </div>
  );
}

// Tiny trend chip used on stat cards (e.g. "+3.2% from last month").
export function Trend({ delta, label = "from last month" }) {
  const n = Number(delta) || 0;
  const up = n >= 0;
  return (
    <div className="inline-flex items-center gap-1" style={{ marginTop: 8, fontSize: 11.5, fontWeight: 600 }}>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 2,
        background: up ? C.greenLt : C.redLt, color: up ? C.green : C.red,
        padding: "2px 8px", borderRadius: 99,
      }}>
        {up ? "▲" : "▼"} {Math.abs(n).toFixed(1)}%
      </span>
      <span style={{ color: C.textFaint, fontWeight: 500 }}>{label}</span>
    </div>
  );
}

export const td = { padding: "14px 18px", fontSize: 13.5, color: C.text, borderBottom: `1px solid ${C.borderSoft}`, verticalAlign: "middle" };
export const iconBtn = (bg, fg) => ({ width: 36, height: 36, borderRadius: 10, background: bg, color: fg, border: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "background .2s var(--ease)" });
export const field = { width: "100%", border: `1px solid ${C.border}`, borderRadius: 11, padding: "11px 14px", fontSize: 14, outline: "none", color: C.text, background: "#fff", transition: "border-color .2s var(--ease), box-shadow .2s var(--ease)" };
export const fieldLabel = { fontSize: 12.5, fontWeight: 600, color: C.navy, marginBottom: 6, display: "block" };

/* Searchable, paginated table ------------------------------------- */
export function DataTable({ columns, data, searchKeys, renderRow, placeholder = "Search…", defaultEntries = 10, loading }) {
  const [q, setQ] = useState("");
  const [entries, setEntries] = useState(defaultEntries);
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => data.filter((r) => searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q.toLowerCase()))),
    [q, data, searchKeys]
  );
  const pages = Math.max(1, Math.ceil(filtered.length / entries));
  const cur = Math.min(page, pages);
  const start = (cur - 1) * entries;
  const shown = filtered.slice(start, start + entries);

  return (
    <Card pad={false}>
      <div className="flex items-center justify-between flex-wrap gap-3" style={{ padding: "18px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
        <div className="flex items-center gap-2" style={{ fontSize: 13, color: C.textMute }}>
          Show
          <select value={entries} onChange={(e) => { setEntries(+e.target.value); setPage(1); }}
            style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: "6px 10px", color: C.text, fontWeight: 600, background: "#fff" }}>
            {[10, 25, 50, 100].map((n) => <option key={n}>{n}</option>)}
          </select>
          entries
        </div>
        <div className="flex items-center gap-2 rounded-xl" style={{ border: `1px solid ${C.border}`, padding: "8px 12px", background: "#fff", minWidth: 240 }}>
          <Search size={15} color={C.textFaint} />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={placeholder}
            style={{ border: "none", outline: "none", fontSize: 13.5, color: C.text, width: "100%", background: "transparent" }} />
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr style={{ background: "#F7FAFB" }}>
              {columns.map((c) => (
                <th key={c} style={{ textAlign: "left", padding: "13px 18px", fontSize: 11.5, fontWeight: 700, color: C.textMute, textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap" }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} style={{ ...td, textAlign: "center", padding: "40px 0", color: C.textFaint }}>Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={columns.length} style={{ ...td, textAlign: "center", padding: "40px 0", color: C.textFaint }}>No records yet.</td></tr>
            ) : shown.map(renderRow)}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-3" style={{ padding: "14px 20px", borderTop: `1px solid ${C.borderSoft}`, fontSize: 13, color: C.textMute }}>
        <span>Showing {shown.length ? start + 1 : 0} to {start + shown.length} of {filtered.length} entries</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, color: cur === 1 ? C.textFaint : C.navy, background: "#fff", cursor: "pointer" }}>Previous</button>
          <span style={{ border: "none", borderRadius: 9, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, color: "#fff", background: C.teal }}>{cur}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))}
            style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, color: cur === pages ? C.textFaint : C.navy, background: "#fff", cursor: "pointer" }}>Next</button>
        </div>
      </div>
    </Card>
  );
}

/* Modal shell ----------------------------------------------------- */
export function Modal({ title, sub, onClose, children, width = 480 }) {
  return (
    <div className="wb-fade-in flex items-center justify-center" style={{ position: "fixed", inset: 0, background: "rgba(15,42,59,.4)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", zIndex: 50, padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="wb-modal-in"
        style={{ background: "#fff", borderRadius: 18, width, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 30px 80px -20px rgba(15,42,59,.45)", border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between" style={{ padding: "20px 22px", borderBottom: `1px solid ${C.borderSoft}` }}>
          <div>
            <h3 style={{ fontWeight: 700, fontSize: 17, color: C.navy, letterSpacing: "-.01em", lineHeight: 1.2 }}>{title}</h3>
            {sub && <p style={{ fontSize: 12.5, color: C.textMute, marginTop: 3 }}>{sub}</p>}
          </div>
          <button onClick={onClose} style={iconBtn(C.bg, C.textMute)}><X size={16} /></button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, ReceiptText, User } from "lucide-react";
import { C, inr, orderRef, normPhone, fmtDate } from "../theme";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");

// Header search: finds orders (by #, name, phone) and customers (by name,
// phone, code). Picking an order opens its invoice; picking a customer
// opens the Customers page filtered to them. Ctrl/⌘ K focuses it.
export default function GlobalSearch({ orders, customers, onOpenOrder, onOpenCustomer }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const digits = term.replace(/\D/g, "");
    const phoneHit = (p) => digits.length >= 4 && normPhone(p).includes(digits);
    const ords = orders
      .filter((o) => orderRef(o).toLowerCase().includes(term) || (o.customer_name || "").toLowerCase().includes(term) || phoneHit(o.phone))
      .slice(0, 6)
      .map((o) => ({ kind: "order", key: "o" + o.id, item: o }));
    const custs = customers
      .filter((c) => `${c.first_name} ${c.last_name || ""}`.toLowerCase().includes(term) || String(c.code || "").toLowerCase().includes(term) || phoneHit(c.phone))
      .slice(0, 4)
      .map((c) => ({ kind: "customer", key: "c" + c.id, item: c }));
    return [...ords, ...custs];
  }, [q, orders, customers]);

  const pick = (r) => {
    if (!r) return;
    if (r.kind === "order") onOpenOrder(r.item);
    else onOpenCustomer(r.item);
    setOpen(false); setQ("");
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") pick(results[hi]);
    else if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
  };

  return (
    <div style={{ flex: 1, maxWidth: 460, position: "relative" }}>
      <div className="flex items-center gap-2" style={{ background: C.bg, border: `1px solid ${C.border}`, padding: "8px 14px", borderRadius: 11 }}>
        <Search size={15} color={C.textFaint} />
        <input ref={inputRef} value={q} placeholder="Search orders, customers, phone…"
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          style={{ flex: 1, border: "none", outline: "none", fontSize: 13.5, background: "transparent", color: C.text, minWidth: 0 }} />
        <span className="wb-kbd">{isMac ? "⌘ K" : "Ctrl K"}</span>
      </div>
      {open && q.trim().length >= 2 && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "#fff", border: `1px solid ${C.border}`,
          borderRadius: 12, boxShadow: "0 18px 40px -18px rgba(15,42,59,.3)", zIndex: 45, overflow: "hidden" }}>
          {results.length === 0 ? (
            <p style={{ padding: "14px 16px", fontSize: 13, color: C.textFaint }}>No matching orders or customers.</p>
          ) : results.map((r, i) => (
            <button key={r.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)} onMouseEnter={() => setHi(i)}
              className="flex items-center gap-3 w-full"
              style={{ padding: "10px 14px", border: "none", borderTop: i ? `1px solid ${C.borderSoft}` : "none", cursor: "pointer", textAlign: "left",
                background: i === hi ? C.bg : "#fff" }}>
              {r.kind === "order" ? <ReceiptText size={15} color={C.tealDark} /> : <User size={15} color={C.navy} />}
              {r.kind === "order" ? (
                <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                  <b style={{ color: C.navy }}>#{orderRef(r.item)}</b> · {r.item.customer_name}
                  <span style={{ color: C.textFaint, fontSize: 11.5 }}> · {fmtDate(r.item.created_at)}</span>
                </span>
              ) : (
                <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                  <b style={{ color: C.navy }}>{r.item.first_name} {r.item.last_name}</b>
                  <span style={{ color: C.textFaint, fontSize: 11.5 }}> · {r.item.code} · {r.item.phone}</span>
                </span>
              )}
              {r.kind === "order" && <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{inr(r.item.total)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

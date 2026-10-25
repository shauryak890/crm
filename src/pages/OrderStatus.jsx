import React, { useMemo, useRef, useState, useEffect } from "react";
import { ScanLine, Shirt, Smartphone, LayoutGrid, List, EyeOff, Eye, Maximize2, X, CheckSquare, Square } from "lucide-react";
import { C, DISPLAY, KANBAN, APP_LIFECYCLE, APP_LIFECYCLE_LABEL, orderRef, findOrdersByRef, isCancelled, isDelivered, localIsoDate, fmtDay, fmtDate } from "../theme";
import { Card, PageHead, Badge, Btn } from "../components/ui";
import { Segmented, usePersistentState } from "../components/kit";

const isLate = (o) => o.due_date && o.due_date < localIsoDate();

// Short feedback tone for the scanner (no audio file needed).
function beep(ok) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.frequency.value = ok ? 880 : 220; osc.type = ok ? "sine" : "square";
    g.gain.value = 0.08; osc.connect(g); g.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + (ok ? 0.12 : 0.3));
    osc.onended = () => ctx.close();
  } catch { /* audio unavailable */ }
}

export default function OrderStatus({ orders, onStatus, onOpenInvoice }) {
  const [scan, setScan] = useState("");
  const [scanMsg, setScanMsg] = useState(null); // { tone, text } after each scan
  const [scanMode, setScanMode] = useState(false);
  const [q, setQ] = useState("");
  const [layout, setLayout] = usePersistentState("orderstatus:layout", "board");
  const [hidden, setHidden] = usePersistentState("orderstatus:hidden", []);
  const [selected, setSelected] = useState(() => new Set());
  const [lateOnly, setLateOnly] = useState(false);

  // The boards are for work in progress: delivered and cancelled orders
  // are done, whichever of the two status columns says so.
  const term = q.trim().toLowerCase();
  const open = orders.filter((o) => !isDelivered(o) && !isCancelled(o) && o.delivery_status !== "Cancelled"
    && (!lateOnly || isLate(o))
    && (!term || `${o.customer_name} ${orderRef(o)} ${o.phone || ""}`.toLowerCase().includes(term)));
  // App orders (channel='app') use the app lifecycle vocabulary so outlet
  // status changes flow live to the customer + driver apps. Walk-in/CRM
  // orders keep the plant Kanban.
  const appOrders = open.filter((o) => o.channel === "app");
  const shopOrders = open.filter((o) => o.channel !== "app");
  const shopCols = KANBAN.filter((s) => s !== "Delivered");
  const appCols = APP_LIFECYCLE.filter((s) => s !== "delivered");

  const onScan = async (raw) => {
    if (!raw.trim()) return;
    const matches = findOrdersByRef(orders, raw);
    setScan("");
    if (matches.length === 1) {
      const match = matches[0];
      // Advance one stage along whichever lifecycle this order belongs to.
      const flow = match.channel === "app" ? APP_LIFECYCLE : KANBAN;
      const idx = flow.indexOf(match.order_status);
      const next = idx >= 0 ? flow[Math.min(idx + 1, flow.length - 1)] : flow[0];
      if (next === match.order_status) {
        beep(false);
        setScanMsg({ tone: "warn", text: `#${orderRef(match)} is already at the last stage (${next}).` });
        return;
      }
      const ok = await onStatus(match.id, next);
      beep(ok);
      setScanMsg(ok
        ? { tone: "success", text: `#${orderRef(match)} → ${match.channel === "app" ? (APP_LIFECYCLE_LABEL[next] || next) : next}`, who: match.customer_name }
        : { tone: "warn", text: `#${orderRef(match)} was not moved.` });
    } else {
      beep(false);
      setScanMsg(matches.length > 1
        ? { tone: "warn", text: `${raw.trim()} exists at more than one outlet — scan the barcode or type the full number, e.g. ${orderRef(matches[0])}.` }
        : { tone: "danger", text: `No order found for "${raw.trim()}".` });
    }
  };

  const toggleSel = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedOrders = open.filter((o) => selected.has(o.id));
  const selChannel = selectedOrders.length && selectedOrders.every((o) => o.channel === "app") ? "app"
    : selectedOrders.length && selectedOrders.every((o) => o.channel !== "app") ? "shop" : "mixed";
  const moveSelected = async (status) => {
    let moved = 0;
    for (const o of selectedOrders) { if (await onStatus(o.id, status)) moved++; }
    setSelected(new Set());
    setScanMsg({ tone: "success", text: `${moved} order${moved === 1 ? "" : "s"} moved to ${APP_LIFECYCLE_LABEL[status] || status}.` });
  };

  const msgColor = (t) => (t === "success" ? C.green : t === "warn" ? C.amber : C.red);

  return (
    <div>
      <PageHead title="Order Status" sub={`${open.length} order${open.length === 1 ? "" : "s"} in progress · oldest first`}>
        <Segmented value={layout} onChange={setLayout} options={[["board", <span key="b" className="inline-flex items-center gap-1"><LayoutGrid size={13} /> Board</span>], ["list", <span key="l" className="inline-flex items-center gap-1"><List size={13} /> List</span>]]} />
        <Btn variant="navy" small icon={Maximize2} onClick={() => setScanMode(true)}>Scan mode</Btn>
      </PageHead>
      <Card style={{ marginBottom: 18 }}>
        <div className="flex items-center gap-3 flex-wrap">
          <ScanLine size={20} color={C.tealDark} />
          <span style={{ fontWeight: 700, color: C.navy, fontSize: 14 }}>Scan Barcode</span>
          <input value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onScan(scan)} autoFocus
            placeholder="Scan or type order # then press Enter — advances it one stage…"
            style={{ flex: 1, minWidth: 220, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 14px", fontSize: 13.5, outline: "none" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter: name / # / phone"
            style={{ width: 210, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 14px", fontSize: 13.5, outline: "none" }} />
          <button onClick={() => setLateOnly((v) => !v)}
            style={{ padding: "9px 12px", borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: lateOnly ? "none" : `1px solid ${C.border}`, background: lateOnly ? C.red : "#fff", color: lateOnly ? "#fff" : C.red }}>
            Late only · {orders.filter((o) => !isDelivered(o) && !isCancelled(o) && o.delivery_status !== "Cancelled" && isLate(o)).length}
          </button>
        </div>
        {scanMsg && <p style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: msgColor(scanMsg.tone) }}>{scanMsg.text}</p>}
      </Card>

      {/* Bulk-move bar — appears once cards are ticked */}
      {selectedOrders.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap wb-fade-in" style={{ position: "sticky", top: 0, zIndex: 5, background: C.navy, color: "#fff", borderRadius: 14, padding: "10px 14px", marginBottom: 14 }}>
          <b style={{ fontSize: 13 }}>{selectedOrders.length} selected</b>
          {selChannel === "mixed" ? (
            <span style={{ fontSize: 12.5, color: "#9FB5C5" }}>Select only walk-in or only app orders to move them together.</span>
          ) : (
            <>
              <span style={{ fontSize: 12.5, color: "#9FB5C5" }}>Move to</span>
              <select defaultValue="" onChange={(e) => e.target.value && moveSelected(e.target.value)}
                style={{ border: "none", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, fontWeight: 600, color: C.navy }}>
                <option value="" disabled>Choose stage…</option>
                {(selChannel === "app" ? APP_LIFECYCLE : KANBAN).map((s) => <option key={s} value={s}>{APP_LIFECYCLE_LABEL[s] || s}</option>)}
              </select>
            </>
          )}
          <button onClick={() => setSelected(new Set())} style={{ marginLeft: "auto", border: "none", background: "rgba(255,255,255,.12)", color: "#fff", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Clear</button>
        </div>
      )}

      {layout === "list" ? (
        <ListView orders={open} selected={selected} toggleSel={toggleSel} onStatus={onStatus} onOpenInvoice={onOpenInvoice} />
      ) : (
        <>
          {appOrders.length > 0 && (
            <div style={{ marginBottom: 26 }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                <Smartphone size={16} color={C.tealDark} />
                <h3 style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 800, color: C.navy }}>App orders</h3>
                <span style={{ fontSize: 12, color: C.textMute }}>· status here updates the customer & driver apps live</span>
              </div>
              <Board cols={appCols} colLabel={(s) => APP_LIFECYCLE_LABEL[s] || s} options={APP_LIFECYCLE} optionLabel={(s) => APP_LIFECYCLE_LABEL[s] || s}
                orders={appOrders} onStatus={onStatus} selected={selected} toggleSel={toggleSel} hidden={hidden} setHidden={setHidden} />
            </div>
          )}
          {appOrders.length > 0 && (
            <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
              <Shirt size={16} color={C.tealDark} />
              <h3 style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 800, color: C.navy }}>Walk-in orders</h3>
            </div>
          )}
          <Board cols={shopCols} colLabel={(s) => s} options={KANBAN} optionLabel={(s) => s}
            orders={shopOrders} onStatus={onStatus} selected={selected} toggleSel={toggleSel} hidden={hidden} setHidden={setHidden} />
        </>
      )}

      {scanMode && <ScanMode onClose={() => setScanMode(false)} onScan={onScan} msg={scanMsg} />}
    </div>
  );
}

/* Full-screen scanner: one huge input, big coloured result, beep. */
function ScanMode({ onClose, onScan, msg }) {
  const [v, setV] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const bg = !msg ? C.navy : msg.tone === "success" ? "#13734F" : msg.tone === "warn" ? "#8A5B12" : "#8E2A2E";
  return (
    <div onClick={() => ref.current?.focus()} style={{ position: "fixed", inset: 0, zIndex: 70, background: bg, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, transition: "background .2s" }}>
      <button onClick={onClose} style={{ position: "absolute", top: 18, right: 18, border: "none", background: "rgba(255,255,255,.14)", color: "#fff", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontWeight: 600, display: "inline-flex", gap: 6, alignItems: "center" }}><X size={15} /> Exit · Esc</button>
      <ScanLine size={44} style={{ opacity: .7 }} />
      <p style={{ fontSize: 15, opacity: .8, marginTop: 10 }}>Scan a tag or invoice — each scan moves the order one stage</p>
      <input ref={ref} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => setTimeout(() => ref.current?.focus(), 50)}
        onKeyDown={(e) => { if (e.key === "Enter") { onScan(v); setV(""); } }}
        style={{ marginTop: 22, width: "min(520px, 90vw)", fontSize: 28, fontWeight: 700, textAlign: "center", border: "none", borderRadius: 16, padding: "16px 20px", color: C.navy, outline: "none" }} />
      {msg && <p style={{ marginTop: 26, fontSize: 30, fontWeight: 800, textAlign: "center", maxWidth: 800 }}>{msg.text}</p>}
      {msg?.who && <p style={{ marginTop: 6, fontSize: 18, opacity: .85 }}>{msg.who}</p>}
    </div>
  );
}

/* Sortable list alternative to the kanban — easier with 75 cards. */
function ListView({ orders, selected, toggleSel, onStatus, onOpenInvoice }) {
  const [sortBy, setSortBy] = useState("due");
  const rows = useMemo(() => orders.slice().sort((a, b) =>
    sortBy === "due" ? String(a.due_date || "9999").localeCompare(String(b.due_date || "9999"))
      : sortBy === "stage" ? String(a.order_status).localeCompare(String(b.order_status))
      : new Date(a.created_at) - new Date(b.created_at)), [orders, sortBy]);
  const th = (k, label) => (
    <th onClick={k ? () => setSortBy(k) : undefined} style={{ textAlign: "left", padding: "11px 14px", fontSize: 11, fontWeight: 700, color: sortBy === k ? C.navy : C.textMute, textTransform: "uppercase", letterSpacing: ".04em", cursor: k ? "pointer" : "default", whiteSpace: "nowrap" }}>
      {label}{sortBy === k ? " ↓" : ""}
    </th>
  );
  const allOn = rows.length > 0 && rows.every((o) => selected.has(o.id));
  return (
    <Card pad={false}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead><tr style={{ background: "#F7FAFB" }}>
            <th style={{ padding: "11px 14px", width: 36 }}>
              <button onClick={() => rows.forEach((o) => (allOn ? selected.has(o.id) : !selected.has(o.id)) && toggleSel(o.id))} style={{ border: "none", background: "none", cursor: "pointer", color: C.navy, display: "inline-flex" }} aria-label="Select all">
                {allOn ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>
            </th>
            {th(null, "Order")}{th("created", "Billed")}{th("due", "Due")}{th("stage", "Stage")}
          </tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={5} style={{ padding: 30, textAlign: "center", color: C.textFaint, fontSize: 13 }}>Nothing in progress.</td></tr>
              : rows.map((o) => (
                <tr key={o.id} style={{ borderTop: `1px solid ${C.borderSoft}`, background: selected.has(o.id) ? C.tealSoft : undefined }}>
                  <td style={{ padding: "10px 14px" }}>
                    <button onClick={() => toggleSel(o.id)} style={{ border: "none", background: "none", cursor: "pointer", color: C.navy, display: "inline-flex" }} aria-label="Select">
                      {selected.has(o.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 13 }}>
                    <button onClick={() => onOpenInvoice && onOpenInvoice(o)} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontWeight: 700, color: C.navy }}>#{orderRef(o)}</button>
                    <span style={{ color: C.text }}> · {o.customer_name}</span>
                    {o.channel === "app" && <span style={{ marginLeft: 6 }}><Badge tone="info">App</Badge></span>}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12.5, color: C.textMute }}>{fmtDate(o.created_at)}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12.5, fontWeight: 600, color: isLate(o) ? C.red : C.textMute }}>{fmtDay(o.due_date)}{isLate(o) ? " · late" : ""}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <select value={o.order_status} onChange={(e) => onStatus(o.id, e.target.value)}
                      style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: "6px 8px", fontSize: 12.5, fontWeight: 600, color: C.tealDark, background: C.tealLight }}>
                      {(o.channel === "app" ? APP_LIFECYCLE : KANBAN).map((s) => <option key={s} value={s}>{APP_LIFECYCLE_LABEL[s] || s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// A horizontal Kanban board over a given set of columns/options.
function Board({ cols, colLabel, options, optionLabel, orders, onStatus, selected, toggleSel, hidden, setHidden }) {
  const visibleCols = cols.filter((c) => !hidden.includes(c));
  const hiddenHere = cols.filter((c) => hidden.includes(c));
  return (
    <>
      {hiddenHere.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 10, fontSize: 12, color: C.textMute }}>
          <EyeOff size={13} /> Hidden:
          {hiddenHere.map((c) => {
            const n = orders.filter((o) => o.order_status === c).length;
            return (
              <button key={c} onClick={() => setHidden(hidden.filter((h) => h !== c))}
                style={{ border: `1px solid ${n ? C.amber : C.border}`, background: "#fff", borderRadius: 99, padding: "3px 10px", fontSize: 11.5, fontWeight: 600, color: n ? C.amber : C.textMute, cursor: "pointer" }}>
                <Eye size={11} style={{ verticalAlign: "-1px" }} /> {colLabel(c)}{n ? ` · ${n}` : ""}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
        {visibleCols.map((col) => {
          // Oldest first — the order that has waited longest is at the top.
          const items = orders.filter((o) => o.order_status === col).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          return (
            <div key={col} style={{ minWidth: 250, flex: "0 0 250px" }}>
              <div className="flex items-center justify-between rounded-xl" style={{ background: C.navy, padding: "10px 12px", marginBottom: 10, gap: 6 }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{colLabel(col)}</span>
                <span className="flex items-center gap-1">
                  <span className="flex items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,.15)", color: "#fff", fontSize: 12, fontWeight: 800, minWidth: 24, height: 22, padding: "0 7px" }}>{items.length}</span>
                  <button onClick={() => setHidden([...hidden, col])} title="Hide this stage" style={{ border: "none", background: "transparent", color: "#9FB5C5", cursor: "pointer", display: "inline-flex", padding: 2 }}><EyeOff size={13} /></button>
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map((o) => {
                  const on = selected.has(o.id);
                  return (
                    <Card key={o.id} style={{ padding: 12, borderRadius: 12, borderColor: on ? C.teal : isLate(o) ? C.red + "55" : C.border, background: on ? C.tealSoft : "#fff" }}>
                      <div className="flex items-center justify-between" style={{ marginBottom: 6, gap: 6 }}>
                        <button onClick={() => toggleSel(o.id)} className="flex items-center gap-2" style={{ border: "none", background: "none", padding: 0, cursor: "pointer", textAlign: "left", minWidth: 0 }}>
                          {on ? <CheckSquare size={15} color={C.teal} /> : <Square size={15} color={C.textFaint} />}
                          <span style={{ fontWeight: 700, color: C.navy, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.customer_name}</span>
                        </button>
                        <Badge tone="info">#{orderRef(o)}</Badge>
                      </div>
                      <div className="flex items-center gap-2" style={{ marginBottom: 8, color: C.textMute, fontSize: 11.5 }}>
                        <Shirt size={13} /> {fmtDay(o.created_at)}{o.pieces != null ? ` · ${o.pieces} pcs` : ""}
                        {o.due_date && <span style={{ marginLeft: "auto", fontWeight: 600, color: isLate(o) ? C.red : C.textMute }}>due {fmtDay(o.due_date)}</span>}
                      </div>
                      <select value={o.order_status} onChange={(e) => onStatus(o.id, e.target.value)}
                        style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 9, padding: "6px 8px", fontSize: 12, fontWeight: 700, color: C.tealDark, background: C.tealLight }}>
                        {options.map((s) => <option key={s} value={s}>{optionLabel(s)}</option>)}
                      </select>
                    </Card>
                  );
                })}
                {items.length === 0 && <div style={{ padding: "22px 0", textAlign: "center", color: C.textFaint, fontSize: 12.5, border: `1.5px dashed ${C.border}`, borderRadius: 12 }}>Empty</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Plus, Minus, Trash2, Send, PackagePlus, X, Clock, CheckCircle2 } from "lucide-react";
import { C, inr } from "../theme";
import * as api from "../lib/api";
import { PageHead, Card, Btn, Badge, IconCircle } from "../components/ui";

const STATUS_TONE = { requested: "warn", approved: "info", dispatched: "info", received: "success", cancelled: "danger" };
const STATUS_LABEL = { requested: "Requested", approved: "Approved by HQ", dispatched: "Dispatched", received: "Received", cancelled: "Cancelled" };

export default function Supplies({ profile, isSuperAdmin, outlets = [], billingOutletId, setBillingOutletId, toast }) {
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState({});        // { itemId: qty }
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [it, ord] = await Promise.all([api.fetchSupplyItems(), api.fetchSupplyOrders()]);
      setItems(it); setOrders(ord);
    } catch (e) { toast && toast("Load error: " + e.message); }
    setLoading(false);
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => ["All", ...Array.from(new Set(items.map((i) => i.category))).sort()], [items]);
  const visible = items.filter((i) =>
    (category === "All" || i.category === category) &&
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const setQty = (id, q) => setCart((c) => { const n = { ...c }; if (q <= 0) delete n[id]; else n[id] = q; return n; });
  const cartLines = Object.entries(cart).map(([id, qty]) => {
    const it = items.find((x) => x.id === id);
    return it ? { ...it, qty, line_total: Math.round(it.price * qty) } : null;
  }).filter(Boolean);
  const cartTotal = cartLines.reduce((a, l) => a + l.line_total, 0);

  const submit = async () => {
    setErr("");
    if (cartLines.length === 0) { setErr("Add at least one item to reorder."); return; }
    const outletId = isSuperAdmin ? billingOutletId : null;
    if (isSuperAdmin && !outletId) { setErr("Pick which outlet this order is for."); return; }
    setBusy(true);
    try {
      await api.createSupplyOrder({
        items: cartLines.map((l) => ({ item_name: l.name, category: l.category, unit: l.unit, qty: l.qty, unit_price: l.price, line_total: l.line_total })),
        note,
        requester: profile?.name || profile?.email,
        outletId,
      });
      toast && toast("Supply order sent to HQ");
      setCart({}); setNote("");
      await load();
    } catch (e) { setErr(e.message || "Could not submit."); }
    setBusy(false);
  };

  const cancelOrder = async (o) => {
    if (!confirm(`Cancel supply order #${o.order_no}?`)) return;
    try { await api.updateSupplyOrderStatus(o.id, "cancelled"); toast && toast("Order cancelled"); await load(); }
    catch (e) { toast && toast("Could not cancel: " + e.message); }
  };

  return (
    <div>
      <PageHead title="Reorder Stock" sub="Order chemicals & packaging from HQ. Your request is sent to HQ for approval & dispatch.">
        {isSuperAdmin && (
          <select value={billingOutletId || ""} onChange={(e) => setBillingOutletId(e.target.value)}
            style={{ border: `1px solid ${C.border}`, borderRadius: 11, padding: "8px 12px", fontSize: 13, fontWeight: 600, color: C.navy, background: "#fff" }}>
            <option value="">Order for outlet…</option>
            {outlets.filter((o) => o.active !== false).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </PageHead>

      <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)" }}>
        {/* Catalogue */}
        <Card pad={false} style={{ display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 200px)" }}>
          <div style={{ padding: 16, borderBottom: `1px solid ${C.borderSoft}`, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="flex items-center gap-2 rounded-xl" style={{ border: `1px solid ${C.border}`, padding: "9px 12px" }}>
              <Search size={15} color={C.textFaint} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find an item…" style={{ border: "none", outline: "none", fontSize: 13.5, width: "100%", background: "transparent" }} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {categories.map((c) => (
                <button key={c} onClick={() => setCategory(c)} className="wb-press"
                  style={{ padding: "6px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: category === c ? "none" : `1px solid ${C.border}`, background: category === c ? C.navy : "#fff", color: category === c ? "#fff" : C.textMute }}>{c}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {loading ? <div style={{ padding: 30, textAlign: "center", color: C.textFaint }}>Loading…</div>
              : visible.length === 0 ? <div style={{ padding: 30, textAlign: "center", color: C.textFaint, fontSize: 13 }}>No items. Run supply_orders.sql to seed the master catalogue.</div>
              : visible.map((it) => {
                const q = cart[it.id] || 0;
                return (
                  <div key={it.id} className="flex items-center gap-3" style={{ padding: "10px 12px", borderTop: `1px solid ${C.borderSoft}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: C.navy }}>{it.name}</p>
                      <p style={{ fontSize: 11.5, color: C.textFaint }}>{it.price > 0 ? inr(it.price) : "Price TBD"} / {it.unit}{it.pack_note ? ` · ${it.pack_note}` : ""}</p>
                    </div>
                    {q > 0 ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => setQty(it.id, q - 1)} style={roundBtn}><Minus size={13} /></button>
                        <input type="number" value={q} min={0} onChange={(e) => setQty(it.id, Math.max(0, Math.floor(+e.target.value || 0)))}
                          style={{ width: 44, textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 4px", fontSize: 13, fontWeight: 700 }} />
                        <button onClick={() => setQty(it.id, q + 1)} style={roundBtn}><Plus size={13} /></button>
                      </div>
                    ) : (
                      <Btn variant="outline" small icon={Plus} onClick={() => setQty(it.id, 1)}>Add</Btn>
                    )}
                  </div>
                );
              })}
          </div>
        </Card>

        {/* Cart / submit */}
        <Card pad={false} style={{ display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 200px)" }}>
          <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.borderSoft}` }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>Your reorder · {cartLines.length} item{cartLines.length === 1 ? "" : "s"}</h3>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {cartLines.length === 0 ? (
              <div className="flex flex-col items-center justify-center" style={{ padding: "40px 20px", color: C.textFaint, gap: 10 }}>
                <PackagePlus size={28} /><span style={{ fontSize: 13, textAlign: "center" }}>Add items on the left to build your reorder.</span>
              </div>
            ) : cartLines.map((l) => (
              <div key={l.id} className="flex items-center justify-between" style={{ padding: "11px 18px", borderTop: `1px solid ${C.borderSoft}` }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</p>
                  <p style={{ fontSize: 11.5, color: C.textFaint }}>{l.qty} {l.unit} × {inr(l.price)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.navy }}>{inr(l.line_total)}</span>
                  <button onClick={() => setQty(l.id, 0)} style={{ border: "none", background: C.redLt, color: C.red, width: 28, height: 28, borderRadius: 8, cursor: "pointer" }}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: 18, borderTop: `1px solid ${C.borderSoft}`, background: C.paper }}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note for HQ (optional) — e.g. urgent, running low on…"
              style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 13, outline: "none", resize: "vertical", marginBottom: 10 }} />
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: C.textMute }}>Estimated total</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.navy }}>{inr(cartTotal)}</span>
            </div>
            {err && <div style={{ background: C.redLt, color: C.red, fontSize: 12.5, fontWeight: 600, padding: "9px 12px", borderRadius: 9, marginBottom: 10 }}>{err}</div>}
            <Btn variant="primary" icon={Send} full onClick={submit} disabled={busy}>Send order to HQ</Btn>
          </div>
        </Card>
      </div>

      {/* Past supply orders */}
      <div style={{ marginTop: 22 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy, marginBottom: 12 }}>{isSuperAdmin ? "All supply orders" : "Your supply orders"}</h3>
        <div className="flex flex-col gap-3">
          {orders.length === 0 ? (
            <Card><p style={{ color: C.textMute, fontSize: 13.5, padding: 6 }}>No supply orders yet.</p></Card>
          ) : orders.map((o) => (
            <Card key={o.id} hover>
              <div className="flex items-center justify-between gap-4" style={{ flexWrap: "wrap" }}>
                <div className="flex items-center gap-3">
                  <IconCircle icon={o.status === "received" ? CheckCircle2 : Clock} tone={o.status === "received" ? "green" : "amber"} size={40} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span style={{ fontWeight: 700, color: C.navy, fontSize: 14.5 }}>Supply #{o.order_no}</span>
                      <Badge tone={STATUS_TONE[o.status] || "muted"}>{STATUS_LABEL[o.status] || o.status}</Badge>
                    </div>
                    <p style={{ fontSize: 12, color: C.textFaint, marginTop: 2 }}>
                      {isSuperAdmin && o.outlet ? `${o.outlet.name} · ` : ""}{new Date(o.created_at).toLocaleDateString("en-GB")}{o.requester ? ` · ${o.requester}` : ""}
                    </p>
                    {o.note && <p style={{ fontSize: 12, color: C.textMute, marginTop: 3, fontStyle: "italic" }}>"{o.note}"</p>}
                    {o.hq_note && <p style={{ fontSize: 12, color: C.tealDark, marginTop: 3 }}>HQ: {o.hq_note}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ fontWeight: 800, color: C.navy, fontSize: 16 }}>{inr(o.total)}</span>
                  {o.status === "requested" && !isSuperAdmin && (
                    <Btn variant="danger" small icon={X} onClick={() => cancelOrder(o)}>Cancel</Btn>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

const roundBtn = { border: "none", background: "#EEF2F5", color: "#163A52", width: 28, height: 28, borderRadius: 8, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };

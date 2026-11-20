import React, { useEffect, useMemo, useState } from "react";
import { Plus, Megaphone } from "lucide-react";
import { C } from "../../theme";
import * as api from "../../lib/api";
import { Card, Btn } from "../../components/ui";
import { LeadBoard, AddLeadModal, SetupNotice } from "../Leads";
import { leadStats, minsLabel } from "../../lib/leads";

// HQ: add leads for any outlet, watch every outlet's call list, and see
// how quickly each outlet calls and how many leads become orders.
export default function HQLeads({ outlets, orders, customers, profile, toast }) {
  const [leads, setLeads] = useState([]);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [days, setDays] = useState(30);
  const byName = profile?.name ? `${profile.name} (HQ)` : "HQ";

  const load = async () => {
    try { setLeads(await api.fetchLeads()); setMissing(false); }
    catch (e) { if (api.leadsMissing(e)) setMissing(true); else toast("Could not load leads: " + e.message); }
    setLoading(false);
  };
  useEffect(() => {
    load();
    let t = null;
    const ch = api.subscribeTable("leads", () => { clearTimeout(t); t = setTimeout(load, 800); }, "hq-leads");
    return () => { clearTimeout(t); api.unsubscribe(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSaved = (l) => l && setLeads((p) => (p.some((x) => x.id === l.id) ? p.map((x) => (x.id === l.id ? { ...x, ...l } : x)) : [l, ...p]));
  const onDeleted = (id) => setLeads((p) => p.filter((x) => x.id !== id));

  const since = Date.now() - days * 864e5;
  const recent = useMemo(() => leads.filter((l) => new Date(l.created_at).getTime() >= since), [leads, since]);
  const rows = useMemo(() => outlets.map((o) => ({ outlet: o, s: leadStats(recent.filter((l) => l.outlet_id === o.id), orders) })), [outlets, recent, orders]);
  const all = useMemo(() => leadStats(recent, orders), [recent, orders]);

  const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: C.textFaint, textTransform: "uppercase", letterSpacing: ".06em", padding: "10px 14px", borderBottom: `1px solid ${C.borderSoft}` };
  const td = { fontSize: 13.5, color: C.text, padding: "11px 14px", borderBottom: `1px solid ${C.borderSoft}` };

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3" style={{ marginBottom: 22 }}>
        <div>
          <p className="wb-eyebrow" style={{ color: "#9FB5C5" }}>Corporate · leads & pickups</p>
          <h1 style={{ fontSize: 30, fontWeight: 700, color: "#fff", letterSpacing: "-.02em", marginTop: 6 }} className="inline-flex items-center gap-2"><Megaphone size={24} /> Leads</h1>
          <p style={{ color: "#9FB5C5", fontSize: 13.5, marginTop: 6 }}>Send a lead to an outlet, then see who called, what happened and how many became orders.</p>
        </div>
        {!missing && <Btn icon={Plus} onClick={() => setAdding(true)}>Add lead</Btn>}
      </div>

      {missing ? <SetupNotice dark /> : loading ? <Card><p style={{ color: C.textMute, fontSize: 13 }}>Loading leads…</p></Card> : (
        <>
          <Card pad={false} style={{ marginBottom: 18, overflow: "hidden" }}>
            <div className="flex items-center justify-between flex-wrap gap-2" style={{ padding: "14px 16px" }}>
              <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>How each outlet handles leads</h3>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 10px", fontSize: 12.5, color: C.navy, background: "#fff" }}>
                <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={3650}>All time</option>
              </select>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                <thead><tr>
                  <th style={th}>Outlet</th><th style={th}>Leads</th><th style={th}>Waiting for a call</th><th style={th}>Called within 1 h</th>
                  <th style={th}>Typical first call</th><th style={th}>Pickups booked</th><th style={th}>Became orders</th><th style={th}>Closed</th>
                </tr></thead>
                <tbody>
                  {[...rows, { outlet: { id: "all", name: "All outlets" }, s: all }].map(({ outlet, s }) => (
                    <tr key={outlet.id} style={outlet.id === "all" ? { background: C.paper, fontWeight: 700 } : undefined}>
                      <td style={{ ...td, fontWeight: 700, color: C.navy }}>{String(outlet.name).replace(/^Patna\s*-\s*/i, "")}</td>
                      <td style={td}>{s.total}</td>
                      <td style={{ ...td, color: s.toCall ? C.red : C.text, fontWeight: s.toCall ? 700 : 400 }}>{s.toCall}</td>
                      <td style={td}>{s.contacted ? `${Math.round((s.fastFirst / s.contacted) * 100)}%` : "—"}</td>
                      <td style={td}>{minsLabel(s.medianFirst)}</td>
                      <td style={td}>{s.booked}</td>
                      <td style={{ ...td, color: C.green, fontWeight: 700 }}>{s.won}{s.total ? <span style={{ color: C.textMute, fontWeight: 500 }}> · {s.conversion}%</span> : null}</td>
                      <td style={td}>{s.lost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <LeadBoard leads={leads} orders={orders} customers={customers} outlets={outlets} multiOutlet canDelete
              byName={byName} toast={toast} onSaved={onSaved} onDeleted={onDeleted} initialChip="call" />
          </Card>
        </>
      )}

      {adding && <AddLeadModal leads={leads} customers={customers} outlets={outlets} needOutlet byName={byName} toast={toast}
        onClose={() => setAdding(false)} onCreated={(l) => { onSaved(l); setAdding(false); }} onSaved={onSaved} />}
    </div>
  );
}

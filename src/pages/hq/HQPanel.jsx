import React, { useEffect, useMemo, useState } from "react";
import {
  Building2, Wallet, ShoppingBag, TrendingUp, Users as UsersIcon, Plus, ArrowLeft,
  LogOut, Store, ChevronRight, MapPin, Receipt, PiggyBank, Package,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  AreaChart, Area, PieChart, Pie,
} from "recharts";
import { C, inr, collected, balanceDue } from "../../theme";
import { supabase } from "../../lib/supabase";
import * as api from "../../lib/api";
import { Logo, Card, Btn, Badge, IconCircle, Modal, field, fieldLabel } from "../../components/ui";
import { isToday } from "../../lib/aggregate";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PIE = [C.teal, C.navy, C.tealMid, C.amber, C.green, "#8FA6B4"];

// Last 6 calendar months of collected revenue for a set of orders.
function monthlyTrend(orders) {
  const now = new Date();
  const out = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = MONTHS[d.getMonth()];
    const v = orders
      .filter((o) => {
        const od = new Date(o.created_at);
        return od.getMonth() === d.getMonth() && od.getFullYear() === d.getFullYear();
      })
      .reduce((a, o) => a + collected(o), 0);
    out.push({ m: label, v: Math.round(v) });
  }
  return out;
}

function paymentSplit(orders) {
  const acc = { UPI: 0, Cash: 0, Card: 0, Cheque: 0 };
  orders.forEach((o) => { acc[o.payment_method] = (acc[o.payment_method] || 0) + collected(o); });
  return Object.entries(acc)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value: Math.round(value) }));
}

function topServices(items, limit = 6) {
  const counts = {};
  items.forEach((i) => { counts[i.product_name] = (counts[i.product_name] || 0) + Number(i.qty || 1); });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, qty]) => ({ name, qty }));
}

const EMPTY_OUTLET = { code: "", name: "", address: "", phone: "" };

export default function HQPanel({ profile, onExit }) {
  const [outlets, setOutlets] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [selected, setSelected] = useState(null);   // outlet drill-down
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_OUTLET);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const [outl, ord, cust, exp, profs, items] = await Promise.all([
        api.fetchOutlets(),
        api.fetchOrders(),       // super_admin → all outlets
        api.fetchCustomers(),
        api.fetchExpenses(),
        api.fetchProfiles(),
        api.fetchAllOrderItems(),
      ]);
      setOutlets(outl); setOrders(ord); setCustomers(cust);
      setExpenses(exp); setProfiles(profs); setOrderItems(items);
    } catch (e) {
      setErr(e.message || "Could not load HQ data.");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Roll up everything per outlet.
  const byOutlet = useMemo(() => {
    const map = new Map();
    outlets.forEach((o) => map.set(o.id, {
      outlet: o, sales: 0, collected: 0, due: 0, orders: 0,
      todayOrders: 0, customers: 0, expenses: 0, staff: 0,
    }));
    const bucket = (id) => map.get(id);
    orders.forEach((o) => {
      const b = bucket(o.outlet_id); if (!b) return;
      b.sales += Number(o.total || 0);
      b.collected += collected(o);
      b.due += balanceDue(o);
      b.orders += 1;
      if (isToday(o.created_at)) b.todayOrders += 1;
    });
    customers.forEach((c) => { const b = bucket(c.outlet_id); if (b) b.customers += 1; });
    expenses.forEach((e) => { const b = bucket(e.outlet_id); if (b) b.expenses += Number(e.amount || 0); });
    profiles.forEach((p) => { const b = bucket(p.outlet_id); if (b) b.staff += 1; });
    return Array.from(map.values());
  }, [outlets, orders, customers, expenses, profiles]);

  // Network-wide totals.
  const totals = useMemo(() => byOutlet.reduce((a, b) => ({
    sales: a.sales + b.sales,
    collected: a.collected + b.collected,
    due: a.due + b.due,
    orders: a.orders + b.orders,
    customers: a.customers + b.customers,
    expenses: a.expenses + b.expenses,
  }), { sales: 0, collected: 0, due: 0, orders: 0, customers: 0, expenses: 0 }), [byOutlet]);

  const chartData = byOutlet.map((b) => ({
    name: b.outlet.name.replace(/^Patna\s*-\s*/i, ""),
    sales: Math.round(b.collected),
  }));

  const saveOutlet = async () => {
    setFormErr("");
    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();
    if (!code) { setFormErr("A short code is required (e.g. PAT-BORING)."); return; }
    if (!name) { setFormErr("Outlet name is required."); return; }
    setSaving(true);
    try {
      await api.createOutlet({ code, name, address: form.address.trim(), phone: form.phone.trim() });
      setAddOpen(false); setForm(EMPTY_OUTLET);
      await load();
    } catch (e) {
      setFormErr(e.code === "23505" ? "That outlet code already exists." : (e.message || "Could not create outlet."));
    }
    setSaving(false);
  };

  const logout = () => supabase.auth.signOut();

  /* ---- Drill-down into one outlet ---- */
  if (selected) {
    const b = byOutlet.find((x) => x.outlet.id === selected.id);
    const outletOrders = orders.filter((o) => o.outlet_id === selected.id);
    const outletOrderIds = new Set(outletOrders.map((o) => o.id));
    const outletItems = orderItems.filter((i) => outletOrderIds.has(i.order_id));
    const outletStaff = profiles.filter((p) => p.outlet_id === selected.id && p.role !== "super_admin");

    const trend = monthlyTrend(outletOrders);
    const split = paymentSplit(outletOrders);
    const services = topServices(outletItems);
    const expensesTotal = b?.expenses || 0;
    const revenue = b?.collected || 0;
    const profit = revenue - expensesTotal;
    const dueCount = outletOrders.filter((o) => balanceDue(o) > 0).length;
    const avgTicket = outletOrders.length ? revenue / outletOrders.length : 0;

    return (
      <Shell profile={profile} onExit={onExit} logout={logout}
        crumb={<button onClick={() => setSelected(null)} className="wb-press inline-flex items-center gap-1"
          style={{ background: "transparent", border: "none", color: C.tealMid, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <ArrowLeft size={14} /> All outlets
        </button>}>
        <div style={{ marginBottom: 24 }}>
          <p className="wb-eyebrow" style={{ color: "#9FB5C5" }}>{selected.code}</p>
          <h1 style={{ fontSize: 30, fontWeight: 700, color: "#fff", letterSpacing: "-.02em", marginTop: 6 }}>{selected.name}</h1>
          {selected.address && <p style={{ color: "#9FB5C5", fontSize: 13, marginTop: 6 }} className="inline-flex items-center gap-1"><MapPin size={13} /> {selected.address}</p>}
        </div>

        {/* KPI strip */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", marginBottom: 18 }}>
          <Stat icon={Wallet} tone="teal" label="Revenue (collected)" value={inr(revenue)} />
          <Stat icon={Receipt} tone="amber" label="Expenses" value={inr(expensesTotal)} />
          <Stat icon={PiggyBank} tone={profit >= 0 ? "green" : "red"} label="Net profit" value={inr(profit)} />
          <Stat icon={TrendingUp} tone="amber" label="Outstanding" value={inr(b?.due || 0)} sub={`${dueCount} unpaid`} />
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", marginBottom: 22 }}>
          <Stat icon={ShoppingBag} tone="navy" label="Orders" value={String(b?.orders || 0)} sub={`${b?.todayOrders || 0} today`} />
          <Stat icon={Wallet} tone="teal" label="Avg. ticket" value={inr(Math.round(avgTicket))} />
          <Stat icon={UsersIcon} tone="green" label="Customers" value={String(b?.customers || 0)} />
          <Stat icon={Building2} tone="navy" label="Staff" value={String(outletStaff.length)} />
        </div>

        {/* Trend + payment split */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", marginBottom: 18 }}>
          <Card>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy, marginBottom: 4 }}>Revenue trend</h3>
            <p style={{ color: C.textMute, fontSize: 12.5, marginBottom: 14 }}>Collected, last 6 months.</p>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ left: -10, right: 8, top: 6 }}>
                  <defs>
                    <linearGradient id="hqTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.teal} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={C.teal} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.borderSoft} vertical={false} />
                  <XAxis dataKey="m" tick={{ fontSize: 11, fill: C.textFaint }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.textFaint }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 12.5 }} formatter={(v) => inr(v)} />
                  <Area type="monotone" dataKey="v" stroke={C.teal} strokeWidth={2.4} fill="url(#hqTrend)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy, marginBottom: 4 }}>Payment mix</h3>
            <p style={{ color: C.textMute, fontSize: 12.5, marginBottom: 8 }}>How customers paid.</p>
            <div style={{ height: 180 }}>
              {split.length === 0 ? (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.textFaint, fontSize: 13 }}>No paid orders yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={split} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
                      {split.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 12.5 }} formatter={(v) => inr(v)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
              {split.map((s, i) => (
                <span key={s.name} className="inline-flex items-center gap-1" style={{ fontSize: 11.5, color: C.textMute }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: PIE[i % PIE.length] }} /> {s.name}
                </span>
              ))}
            </div>
          </Card>
        </div>

        {/* Top services + recent orders + staff */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)", marginBottom: 18 }}>
          <Card pad={false}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
              <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy }} className="inline-flex items-center gap-2"><Package size={15} color={C.tealDark} /> Top services</h3>
            </div>
            <div style={{ padding: 8 }}>
              {services.length === 0 ? (
                <div style={{ padding: "30px 0", textAlign: "center", color: C.textFaint, fontSize: 13 }}>No items yet.</div>
              ) : services.map((s, i) => {
                const max = services[0].qty || 1;
                return (
                  <div key={s.name} style={{ padding: "8px 12px" }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
                      <span style={{ fontSize: 12.5, color: C.text, fontWeight: 500 }}>{i + 1}. {s.name}</span>
                      <span style={{ fontSize: 12.5, color: C.navy, fontWeight: 700 }}>{s.qty}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: C.bg, overflow: "hidden" }}>
                      <div style={{ width: `${(s.qty / max) * 100}%`, height: "100%", background: C.teal, borderRadius: 99 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card pad={false}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
              <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>Recent orders</h3>
            </div>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {outletOrders.length === 0 ? (
                <div style={{ padding: "40px 0", textAlign: "center", color: C.textFaint, fontSize: 13 }}>No orders yet.</div>
              ) : outletOrders.slice(0, 12).map((o) => (
                <div key={o.id} className="flex items-center justify-between" style={{ padding: "12px 20px", borderTop: `1px solid ${C.borderSoft}` }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 13.5, color: C.navy }}>#{o.order_no} · {o.customer_name}</p>
                    <p style={{ fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>{new Date(o.created_at).toLocaleDateString("en-GB")} · {o.payment_method}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontWeight: 700, fontSize: 13.5, color: C.navy }}>{inr(o.total)}</p>
                    <Badge tone={balanceDue(o) > 0 ? "danger" : "success"}>{balanceDue(o) > 0 ? "Due " + inr(balanceDue(o)) : "Paid"}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Staff */}
        <Card pad={false}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>Staff · {outletStaff.length}</h3>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 0 }}>
            {outletStaff.length === 0 ? (
              <div style={{ padding: "30px 20px", color: C.textFaint, fontSize: 13 }}>No staff assigned to this outlet yet.</div>
            ) : outletStaff.map((p) => (
              <div key={p.id} className="flex items-center gap-3" style={{ padding: "14px 20px", borderTop: `1px solid ${C.borderSoft}` }}>
                <div className="flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: C.tealSoft, color: C.tealDark, fontWeight: 700, fontSize: 13 }}>{(p.name || p.email || "?")[0].toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: 13, color: C.navy }}>{p.name || "—"}</p>
                  <p style={{ fontSize: 11.5, color: C.textFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.email}</p>
                </div>
                <Badge tone={p.role === "admin" ? "navy" : "muted"}>{p.role}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </Shell>
    );
  }

  /* ---- Network overview ---- */
  return (
    <Shell profile={profile} onExit={onExit} logout={logout}>
      <div className="flex items-end justify-between flex-wrap gap-3" style={{ marginBottom: 26 }}>
        <div>
          <p className="wb-eyebrow" style={{ color: "#9FB5C5" }}>Corporate · all outlets</p>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: "#fff", letterSpacing: "-.02em", marginTop: 6 }}>Command Centre</h1>
          <p style={{ color: "#9FB5C5", fontSize: 13.5, marginTop: 6 }}>Every store's takings, orders and staff in one place.</p>
        </div>
        <Btn variant="primary" icon={Plus} onClick={() => { setForm(EMPTY_OUTLET); setFormErr(""); setAddOpen(true); }}>New outlet</Btn>
      </div>

      {err && <div style={{ background: "rgba(224,72,77,.15)", color: "#FCA5A8", fontSize: 13, padding: "12px 16px", borderRadius: 12, marginBottom: 18 }}>{err}</div>}

      {/* Network totals */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", marginBottom: 20 }}>
        <Stat icon={Building2} tone="navy"  label="Outlets" value={String(outlets.length)} />
        <Stat icon={Wallet} tone="teal"     label="Collected (all)" value={inr(totals.collected)} />
        <Stat icon={TrendingUp} tone="amber" label="Outstanding (all)" value={inr(totals.due)} />
        <Stat icon={ShoppingBag} tone="green" label="Orders (all)" value={String(totals.orders)} />
      </div>

      {/* Per-outlet sales chart */}
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy, marginBottom: 4 }}>Collected by outlet</h3>
        <p style={{ color: C.textMute, fontSize: 12.5, marginBottom: 14 }}>Money actually received, per store.</p>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: -8, right: 8, top: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.borderSoft} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.textFaint }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.textFaint }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 12.5 }} formatter={(v) => inr(v)} cursor={{ fill: C.tealSoft }} />
              <Bar dataKey="sales" radius={[8, 8, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={C.teal} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Per-outlet table */}
      <Card pad={false}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>Outlets</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {["Outlet", "Today", "Orders", "Collected", "Outstanding", "Customers", "Staff", ""].map((h) => (
                  <th key={h} style={{ textAlign: h === "Outlet" || h === "" ? "left" : "right", padding: "11px 18px", fontSize: 11, fontWeight: 600, color: C.textMute, textTransform: "uppercase", letterSpacing: ".05em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: "40px 0", textAlign: "center", color: C.textFaint }}>Loading…</td></tr>
              ) : byOutlet.map((b) => (
                <tr key={b.outlet.id}
                  onClick={() => setSelected(b.outlet)}
                  style={{ cursor: "pointer", transition: "background .15s var(--ease)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.bg)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <td style={tD}>
                    <div className="flex items-center gap-3">
                      <IconCircle icon={Store} tone="teal" size={34} />
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 13.5, color: C.navy }}>{b.outlet.name}</p>
                        <p style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>{b.outlet.code}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...tD, textAlign: "right" }}>{b.todayOrders}</td>
                  <td style={{ ...tD, textAlign: "right" }}>{b.orders}</td>
                  <td style={{ ...tD, textAlign: "right", fontWeight: 700, color: C.navy }}>{inr(b.collected)}</td>
                  <td style={{ ...tD, textAlign: "right", color: b.due > 0 ? C.red : C.textMute }}>{inr(b.due)}</td>
                  <td style={{ ...tD, textAlign: "right" }}>{b.customers}</td>
                  <td style={{ ...tD, textAlign: "right" }}>{b.staff}</td>
                  <td style={{ ...tD, textAlign: "right" }}><ChevronRight size={16} color={C.textFaint} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {addOpen && (
        <Modal title="Add an outlet" sub="Creates a new store. Assign staff to it afterwards." onClose={() => setAddOpen(false)}>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label style={fieldLabel}>Short code *</label>
              <input style={field} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="PAT-BORING" />
            </div>
            <div>
              <label style={fieldLabel}>Phone</label>
              <input style={field} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="93081…" />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={fieldLabel}>Outlet name *</label>
            <input style={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Patna - Boring Road" />
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={fieldLabel}>Address</label>
            <input style={field} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Boring Road, Patna" />
          </div>
          {formErr && <div style={{ background: C.redLt, color: C.red, fontSize: 12.5, fontWeight: 600, padding: "9px 12px", borderRadius: 9, marginTop: 14 }}>{formErr}</div>}
          <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
            <Btn variant="outline" small onClick={() => setAddOpen(false)}>Cancel</Btn>
            <Btn variant="primary" small icon={Plus} onClick={saveOutlet} disabled={saving}>Create outlet</Btn>
          </div>
        </Modal>
      )}
    </Shell>
  );
}

/* Full-screen navy shell — no app sidebar. */
function Shell({ profile, onExit, logout, crumb, children }) {
  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, ${C.navy} 0%, ${C.navyDeep} 100%)`, color: "#fff" }}>
      <header className="flex items-center justify-between" style={{ padding: "18px 28px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-xl" style={{ background: "rgba(255,255,255,.08)", width: 40, height: 40 }}>
            <Logo size={26} />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, lineHeight: 1 }}>Whites &amp; Brights</p>
            <p style={{ color: C.tealMid, fontSize: 10, fontWeight: 600, letterSpacing: ".18em", marginTop: 4, textTransform: "uppercase" }}>HQ · Super Admin</p>
          </div>
          {crumb && <div style={{ marginLeft: 16, paddingLeft: 16, borderLeft: "1px solid rgba(255,255,255,.12)" }}>{crumb}</div>}
        </div>
        <div className="flex items-center gap-3">
          <div style={{ textAlign: "right" }} className="wb-hide-sm">
            <p style={{ fontSize: 13, fontWeight: 600 }}>{profile?.name || profile?.email}</p>
            <p style={{ fontSize: 10.5, color: "#9FB5C5" }}>Super Admin</p>
          </div>
          <button onClick={onExit} className="wb-press" title="Back to store panel"
            style={{ background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.14)", padding: "8px 14px", borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            Store panel
          </button>
          <button onClick={logout} className="wb-press" title="Sign out"
            style={{ background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.14)", width: 36, height: 36, borderRadius: 10, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <main style={{ padding: "32px 36px", maxWidth: 1240, margin: "0 auto" }}>{children}</main>
    </div>
  );
}

/* Stat card that reads on the navy shell (white card, like the rest). */
function Stat({ icon, tone, label, value, sub }) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <IconCircle icon={icon} tone={tone} />
      </div>
      <p style={{ color: C.textMute, fontSize: 12.5, fontWeight: 500, marginTop: 14 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 700, color: C.navy, marginTop: 4, letterSpacing: "-.02em" }}>{value}</p>
      {sub && <p style={{ color: C.textFaint, fontSize: 11.5, marginTop: 4 }}>{sub}</p>}
    </Card>
  );
}

const tD = { padding: "13px 18px", fontSize: 13.5, color: C.text, borderTop: `1px solid ${C.borderSoft}`, verticalAlign: "middle" };

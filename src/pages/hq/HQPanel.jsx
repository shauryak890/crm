import React, { useEffect, useMemo, useState } from "react";
import {
  Building2, Wallet, ShoppingBag, TrendingUp, Users as UsersIcon, Plus, ArrowLeft,
  LogOut, Store, ChevronRight, MapPin, Receipt, PiggyBank, Package, Ban, RotateCcw,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  AreaChart, Area, PieChart, Pie,
} from "recharts";
import { C, inr, balanceDue, orderRef, isCancelled, normPhone } from "../../theme";
import { supabase } from "../../lib/supabase";
import * as api from "../../lib/api";
import { Logo, Card, Btn, Badge, IconCircle, Modal, field, fieldLabel } from "../../components/ui";
import { isToday, revenueEvents, costEvents } from "../../lib/aggregate";
import { PeriodStepper, usePeriod } from "../../components/kit";
import { inPeriod, periodLabel } from "../../lib/period";
import { localIsoDate, isDelivered, fmtDate } from "../../theme";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

/* Things across the network that need someone's attention today. */
function AlertsPanel({ outlets, orders, supplyOrders }) {
  const today = localIsoDate();
  const monthAgo = localIsoDate(-30);
  const name = (id) => outlets.find((o) => o.id === id)?.name?.replace(/^Patna\s*-\s*/i, "") || "—";
  const alerts = [];
  outlets.filter((o) => o.active !== false).forEach((out) => {
    const mine = orders.filter((o) => o.outlet_id === out.id && !isCancelled(o));
    const overdue = mine.filter((o) => !isDelivered(o) && o.delivery_status !== "Cancelled" && o.due_date && o.due_date < today);
    const oldDue = mine.filter((o) => balanceDue(o) > 0 && String(o.created_at).slice(0, 10) < monthAgo);
    const appWaiting = mine.filter((o) => o.channel === "app" && o.order_status === "pending_pickup");
    const billedToday = mine.filter((o) => isToday(o.created_at)).length;
    if (overdue.length) alerts.push({ tone: C.red, text: `${name(out.id)}: ${overdue.length} order${overdue.length === 1 ? "" : "s"} past due date` });
    if (oldDue.length) alerts.push({ tone: C.amber, text: `${name(out.id)}: ${inr(oldDue.reduce((a, o) => a + balanceDue(o), 0))} unpaid for 30+ days (${oldDue.length} orders)` });
    if (appWaiting.length) alerts.push({ tone: C.red, text: `${name(out.id)}: ${appWaiting.length} app order${appWaiting.length === 1 ? "" : "s"} waiting for a pickup driver` });
    if (!billedToday && new Date().getHours() >= 13) alerts.push({ tone: C.amber, text: `${name(out.id)}: no orders billed yet today` });
  });
  supplyOrders.filter((s) => s.status === "requested").forEach((s) => {
    const days = Math.floor((Date.now() - new Date(s.created_at).getTime()) / 86400000);
    if (days >= 2) alerts.push({ tone: C.amber, text: `Supply order #${s.order_no} (${s.outlet?.name || name(s.outlet_id)}) waiting ${days} days for approval` });
  });
  return (
    <Card style={{ marginBottom: 20 }}>
      <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy, marginBottom: 10 }} className="inline-flex items-center gap-2"><AlertTriangle size={15} color={C.amber} /> Alerts</h3>
      {alerts.length === 0 ? (
        <p className="inline-flex items-center gap-2" style={{ color: C.green, fontSize: 13, fontWeight: 600 }}><CheckCircle2 size={15} /> Nothing needs attention across the network.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {alerts.map((a, i) => (
            <div key={i} style={{ fontSize: 13, color: C.text, borderLeft: `3px solid ${a.tone}`, padding: "4px 10px", background: C.paper, borderRadius: 6 }}>{a.text}</div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* Outlets side by side for the selected period; the best figure in each
   row is highlighted. Click an outlet's name to drill in. */
function OutletCompare({ rows, period, onOpen }) {
  if (rows.length < 2) return null;
  const metrics = [
    ["Collected", (b) => b.collected, inr, "max"],
    ["Expenses & supplies", (b) => b.expenses, inr, "min"],
    ["Net", (b) => b.collected - b.expenses, inr, "max"],
    ["Orders billed", (b) => b.orders, String, "max"],
    ["Avg. bill", (b) => (b.orders ? b.sales / b.orders : 0), (v) => inr(Math.round(v)), "max"],
    ["Outstanding", (b) => b.due, inr, "min"],
    ["Customers", (b) => b.customers, String, "max"],
    ["Staff", (b) => b.staff, String, null],
  ];
  return (
    <Card pad={false} style={{ marginBottom: 20 }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>Outlets compared · {periodLabel(period)}</h3>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
          <thead><tr style={{ background: C.bg }}>
            <th style={{ textAlign: "left", padding: "10px 18px", fontSize: 11, color: C.textMute, fontWeight: 600, textTransform: "uppercase" }}></th>
            {rows.map((b) => (
              <th key={b.outlet.id} style={{ textAlign: "right", padding: "10px 18px" }}>
                <button onClick={() => onOpen(b.outlet)} style={{ border: "none", background: "none", color: C.tealDark, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  {b.outlet.name.replace(/^Patna\s*-\s*/i, "")} →
                </button>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {metrics.map(([label, get, fmt, best]) => {
              const vals = rows.map(get);
              const target = best === "max" ? Math.max(...vals) : best === "min" ? Math.min(...vals) : null;
              return (
                <tr key={label}>
                  <td style={{ ...tD, color: C.textMute, fontSize: 12.5 }}>{label}</td>
                  {vals.map((v, i) => (
                    <td key={i} style={{ ...tD, textAlign: "right", fontWeight: 700, color: target !== null && v === target && vals.some((x) => x !== v) ? C.green : C.navy }}>{fmt(v)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
import HQOffers from "./HQOffers";
import { Tag } from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PIE = [C.teal, C.navy, C.tealMid, C.amber, C.green, "#8FA6B4"];

// Last 6 calendar months of money collected (order payments by pay date
// + plan sales) from a list of revenue events.
function monthlyTrend(revenue) {
  const now = new Date();
  const out = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const v = revenue
      .filter((e) => { const od = new Date(e.date); return od.getMonth() === d.getMonth() && od.getFullYear() === d.getFullYear(); })
      .reduce((a, e) => a + e.amount, 0);
    out.push({ m: MONTHS[d.getMonth()], v: Math.round(v) });
  }
  return out;
}

function paymentSplit(revenue) {
  const acc = {};
  revenue.forEach((e) => { acc[e.method] = (acc[e.method] || 0) + e.amount; });
  return Object.entries(acc)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value: Math.round(value) }));
}

// CRM logins only — drivers and app customers also carry an outlet_id.
const isStaff = (p) => p.role === "staff" || p.role === "admin";



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
  const [supplyOrders, setSupplyOrders] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [period, setPeriod] = usePeriod("hq", "month");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [selected, setSelected] = useState(null);   // outlet drill-down
  const [view, setView] = useState("network");        // 'network' | 'customers'
  const [expandedCust, setExpandedCust] = useState(null); // app-customer drill-down
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_OUTLET);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const toast = (msg) => {
    setToastMsg(msg);
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => setToastMsg(""), 2600);
  };

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const [outl, ord, cust, exp, profs, items, supply, subs] = await Promise.all([
        api.fetchOutlets(),
        api.fetchOrders(),       // super_admin → all outlets
        api.fetchCustomers(),
        api.fetchExpenses(),
        api.fetchProfiles(),
        api.fetchAllOrderItems(),
        api.fetchSupplyOrders().catch(() => []),
        api.fetchCustomerSubscriptions().catch(() => []),
      ]);
      setOutlets(outl); setOrders(ord); setCustomers(cust);
      setExpenses(exp); setProfiles(profs); setOrderItems(items); setSupplyOrders(supply); setSubscriptions(subs);
    } catch (e) {
      setErr(e.message || "Could not load HQ data.");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Roll up everything per outlet.
  // Money in / out for the chosen period — same rules as the store
  // Dashboard and Reports (payments by pay date, plan sales, supplies).
  const revenue = useMemo(() => revenueEvents(orders, subscriptions).filter((e) => inPeriod(e.date, period)), [orders, subscriptions, period]);
  const costs = useMemo(() => costEvents(expenses, supplyOrders).filter((e) => inPeriod(e.date, period)), [expenses, supplyOrders, period]);

  const byOutlet = useMemo(() => {
    const map = new Map();
    outlets.forEach((o) => map.set(o.id, {
      outlet: o, sales: 0, collected: 0, due: 0, orders: 0,
      todayOrders: 0, customers: 0, expenses: 0, staff: 0,
    }));
    const bucket = (id) => map.get(id);
    orders.forEach((o) => {
      const b = bucket(o.outlet_id); if (!b || isCancelled(o)) return;
      if (isToday(o.created_at)) b.todayOrders += 1;
      if (!inPeriod(o.created_at, period)) return;
      b.sales += Number(o.total || 0);
      b.due += balanceDue(o);
      b.orders += 1;
    });
    revenue.forEach((e) => { const b = bucket(e.outlet_id); if (b) b.collected += e.amount; });
    costs.forEach((e) => { const b = bucket(e.outlet_id); if (b) b.expenses += e.amount; });
    customers.forEach((c) => { const b = bucket(c.outlet_id); if (b) b.customers += 1; });
    profiles.forEach((p) => { const b = bucket(p.outlet_id); if (b && isStaff(p)) b.staff += 1; });
    return Array.from(map.values());
  }, [outlets, orders, customers, profiles, revenue, costs, period]);

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

  // ---- App customers (signed up in the app: profiles.role='customer') ----
  // Each with their app orders (channel='app', matched by customer_user_id).
  const appCustomers = useMemo(() => {
    const appOrders = orders.filter((o) => o.channel === "app");
    // The same person often exists as a walk-in customer too (profiles
    // store 91XXXXXXXXXX, customers 10 digits) — link them by phone.
    const walkInByPhone = new Map();
    customers.forEach((c) => {
      const k = normPhone(c.phone);
      if (k.length !== 10) return;
      const ords = orders.filter((o) => o.customer_id === c.id && o.channel !== "app" && !isCancelled(o));
      walkInByPhone.set(k, { code: c.code, orders: ords.length, value: ords.reduce((a, o) => a + Number(o.total || 0), 0) });
    });
    const ordersByUser = new Map();
    appOrders.forEach((o) => {
      const k = o.customer_user_id;
      if (!k) return;
      if (!ordersByUser.has(k)) ordersByUser.set(k, []);
      ordersByUser.get(k).push(o);
    });
    return profiles
      .filter((p) => p.role === "customer")
      .map((p) => {
        const ords = (ordersByUser.get(p.id) ?? []).sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
        const phone = normPhone(p.phone);
        const walkIn = phone.length === 10 ? walkInByPhone.get(phone) : null;
        return {
          ...p,
          orders: ords,
          orderCount: ords.length,
          // Cancelled app orders were never charged — leave them out.
          totalSpent: ords.filter((o) => !isCancelled(o)).reduce((a, o) => a + Number(o.total || 0), 0),
          lastOrderAt: ords[0]?.created_at ?? null,
          walkIn,
        };
      })
      .sort((a, b) => b.orderCount - a.orderCount || (a.name || "").localeCompare(b.name || ""));
  }, [profiles, orders, customers]);

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

  // Outlets are never hard-deleted — orders, customers, staff, expenses
  // and supply orders all reference outlet_id, so removing the row would
  // either fail on the FK or silently orphan real business history.
  // "Deleting" an outlet deactivates it instead: it disappears from every
  // billing-outlet picker (POS, Reorder Stock, Subscriptions, Add User)
  // while every past record stays intact and still viewable here.
  const toggleOutletActive = async (outlet) => {
    const activating = outlet.active === false;
    if (!activating && !confirm(`Deactivate ${outlet.name}? It will disappear from every "billing for outlet" picker, but its orders, customers and staff stay exactly as they are and remain visible here.`)) return;
    try {
      await api.updateOutlet(outlet.id, { active: activating });
      toast(activating ? `${outlet.name} reactivated` : `${outlet.name} deactivated`);
      setSelected((s) => (s ? { ...s, active: activating } : s));
      await load();
    } catch (e) {
      toast("Could not update: " + e.message);
    }
  };

  const logout = () => supabase.auth.signOut();

  /* ---- Drill-down into one outlet ---- */
  if (selected) {
    const b = byOutlet.find((x) => x.outlet.id === selected.id);
    const outletOrders = orders.filter((o) => o.outlet_id === selected.id);
    const outletOrderIds = new Set(outletOrders.map((o) => o.id));
    const liveIds = new Set(outletOrders.filter((o) => !isCancelled(o)).map((o) => o.id));
    const outletItems = orderItems.filter((i) => outletOrderIds.has(i.order_id) && liveIds.has(i.order_id));
    const outletStaff = profiles.filter((p) => p.outlet_id === selected.id && isStaff(p));
    const outletRevenue = revenue.filter((e) => e.outlet_id === selected.id);

    // Trend always shows the last 6 months, independent of the period filter.
    const trend = monthlyTrend(revenueEvents(outletOrders, subscriptions.filter((s) => s.outlet_id === selected.id)));
    const split = paymentSplit(outletRevenue);
    const services = topServices(outletItems);
    const expensesTotal = b?.expenses || 0;
    const collectedTotal = b?.collected || 0;
    const profit = collectedTotal - expensesTotal;
    const dueCount = outletOrders.filter((o) => inPeriod(o.created_at, period) && balanceDue(o) > 0).length;
    // Average bill value of orders billed in the period (not cash ÷ orders,
    // which unpaid orders dragged down).
    const avgTicket = b?.orders ? b.sales / b.orders : 0;

    return (
      <Shell profile={profile} onExit={onExit} logout={logout}
        crumb={<button onClick={() => setSelected(null)} className="wb-press inline-flex items-center gap-1"
          style={{ background: "transparent", border: "none", color: C.tealMid, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <ArrowLeft size={14} /> All outlets
        </button>}>
        <div className="flex items-start justify-between flex-wrap gap-3" style={{ marginBottom: 24 }}>
          <div>
            <p className="wb-eyebrow" style={{ color: "#9FB5C5" }}>{selected.code}{selected.active === false && <span style={{ marginLeft: 8 }}><Badge tone="danger">Deactivated</Badge></span>}</p>
            <h1 className="wb-hq-title" style={{ fontSize: 30, fontWeight: 700, color: "#fff", letterSpacing: "-.02em", marginTop: 6 }}>{selected.name}</h1>
            {selected.address && <p style={{ color: "#9FB5C5", fontSize: 13, marginTop: 6 }} className="inline-flex items-center gap-1"><MapPin size={13} /> {selected.address}</p>}
          </div>
          <Btn variant="ghost" icon={selected.active === false ? RotateCcw : Ban} onClick={() => toggleOutletActive(selected)}>
            {selected.active === false ? "Reactivate outlet" : "Deactivate outlet"}
          </Btn>
        </div>

        {/* KPI strip */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(150px,100%),1fr))", marginBottom: 18 }}>
          <Stat icon={Wallet} tone="teal" label="Revenue (collected)" value={inr(collectedTotal)} />
          <Stat icon={Receipt} tone="amber" label="Expenses" value={inr(expensesTotal)} />
          <Stat icon={PiggyBank} tone={profit >= 0 ? "green" : "red"} label="Net profit" value={inr(profit)} />
          <Stat icon={TrendingUp} tone="amber" label="Outstanding" value={inr(b?.due || 0)} sub={`${dueCount} unpaid`} />
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(150px,100%),1fr))", marginBottom: 22 }}>
          <Stat icon={ShoppingBag} tone="navy" label="Orders" value={String(b?.orders || 0)} sub={`${b?.todayOrders || 0} today`} />
          <Stat icon={Wallet} tone="teal" label="Avg. ticket" value={inr(Math.round(avgTicket))} />
          <Stat icon={UsersIcon} tone="green" label="Customers" value={String(b?.customers || 0)} />
          <Stat icon={Building2} tone="navy" label="Staff" value={String(outletStaff.length)} />
        </div>

        {/* Trend + payment split */}
        <div className="grid gap-4 wb-hq-split" style={{ gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", marginBottom: 18 }}>
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
            <p style={{ color: C.textMute, fontSize: 12.5, marginBottom: 8 }}>How customers paid · {periodLabel(period)}.</p>
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
        <div className="grid gap-4 wb-hq-split" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)", marginBottom: 18 }}>
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
                    <p style={{ fontWeight: 600, fontSize: 13.5, color: C.navy }}>#{orderRef(o)} · {o.customer_name}</p>
                    <p style={{ fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>{fmtDate(o.created_at)} · {o.payment_method}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontWeight: 700, fontSize: 13.5, color: C.navy }}>{inr(o.total)}</p>
                    {isCancelled(o) ? <Badge tone="muted">Cancelled</Badge>
                      : <Badge tone={balanceDue(o) > 0 ? "danger" : "success"}>{balanceDue(o) > 0 ? "Due " + inr(balanceDue(o)) : "Paid"}</Badge>}
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(260px,100%),1fr))", gap: 0 }}>
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

  /* ---- App customers view ---- */
  if (view === "customers") {
    return (
      <Shell profile={profile} onExit={onExit} logout={logout}>
        <div className="flex items-end justify-between flex-wrap gap-3" style={{ marginBottom: 22 }}>
          <div>
            <p className="wb-eyebrow" style={{ color: "#9FB5C5" }}>Corporate · app customers</p>
            <h1 className="wb-hq-title" style={{ fontSize: 32, fontWeight: 700, color: "#fff", letterSpacing: "-.02em", marginTop: 6 }}>App Customers</h1>
            <p style={{ color: "#9FB5C5", fontSize: 13.5, marginTop: 6 }}>Everyone who signed up in the app, and their orders.</p>
          </div>
          <Btn variant="ghost" onClick={() => { setView("network"); setExpandedCust(null); }}>← Network</Btn>
        </div>

        {err && <div style={{ background: "rgba(224,72,77,.15)", color: "#FCA5A8", fontSize: 13, padding: "12px 16px", borderRadius: 12, marginBottom: 18 }}>{err}</div>}

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(160px,100%),1fr))", marginBottom: 20 }}>
          <Stat icon={UsersIcon} tone="navy" label="App customers" value={String(appCustomers.length)} />
          <Stat icon={ShoppingBag} tone="teal" label="App orders" value={String(appCustomers.reduce((a, c) => a + c.orderCount, 0))} />
          <Stat icon={Wallet} tone="green" label="App order value" value={inr(appCustomers.reduce((a, c) => a + c.totalSpent, 0))} sub="excl. cancelled" />
        </div>

        <Card pad={false}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>Customers · {appCustomers.length}</h3>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr style={{ background: C.bg }}>
                  {["Customer", "Phone", "Orders", "Total value", "Walk-in", "Last order", ""].map((h) => (
                    <th key={h} style={{ textAlign: h === "Customer" || h === "Phone" || h === "" ? "left" : "right", padding: "11px 18px", fontSize: 11, fontWeight: 600, color: C.textMute, textTransform: "uppercase", letterSpacing: ".05em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ padding: "40px 0", textAlign: "center", color: C.textFaint }}>Loading…</td></tr>
                ) : appCustomers.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: "40px 0", textAlign: "center", color: C.textFaint }}>No app customers yet.</td></tr>
                ) : appCustomers.map((c) => {
                  const open = expandedCust === c.id;
                  return (
                    <React.Fragment key={c.id}>
                      <tr
                        onClick={() => setExpandedCust(open ? null : c.id)}
                        style={{ cursor: "pointer" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = C.bg)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                        <td style={tD}>
                          <div className="flex items-center gap-3">
                            <IconCircle icon={UsersIcon} tone="teal" size={34} />
                            <span style={{ fontWeight: 600, fontSize: 13.5, color: C.navy }}>{c.name || "—"}</span>
                          </div>
                        </td>
                        <td style={{ ...tD, color: C.textMute }}>{c.phone || c.email || "—"}</td>
                        <td style={{ ...tD, textAlign: "right" }}>{c.orderCount}</td>
                        <td style={{ ...tD, textAlign: "right", fontWeight: 700, color: C.navy }}>{inr(c.totalSpent)}</td>
                        <td style={{ ...tD, textAlign: "right", fontSize: 12.5, color: c.walkIn ? C.navy : C.textFaint }}
                          title={c.walkIn ? `Walk-in customer ${c.walkIn.code}` : "No walk-in record with this phone"}>
                          {c.walkIn ? `${c.walkIn.orders} · ${inr(c.walkIn.value)}` : "—"}
                        </td>
                        <td style={{ ...tD, textAlign: "right", color: C.textMute, fontSize: 12.5 }}>{c.lastOrderAt ? fmtDate(c.lastOrderAt) : "—"}</td>
                        <td style={{ ...tD, textAlign: "right", color: C.teal, fontSize: 12.5 }}>{c.orderCount > 0 ? (open ? "Hide" : "View") : ""}</td>
                      </tr>
                      {open && c.orders.map((o) => (
                        <tr key={o.id} style={{ background: C.bg }}>
                          <td style={{ ...tD, paddingLeft: 64, fontSize: 12.5, color: C.navy }}>#{orderRef(o)} · {String(o.order_status || "").replace(/_/g, " ")}</td>
                          <td style={{ ...tD, fontSize: 12.5, color: C.textMute }} colSpan={2}>{o.address || "—"}</td>
                          <td style={{ ...tD, textAlign: "right", fontWeight: 600, color: C.navy, fontSize: 12.5 }}>{inr(o.total)}</td>
                          <td style={{ ...tD, textAlign: "right", color: C.textMute, fontSize: 12 }} colSpan={3}>{fmtDate(o.created_at)}</td>
                        </tr>
                      ))}
                      {open && c.orderCount === 0 && (
                        <tr style={{ background: C.bg }}>
                          <td colSpan={7} style={{ ...tD, paddingLeft: 64, color: C.textFaint, fontSize: 12.5 }}>No orders yet.</td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </Shell>
    );
  }

  /* ---- Offers & banners view ---- */
  if (view === "offers") {
    return (
      <Shell profile={profile} onExit={onExit} logout={logout} toast={toastMsg}
        crumb={<button onClick={() => setView("network")} className="wb-press inline-flex items-center gap-1"
          style={{ background: "transparent", border: "none", color: C.tealMid, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <ArrowLeft size={14} /> Network
        </button>}>
        <HQOffers toast={toast} />
      </Shell>
    );
  }

  /* ---- Network overview ---- */
  return (
    <Shell profile={profile} onExit={onExit} logout={logout} toast={toastMsg}>
      <div className="flex items-end justify-between flex-wrap gap-3" style={{ marginBottom: 26 }}>
        <div>
          <p className="wb-eyebrow" style={{ color: "#9FB5C5" }}>Corporate · all outlets</p>
          <h1 className="wb-hq-title" style={{ fontSize: 32, fontWeight: 700, color: "#fff", letterSpacing: "-.02em", marginTop: 6 }}>Command Centre</h1>
          <p style={{ color: "#9FB5C5", fontSize: 13.5, marginTop: 6 }}>Every store's takings, orders and staff in one place.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <PeriodStepper value={period} onChange={setPeriod} dark modes={["day", "week", "month", "year", "all", "custom"]} />
          <Btn variant="ghost" icon={UsersIcon} onClick={() => setView("customers")}>App customers</Btn>
          <Btn variant="ghost" icon={Tag} onClick={() => setView("offers")}>Offers</Btn>
          <Btn variant="primary" icon={Plus} onClick={() => { setForm(EMPTY_OUTLET); setFormErr(""); setAddOpen(true); }}>New outlet</Btn>
        </div>
      </div>

      {err && <div style={{ background: "rgba(224,72,77,.15)", color: "#FCA5A8", fontSize: 13, padding: "12px 16px", borderRadius: 12, marginBottom: 18 }}>{err}</div>}

      {/* Network totals */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(160px,100%),1fr))", marginBottom: 20 }}>
        <Stat icon={Building2} tone="navy"  label="Outlets" value={String(outlets.length)} />
        <Stat icon={Wallet} tone="teal"     label={`Collected · ${periodLabel(period)}`} value={inr(totals.collected)} sub="incl. plan sales" />
        <Stat icon={TrendingUp} tone="amber" label={`Outstanding · ${periodLabel(period)}`} value={inr(totals.due)} sub="on orders billed in this period" />
        <Stat icon={ShoppingBag} tone="green" label={`Orders · ${periodLabel(period)}`} value={String(totals.orders)} sub="excl. cancelled" />
      </div>

      <AlertsPanel outlets={outlets} orders={orders} supplyOrders={supplyOrders} />

      <OutletCompare rows={byOutlet} period={period} onOpen={setSelected} />

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

      {/* Supply orders from outlets */}
      <SupplyOrdersCard orders={supplyOrders} onReload={load} />

      {addOpen && (
        <Modal title="Add an outlet" sub="Creates a new store. Assign staff to it afterwards." onClose={() => setAddOpen(false)}>
          <div className="grid gap-3 wb-form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
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
function Shell({ profile, onExit, logout, crumb, children, toast }) {
  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, ${C.navy} 0%, ${C.navyDeep} 100%)`, color: "#fff" }}>
      {toast && (
        <div style={{ position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
          background: C.navy, color: "#fff", border: "1px solid rgba(255,255,255,.18)",
          padding: "10px 18px", borderRadius: 12, fontSize: 13.5, fontWeight: 600, boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>
          {toast}
        </div>
      )}
      <header className="wb-hq-header flex items-center justify-between flex-wrap" style={{ padding: "18px 28px", borderBottom: "1px solid rgba(255,255,255,.08)", gap: 12 }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-xl" style={{ background: "rgba(255,255,255,.08)", width: 40, height: 40 }}>
            <Logo size={26} />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, lineHeight: 1 }}>Whites &amp; Brights</p>
            <p style={{ color: C.tealMid, fontSize: 10, fontWeight: 600, letterSpacing: ".18em", marginTop: 4, textTransform: "uppercase" }}>HQ · Super Admin</p>
          </div>
          {crumb && <div className="wb-hq-crumb" style={{ marginLeft: 16, paddingLeft: 16, borderLeft: "1px solid rgba(255,255,255,.12)" }}>{crumb}</div>}
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
      <main className="wb-hq-main" style={{ padding: "32px 36px", maxWidth: 1240, margin: "0 auto" }}>{children}</main>
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

/* ── Supply orders raised by outlets (HQ moves them through the flow) ── */
const SUP_STATUS = ["requested", "approved", "dispatched", "received", "cancelled"];
const SUP_LABEL = { requested: "Requested", approved: "Approved", dispatched: "Dispatched", received: "Received", cancelled: "Cancelled" };
const SUP_TONE = { requested: "warn", approved: "info", dispatched: "info", received: "success", cancelled: "danger" };

function SupplyOrdersCard({ orders, onReload }) {
  const [open, setOpen] = useState(null);   // order being expanded
  const [lines, setLines] = useState([]);
  const setStatus = async (o, status) => {
    const verb = status === "cancelled" ? "Reject" : `Mark as ${SUP_LABEL[status]}`;
    let note;
    if (status === "cancelled") {
      note = prompt(`Reject supply order #${o.order_no}? Optional reason for the outlet:`, "");
      if (note === null) return;
    } else if (!confirm(`${verb} — supply order #${o.order_no} (${o.outlet?.name || "outlet"})?`)) return;
    try { await api.updateSupplyOrderStatus(o.id, status, note || undefined); await onReload(); }
    catch (e) { alert("Could not update: " + e.message); }
  };
  // Price an unpriced line (chemicals / "N/A" items go out at ₹0 for HQ
  // to quote) and roll the order total up.
  const priceLine = async (o, line, value) => {
    const unit_price = Number(value);
    if (!Number.isFinite(unit_price) || unit_price < 0) return;
    try {
      await api.priceSupplyOrderLine(o.id, line.id, unit_price, Number(line.qty) || 0);
      setLines(await api.fetchSupplyOrderItems(o.id));
      await onReload();
    } catch (e) { alert("Could not save price: " + e.message); }
  };
  const ageDays = (o) => Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000);
  const toggle = async (o) => {
    if (open === o.id) { setOpen(null); return; }
    setOpen(o.id); setLines([]);
    try { setLines(await api.fetchSupplyOrderItems(o.id)); } catch {}
  };
  const pending = orders.filter((o) => o.status === "requested").length;

  return (
    <Card pad={false} style={{ marginTop: 18 }}>
      <div className="flex items-center justify-between" style={{ padding: "16px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
        <h3 className="inline-flex items-center gap-2" style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>
          <Package size={16} color={C.tealDark} /> Supply orders from outlets
        </h3>
        {pending > 0 && <Badge tone="warn">{pending} awaiting approval</Badge>}
      </div>
      {orders.length === 0 ? (
        <p style={{ color: C.textMute, fontSize: 13.5, padding: 20 }}>No supply orders yet.</p>
      ) : orders.map((o) => (
        <div key={o.id} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
          <div className="flex items-center justify-between gap-3" style={{ padding: "13px 20px", flexWrap: "wrap" }}>
            <button onClick={() => toggle(o)} style={{ background: "transparent", border: "none", cursor: "pointer", textAlign: "left", padding: 0, flex: 1, minWidth: "min(200px, 100%)" }}>
              <div className="flex items-center gap-2">
                <span style={{ fontWeight: 700, color: C.navy, fontSize: 14 }}>#{o.order_no}</span>
                <Badge tone={SUP_TONE[o.status]}>{SUP_LABEL[o.status] || o.status}</Badge>
                {o.status === "requested" && ageDays(o) >= 3 && <Badge tone="danger">Waiting {ageDays(o)} days</Badge>}
              </div>
              <p style={{ fontSize: 12, color: C.textFaint, marginTop: 2 }}>
                {o.outlet?.name || "—"} · {fmtDate(o.created_at)}{o.requester ? ` · ${o.requester}` : ""}
              </p>
              {o.note && <p style={{ fontSize: 12, color: C.textMute, marginTop: 2, fontStyle: "italic" }}>"{o.note}"</p>}
            </button>
            <div className="flex items-center gap-3">
              <span style={{ fontWeight: 800, color: C.navy, fontSize: 15 }}>{inr(o.total)}</span>
              {o.status !== "cancelled" && o.status !== "received" && (() => {
                // Only forward moves (no un-dispatching), plus Reject while
                // the order hasn't left HQ yet.
                const flow = ["requested", "approved", "dispatched", "received"];
                const next = flow.slice(flow.indexOf(o.status) + 1);
                return (
                  <select value={o.status} onChange={(e) => setStatus(o, e.target.value)}
                    style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: "6px 8px", fontSize: 12.5, fontWeight: 600, color: C.navy, background: "#fff" }}>
                    <option value={o.status}>{SUP_LABEL[o.status]}</option>
                    {next.map((s) => <option key={s} value={s}>→ {SUP_LABEL[s]}</option>)}
                    {o.status !== "dispatched" && <option value="cancelled">✕ Reject</option>}
                  </select>
                );
              })()}
            </div>
          </div>
          {open === o.id && (
            <div style={{ padding: "0 20px 14px", background: C.bg }}>
              {lines.length === 0 ? <p style={{ fontSize: 12.5, color: C.textFaint, padding: "10px 0" }}>Loading items…</p> :
                <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                        <td style={{ padding: "7px 0", color: C.text }}>{l.item_name}</td>
                        <td style={{ padding: "7px 0", textAlign: "right", color: C.textMute }}>
                          {l.qty} {l.unit} ×{" "}
                          {Number(l.unit_price) > 0 || o.status === "received" || o.status === "cancelled" ? inr(l.unit_price) : (
                            <input type="number" min="0" placeholder="₹ rate" title="Quote this item"
                              onKeyDown={(e) => e.key === "Enter" && priceLine(o, l, e.currentTarget.value)}
                              onBlur={(e) => e.currentTarget.value && priceLine(o, l, e.currentTarget.value)}
                              style={{ width: 80, border: `1px solid ${C.amber}`, borderRadius: 7, padding: "3px 6px", fontSize: 12 }} />
                          )}
                        </td>
                        <td style={{ padding: "7px 0 7px 16px", textAlign: "right", fontWeight: 700, color: C.navy }}>{inr(l.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>}
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}

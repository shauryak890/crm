import React, { useMemo, useState } from "react";
import {
  Wallet, TrendingUp, ShoppingBag, Users as UsersIcon, Plus, ArrowUpRight, Download, Calendar, ArrowUp, ArrowDown, ReceiptText,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, AreaChart, Area,
} from "recharts";
import { C, inr, balanceDue, orderRef, isCancelled } from "../theme";
import { Card, Btn, Badge, IconCircle, Trend, printPage } from "../components/ui";
import { Segmented, usePersistentState, SkeletonBlock } from "../components/kit";
import { currentPeriod } from "../lib/period";
import { AlertTriangle, Truck, Smartphone, PackagePlus, BadgePercent, CheckCircle2, Clock } from "lucide-react";
import { localIsoDate, isDelivered, fmtDay } from "../theme";
import { paymentTotals, buildYearData, isToday, revenueEvents, costEvents, sumEvents } from "../lib/aggregate";


/* ── Period helpers ─────────────────────────────────────────────────
   For a chosen period (day / month / year) return:
     • money collected in the current window (order payments by the day
       they were paid + subscription plan sales) and orders billed in it
     • the SAME window one year earlier (e.g. this June vs last June)
     • the % change between them (null when last year had nothing to
       compare against — "+100%" against ₹0 means nothing)
   So the owner can see "this month vs the same month last year". */
function inSameDay(d, ref)   { return d.getDate() === ref.getDate() && d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear(); }
function inSameMonth(d, ref) { return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear(); }
function inSameYear(d, ref)  { return d.getFullYear() === ref.getFullYear(); }
const MATCH = { day: inSameDay, month: inSameMonth, year: inSameYear };

function periodStats(orders, revenue, costs, period) {
  const now = new Date();
  const lastYear = new Date(now);
  lastYear.setFullYear(now.getFullYear() - 1);
  const match = MATCH[period];

  const cur = sumEvents(revenue, (d) => match(d, now));
  const prev = sumEvents(revenue, (d) => match(d, lastYear));
  const curExpense = sumEvents(costs, (d) => match(d, now));

  // Orders BILLED in the window — their worth, and how much of it is
  // still owed. Cancelled orders are void and count for nothing.
  let curCount = 0, prevCount = 0, curWorth = 0, curOutstanding = 0;
  orders.forEach((o) => {
    if (isCancelled(o)) return;
    const d = new Date(o.created_at);
    if (match(d, now)) { curCount++; curWorth += Number(o.total || 0); curOutstanding += balanceDue(o); }
    if (match(d, lastYear)) prevCount++;
  });
  const delta = prev > 0 ? ((cur - prev) / prev) * 100 : null;
  return { cur, prev, curCount, prevCount, delta, curWorth, curOutstanding, curExpense };
}

const PERIOD_LABEL = {
  day:   { now: "Today",        ago: "Same day last year",   prior: "yesterday" },
  month: { now: "This month",   ago: "Same month last year", prior: "last month" },
  year:  { now: "This year",    ago: "Last year",            prior: "last year" },
};

// Collected in the previous window (yesterday / last month / last year),
// for the "vs last month"-style chip on the collected tile.
function priorPeriodDelta(revenue, period, cur) {
  const ref = new Date();
  if (period === "day") ref.setDate(ref.getDate() - 1);
  else if (period === "month") ref.setMonth(ref.getMonth() - 1, 1);
  else ref.setFullYear(ref.getFullYear() - 1);
  const prev = sumEvents(revenue, (d) => MATCH[period](d, ref));
  return prev > 0 ? ((cur - prev) / prev) * 100 : null;
}

// A small day-bars series for the daily view (last 14 days).
function dailySeries(revenue, days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    out.push({ m: d.getDate() + "/" + (d.getMonth() + 1), sales: Math.round(sumEvents(revenue, (x) => inSameDay(x, d))) });
  }
  return out;
}

function sparkData(revenue, days = 7) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({ d: d.getDate(), v: Math.round(sumEvents(revenue, (x) => inSameDay(x, d))) });
  }
  return out;
}

export default function Dashboard({ orders, expenses = [], subscriptions = [], supplyOrders = [], go, displayName, customers = [],
  isSuperAdmin = false, isAdmin = false, outlets = [], dashOutletId = "", setDashOutletId, loading }) {
  // Staff land on the slim counter view (today's work); owners on the
  // money view. Either can switch, and the choice is remembered.
  const [mode, setMode] = usePersistentState("dashboard:mode", isAdmin ? "owner" : "counter");
  const [period, setPeriod] = useState("month"); // 'day' | 'month' | 'year'
  const revenue = useMemo(() => revenueEvents(orders, subscriptions), [orders, subscriptions]);
  const costs = useMemo(() => costEvents(expenses, supplyOrders), [expenses, supplyOrders]);
  const year = useMemo(() => buildYearData(revenue, costs), [revenue, costs]);
  const spark = useMemo(() => sparkData(revenue), [revenue]);
  const todayOrders = orders.filter((o) => isToday(o.created_at) && !isCancelled(o));
  const todayCollected = sumEvents(revenue, (d) => inSameDay(d, new Date()));
  const unpaidTotal = orders.reduce((a, o) => a + balanceDue(o), 0);

  const stats = useMemo(() => periodStats(orders, revenue, costs, period), [orders, revenue, costs, period]);
  const pt = useMemo(() => paymentTotals(revenue.filter((e) => MATCH[period](new Date(e.date), new Date()))), [revenue, period]);
  const delta = useMemo(() => priorPeriodDelta(revenue, period, stats.cur), [revenue, period, stats.cur]);
  const chartData = useMemo(() => (period === "day" ? dailySeries(revenue) : year), [revenue, period, year]);
  const lbl = PERIOD_LABEL[period];
  const netProfit = stats.cur - stats.curExpense;

  const firstName = (displayName || "there").split(/[ @]/)[0];
  const first = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : "there";

  return (
    <div>
      {/* ───── Welcome banner ───── */}
      <div className="flex items-end justify-between flex-wrap gap-3" style={{ marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: C.navy, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            Welcome back, {first}
          </h1>
          <p style={{ color: C.textMute, fontSize: 13.5, marginTop: 6 }}>
            Monitor your counter, your customers and today's takings — all in one place.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Outlet filter — HQ only. "" shows the whole network. */}
          {isSuperAdmin && outlets.length > 0 && (
            <select value={dashOutletId || ""} onChange={(e) => setDashOutletId && setDashOutletId(e.target.value)}
              style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 11, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, color: C.navy, cursor: "pointer" }}>
              <option value="">All outlets</option>
              {outlets.filter((o) => o.active !== false).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <Segmented value={mode} onChange={setMode} options={[["counter", "Counter"], ["owner", "Owner"]]} />
          {/* Period toggle — drives the comparison card + chart */}
          {mode === "owner" && <div className="flex items-center" style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 11, padding: 3 }}>
            {[["day", "Daily"], ["month", "Monthly"], ["year", "Yearly"]].map(([k, label]) => (
              <button key={k} onClick={() => setPeriod(k)}
                style={{
                  border: "none", cursor: "pointer", padding: "6px 13px", borderRadius: 8,
                  fontSize: 12.5, fontWeight: 600,
                  background: period === k ? C.navy : "transparent",
                  color: period === k ? "#fff" : C.textMute,
                }}>{label}</button>
            ))}
          </div>}
          <div className="flex items-center gap-2 wb-hide-sm" style={{ background: "#fff", border: `1px solid ${C.border}`, padding: "8px 14px", borderRadius: 11, fontSize: 12.5, color: C.text, fontWeight: 500 }}>
            <Calendar size={14} color={C.textMute} /> {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "long", year: "numeric" })}
          </div>
          <Btn variant="navy" icon={Download} small onClick={printPage}>Print</Btn>
          <Btn variant="primary" icon={Plus} small onClick={() => go("pos")}>New Sale</Btn>
        </div>
      </div>

      <Attention orders={orders} subscriptions={subscriptions} supplyOrders={supplyOrders} isSuperAdmin={isSuperAdmin} go={go} loading={loading} />

      {mode === "counter" ? (
        <CounterView orders={orders} revenue={revenue} go={go} />
      ) : (<>
      {/* ───── Year-on-year comparison for the chosen period ───── */}
      <Card pad={false} hover style={{ marginBottom: 18, overflow: "hidden" }}>
        <div className="flex items-stretch flex-wrap">
          <div style={{ flex: "1 1 300px", padding: 24, minWidth: 260, background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyDeep} 100%)`, color: "#fff" }}>
            <p className="wb-eyebrow" style={{ color: "#9FB5C5" }}>{lbl.now} · collected</p>
            <p style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-.02em", marginTop: 8, lineHeight: 1 }}>{inr(stats.cur)}</p>
            <p style={{ color: "#9FB5C5", fontSize: 13, marginTop: 8 }}>{stats.curCount} order{stats.curCount === 1 ? "" : "s"} billed · incl. plan sales</p>
            {stats.delta !== null ? (
              <div className="inline-flex items-center gap-2" style={{ marginTop: 16, background: stats.delta >= 0 ? "rgba(31,169,113,.2)" : "rgba(224,72,77,.22)", color: stats.delta >= 0 ? "#7CE0B4" : "#FCA5A8", padding: "6px 12px", borderRadius: 99, fontSize: 13, fontWeight: 700 }}>
                {stats.delta >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                {Math.abs(stats.delta).toFixed(1)}% vs last year
              </div>
            ) : (
              <div style={{ marginTop: 16, color: "#9FB5C5", fontSize: 12.5 }}>No data from last year to compare yet</div>
            )}
          </div>
          <div style={{ flex: "1 1 300px", padding: 24, minWidth: 260, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <p className="wb-eyebrow">{lbl.ago}</p>
            <p style={{ fontSize: 26, fontWeight: 700, color: C.navy, letterSpacing: "-.02em", marginTop: 8 }}>{inr(stats.prev)}</p>
            <p style={{ color: C.textMute, fontSize: 13, marginTop: 6 }}>{stats.prevCount} order{stats.prevCount === 1 ? "" : "s"} in the same period last year</p>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.borderSoft}`, fontSize: 13, color: C.textMute }}>
              {stats.prev === 0
                ? <span>Comparisons appear once there's a full year of history.</span>
                : stats.cur >= stats.prev
                ? <span>You're <b style={{ color: C.green }}>{inr(stats.cur - stats.prev)}</b> ahead of last year.</span>
                : <span>You're <b style={{ color: C.red }}>{inr(stats.prev - stats.cur)}</b> behind last year.</span>}
            </div>
          </div>
        </div>
      </Card>

      {/* ───── Stat tiles ───── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 18 }}>
        <StatCard
          tone="navy" icon={ReceiptText}
          label={`Order Worth · ${lbl.now}`}
          value={inr(stats.curWorth)}
          sub={`billed ${lbl.now.toLowerCase()} · ${inr(stats.curOutstanding)} of it still unpaid`}
        />
        <StatCard
          tone="teal" icon={Wallet}
          label={`Collected · ${lbl.now}`}
          value={inr(stats.cur)}
          delta={delta ?? undefined}
          sub={delta !== null ? `vs ${lbl.prior}` : undefined}
        />
        <StatCard
          tone={netProfit >= 0 ? "green" : "amber"} icon={TrendingUp}
          label={`Net Profit · ${lbl.now}`}
          value={inr(netProfit)}
          sub={`${inr(stats.cur)} in − ${inr(stats.curExpense)} expenses & supplies`}
        />
        <StatCard
          tone="navy" icon={ShoppingBag}
          label="Today's Orders"
          value={String(todayOrders.length).padStart(2, "0")}
          sub={`${inr(todayCollected)} collected today`}
        />
        <StatCard
          tone="amber" icon={TrendingUp}
          label="Outstanding"
          value={inr(unpaidTotal)}
          sub={`${orders.filter(o => balanceDue(o) > 0).length} invoices with a balance · all time`}
        />
        <StatCard
          tone="green" icon={UsersIcon}
          label="Customers"
          value={String(customers.length).padStart(2, "0")}
          sub="active in directory"
        />
      </div>

      {/* ───── Hero takings + sparkline ───── */}
      <Card pad={false} hover style={{ marginBottom: 18 }}>
        <div className="flex items-stretch flex-wrap">
          <div style={{ flex: "1 1 320px", padding: 24, borderRight: `1px solid ${C.borderSoft}`, minWidth: 280 }}>
            <p className="wb-eyebrow">Last 7 days</p>
            <p style={{ fontSize: 30, fontWeight: 700, color: C.navy, letterSpacing: "-0.02em", marginTop: 8 }}>{inr(spark.reduce((a, x) => a + x.v, 0))}</p>
            <p style={{ color: C.textMute, fontSize: 13, marginTop: 6 }}>
              Collected per day · last {spark.length} days
            </p>
            <div style={{ height: 80, marginTop: 14 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="weekSpark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.teal} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C.teal} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 12.5 }} formatter={(v) => inr(v)} labelFormatter={(d) => `Day ${d}`} />
                  <Area type="monotone" dataKey="v" stroke={C.teal} strokeWidth={2.2} fill="url(#weekSpark)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div style={{ flex: "2 1 480px", padding: 24, minWidth: 360 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <div>
                <p className="wb-eyebrow">{period === "day" ? "Last 14 days" : "Monthly"}</p>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: C.navy, marginTop: 4, letterSpacing: "-.01em" }}>Sales overview</h3>
              </div>
              <Badge tone="info">{period === "day" ? "Daily" : `Year ${new Date().getFullYear()}`}</Badge>
            </div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: -12, right: 8, top: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.borderSoft} vertical={false} />
                  <XAxis dataKey="m" tick={{ fontSize: 11, fill: C.textFaint }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.textFaint }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 12.5 }} formatter={(v) => inr(v)} cursor={{ fill: C.tealSoft }} />
                  <Bar dataKey="sales" radius={[8, 8, 0, 0]}>
                    {chartData.map((row, i) => {
                      const isCurrent = period === "day"
                        ? i === chartData.length - 1
                        : i === new Date().getMonth();
                      return <Cell key={i} fill={isCurrent ? C.teal : "#D6E7EE"} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Card>

      {/* ───── Income vs Expense ───── */}
      <Card hover style={{ marginBottom: 18 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <div>
            <p className="wb-eyebrow">Income vs Expense</p>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: C.navy, marginTop: 4, letterSpacing: "-.01em" }}>Monthly — {new Date().getFullYear()}</h3>
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, color: C.textMute, fontWeight: 600 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: C.teal, display: "inline-block" }} /> Income
            </span>
            <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, color: C.textMute, fontWeight: 600 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: C.amber, display: "inline-block" }} /> Expense
            </span>
          </div>
        </div>
        <div style={{ height: 220, marginTop: 10 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={year} margin={{ left: -12, right: 8, top: 6 }} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.borderSoft} vertical={false} />
              <XAxis dataKey="m" tick={{ fontSize: 11, fill: C.textFaint }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.textFaint }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 12.5 }} formatter={(v) => inr(v)} cursor={{ fill: C.tealSoft }} />
              <Bar dataKey="sales" name="Income" fill={C.teal} radius={[4, 4, 0, 0]} />
              <Bar dataKey="exp" name="Expense" fill={C.amber} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ───── Recent + Payments breakdown ───── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)" }}>
        <Card pad={false} hover>
          <div className="flex items-center justify-between" style={{ padding: "18px 22px", borderBottom: `1px solid ${C.borderSoft}` }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy, letterSpacing: "-.01em" }}>Recent Transactions</h3>
            <button onClick={() => go("sales")} className="inline-flex items-center gap-1"
              style={{ color: C.tealDark, fontSize: 12.5, fontWeight: 600, background: "transparent", border: "none", cursor: "pointer" }}>
              View all <ArrowUpRight size={13} />
            </button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.bg }}>
                <th style={tH}>Activity</th>
                <th style={tH}>Date</th>
                <th style={{ ...tH, textAlign: "right" }}>Total</th>
                <th style={{ ...tH, textAlign: "right" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={4} style={{ padding: "44px 0", textAlign: "center", color: C.textFaint, fontSize: 13 }}>No orders yet. Create one from the POS.</td></tr>
              )}
              {orders.slice(0, 6).map((o) => (
                <tr key={o.id}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.bg)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  style={{ transition: "background .15s var(--ease)" }}>
                  <td style={{ ...tD }}>
                    <div className="flex items-center gap-3">
                      <IconCircle icon={ShoppingBag} tone={o.fulfilment === "delivery" ? "navy" : "teal"} size={34} />
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 13.5, color: C.navy }}>{o.customer_name}</p>
                        <p style={{ fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>#{orderRef(o)} · {o.fulfilment === "delivery" ? "Delivery" : "Pickup"}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...tD, color: C.textMute }}>
                    {new Date(o.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    {isToday(o.created_at) && <span style={{ color: C.tealDark, marginLeft: 6, fontSize: 11, fontWeight: 600 }}>· today</span>}
                  </td>
                  <td style={{ ...tD, textAlign: "right", fontWeight: 700, color: C.navy }}>{inr(o.total)}</td>
                  <td style={{ ...tD, textAlign: "right" }}>
                    {isCancelled(o) ? <Badge tone="muted">Cancelled</Badge>
                      : <Badge tone={o.payment_status === "Paid" ? "success" : o.payment_status === "Partial" ? "warn" : "danger"}>{o.payment_status}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card hover>
          <p className="wb-eyebrow" style={{ marginBottom: 6 }}>Payment channels</p>
          <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy, letterSpacing: "-.01em", marginBottom: 14 }}>{lbl.now}</h3>
          {[
            { k: "UPI",    v: pt.UPI,    color: C.teal },
            { k: "Cash",   v: pt.Cash,   color: C.navy },
            { k: "Card",   v: pt.Card,   color: C.tealMid },
            { k: "Cheque", v: pt.Cheque, color: C.amber },
            { k: "Plan sales", v: pt["Plan sales"], color: C.green },
            ...(pt.Other ? [{ k: "Other", v: pt.Other, color: C.textFaint }] : []),
          ].map((row, _i, rows) => {
            const max = Math.max(...rows.map((r) => r.v), 1);
            const pct = (row.v / max) * 100;
            return (
              <div key={row.k} style={{ marginBottom: 14 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 12.5, color: C.text, fontWeight: 500 }}>{row.k}</span>
                  <span style={{ fontSize: 12.5, color: C.navy, fontWeight: 700 }}>{inr(row.v)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: C.bg, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: row.color, borderRadius: 99, transition: "width .8s var(--ease)" }} />
                </div>
              </div>
            );
          })}
          <div style={{ borderTop: `1px solid ${C.borderSoft}`, marginTop: 18, paddingTop: 16 }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12.5, color: C.textMute }}>Total collected</span>
              <span style={{ fontSize: 17, fontWeight: 700, color: C.navy, letterSpacing: "-.01em" }}>{inr(pt.Total)}</span>
            </div>
            {delta !== null && <Trend delta={delta} label={`from ${lbl.prior}`} />}
          </div>
        </Card>
      </div>
      </>)}
    </div>
  );
}

/* ── "Needs attention" — every card opens the matching filtered list ── */
function Attention({ orders, subscriptions, supplyOrders, isSuperAdmin, go, loading }) {
  if (loading && !orders.length) {
    return <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", marginBottom: 18 }}>
      {[0, 1, 2, 3].map((i) => <Card key={i}><SkeletonBlock h={14} w="60%" /><SkeletonBlock h={22} w="40%" style={{ marginTop: 10 }} /></Card>)}
    </div>;
  }
  const today = localIsoDate();
  const open = orders.filter((o) => !isDelivered(o) && !isCancelled(o) && o.delivery_status !== "Cancelled");
  const dueToday = open.filter((o) => o.due_date === today);
  const overdue = open.filter((o) => o.due_date && o.due_date < today);
  const unpaid = orders.filter((o) => balanceDue(o) > 0);
  const appWaiting = orders.filter((o) => o.channel === "app" && o.order_status === "pending_pickup");
  const supply = supplyOrders.filter((s) => (isSuperAdmin ? s.status === "requested" : s.status === "dispatched"));
  const in7 = localIsoDate(7);
  const expiring = subscriptions.filter((s) => s.status === "active" && String(s.expires_at).slice(0, 10) >= today && String(s.expires_at).slice(0, 10) <= in7);
  const sumDue = (l) => l.reduce((a, o) => a + balanceDue(o), 0);

  const cards = [
    dueToday.length && { icon: Truck, tone: C.teal, title: `${dueToday.length} to hand over today`, sub: `${inr(sumDue(dueToday))} to collect`, to: ["delivery", { tab: "today" }] },
    overdue.length && { icon: AlertTriangle, tone: C.red, title: `${overdue.length} overdue order${overdue.length === 1 ? "" : "s"}`, sub: `oldest due ${fmtDay(overdue.reduce((m, o) => (o.due_date < m ? o.due_date : m), today))}`, to: ["delivery", { tab: "overdue" }] },
    unpaid.length && { icon: Clock, tone: C.amber, title: `${inr(sumDue(unpaid))} unpaid`, sub: `across ${unpaid.length} order${unpaid.length === 1 ? "" : "s"}`, to: ["sales", { chip: "unpaid", period: currentPeriod("all") }] },
    appWaiting.length && { icon: Smartphone, tone: C.red, title: `${appWaiting.length} app order${appWaiting.length === 1 ? "" : "s"} awaiting pickup`, sub: "assign a driver", to: ["apporders"] },
    supply.length && { icon: PackagePlus, tone: C.navy, title: isSuperAdmin ? `${supply.length} supply order${supply.length === 1 ? "" : "s"} to approve` : `${supply.length} supply order${supply.length === 1 ? "" : "s"} on the way`, sub: isSuperAdmin ? "open HQ (#hq) to approve" : "mark received when it arrives", to: ["supplies"] },
    expiring.length && { icon: BadgePercent, tone: C.green, title: `${expiring.length} plan${expiring.length === 1 ? "" : "s"} expiring this week`, sub: "offer a renewal", to: ["subscriptions", { chip: "expiring" }] },
  ].filter(Boolean);

  if (!cards.length) {
    return (
      <div className="flex items-center gap-2" style={{ background: C.greenLt, color: C.green, borderRadius: 14, padding: "12px 16px", marginBottom: 18, fontSize: 13.5, fontWeight: 600 }}>
        <CheckCircle2 size={16} /> All caught up — nothing overdue, unpaid or waiting.
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 18 }}>
      <p className="wb-eyebrow" style={{ marginBottom: 8 }}>Needs attention</p>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        {cards.map((c) => (
          <button key={c.title} onClick={() => go(...c.to)} className="wb-lift"
            style={{ textAlign: "left", background: "#fff", border: `1px solid ${C.border}`, borderLeft: `4px solid ${c.tone}`, borderRadius: 14, padding: "12px 14px", cursor: "pointer" }}>
            <div className="flex items-center gap-2" style={{ color: c.tone }}><c.icon size={15} /><span style={{ fontSize: 13.5, fontWeight: 700, color: C.navy }}>{c.title}</span></div>
            <p style={{ fontSize: 12, color: C.textMute, marginTop: 4 }}>{c.sub} <span style={{ color: C.tealDark, fontWeight: 600 }}>→</span></p>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Counter view — just today's work, for the person at the desk ── */
function CounterView({ orders, revenue, go }) {
  const today = localIsoDate();
  const billedToday = orders.filter((o) => isToday(o.created_at) && !isCancelled(o));
  const collectedToday = revenue.filter((e) => isToday(e.date)).reduce((a, e) => a + e.amount, 0);
  const pieces = billedToday.reduce((a, o) => a + (Number(o.pieces) || 0), 0);
  const handover = orders.filter((o) => o.due_date === today && !isDelivered(o) && !isCancelled(o) && o.delivery_status !== "Cancelled");
  const tile = (label, value, sub) => (
    <Card><p style={{ color: C.textMute, fontSize: 12.5, fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 700, color: C.navy, marginTop: 4 }}>{value}</p>
      {sub && <p style={{ color: C.textFaint, fontSize: 11.5, marginTop: 4 }}>{sub}</p>}</Card>
  );
  return (
    <>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 18 }}>
        {tile("Billed today", billedToday.length, `${inr(billedToday.reduce((a, o) => a + Number(o.total || 0), 0))} · ${pieces} pieces in`)}
        {tile("Collected today", inr(collectedToday), "cash, UPI, card & plan sales")}
        {tile("To hand over today", handover.length, `${inr(handover.reduce((a, o) => a + balanceDue(o), 0))} still to collect`)}
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <Card pad={false}>
          <div className="flex items-center justify-between" style={{ padding: "16px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>Hand over today</h3>
            <button onClick={() => go("delivery", { tab: "today" })} style={{ color: C.tealDark, fontSize: 12.5, fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>Open list →</button>
          </div>
          {handover.length === 0 ? <p style={{ padding: 24, color: C.textFaint, fontSize: 13, textAlign: "center" }}>Nothing due today.</p>
            : handover.slice(0, 8).map((o) => (
              <div key={o.id} className="flex items-center justify-between" style={{ padding: "11px 20px", borderTop: `1px solid ${C.borderSoft}`, fontSize: 13 }}>
                <span><b style={{ color: C.navy }}>#{orderRef(o)}</b> · {o.customer_name}</span>
                <span style={{ fontWeight: 700, color: balanceDue(o) ? C.red : C.green }}>{balanceDue(o) ? inr(balanceDue(o)) : "Paid"}</span>
              </div>
            ))}
        </Card>
        <Card pad={false}>
          <div className="flex items-center justify-between" style={{ padding: "16px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>Billed today</h3>
            <button onClick={() => go("sales", { period: currentPeriod("day") })} style={{ color: C.tealDark, fontSize: 12.5, fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>Open in Sales →</button>
          </div>
          {billedToday.length === 0 ? <p style={{ padding: 24, color: C.textFaint, fontSize: 13, textAlign: "center" }}>No orders yet today.</p>
            : billedToday.slice(0, 8).map((o) => (
              <div key={o.id} className="flex items-center justify-between" style={{ padding: "11px 20px", borderTop: `1px solid ${C.borderSoft}`, fontSize: 13 }}>
                <span><b style={{ color: C.navy }}>#{orderRef(o)}</b> · {o.customer_name}
                  <span style={{ color: C.textFaint }}> · {new Date(o.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span></span>
                <Badge tone={o.payment_status === "Paid" ? "success" : o.payment_status === "Partial" ? "warn" : "danger"}>{inr(o.total)}</Badge>
              </div>
            ))}
        </Card>
      </div>
    </>
  );
}

/* Stat card — soft-circle icon, big number, optional trend / subtitle. */
function StatCard({ icon, label, value, delta, sub, tone = "teal" }) {
  return (
    <Card hover>
      <div className="flex items-start justify-between">
        <IconCircle icon={icon} tone={tone} />
        {typeof delta === "number" && (
          <span style={{
            fontSize: 11.5, fontWeight: 600,
            display: "inline-flex", alignItems: "center", gap: 3,
            background: delta >= 0 ? C.greenLt : C.redLt,
            color: delta >= 0 ? C.green : C.red,
            padding: "3px 8px", borderRadius: 99,
          }}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      <p style={{ color: C.textMute, fontSize: 12.5, fontWeight: 500, marginTop: 14 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 700, color: C.navy, marginTop: 4, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ color: C.textFaint, fontSize: 11.5, marginTop: 6 }}>{sub}</p>}
    </Card>
  );
}

const tH = { textAlign: "left", padding: "10px 18px", fontSize: 11, fontWeight: 600, color: C.textMute, textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap" };
const tD = { padding: "13px 18px", fontSize: 13.5, color: C.text, borderTop: `1px solid ${C.borderSoft}`, verticalAlign: "middle" };

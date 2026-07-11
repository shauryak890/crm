import React, { useMemo, useState } from "react";
import {
  Wallet, TrendingUp, ShoppingBag, Users as UsersIcon, Plus, ArrowUpRight, Download, Calendar, ArrowUp, ArrowDown, ReceiptText,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, AreaChart, Area,
} from "recharts";
import { C, inr, collected, balanceDue } from "../theme";
import { Card, Btn, Badge, IconCircle, Trend } from "../components/ui";
import { paymentTotals, buildYearData, isToday } from "../lib/aggregate";

const todayLabel = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "long", year: "numeric" });

/* ── Period helpers ─────────────────────────────────────────────────
   For a chosen period (day / month / year) return:
     • the current window's collected revenue + order count
     • the SAME window one year earlier (e.g. this June vs last June)
     • the % change between them
   So the owner can see "this month vs the same month last year". */
function inSameDay(d, ref)   { return d.getDate() === ref.getDate() && d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear(); }
function inSameMonth(d, ref) { return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear(); }
function inSameYear(d, ref)  { return d.getFullYear() === ref.getFullYear(); }

function periodStats(orders, period, expenses = []) {
  const now = new Date();
  const lastYear = new Date(now);
  lastYear.setFullYear(now.getFullYear() - 1);

  const match = { day: inSameDay, month: inSameMonth, year: inSameYear }[period];

  let cur = 0, prev = 0, curCount = 0, prevCount = 0;
  // Also track gross order worth (total) + collected for the CURRENT window,
  // so the "Order Worth" tile can follow the selected period.
  let curWorth = 0, curCollected = 0, curOutstanding = 0;
  orders.forEach((o) => {
    const d = new Date(o.created_at);
    if (match(d, now)) {
      cur += collected(o); curCount++;
      curWorth += Number(o.total || 0);
      curCollected += collected(o);
      curOutstanding += balanceDue(o);
    }
    if (match(d, lastYear)) { prev += collected(o); prevCount++; }
  });
  const delta = prev === 0 ? (cur > 0 ? 100 : 0) : ((cur - prev) / prev) * 100;

  let curExpense = 0;
  expenses.forEach((e) => {
    const d = new Date(e.spent_on);
    if (match(d, now)) curExpense += Number(e.amount || 0);
  });

  return { cur, prev, curCount, prevCount, delta, curWorth, curCollected, curOutstanding, curExpense };
}

const PERIOD_LABEL = {
  day:   { now: "Today",        ago: "Same day last year" },
  month: { now: "This month",   ago: "Same month last year" },
  year:  { now: "This year",    ago: "Last year" },
};

// A small day-bars series for the daily view (last 14 days).
function dailySeries(orders, days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const v = orders.filter((o) => inSameDay(new Date(o.created_at), d)).reduce((a, o) => a + collected(o), 0);
    out.push({ m: d.getDate() + "/" + (d.getMonth() + 1), sales: Math.round(v) });
  }
  return out;
}

// Compare current-month value to last-month, return % delta.
function deltaForMonth(orders, monthOffset = 0) {
  const now = new Date();
  const month = now.getMonth() + monthOffset;
  const year = now.getFullYear();
  const sumIn = (m, y, filterFn = () => true) =>
    orders
      .filter((o) => {
        const d = new Date(o.created_at);
        return d.getMonth() === m && d.getFullYear() === y && filterFn(o);
      })
      .reduce((a, o) => a + Number(o.total), 0);
  const cur = sumIn(month, year);
  const prev = sumIn(month - 1, year) || sumIn(11, year - 1);
  if (!prev) return cur ? 100 : 0;
  return ((cur - prev) / prev) * 100;
}

function sparkData(orders, days = 8) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const v = orders
      .filter((o) => {
        const od = new Date(o.created_at);
        return od.getDate() === d.getDate() && od.getMonth() === d.getMonth() && od.getFullYear() === d.getFullYear();
      })
      .reduce((a, o) => a + Number(o.total), 0);
    out.push({ d: d.getDate(), v });
  }
  return out;
}

export default function Dashboard({ orders, expenses = [], go, displayName, customers = [] }) {
  const [period, setPeriod] = useState("month"); // 'day' | 'month' | 'year'
  const pt = paymentTotals(orders);
  const year = buildYearData(orders, expenses);
  const delta = useMemo(() => deltaForMonth(orders), [orders]);
  const spark = useMemo(() => sparkData(orders), [orders]);
  const todayOrders = orders.filter((o) => isToday(o.created_at));
  const todayPaidTotal = todayOrders.reduce((a, o) => a + collected(o), 0);
  const unpaidTotal = orders.reduce((a, o) => a + balanceDue(o), 0);

  const stats = useMemo(() => periodStats(orders, period, expenses), [orders, period, expenses]);
  const chartData = useMemo(() => (period === "day" ? dailySeries(orders) : year), [orders, period, year]);
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
          {/* Period toggle — drives the comparison card + chart */}
          <div className="flex items-center" style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 11, padding: 3 }}>
            {[["day", "Daily"], ["month", "Monthly"], ["year", "Yearly"]].map(([k, label]) => (
              <button key={k} onClick={() => setPeriod(k)}
                style={{
                  border: "none", cursor: "pointer", padding: "6px 13px", borderRadius: 8,
                  fontSize: 12.5, fontWeight: 600,
                  background: period === k ? C.navy : "transparent",
                  color: period === k ? "#fff" : C.textMute,
                }}>{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 wb-hide-sm" style={{ background: "#fff", border: `1px solid ${C.border}`, padding: "8px 14px", borderRadius: 11, fontSize: 12.5, color: C.text, fontWeight: 500 }}>
            <Calendar size={14} color={C.textMute} /> {todayLabel}
          </div>
          <Btn variant="navy" icon={Download} small onClick={() => window.print()}>Export</Btn>
          <Btn variant="primary" icon={Plus} small onClick={() => go("pos")}>New Sale</Btn>
        </div>
      </div>

      {/* ───── Year-on-year comparison for the chosen period ───── */}
      <Card pad={false} hover style={{ marginBottom: 18, overflow: "hidden" }}>
        <div className="flex items-stretch flex-wrap">
          <div style={{ flex: "1 1 300px", padding: 24, minWidth: 260, background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyDeep} 100%)`, color: "#fff" }}>
            <p className="wb-eyebrow" style={{ color: "#9FB5C5" }}>{lbl.now} · collected</p>
            <p style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-.02em", marginTop: 8, lineHeight: 1 }}>{inr(stats.cur)}</p>
            <p style={{ color: "#9FB5C5", fontSize: 13, marginTop: 8 }}>{stats.curCount} order{stats.curCount === 1 ? "" : "s"}</p>
            <div className="inline-flex items-center gap-2" style={{ marginTop: 16, background: stats.delta >= 0 ? "rgba(31,169,113,.2)" : "rgba(224,72,77,.22)", color: stats.delta >= 0 ? "#7CE0B4" : "#FCA5A8", padding: "6px 12px", borderRadius: 99, fontSize: 13, fontWeight: 700 }}>
              {stats.delta >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
              {Math.abs(stats.delta).toFixed(1)}% vs last year
            </div>
          </div>
          <div style={{ flex: "1 1 300px", padding: 24, minWidth: 260, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <p className="wb-eyebrow">{lbl.ago}</p>
            <p style={{ fontSize: 26, fontWeight: 700, color: C.navy, letterSpacing: "-.02em", marginTop: 8 }}>{inr(stats.prev)}</p>
            <p style={{ color: C.textMute, fontSize: 13, marginTop: 6 }}>{stats.prevCount} order{stats.prevCount === 1 ? "" : "s"} in the same period last year</p>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.borderSoft}`, fontSize: 13, color: C.textMute }}>
              {stats.delta >= 0
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
          sub={`${inr(stats.curCollected)} paid · ${inr(stats.curOutstanding)} outstanding`}
        />
        <StatCard
          tone="teal" icon={Wallet}
          label="Total Sales (Paid)"
          value={inr(pt.Total)}
          delta={delta}
        />
        <StatCard
          tone={netProfit >= 0 ? "green" : "amber"} icon={TrendingUp}
          label={`Net Profit · ${lbl.now}`}
          value={inr(netProfit)}
          sub={`${inr(stats.cur)} income − ${inr(stats.curExpense)} expenses`}
        />
        <StatCard
          tone="navy" icon={ShoppingBag}
          label="Today's Orders"
          value={String(todayOrders.length).padStart(2, "0")}
          sub={`${inr(todayPaidTotal)} collected today`}
        />
        <StatCard
          tone="amber" icon={TrendingUp}
          label="Outstanding"
          value={inr(unpaidTotal)}
          sub={`${orders.filter(o => balanceDue(o) > 0).length} invoices with a balance`}
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
            <p className="wb-eyebrow">This week</p>
            <p style={{ fontSize: 30, fontWeight: 700, color: C.navy, letterSpacing: "-0.02em", marginTop: 8 }}>{inr(spark.reduce((a, x) => a + x.v, 0))}</p>
            <p style={{ color: C.textMute, fontSize: 13, marginTop: 6 }}>
              Daily takings · last {spark.length} days
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
                        <p style={{ fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>#{o.order_no} · {o.fulfilment === "delivery" ? "Delivery" : "Pickup"}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...tD, color: C.textMute }}>
                    {new Date(o.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    {isToday(o.created_at) && <span style={{ color: C.tealDark, marginLeft: 6, fontSize: 11, fontWeight: 600 }}>· today</span>}
                  </td>
                  <td style={{ ...tD, textAlign: "right", fontWeight: 700, color: C.navy }}>{inr(o.total)}</td>
                  <td style={{ ...tD, textAlign: "right" }}>
                    <Badge tone={o.payment_status === "Paid" ? "success" : o.payment_status === "Partial" ? "warn" : "danger"}>{o.payment_status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card hover>
          <p className="wb-eyebrow" style={{ marginBottom: 6 }}>Payment channels</p>
          <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy, letterSpacing: "-.01em", marginBottom: 14 }}>This month</h3>
          {[
            { k: "UPI",    v: pt.UPI,    color: C.teal },
            { k: "Cash",   v: pt.Cash,   color: C.navy },
            { k: "Card",   v: pt.Card,   color: C.tealMid },
            { k: "Cheque", v: pt.Cheque, color: C.amber },
          ].map((row) => {
            const max = Math.max(pt.UPI, pt.Cash, pt.Card, pt.Cheque, 1);
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
            <Trend delta={delta} />
          </div>
        </Card>
      </div>
    </div>
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

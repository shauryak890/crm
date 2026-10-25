import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend,
} from "recharts";
import { FileText, FileSpreadsheet, ArrowUp, ArrowDown } from "lucide-react";
import { C, DISPLAY, inr, localIsoDate, isCancelled } from "../theme";
import { Card, PageHead, Btn } from "../components/ui";
import { PeriodStepper, usePeriod } from "../components/kit";
import { topServices, revenueEvents, costEvents } from "../lib/aggregate";
import { periodRange, periodLabel, previousPeriod, periodNoun, inPeriod, toDate } from "../lib/period";
import { buildReportData, downloadReportPdf, downloadReportExcel } from "../lib/reportExport";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CAT_COLOR = { Rent: C.navy, Salary: C.teal, Utilities: C.amber, Maintenance: C.green, General: "#8FA6B4", Supplies: C.tealMid };

// Chart buckets for a period: months for a year (or all time = by month
// across the data), days for anything shorter. Each bucket carries the
// sub-period it covers so clicking a bar can open exactly that slice.
function buckets(period, revenue, costs) {
  const r = periodRange(period);
  let rows;
  if (!r || period.mode === "year") {
    const year = r ? r[0].getFullYear() : null;
    if (year == null) {
      const keys = Array.from(new Set([...revenue, ...costs].map((e) => localIsoDate(0, toDate(e.date)).slice(0, 7)))).sort().slice(-24);
      rows = keys.map((k) => ({ label: MONTHS[+k.slice(5) - 1] + " " + k.slice(2, 4), sub: { mode: "month", anchor: k + "-01" }, key: k }));
    } else {
      rows = MONTHS.map((m, i) => ({ label: m, sub: { mode: "month", anchor: `${year}-${String(i + 1).padStart(2, "0")}-01` }, key: `${year}-${String(i + 1).padStart(2, "0")}` }));
    }
    const idx = new Map(rows.map((x, i) => [x.key, i]));
    rows.forEach((x) => { x.sales = 0; x.exp = 0; });
    revenue.forEach((e) => { const i = idx.get(localIsoDate(0, toDate(e.date)).slice(0, 7)); if (i != null) rows[i].sales += e.amount; });
    costs.forEach((e) => { const i = idx.get(localIsoDate(0, toDate(e.date)).slice(0, 7)); if (i != null) rows[i].exp += e.amount; });
  } else {
    rows = [];
    for (let d = new Date(r[0]); d < r[1]; d.setDate(d.getDate() + 1)) {
      const k = localIsoDate(0, d);
      rows.push({ label: String(d.getDate()), sub: { mode: "day", anchor: k }, key: k, sales: 0, exp: 0 });
    }
    const idx = new Map(rows.map((x, i) => [x.key, i]));
    revenue.forEach((e) => { const i = idx.get(localIsoDate(0, toDate(e.date))); if (i != null) rows[i].sales += e.amount; });
    costs.forEach((e) => { const i = idx.get(localIsoDate(0, toDate(e.date))); if (i != null) rows[i].exp += e.amount; });
  }
  rows.forEach((x) => { x.sales = Math.round(x.sales); x.exp = Math.round(x.exp); });
  return rows;
}

function Delta({ cur, prev, invert, period }) {
  if (!prev) return <span style={{ fontSize: 12, color: C.textFaint }}>no earlier data to compare</span>;
  const d = ((cur - prev) / prev) * 100;
  const good = invert ? d <= 0 : d >= 0;
  return (
    <span className="inline-flex items-center gap-1" style={{ fontSize: 12, fontWeight: 600, color: good ? C.green : C.red }}>
      {d >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{Math.abs(d).toFixed(1)}% vs {periodNoun(period)} <span style={{ color: C.textFaint, fontWeight: 500 }}>({inr(prev)})</span>
    </span>
  );
}

function Stat({ label, value, children, color = C.navy }) {
  return (
    <Card>
      <p style={{ color: C.textMute, fontSize: 12.5, fontWeight: 600 }}>{label}</p>
      <p style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 800, color, marginTop: 6 }}>{value}</p>
      <div style={{ marginTop: 8 }}>{children}</div>
    </Card>
  );
}

export default function Reports({ orders: allOrders, expenses: allExpenses, customers: allCustomers, orderItems,
  outlets = [], isSuperAdmin = false, subscriptions: allSubs = [], supplyOrders: allSupply = [], go }) {
  const [period, setPeriod] = usePeriod("reports", "month");
  const [outletId, setOutletId] = useState(""); // super_admin filter, "" = all
  const [busy, setBusy] = useState(false);
  const byOutlet = (rows) => (outletId ? rows.filter((r) => r.outlet_id === outletId) : rows);
  const orders = useMemo(() => byOutlet(allOrders), [allOrders, outletId]);           // eslint-disable-line react-hooks/exhaustive-deps
  const expenses = useMemo(() => byOutlet(allExpenses), [allExpenses, outletId]);     // eslint-disable-line react-hooks/exhaustive-deps
  const customers = useMemo(() => byOutlet(allCustomers), [allCustomers, outletId]);  // eslint-disable-line react-hooks/exhaustive-deps
  const subscriptions = useMemo(() => byOutlet(allSubs), [allSubs, outletId]);        // eslint-disable-line react-hooks/exhaustive-deps
  const supplyOrders = useMemo(() => byOutlet(allSupply), [allSupply, outletId]);     // eslint-disable-line react-hooks/exhaustive-deps

  const revenue = useMemo(() => revenueEvents(orders, subscriptions), [orders, subscriptions]);
  const costs = useMemo(() => costEvents(expenses, supplyOrders), [expenses, supplyOrders]);
  const prev = previousPeriod(period);
  const sumIn = (ev, p) => (p ? ev.reduce((a, e) => (inPeriod(e.date, p) ? a + e.amount : a), 0) : 0);
  const totalIn = sumIn(revenue, period), totalOut = sumIn(costs, period);
  const prevIn = sumIn(revenue, prev), prevOut = sumIn(costs, prev);
  const billed = orders.filter((o) => !isCancelled(o) && inPeriod(o.created_at, period));
  const prevBilled = prev ? orders.filter((o) => !isCancelled(o) && inPeriod(o.created_at, prev)) : [];
  const newCustomers = customers.filter((c) => inPeriod(c.created_at, period)).length;

  const chartData = useMemo(() => buckets(period, revenue, costs), [period, revenue, costs]);

  // Where the money went, by expense category (supplies included).
  const costBreakdown = useMemo(() => {
    const m = {};
    expenses.filter((e) => inPeriod(e.spent_on, period)).forEach((e) => { m[e.category] = (m[e.category] || 0) + Number(e.amount || 0); });
    const sup = costs.filter((e) => e.kind === "supplies" && inPeriod(e.date, period)).reduce((a, e) => a + e.amount, 0);
    if (sup) m.Supplies = sup;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [expenses, costs, period]);

  const pie = useMemo(() => {
    const keep = new Set(billed.map((o) => o.id));
    return topServices(orderItems.filter((i) => keep.has(i.order_id)));
  }, [billed, orderItems]);

  // Export the selected period (all time = from the first record).
  const range = periodRange(period);
  const from = range ? localIsoDate(0, range[0]) : (orders.reduce((m, o) => (!m || o.created_at < m ? o.created_at : m), null) || localIsoDate()).slice(0, 10);
  const to = range ? localIsoDate(-1, range[1]) : localIsoDate();
  const run = (fn) => {
    if (busy) return;
    setBusy(true);
    try { fn(buildReportData({ orders, expenses, outlets, from, to, isSuperAdmin, subscriptions, supplyOrders, customers })); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHead title="Reports" sub={`${periodLabel(period)}${outletId ? ` · ${outlets.find((o) => o.id === outletId)?.name}` : ""}`}>
        {isSuperAdmin && (
          <select value={outletId} onChange={(e) => setOutletId(e.target.value)}
            style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 11, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, color: C.navy }}>
            <option value="">All outlets</option>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        <PeriodStepper value={period} onChange={setPeriod} modes={["week", "month", "year", "all", "custom"]} />
        <Btn variant="navy" icon={FileText} small disabled={busy} onClick={() => run(downloadReportPdf)}>PDF</Btn>
        <Btn variant="primary" icon={FileSpreadsheet} small disabled={busy} onClick={() => run(downloadReportExcel)}>Excel (CSV)</Btn>
      </PageHead>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", marginBottom: 18 }}>
        <Stat label="Collected" value={inr(totalIn)} color={C.green}><Delta cur={totalIn} prev={prevIn} period={period} /></Stat>
        <Stat label="Expenses & supplies" value={inr(totalOut)} color={C.red}><Delta cur={totalOut} prev={prevOut} invert period={period} /></Stat>
        <Stat label="Net" value={inr(totalIn - totalOut)} color={totalIn - totalOut >= 0 ? C.navy : C.red}><Delta cur={totalIn - totalOut} prev={prevIn - prevOut} period={period} /></Stat>
        <Stat label="Orders billed" value={billed.length}>
          <span style={{ fontSize: 12, color: C.textMute }}>{prevBilled.length ? `${prevBilled.length} in ${periodNoun(period)} · ` : ""}{newCustomers} new customer{newCustomers === 1 ? "" : "s"}</span>
        </Stat>
      </div>

      <Card style={{ marginBottom: 18 }}>
        <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: 12 }}>
          <h3 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 16, color: C.navy }}>Money in vs out · {periodLabel(period)}</h3>
          {go && <span style={{ fontSize: 12, color: C.textFaint }}>Click a bar to open those sales</span>}
        </div>
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: -8, right: 8, top: 6 }} barGap={2}
              onClick={(s) => { const row = s?.activePayload?.[0]?.payload; if (row && go) go("sales", { period: row.sub }); }}
              style={{ cursor: go ? "pointer" : "default" }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.textFaint }} axisLine={false} tickLine={false} interval={chartData.length > 16 ? 2 : 0} />
              <YAxis tick={{ fontSize: 11, fill: C.textFaint }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${C.border}`, fontSize: 12.5 }} formatter={(v) => inr(v)} cursor={{ fill: C.tealSoft }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="sales" name="Collected" fill={C.teal} radius={[5, 5, 0, 0]} />
              <Bar dataKey="exp" name="Expenses" fill={C.amber} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <Card>
          <h3 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 16, color: C.navy, marginBottom: 12 }}>Where the money went</h3>
          {costBreakdown.length === 0 ? <p style={{ color: C.textFaint, fontSize: 13, padding: "30px 0", textAlign: "center" }}>No expenses in this period.</p> : (
            <div className="flex flex-col gap-3">
              {costBreakdown.map((r) => (
                <button key={r.name} onClick={() => go && r.name !== "Supplies" && go("expenses", { category: r.name })}
                  style={{ border: "none", background: "none", padding: 0, textAlign: "left", cursor: go && r.name !== "Supplies" ? "pointer" : "default" }}>
                  <div className="flex justify-between" style={{ fontSize: 12.5, marginBottom: 5 }}>
                    <span style={{ color: C.text, fontWeight: 500 }}>{r.name}</span>
                    <span style={{ color: C.navy, fontWeight: 700 }}>{inr(r.value)} <span style={{ color: C.textFaint, fontWeight: 500 }}>· {totalOut ? Math.round((r.value / totalOut) * 100) : 0}%</span></span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: C.bg, overflow: "hidden" }}>
                    <div style={{ width: `${totalOut ? (r.value / totalOut) * 100 : 0}%`, height: "100%", background: CAT_COLOR[r.name] || C.textFaint, borderRadius: 99 }} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <h3 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 16, color: C.navy, marginBottom: 12 }}>Most requested services</h3>
          {pie.length === 0 ? (
            <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: C.textFaint, fontSize: 13 }}>No sales in this period.</div>
          ) : (
            <>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pie} dataKey="value" nameKey="name" innerRadius={48} outerRadius={88} paddingAngle={1.5}>
                      {pie.map((e, i) => <Cell key={i} fill={e.color} stroke="#fff" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${C.border}`, fontSize: 12.5 }} formatter={(v) => `${v} pcs`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 10 }}>
                {pie.slice(0, 8).map((e) => (
                  <div key={e.name} className="flex items-center gap-2" style={{ minWidth: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: e.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, color: C.textMute, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
                    <span style={{ fontSize: 11.5, color: C.navy, fontWeight: 700, marginLeft: "auto" }}>{e.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

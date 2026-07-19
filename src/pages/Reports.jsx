import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp, Wallet, Users, ArrowUpRight, ArrowDownRight, FileText, FileSpreadsheet, CalendarRange } from "lucide-react";
import { C, DISPLAY, inr, collected } from "../theme";
import { Card, PageHead, Btn } from "../components/ui";
import { buildYearData, topServices } from "../lib/aggregate";
import { buildReportData, downloadReportPdf, downloadReportExcel } from "../lib/reportExport";

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthAgoIso = () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); };

function CustomReport({ orders, expenses, outlets, isSuperAdmin }) {
  const [from, setFrom] = useState(monthAgoIso);
  const [to, setTo] = useState(todayIso);
  const [busy, setBusy] = useState(false);

  const invalid = !from || !to || from > to;
  const data = useMemo(
    () => (invalid ? null : buildReportData({ orders, expenses, outlets, from, to, isSuperAdmin })),
    [orders, expenses, outlets, from, to, isSuperAdmin, invalid]
  );

  const run = (fn) => {
    if (!data || busy) return;
    setBusy(true);
    try { fn(data); } finally { setBusy(false); }
  };

  return (
    <Card style={{ marginBottom: 18 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
        <CalendarRange size={17} color={C.tealDark} />
        <h3 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 16, color: C.navy }}>Custom Report</h3>
      </div>
      <p style={{ color: C.textMute, fontSize: 12.5, marginBottom: 16 }}>Pick a date range and download every sale and expense in it — day by day, with totals.</p>

      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: C.navy, marginBottom: 6, display: "block" }}>From</label>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
            style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 13, outline: "none" }} />
        </div>
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: C.navy, marginBottom: 6, display: "block" }}>To</label>
          <input type="date" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)}
            style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 13, outline: "none" }} />
        </div>
        <Btn variant="navy" icon={FileText} small disabled={!data || busy} onClick={() => run(downloadReportPdf)}>Download PDF</Btn>
        <Btn variant="primary" icon={FileSpreadsheet} small disabled={!data || busy} onClick={() => run(downloadReportExcel)}>Download Excel (CSV)</Btn>
      </div>

      {invalid ? (
        <p style={{ color: C.red, fontSize: 12, marginTop: 12 }}>Pick a valid range — "From" must be on or before "To".</p>
      ) : (
        <div className="flex items-center gap-5 flex-wrap" style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.borderSoft}` }}>
          <span style={{ fontSize: 12.5, color: C.textMute }}>{data.summary.orderCount} orders</span>
          <span style={{ fontSize: 12.5, color: C.green, fontWeight: 700 }}>{inr(data.summary.totalSales)} sales</span>
          <span style={{ fontSize: 12.5, color: C.red, fontWeight: 700 }}>{inr(data.summary.totalExpenses)} expenses</span>
          <span style={{ fontSize: 12.5, color: C.navy, fontWeight: 700 }}>{inr(data.summary.netProfit)} net</span>
        </div>
      )}
    </Card>
  );
}

// Same 12-row {m, sales, exp} shape, sliced down to the current month only
// for the "Monthly" view — the underlying data is identical either way.
function monthSlice(year) {
  const m = new Date().getMonth();
  return [year[m]];
}

function Stat({ label, value, icon: Icon, sub, tone }) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p style={{ color: C.textMute, fontSize: 12.5, fontWeight: 600 }}>{label}</p>
          <p style={{ fontFamily: DISPLAY, fontSize: 27, fontWeight: 800, color: C.navy, marginTop: 8 }}>{value}</p>
        </div>
        <div className="flex items-center justify-center rounded-xl" style={{ width: 44, height: 44, background: C.tealLight }}>
          <Icon size={21} color={C.tealDark} />
        </div>
      </div>
      {sub && (
        <div className="flex items-center gap-1.5" style={{ marginTop: 14 }}>
          {tone === "up" ? <ArrowUpRight size={15} color={C.green} /> : <ArrowDownRight size={15} color={C.red} />}
          <span style={{ fontSize: 12.5, fontWeight: 700, color: tone === "up" ? C.green : C.red }}>{sub}</span>
        </div>
      )}
    </Card>
  );
}

export default function Reports({ orders, expenses, customers, orderItems, outlets = [], isSuperAdmin = false }) {
  const [range, setRange] = useState("year"); // 'month' | 'year'
  const year = buildYearData(orders, expenses);
  const chartData = useMemo(() => (range === "month" ? monthSlice(year) : year), [range, year]);
  const totalSales = orders.reduce((a, o) => a + collected(o), 0);
  const totalExp = expenses.reduce((a, e) => a + Number(e.amount), 0);
  const pie = topServices(orderItems);

  return (
    <div>
      <PageHead title="Reports" sub="Outlet performance overview" />
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", marginBottom: 18 }}>
        <Stat label={`Total Sales (${new Date().getFullYear()})`} value={inr(totalSales)} icon={TrendingUp} sub="paid invoices" tone="up" />
        <Stat label="Total Expenses" value={inr(totalExp)} icon={Wallet} sub="recorded" tone="down" />
        <Stat label="Customers" value={customers.length} icon={Users} sub="on file" tone="up" />
      </div>

      <CustomReport orders={orders} expenses={expenses} outlets={outlets} isSuperAdmin={isSuperAdmin} />

      <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)" }}>
        <Card>
          <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: 16 }}>
            <h3 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 16, color: C.navy }}>
              Sales & Expenses — {range === "month" ? new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : new Date().getFullYear()}
            </h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span style={{ width: 9, height: 9, borderRadius: 3, background: C.teal, display: "inline-block" }} />
                <span style={{ fontSize: 11.5, color: C.textMute, fontWeight: 600 }}>Sales</span>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: C.amber, display: "inline-block", marginLeft: 8 }} />
                <span style={{ fontSize: 11.5, color: C.textMute, fontWeight: 600 }}>Expenses</span>
              </div>
              <div className="flex items-center" style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, padding: 2 }}>
                {[["month", "Monthly"], ["year", "Yearly"]].map(([k, label]) => (
                  <button key={k} onClick={() => setRange(k)}
                    style={{
                      border: "none", cursor: "pointer", padding: "5px 11px", borderRadius: 7,
                      fontSize: 11.5, fontWeight: 600,
                      background: range === k ? C.navy : "transparent",
                      color: range === k ? "#fff" : C.textMute,
                    }}>{label}</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: -12, right: 8, top: 6 }}>
                <defs>
                  <linearGradient id="rs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.teal} stopOpacity={0.3} /><stop offset="100%" stopColor={C.teal} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F5" vertical={false} />
                <XAxis dataKey="m" tick={{ fontSize: 11, fill: C.textFaint }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: C.textFaint }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${C.border}`, fontSize: 12.5 }} formatter={(v) => inr(v)} />
                <Area type="monotone" dataKey="sales" stroke={C.teal} strokeWidth={2.6} fill="url(#rs)" name="Sales" />
                <Area type="monotone" dataKey="exp" stroke={C.amber} strokeWidth={2.2} fill="none" name="Expenses" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 16, color: C.navy, marginBottom: 12 }}>Most Requested Services</h3>
          {pie.length === 0 ? (
            <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: C.textFaint, fontSize: 13 }}>No sales recorded yet.</div>
          ) : (
            <>
              <div style={{ height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pie} dataKey="value" nameKey="name" innerRadius={48} outerRadius={92} paddingAngle={1.5}>
                      {pie.map((e, i) => <Cell key={i} fill={e.color} stroke="#fff" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${C.border}`, fontSize: 12.5 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 10 }}>
                {pie.slice(0, 6).map((e) => (
                  <div key={e.name} className="flex items-center gap-2">
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: e.color }} />
                    <span style={{ fontSize: 11.5, color: C.textMute, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
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

import React, { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Repeat, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";
import { C, inr, localIsoDate, fmtDate, fmtDay } from "../theme";
import { PageHead, Btn, Badge, DataTable, Modal, td, iconBtn, field, fieldLabel } from "../components/ui";
import { PeriodStepper, usePeriod, Segmented, usePersistentState } from "../components/kit";
import { inPeriod, previousPeriod, periodLabel, periodNoun, stepPeriod, toDate } from "../lib/period";

// Supply purchases (chemicals/packaging) now go through Reorder Stock —
// this page is scoped to the other running costs of an outlet.
const CATS = ["Rent", "Salary", "Utilities", "Maintenance", "General"];
const CAT_COLOR = { Rent: C.navy, Salary: C.teal, Utilities: C.amber, Maintenance: C.green, General: "#8FA6B4" };
const blankForm = () => ({ title: "", category: "Rent", amount: "", spent_on: localIsoDate(), outlet_id: "" });
// Anything this large gets a "are you sure?" — one slipped digit
// (₹404 → ₹40,004) otherwise skews profit for the whole month.
const LARGE_EXPENSE = 25000;
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
const sum = (rows) => rows.reduce((a, e) => a + Number(e.amount || 0), 0);

export default function Expenses({ expenses, loading, onAdd, onUpdate, onDelete, isAdmin, isSuperAdmin = false, outlets = [], intent }) {
  const [editing, setEditing] = useState(null); // null closed · {} add · row edit
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [period, setPeriod] = usePeriod("expenses", "month");
  const [groupMode, setGroupMode] = usePersistentState("expenses:group", "date");
  const [cat, setCat] = useState(intent?.category || "");

  const outletName = (id) => outlets.find((o) => o.id === id)?.name?.replace(/^Patna\s*-\s*/i, "") || "—";
  const inView = useMemo(() => expenses.filter((e) => inPeriod(e.spent_on, period)), [expenses, period]);
  const prev = previousPeriod(period);
  const inPrev = useMemo(() => (prev ? expenses.filter((e) => inPeriod(e.spent_on, prev)) : []), [expenses, prev]);
  const shown = (cat ? inView.filter((e) => e.category === cat) : inView)
    .slice().sort((a, b) => (groupMode === "category"
      ? String(a.category).localeCompare(String(b.category)) || String(b.spent_on).localeCompare(String(a.spent_on))
      : String(b.spent_on).localeCompare(String(a.spent_on))));
  const total = sum(inView);

  // Category cards: amount, share of the period, change vs the previous
  // period, and an "unusual" flag when a category jumps well above its
  // own recent average (this is what would have caught ₹40,004).
  const cards = useMemo(() => {
    const cats = Array.from(new Set([...CATS, ...inView.map((e) => e.category)]));
    const history = [1, 2, 3].map((n) => { let p = period; for (let i = 0; i < n; i++) p = stepPeriod(p, -1); return p; });
    return cats.map((c) => {
      const amt = sum(inView.filter((e) => e.category === c));
      const before = sum(inPrev.filter((e) => e.category === c));
      const avg = period.mode === "all" ? 0 : history.reduce((a, p) => a + sum(expenses.filter((e) => e.category === c && inPeriod(e.spent_on, p))), 0) / 3;
      return {
        c, amt, share: total ? (amt / total) * 100 : 0,
        delta: before > 0 ? ((amt - before) / before) * 100 : null,
        unusual: avg > 0 && amt > 2 * avg && amt - avg > 5000,
      };
    }).filter((x) => x.amt > 0 || CATS.includes(x.c));
  }, [inView, inPrev, expenses, period, total]);

  // Recurring costs not yet recorded this month: anything that appeared
  // in BOTH of the previous two months (rent, salaries, recharges …) but
  // not in the month being viewed. Only offered for the current month.
  const viewingThisMonth = period.mode === "month" && period.anchor.slice(0, 7) === localIsoDate().slice(0, 7);
  const missingRecurring = useMemo(() => {
    if (!viewingThisMonth) return [];
    const m1 = stepPeriod(period, -1), m2 = stepPeriod(period, -2);
    const key = (e) => `${e.outlet_id || ""}|${e.category}|${norm(e.title)}`;
    const keysIn = (p) => new Set(expenses.filter((e) => inPeriod(e.spent_on, p)).map(key));
    const k1 = keysIn(m1), k2 = keysIn(m2), now = new Set(inView.map(key));
    const latest = new Map();
    expenses.filter((e) => inPeriod(e.spent_on, m1)).forEach((e) => latest.set(key(e), e));
    return [...latest.entries()].filter(([k]) => k2.has(k) && k1.has(k) && !now.has(k)).map(([, e]) => e);
  }, [expenses, inView, period, viewingThisMonth]);

  const finalAmount = Number(form.amount) || 0;
  const openAdd = (prefill) => { setForm({ ...blankForm(), ...(prefill || {}) }); setErr(""); setEditing({}); };
  const openEdit = (e) => {
    setForm({ title: e.title, category: e.category, amount: String(e.amount), spent_on: String(e.spent_on).slice(0, 10), outlet_id: e.outlet_id || "" });
    setErr(""); setEditing(e);
  };

  const save = async () => {
    setErr("");
    if (!form.title.trim()) { setErr("Title is required."); return; }
    if (finalAmount <= 0) { setErr("Enter the amount spent."); return; }
    if (isSuperAdmin && !editing?.id && !form.outlet_id) { setErr("Pick which outlet this expense belongs to."); return; }
    if (finalAmount >= LARGE_EXPENSE && !confirm(`Record ${inr(finalAmount)} for "${form.title.trim()}"?\n\nThat's a large amount — double-check the digits.`)) return;
    if (busy) return;
    setBusy(true);
    const payload = { title: form.title.trim(), category: form.category, amount: finalAmount, spent_on: form.spent_on };
    if (isSuperAdmin && form.outlet_id) payload.outlet_id = form.outlet_id;
    const ok = editing?.id ? await onUpdate(editing.id, payload) : await onAdd(payload);
    setBusy(false);
    if (ok) { setEditing(null); setForm(blankForm()); }
  };

  const columns = ["Date", "Title", ...(isSuperAdmin ? ["Outlet"] : []), "Category", "Amount", ...(isAdmin ? [""] : [])];
  const titleSuggestions = useMemo(() => Array.from(new Set(expenses.map((e) => e.title))).slice(0, 60), [expenses]);

  return (
    <div>
      <PageHead title="Expenses" sub={`${inr(total)} in ${periodLabel(period)} · rent, salary, utilities & other running costs`}>
        <PeriodStepper value={period} onChange={(p) => { setPeriod(p); setCat(""); }} modes={["month", "week", "year", "all", "custom"]} />
        <Btn variant="primary" icon={Plus} small onClick={() => openAdd()}>Add Expense</Btn>
      </PageHead>

      {missingRecurring.length > 0 && (
        <div className="flex items-start gap-3 flex-wrap" style={{ background: C.tealLight, border: `1px solid ${C.teal}33`, borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
          <Repeat size={16} color={C.tealDark} style={{ marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>Monthly costs not added for {periodLabel(period)} yet</p>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
              {missingRecurring.map((e) => (
                <button key={e.id} onClick={() => openAdd({ title: e.title, category: e.category, amount: String(e.amount), outlet_id: e.outlet_id || "" })}
                  className="wb-press" title={`Last added ${fmtDate(e.spent_on)}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 99, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, color: C.navy, cursor: "pointer" }}>
                  <Plus size={12} /> {e.title} · {inr(e.amount)}{isSuperAdmin ? ` · ${outletName(e.outlet_id)}` : ""}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Category cards — click one to filter the list to it */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", marginBottom: 16 }}>
        {cards.map((k) => {
          const active = cat === k.c;
          return (
            <button key={k.c} onClick={() => setCat(active ? "" : k.c)} className="wb-lift"
              style={{ textAlign: "left", background: "#fff", border: `1.5px solid ${active ? CAT_COLOR[k.c] || C.navy : C.border}`, borderRadius: 14, padding: "12px 14px", cursor: "pointer" }}>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2" style={{ fontSize: 12, fontWeight: 700, color: C.textMute }}>
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: CAT_COLOR[k.c] || C.textFaint }} />{k.c}
                </span>
                {k.unusual && <span title="Much higher than this category's recent average — check the amount" style={{ color: C.amber, display: "inline-flex" }}><AlertTriangle size={14} /></span>}
              </div>
              <p style={{ fontSize: 19, fontWeight: 800, color: C.navy, marginTop: 4 }}>{inr(k.amt)}</p>
              <div style={{ height: 4, borderRadius: 99, background: C.bg, marginTop: 6, overflow: "hidden" }}>
                <div style={{ width: `${k.share}%`, height: "100%", background: CAT_COLOR[k.c] || C.textFaint }} />
              </div>
              <p style={{ fontSize: 11, color: C.textFaint, marginTop: 5 }} className="flex items-center gap-1">
                {k.share.toFixed(0)}%
                {k.delta !== null && (
                  <span className="inline-flex items-center" style={{ color: k.delta > 0 ? C.red : C.green, fontWeight: 600 }}>
                    · {k.delta > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}{Math.abs(k.delta).toFixed(0)}% vs {periodNoun(period)}
                  </span>
                )}
              </p>
            </button>
          );
        })}
      </div>

      <DataTable
        loading={loading}
        entriesKey="expenses"
        defaultEntries={25}
        columns={columns}
        data={shown}
        searchKeys={["title", "category", "expense_no"]}
        placeholder="Search : num, title…"
        emptyText={`No expenses in ${periodLabel(period)}${cat ? ` for ${cat}` : ""}.`}
        toolbar={
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2" style={{ fontSize: 12.5, color: C.textMute }}>
              Group by <Segmented small value={groupMode} onChange={setGroupMode} options={[["date", "Date"], ["category", "Category"]]} />
            </div>
            {cat && <button onClick={() => setCat("")} style={{ border: "none", background: C.bg, borderRadius: 99, padding: "5px 12px", fontSize: 12, fontWeight: 600, color: C.navy, cursor: "pointer" }}>Showing {cat} only · ✕</button>}
          </div>
        }
        groupBy={(e) => (groupMode === "category" ? e.category : String(e.spent_on).slice(0, 10))}
        renderGroup={(k, rows) => (
          <div className="flex items-center justify-between" style={{ fontSize: 12.5 }}>
            <span style={{ fontWeight: 700, color: C.navy }}>
              {groupMode === "category" ? k : toDate(k).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}
              <span style={{ color: C.textFaint, fontWeight: 500 }}> · {rows.length} item{rows.length === 1 ? "" : "s"}</span>
            </span>
            <span style={{ fontWeight: 800, color: C.navy }}>{inr(sum(rows))}</span>
          </div>
        )}
        footer={(rows) => (
          <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
            <span style={{ color: C.textMute }}>{rows.length} expense{rows.length === 1 ? "" : "s"}{cat ? ` · ${cat}` : ""}</span>
            <span style={{ fontWeight: 800, color: C.navy }}>Total {inr(sum(rows))}</span>
          </div>
        )}
        renderRow={(e) => (
          <tr key={e.id} className={isAdmin ? "wb-row" : undefined} onClick={isAdmin ? () => openEdit(e) : undefined}>
            <td style={{ ...td, color: C.textMute, whiteSpace: "nowrap" }}>{fmtDay(e.spent_on)}<div style={{ fontSize: 11, color: C.textFaint }}>{e.expense_no}</div></td>
            <td style={{ ...td, fontWeight: 600 }}>{e.title}</td>
            {isSuperAdmin && <td style={{ ...td, color: C.textMute }}>{outletName(e.outlet_id)}</td>}
            <td style={td}><Badge tone="navy">{e.category}</Badge></td>
            <td style={{ ...td, fontWeight: 800, color: Number(e.amount) >= LARGE_EXPENSE ? C.amber : undefined }}>{inr(e.amount)}</td>
            {isAdmin && (
              <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }} onClick={(ev) => ev.stopPropagation()}>
                <div className="inline-flex gap-1">
                  <button onClick={() => openEdit(e)} title="Edit" style={iconBtn(C.bg, C.navy)}><Pencil size={14} /></button>
                  <button onClick={() => onDelete(e)} title="Delete" style={iconBtn(C.redLt, C.red)}><Trash2 size={14} /></button>
                </div>
              </td>
            )}
          </tr>
        )}
      />

      {editing && (
        <Modal title={editing.id ? `Edit Expense ${editing.expense_no || ""}` : "Add Expense"} sub="Rent, salary, utilities & other running costs — reflects in HQ reports" onClose={() => setEditing(null)}>
          {isSuperAdmin && !editing.id && (
            <div style={{ marginBottom: 14 }}><label style={fieldLabel}>Outlet *</label>
              <select style={field} value={form.outlet_id} onChange={(e) => setForm({ ...form, outlet_id: e.target.value })}>
                <option value="">— Select outlet —</option>
                {outlets.filter((o) => o.active !== false).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <div><label style={fieldLabel}>Title *</label>
            <input style={field} list="wb-expense-titles" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Shop rent — July, Staff salary — Ramesh" autoFocus />
            <datalist id="wb-expense-titles">{titleSuggestions.map((t) => <option key={t} value={t} />)}</datalist>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={fieldLabel}>Category</label>
            <div className="flex flex-wrap gap-2">
              {(CATS.includes(form.category) ? CATS : [form.category, ...CATS]).map((c) => (
                <button key={c} type="button" onClick={() => setForm({ ...form, category: c })}
                  style={{ padding: "7px 12px", borderRadius: 99, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    border: form.category === c ? "none" : `1px solid ${C.border}`, background: form.category === c ? (CAT_COLOR[c] || C.navy) : "#fff", color: form.category === c ? "#fff" : C.textMute }}>{c}</button>
              ))}
            </div>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
            <div>
              <label style={fieldLabel}>Amount (₹) *</label>
              <input style={field} type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Total spent"
                onKeyDown={(e) => e.key === "Enter" && save()} />
              {finalAmount > 0 && <p style={{ fontSize: 12, color: finalAmount >= LARGE_EXPENSE ? C.amber : C.textMute, marginTop: 6, fontWeight: 600 }}>{inr(finalAmount)}{finalAmount >= LARGE_EXPENSE ? " — large, double-check" : ""}</p>}
            </div>
            <div><label style={fieldLabel}>Date</label><input style={field} type="date" max={localIsoDate()} value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })} /></div>
          </div>

          {err && <div style={{ background: C.redLt, color: C.red, fontSize: 12.5, fontWeight: 600, padding: "9px 12px", borderRadius: 9, marginTop: 14 }}>{err}</div>}
          <div className="flex justify-between gap-2" style={{ marginTop: 22 }}>
            <div>{editing.id && isAdmin && <Btn variant="danger" small icon={Trash2} onClick={async () => { if (await onDelete(editing)) setEditing(null); }}>Delete</Btn>}</div>
            <div className="flex gap-2">
              <Btn variant="outline" small onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn variant="primary" small icon={editing.id ? Pencil : Plus} onClick={save} disabled={busy || finalAmount <= 0}>{editing.id ? "Save changes" : "Save"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

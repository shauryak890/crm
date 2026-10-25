import React, { useMemo, useState } from "react";
import { Plus, MessageCircle, ShoppingCart, Phone, Wallet } from "lucide-react";
import { C, STORE, inr, orderRef, balanceDue, collected, normPhone, isValidPhone, isCancelled, fmtDate, fmtDay, localIsoDate, waLink } from "../theme";
import { PageHead, Btn, Badge, DataTable, Modal, td, field, fieldLabel } from "../components/ui";
import { FilterChips, Drawer, KV, SectionTitle, usePersistentState } from "../components/kit";
import { rollupCustomer } from "../lib/api";
import { CollectPaymentModal } from "./Sales";

const blank = () => ({ first_name: "", last_name: "", phone: "", address: "", outlet_id: "" });

// A customer's current plan: the newest subscription that is still usable
// (active, unexpired, kg left).
function activePlan(subs) {
  const now = new Date();
  return subs.find((s) => s.status === "active" && new Date(s.expires_at) >= now
    && Number(s.weight_used_kg) < Number(s.weight_limit_kg)) || null;
}

const INACTIVE_DAYS = 60;
const CHIPS = [
  { key: "all", label: "All", test: () => true },
  { key: "owing", label: "Owes money", tone: "danger", test: (c) => c.rest > 0 },
  { key: "plan", label: "Has plan", test: (c) => !!c.plan },
  { key: "inactive", label: `Inactive ${INACTIVE_DAYS}+ days`, tone: "warn", test: (c) => c.lastAt && c.lastAt < localIsoDate(-INACTIVE_DAYS) },
  { key: "new", label: "New this month", test: (c) => String(c.created_at || "").slice(0, 7) === localIsoDate().slice(0, 7) },
];
const SORTS = [["recent", "Newest"], ["owed", "Most owed"], ["spent", "Top spenders"], ["last", "Last visit"]];

export default function Customers({ customers, orders, subscriptions = [], loading, onAdd,
  isSuperAdmin = false, outlets = [], onOpenInvoice, initialQuery = "", intent,
  onCollectPayment, onResetPayment, isAdmin, go }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [chip, setChip] = useState(intent?.chip || "all");
  const [sort, setSort] = usePersistentState("customers:sort", "recent");
  const [profileId, setProfileId] = useState(null);
  const [payOrder, setPayOrder] = useState(null);

  const outletName = (id) => outlets.find((o) => o.id === id)?.name?.replace(/^Patna\s*-\s*/i, "") || "—";

  const save = async () => {
    setErr("");
    if (!form.first_name.trim() || busy) { setErr("First name is required."); return; }
    if (!isValidPhone(form.phone)) { setErr("Enter a valid 10-digit mobile number."); return; }
    if (isSuperAdmin && !form.outlet_id) { setErr("Pick which outlet this customer belongs to."); return; }
    const p = normPhone(form.phone);
    const dupe = customers.find((c) => normPhone(c.phone) === p && (!isSuperAdmin || c.outlet_id === form.outlet_id));
    if (dupe) { setErr(`${dupe.first_name} ${dupe.last_name || ""} (${dupe.code}) already has this number.`); return; }
    setBusy(true);
    const payload = { first_name: form.first_name.trim(), last_name: form.last_name.trim(), phone: p, address: form.address.trim() };
    if (isSuperAdmin) payload.outlet_id = form.outlet_id;
    const ok = await onAdd(payload);
    setBusy(false);
    if (ok) { setOpen(false); setForm(blank()); }
  };

  const subsByCustomer = useMemo(() => {
    const m = {};
    subscriptions.forEach((s) => { (m[s.customer_id] = m[s.customer_id] || []).push(s); });
    return m;
  }, [subscriptions]);

  const all = useMemo(() => customers.map((c) => {
    const r = rollupCustomer(c, orders);
    const live = r.orders.filter((o) => !isCancelled(o));
    const lastAt = live.reduce((m, o) => (!m || o.created_at > m ? o.created_at : m), null);
    return { ...c, ...r, plan: activePlan(subsByCustomer[c.id] || []), lastAt: lastAt ? String(lastAt).slice(0, 10) : null, visits: live.length };
  }), [customers, orders, subsByCustomer]);

  const chips = CHIPS.map((c) => ({ ...c, count: all.filter(c.test).length }));
  const active = CHIPS.find((c) => c.key === chip) || CHIPS[0];
  const rows = useMemo(() => {
    const r = all.filter(active.test);
    if (sort === "owed") return r.sort((a, b) => b.rest - a.rest);
    if (sort === "spent") return r.sort((a, b) => b.total - a.total);
    if (sort === "last") return r.sort((a, b) => String(b.lastAt || "").localeCompare(String(a.lastAt || "")));
    return r;
  }, [all, active, sort]);
  const profile = profileId ? all.find((c) => c.id === profileId) : null;

  const columns = ["Customer", "Phone", ...(isSuperAdmin ? ["Outlet"] : []), "Visits", "Last visit", "Billed", "Due", "Plan"];

  return (
    <div>
      <PageHead title="Customers" sub={`${customers.length} clients · ${chips[1].count} owe money`}>
        <select value={sort} onChange={(e) => setSort(e.target.value)}
          style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", fontSize: 12.5, fontWeight: 600, color: C.navy, background: "#fff" }}>
          {SORTS.map(([k, l]) => <option key={k} value={k}>Sort: {l}</option>)}
        </select>
        <Btn variant="primary" icon={Plus} small onClick={() => { setErr(""); setOpen(true); }}>Add Customer</Btn>
      </PageHead>
      <DataTable
        key={initialQuery}
        initialQuery={initialQuery}
        loading={loading}
        entriesKey="customers"
        defaultEntries={25}
        columns={columns}
        data={rows}
        searchKeys={["first_name", "last_name", "phone", "code", "address"]}
        placeholder="Search : code, name, phone…"
        emptyText="No customers match this filter."
        toolbar={<FilterChips chips={chips} value={chip} onChange={setChip} />}
        footer={chip === "owing" ? (list) => (
          <div className="flex justify-between" style={{ fontSize: 13 }}>
            <span style={{ color: C.textMute }}>{list.length} customers owe money</span>
            <b style={{ color: C.red }}>{inr(list.reduce((a, c) => a + c.rest, 0))} outstanding</b>
          </div>
        ) : undefined}
        renderRow={(c) => (
          <tr key={c.id} className="wb-row" tabIndex={0} onClick={() => setProfileId(c.id)} onKeyDown={(e) => e.key === "Enter" && setProfileId(c.id)}>
            <td style={td}>
              <div style={{ fontWeight: 600 }}>{c.first_name} {c.last_name}</div>
              <div style={{ fontSize: 11.5, color: C.tealDark, fontWeight: 700 }}>{c.code}</div>
            </td>
            <td style={{ ...td, color: isValidPhone(c.phone) ? C.textMute : C.red }} title={isValidPhone(c.phone) ? undefined : "Not a valid 10-digit number"}>{c.phone || "—"}</td>
            {isSuperAdmin && <td style={{ ...td, color: C.textMute, whiteSpace: "nowrap" }}>{outletName(c.outlet_id)}</td>}
            <td style={{ ...td, color: C.textMute }}>{c.visits}</td>
            <td style={{ ...td, color: c.lastAt && c.lastAt < localIsoDate(-INACTIVE_DAYS) ? C.amber : C.textMute, whiteSpace: "nowrap" }}>{c.lastAt ? fmtDay(c.lastAt) : "—"}</td>
            <td style={{ ...td, fontWeight: 700 }}>{inr(c.total)}</td>
            <td style={{ ...td, color: c.rest ? C.red : C.textFaint, fontWeight: 700 }}>{inr(c.rest)}</td>
            <td style={td}>{c.plan
              ? <Badge tone="info">{c.plan.plan_name} · {(Number(c.plan.weight_limit_kg) - Number(c.plan.weight_used_kg)).toFixed(1)} kg</Badge>
              : <span style={{ color: C.textFaint }}>—</span>}</td>
          </tr>
        )}
      />

      {profile && (
        <CustomerDrawer c={profile} outletName={isSuperAdmin ? outletName : null}
          onClose={() => setProfileId(null)}
          onOpenInvoice={onOpenInvoice}
          onCollect={setPayOrder}
          onNewSale={go ? () => go("pos", { customer: { name: `${profile.first_name} ${profile.last_name || ""}`.trim(), phone: profile.phone, address: profile.address } }) : null} />
      )}

      {payOrder && (
        <CollectPaymentModal order={orders.find((x) => x.id === payOrder.id) || payOrder} isAdmin={isAdmin}
          onClose={() => setPayOrder(null)}
          onCollect={async (payload) => { const ok = await onCollectPayment(payload); if (ok) setPayOrder(null); }}
          onReset={async () => { const ok = await onResetPayment(payOrder); if (ok) setPayOrder(null); }} />
      )}

      {open && (
        <Modal title="Add Customer" sub="New client record" onClose={() => setOpen(false)}>
          {isSuperAdmin && (
            <div style={{ marginBottom: 14 }}><label style={fieldLabel}>Outlet *</label>
              <select style={field} value={form.outlet_id} onChange={(e) => setForm({ ...form, outlet_id: e.target.value })}>
                <option value="">— Select outlet —</option>
                {outlets.filter((o) => o.active !== false).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div><label style={fieldLabel}>First name *</label><input style={field} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} autoFocus /></div>
            <div><label style={fieldLabel}>Last name</label><input style={field} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 14 }}><label style={fieldLabel}>Phone *</label><input style={field} inputMode="tel" placeholder="10-digit mobile" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div style={{ marginTop: 14 }}><label style={fieldLabel}>Address</label><input style={field} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save()} /></div>
          {err && <div style={{ background: C.redLt, color: C.red, fontSize: 12.5, fontWeight: 600, padding: "9px 12px", borderRadius: 9, marginTop: 14 }}>{err}</div>}
          <div className="flex justify-end gap-2" style={{ marginTop: 22 }}>
            <Btn variant="outline" small onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="primary" small icon={Plus} onClick={save} disabled={busy}>Save Customer</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ─────────────── Customer profile drawer ─────────────── */
function CustomerDrawer({ c, outletName, onClose, onOpenInvoice, onCollect, onNewSale }) {
  const owing = c.orders.filter((o) => balanceDue(o) > 0);
  const inactive = c.lastAt && c.lastAt < localIsoDate(-INACTIVE_DAYS);
  const reminder = c.rest > 0 ? waLink(c.phone, [
    `*${STORE.name}*`, `Dear ${c.first_name},`, ``,
    `A gentle reminder that *${inr(c.rest)}* is pending on ${owing.length === 1 ? `order *#${orderRef(owing[0])}*` : `${owing.length} orders (${owing.map((o) => "#" + orderRef(o)).join(", ")})`}.`,
    `You can pay at the counter or by UPI. Thank you!`, ``, `— Team ${STORE.name}`,
  ].join("\n")) : null;
  const winBack = waLink(c.phone, [
    `*${STORE.name}*`, `Dear ${c.first_name},`, ``,
    `We haven't seen you in a while! Drop off your laundry this week — free pickup on request.`, ``, `— Team ${STORE.name}`,
  ].join("\n"));

  return (
    <Drawer title={`${c.first_name} ${c.last_name || ""}`.trim()} onClose={onClose}
      sub={<span className="flex items-center gap-2 flex-wrap">{c.code}{c.plan && <Badge tone="info">{c.plan.plan_name}</Badge>}{inactive && <Badge tone="warn">Inactive</Badge>}</span>}
      footer={
        <div className="flex gap-2 flex-wrap">
          {onNewSale && <Btn variant="primary" small icon={ShoppingCart} onClick={onNewSale}>New sale</Btn>}
          {reminder && <a href={reminder} target="_blank" rel="noreferrer"><Btn variant="outline" small icon={MessageCircle}>Dues reminder</Btn></a>}
          {inactive && winBack && <a href={winBack} target="_blank" rel="noreferrer"><Btn variant="outline" small icon={MessageCircle}>“We miss you”</Btn></a>}
          {c.phone && <a href={`tel:${c.phone}`}><Btn variant="ghost" small icon={Phone}>Call</Btn></a>}
        </div>
      }>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {[["Billed", c.total, C.navy], ["Paid", c.paid, C.green], ["Due", c.rest, c.rest ? C.red : C.textFaint]].map(([k, v, col]) => (
          <div key={k} style={{ background: C.bg, borderRadius: 12, padding: "10px 12px" }}>
            <p style={{ fontSize: 11.5, color: C.textMute, fontWeight: 600 }}>{k}</p>
            <p style={{ fontSize: 17, fontWeight: 800, color: col }}>{inr(v)}</p>
          </div>
        ))}
      </div>

      <SectionTitle>Contact</SectionTitle>
      <KV k="Phone" v={c.phone || "—"} color={isValidPhone(c.phone) ? undefined : C.red} />
      {c.address && <KV k="Address" v={c.address} />}
      {outletName && <KV k="Outlet" v={outletName(c.outlet_id)} />}
      <KV k="Customer since" v={fmtDate(c.created_at)} />
      <KV k="Visits" v={`${c.visits}${c.lastAt ? ` · last ${fmtDay(c.lastAt)}` : ""}`} />
      {c.plan && <KV k="Plan balance" v={`${(Number(c.plan.weight_limit_kg) - Number(c.plan.weight_used_kg)).toFixed(1)} kg · until ${fmtDay(c.plan.expires_at)}`} color={C.green} />}

      <SectionTitle>Orders · {c.orders.length}</SectionTitle>
      {c.orders.length === 0 ? <p style={{ color: C.textFaint, fontSize: 13 }}>No orders yet.</p> : (
        <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 12, overflow: "hidden" }}>
          {[...c.orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((o) => {
            const due = balanceDue(o);
            return (
              <div key={o.id} className="flex items-center justify-between" style={{ padding: "9px 12px", borderTop: `1px solid ${C.borderSoft}`, fontSize: 13, opacity: isCancelled(o) ? 0.5 : 1, gap: 8 }}>
                <div>
                  <button onClick={() => onOpenInvoice && onOpenInvoice(o)} style={{ border: "none", background: "none", color: C.tealDark, fontWeight: 700, cursor: "pointer", padding: 0 }}>#{orderRef(o)}</button>
                  <span style={{ color: C.textFaint, fontSize: 12 }}> · {fmtDay(o.created_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontWeight: 600 }}>{inr(o.total)}</span>
                  {isCancelled(o) ? <Badge tone="muted">Cancelled</Badge>
                    : due > 0 ? <button onClick={() => onCollect(o)} title="Collect payment" style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}><Badge tone="danger"><Wallet size={10} /> {inr(due)}</Badge></button>
                    : <Badge tone="success">Paid · {inr(collected(o))}</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}

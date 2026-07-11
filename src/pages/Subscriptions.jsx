import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Search, Plus, Pencil, X, ShieldCheck, Clock, Ban, MessageCircle } from "lucide-react";
import { C, inr, STORE } from "../theme";
import * as api from "../lib/api";
import { PageHead, Card, Btn, Badge, Modal, field, fieldLabel } from "../components/ui";

const fmtDate = (s) => s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// WhatsApp the customer that their subscription is now active, with the
// plan, weight limit, and the exact start/expiry dates.
function notifySubscriptionWhatsApp(customer, sub) {
  const num = String(customer.phone || "").replace(/\D/g, "");
  if (!num) return;
  const lines = [
    `*${STORE.name}*`,
    `Dear ${customer.first_name},`,
    ``,
    `Your *${sub.plan_name}* subscription is now active!`,
    `Weight limit: ${sub.weight_limit_kg} kg`,
    `Started: ${fmtDate(sub.purchased_at)}`,
    `Valid until: ${fmtDate(sub.expires_at)}`,
    ``,
    `Every wash is deducted from your plan automatically at checkout — just drop off your laundry with us.`,
    ``,
    `Thank you for choosing ${STORE.name}!`,
  ].join("\n");
  const wa = num.length === 10 ? "91" + num : num;
  window.open(`https://wa.me/${wa}?text=${encodeURIComponent(lines)}`, "_blank");
}

const STATUS_TONE  = { active: "success", expired: "muted", cancelled: "danger" };
const STATUS_LABEL = { active: "Active", expired: "Expired", cancelled: "Cancelled" };

// A subscription is only really "active" if the DB says so AND it hasn't
// passed its 30-day expiry — the DB doesn't auto-flip the status column,
// so the frontend treats a stale 'active' row past expires_at as expired.
function effectiveStatus(s) {
  if (s.status === "active" && new Date(s.expires_at) < new Date()) return "expired";
  return s.status;
}

const blankPlanForm = () => ({ name: "", price: "", weight_limit_kg: "", features: "" });

export default function Subscriptions({ profile, isAdmin, isSuperAdmin, customers = [], outlets = [], billingOutletId, setBillingOutletId, toast, onRefresh }) {
  const [plans, setPlans] = useState([]);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [planModal, setPlanModal] = useState(null); // null closed, {} add, {...plan} edit
  const [planForm, setPlanForm] = useState(blankPlanForm);
  const [planBusy, setPlanBusy] = useState(false);

  const [sellFor, setSellFor] = useState(null); // customer row being sold a plan
  const [sellBusy, setSellBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pl, su] = await Promise.all([
        isAdmin ? api.fetchAllSubscriptionPlans() : api.fetchSubscriptionPlans(),
        api.fetchCustomerSubscriptions(),
      ]);
      setPlans(pl); setSubs(su);
    } catch (e) { toast && toast("Load error: " + e.message); }
    setLoading(false);
  }, [isAdmin, toast]);
  useEffect(() => { load(); }, [load]);

  // Latest subscription per customer, for the directory table.
  const subByCustomer = useMemo(() => {
    const m = {};
    for (const s of subs) {
      const prev = m[s.customer_id];
      if (!prev || new Date(s.purchased_at) > new Date(prev.purchased_at)) m[s.customer_id] = s;
    }
    return m;
  }, [subs]);

  const visibleCustomers = customers.filter((c) =>
    `${c.first_name} ${c.last_name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())
  );

  /* ── Plan editor (admin only) ────────────────────────────────────── */
  const openAddPlan = () => { setPlanForm(blankPlanForm()); setPlanModal({}); };
  const openEditPlan = (p) => { setPlanForm({ name: p.name, price: p.price, weight_limit_kg: p.weight_limit_kg, features: (p.features || []).join(", ") }); setPlanModal(p); };
  const savePlan = async () => {
    if (!planForm.name.trim() || !planForm.price || !planForm.weight_limit_kg || planBusy) return;
    setPlanBusy(true);
    const payload = {
      name: planForm.name.trim(),
      price: Number(planForm.price),
      weight_limit_kg: Number(planForm.weight_limit_kg),
      features: planForm.features.split(",").map((f) => f.trim()).filter(Boolean),
    };
    try {
      if (planModal?.id) await api.updateSubscriptionPlan(planModal.id, payload);
      else await api.createSubscriptionPlan(payload);
      toast && toast(planModal?.id ? "Plan updated" : "Plan added");
      setPlanModal(null);
      await load();
      onRefresh && onRefresh();
    } catch (e) { toast && toast("Could not save: " + e.message); }
    setPlanBusy(false);
  };
  const archivePlan = async (p) => {
    if (!confirm(`Retire "${p.name}"? Existing customer subscriptions keep their terms.`)) return;
    try { await api.updateSubscriptionPlan(p.id, { active: false }); toast && toast("Plan retired"); await load(); onRefresh && onRefresh(); }
    catch (e) { toast && toast("Could not retire: " + e.message); }
  };

  /* ── Sell a plan to a customer ───────────────────────────────────── */
  const sell = async (plan, notify = true) => {
    setErr("");
    const outletId = isSuperAdmin ? billingOutletId : null;
    if (isSuperAdmin && !outletId) { setErr("Pick which outlet this sale is for."); return; }
    setSellBusy(true);
    try {
      const created = await api.createCustomerSubscription({ customerId: sellFor.id, plan, outletId });
      toast && toast(`${plan.name} sold to ${sellFor.first_name}`);
      if (notify) notifySubscriptionWhatsApp(sellFor, created);
      setSellFor(null);
      await load();
      onRefresh && onRefresh();
    } catch (e) {
      // The DB blocks a second active subscription with a unique-index violation.
      const msg = /duplicate key|unique/i.test(e.message) ? "This customer already has an active subscription." : e.message;
      setErr(msg);
    }
    setSellBusy(false);
  };

  const cancelSub = async (s) => {
    if (!confirm(`Cancel ${s.plan_name} for this customer? Remaining balance will be forfeited.`)) return;
    try { await api.cancelCustomerSubscription(s.id); toast && toast("Subscription cancelled"); await load(); onRefresh && onRefresh(); }
    catch (e) { toast && toast("Could not cancel: " + e.message); }
  };

  return (
    <div>
      <PageHead title="Subscriptions" sub="Sell monthly weight-based laundry plans and track each customer's remaining balance.">
        {isSuperAdmin && (
          <select value={billingOutletId || ""} onChange={(e) => setBillingOutletId(e.target.value)}
            style={{ border: `1px solid ${C.border}`, borderRadius: 11, padding: "8px 12px", fontSize: 13, fontWeight: 600, color: C.navy, background: "#fff", marginRight: 10 }}>
            <option value="">Sell for outlet…</option>
            {outlets.filter((o) => o.active !== false).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        {isAdmin && <Btn variant="primary" icon={Plus} small onClick={openAddPlan}>Add Plan</Btn>}
      </PageHead>

      {/* Plan cards */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 26 }}>
        {plans.map((p) => (
          <Card key={p.id} hover style={{ position: "relative" }}>
            {isAdmin && (
              <button onClick={() => openEditPlan(p)} style={{ position: "absolute", top: 14, right: 14, border: "none", background: C.bg, color: C.navy, width: 28, height: 28, borderRadius: 8, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Pencil size={13} />
              </button>
            )}
            <p style={{ fontSize: 15, fontWeight: 800, color: C.navy }}>{p.name}{p.active === false && <span style={{ marginLeft: 8 }}><Badge tone="muted">Retired</Badge></span>}</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: C.tealDark, marginTop: 6 }}>{inr(p.price)}<span style={{ fontSize: 12, color: C.textFaint, fontWeight: 600 }}> / month</span></p>
            <p style={{ fontSize: 12.5, color: C.textMute, marginTop: 4 }}>{p.weight_limit_kg} kg limit</p>
            {(p.features || []).length > 0 && (
              <ul style={{ marginTop: 10, paddingLeft: 0, listStyle: "none" }}>
                {p.features.map((f, i) => (
                  <li key={i} style={{ fontSize: 12, color: C.textMute, marginTop: 4 }}>· {f}</li>
                ))}
              </ul>
            )}
            {isAdmin && p.active !== false && (
              <button onClick={() => archivePlan(p)} style={{ marginTop: 12, border: "none", background: "transparent", color: C.textFaint, fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}>Retire plan</button>
            )}
          </Card>
        ))}
        {plans.length === 0 && !loading && (
          <Card><p style={{ color: C.textMute, fontSize: 13.5 }}>No plans yet. Run supabase/subscriptions.sql to seed the master list.</p></Card>
        )}
      </div>

      {/* Customer subscription directory */}
      <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy, marginBottom: 12 }}>Customer subscriptions</h3>
      <Card pad={false}>
        <div style={{ padding: 14, borderBottom: `1px solid ${C.borderSoft}` }}>
          <div className="flex items-center gap-2 rounded-xl" style={{ border: `1px solid ${C.border}`, padding: "9px 12px", maxWidth: 340 }}>
            <Search size={15} color={C.textFaint} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a customer…" style={{ border: "none", outline: "none", fontSize: 13.5, width: "100%", background: "transparent" }} />
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.bg }}>
              <th style={tH}>Customer</th>
              <th style={tH}>Plan</th>
              <th style={tH}>Status</th>
              <th style={tH}>Balance</th>
              <th style={tH}>Expires</th>
              <th style={tH}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: C.textFaint }}>Loading…</td></tr>
            ) : visibleCustomers.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: C.textFaint, fontSize: 13 }}>No customers found.</td></tr>
            ) : visibleCustomers.map((c) => {
              const s = subByCustomer[c.id];
              const status = s ? effectiveStatus(s) : null;
              const remaining = s ? Math.max(0, Number(s.weight_limit_kg) - Number(s.weight_used_kg)) : 0;
              return (
                <tr key={c.id}>
                  <td style={tD}>
                    <p style={{ fontWeight: 600, color: C.navy }}>{c.first_name} {c.last_name}</p>
                    <p style={{ fontSize: 11.5, color: C.textFaint }}>{c.phone}</p>
                  </td>
                  <td style={tD}>{s ? s.plan_name : <span style={{ color: C.textFaint }}>—</span>}</td>
                  <td style={tD}>{s ? <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge> : <span style={{ color: C.textFaint }}>No plan</span>}</td>
                  <td style={tD}>
                    {s ? (
                      <span style={{ fontWeight: 700, color: status === "active" ? C.navy : C.textFaint }}>
                        {remaining.toFixed(1)} / {Number(s.weight_limit_kg).toFixed(1)} kg
                      </span>
                    ) : <span style={{ color: C.textFaint }}>—</span>}
                  </td>
                  <td style={{ ...tD, color: C.textMute }}>{s ? new Date(s.expires_at).toLocaleDateString("en-GB") : "—"}</td>
                  <td style={tD}>
                    <div className="flex items-center gap-2">
                      {(!s || status !== "active") && (
                        <Btn variant="outline" small icon={Plus} onClick={() => { setErr(""); setSellFor(c); }}>Sell plan</Btn>
                      )}
                      {s && status === "active" && (
                        <Btn variant="danger" small icon={Ban} onClick={() => cancelSub(s)}>Cancel</Btn>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Plan editor modal */}
      {planModal && (
        <Modal title={planModal.id ? "Edit plan" : "Add plan"} sub="Shown to every outlet · matches the website's Monthly Subscription Packs" onClose={() => setPlanModal(null)}>
          <div><label style={fieldLabel}>Plan name *</label><input style={field} value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="e.g. Gold" /></div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
            <div><label style={fieldLabel}>Price / month (₹) *</label><input style={field} type="number" min="0" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} /></div>
            <div><label style={fieldLabel}>Weight limit (kg) *</label><input style={field} type="number" min="0" value={planForm.weight_limit_kg} onChange={(e) => setPlanForm({ ...planForm, weight_limit_kg: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={fieldLabel}>Features (comma separated)</label>
            <input style={field} value={planForm.features} onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })} placeholder="Wash & Iron Service, Priority Delivery" />
          </div>
          <div className="flex justify-end gap-2" style={{ marginTop: 22 }}>
            <Btn variant="outline" small onClick={() => setPlanModal(null)}>Cancel</Btn>
            <Btn variant="primary" small icon={Plus} onClick={savePlan} disabled={planBusy}>Save</Btn>
          </div>
        </Modal>
      )}

      {/* Sell modal */}
      {sellFor && (
        <Modal title={`Sell a plan · ${sellFor.first_name} ${sellFor.last_name}`} sub="Charged now at the POS counter; balance is tracked here and applied automatically on future orders." onClose={() => setSellFor(null)}>
          <div className="flex flex-col gap-2">
            {plans.filter((p) => p.active !== false).map((p) => (
              <button key={p.id} onClick={() => sell(p)} disabled={sellBusy}
                className="flex items-center justify-between wb-press"
                style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", background: "#fff", cursor: sellBusy ? "default" : "pointer", textAlign: "left" }}>
                <div>
                  <p style={{ fontWeight: 700, color: C.navy, fontSize: 13.5 }}>{p.name}</p>
                  <p style={{ fontSize: 11.5, color: C.textMute, marginTop: 2 }}>{p.weight_limit_kg} kg · valid 30 days</p>
                </div>
                <span style={{ fontWeight: 800, color: C.tealDark, fontSize: 15 }}>{inr(p.price)}</span>
              </button>
            ))}
          </div>
          {err && <div style={{ background: C.redLt, color: C.red, fontSize: 12.5, fontWeight: 600, padding: "9px 12px", borderRadius: 9, marginTop: 12 }}>{err}</div>}
        </Modal>
      )}
    </div>
  );
}

const tH = { textAlign: "left", padding: "10px 18px", fontSize: 11, fontWeight: 600, color: C.textMute, textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap" };
const tD = { padding: "13px 18px", fontSize: 13.5, color: C.text, borderTop: `1px solid ${C.borderSoft}`, verticalAlign: "middle" };

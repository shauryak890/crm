import React, { useEffect, useMemo, useState } from "react";
import {
  Phone, MessageCircle, PhoneCall, Plus, ShoppingCart, Search, Clock, CheckCircle2, XCircle,
  CalendarClock, Truck, StickyNote, RotateCcw, Trash2, AlertTriangle, UserCheck, Pencil, Megaphone,
} from "lucide-react";
import { C, fmtDateTime, fmtDay, orderRef, waLink, inr } from "../theme";
import * as api from "../lib/api";
import { Card, Btn, Badge, Modal, PageHead, field, fieldLabel } from "../components/ui";
import { FilterChips, Drawer, KV } from "../components/kit";
import {
  KINDS, SOURCES, OUTCOMES, kindLabel, sourceLabel, outcomeLabel, leadPhone, validLeadPhone, bucket, needsAction,
  waitingMinutes, retryChoices, applyOutcome, reopen, matchingOrder, openDuplicate, ago, toLocalInput, fromLocalInput, leadIsOpen,
} from "../lib/leads";

const outletShort = (outlets, id) => (outlets.find((o) => o.id === id)?.name || "—").replace(/^Patna\s*-\s*/i, "");
const fmtPhone = (p) => { const d = leadPhone(p); return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : p; };

/* ── Store page ─────────────────────────────────────────────────────── */
export default function Leads({ leads, leadsMissing, orders, customers, outlets, isSuperAdmin, byName, toast, onSaved, onDeleted, onBill, intent }) {
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <PageHead title="Leads & Pickups" sub="People to call back: pickups and enquiries from WhatsApp, calls and HQ. Log what happened on every call so nobody has to ask “Bat hua?”.">
        {!leadsMissing && <Btn icon={Plus} onClick={() => setAdding(true)}>Add lead</Btn>}
      </PageHead>
      {leadsMissing ? <SetupNotice /> : (
        <LeadBoard leads={leads} orders={orders} customers={customers} outlets={outlets} multiOutlet={isSuperAdmin}
          canDelete={isSuperAdmin} byName={byName} toast={toast} onSaved={onSaved} onDeleted={onDeleted} onBill={onBill}
          initialChip={intent?.chip} />
      )}
      {adding && <AddLeadModal leads={leads} customers={customers} outlets={outlets} needOutlet={isSuperAdmin} byName={byName}
        onClose={() => setAdding(false)} toast={toast} onCreated={(l) => { onSaved(l); setAdding(false); }} onSaved={onSaved} />}
    </div>
  );
}

export function SetupNotice({ dark }) {
  return (
    <Card style={dark ? { marginBottom: 18 } : undefined}>
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} color={C.amber} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ fontWeight: 700, color: C.navy, fontSize: 14 }}>Leads need a one-time database update</p>
          <p style={{ color: C.textMute, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
            Run <code style={{ background: C.bg, padding: "1px 6px", borderRadius: 6 }}>supabase/leads.sql</code> once in the Supabase SQL editor, then reload this page.
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ── The list, shared by the store page and HQ ──────────────────────── */
export function LeadBoard({ leads, orders = [], customers = [], outlets = [], multiOutlet, canDelete, byName, toast, onSaved, onDeleted, onBill, initialChip }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  // Re-read the clock whenever a lead changes, so one that was just set to
  // "call now" lands on the right list straight away.
  useEffect(() => { setNow(Date.now() + 1000); }, [leads]);
  const [chip, setChip] = useState(initialChip || "call");
  const [q, setQ] = useState("");
  const [outletF, setOutletF] = useState("");
  const [logging, setLogging] = useState(null);
  const [openId, setOpenId] = useState(null);

  const scoped = useMemo(() => (outletF ? leads.filter((l) => l.outlet_id === outletF) : leads), [leads, outletF]);
  const counts = useMemo(() => {
    const c = { call: 0, later: 0, booked: 0, won: 0, lost: 0, all: scoped.length };
    scoped.forEach((l) => { c[bucket(l, now)]++; });
    return c;
  }, [scoped, now]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    let list = scoped.filter((l) => chip === "all" || bucket(l, now) === chip);
    if (s) list = list.filter((l) => String(l.name || "").toLowerCase().includes(s) || (digits.length >= 3 && leadPhone(l.phone).includes(digits))
      || String(l.area || "").toLowerCase().includes(s) || String(l.note || "").toLowerCase().includes(s) || String(l.lead_no) === s.replace(/^#/, ""));
    const key = (l) => {
      const b = bucket(l, now);
      if (b === "call") return l.status === "new" ? new Date(l.created_at).getTime() : new Date(l.next_action_at || l.created_at).getTime();
      if (b === "later") return new Date(l.next_action_at).getTime();
      if (b === "booked") return new Date(l.pickup_at).getTime();
      return -new Date(l.closed_at || l.updated_at || l.created_at).getTime();
    };
    return [...list].sort((a, b) => key(a) - key(b));
  }, [scoped, chip, q, now]);

  const openLead = leads.find((l) => l.id === openId) || null;
  const logLead = leads.find((l) => l.id === logging) || null;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3" style={{ marginBottom: 14 }}>
        <FilterChips value={chip} onChange={setChip} chips={[
          { key: "call", label: "To call now", count: counts.call, tone: "danger" },
          { key: "later", label: "Call later", count: counts.later },
          { key: "booked", label: "Pickups booked", count: counts.booked, tone: "warn" },
          { key: "won", label: "Won", count: counts.won },
          { key: "lost", label: "Closed", count: counts.lost },
          { key: "all", label: "All", count: counts.all },
        ]} />
        <div className="flex items-center gap-2 flex-wrap">
          {multiOutlet && (
            <select value={outletF} onChange={(e) => setOutletF(e.target.value)} style={{ ...field, width: "auto", padding: "8px 12px", fontSize: 13 }}>
              <option value="">All outlets</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{outletShort(outlets, o.id)}</option>)}
            </select>
          )}
          <div style={{ position: "relative" }}>
            <Search size={14} color={C.textFaint} style={{ position: "absolute", left: 11, top: 11 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or area" style={{ ...field, width: 220, padding: "8px 12px 8px 30px", fontSize: 13 }} />
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <Card><p style={{ color: C.textMute, fontSize: 13.5, textAlign: "center", padding: "18px 0" }}>
          {q ? "No leads match that search." : chip === "call" ? "Nobody waiting for a call right now." : "Nothing here."}
        </p></Card>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(360px, 100%), 1fr))" }}>
          {shown.map((l) => (
            <LeadCard key={l.id} lead={l} now={now} orders={orders} customers={customers} outlets={outlets} multiOutlet={multiOutlet}
              onLog={() => setLogging(l.id)} onOpen={() => setOpenId(l.id)} onBill={onBill} byName={byName} toast={toast} onSaved={onSaved} />
          ))}
        </div>
      )}

      {logLead && <LogCallModal lead={logLead} byName={byName} orders={orders} toast={toast} onClose={() => setLogging(null)}
        onSaved={(l) => { onSaved(l); setLogging(null); }} onBill={onBill} />}
      {openLead && <LeadDrawer lead={openLead} orders={orders} outlets={outlets} canDelete={canDelete} byName={byName} toast={toast}
        onClose={() => setOpenId(null)} onSaved={onSaved} onDeleted={(id) => { setOpenId(null); onDeleted(id); }} onLog={() => setLogging(openLead.id)} />}
    </div>
  );
}

function statusLine(l, now) {
  const b = bucket(l, now);
  if (b === "call") {
    if (l.status === "new" && l.first_contact_at) return { tone: C.red, icon: PhoneCall, text: `Reopened · call again${l.attempts ? ` · ${l.attempts} call${l.attempts === 1 ? "" : "s"} before` : ""}` };
    if (l.status === "new") {
      const w = waitingMinutes(l, now);
      return { tone: w >= 60 ? C.red : C.amber, icon: PhoneCall, text: `New · waiting ${w < 60 ? `${w} min` : ago(l.created_at, now).replace(" ago", "")} for a first call` };
    }
    return { tone: C.red, icon: PhoneCall, text: `Call again now · was due ${fmtDateTime(l.next_action_at)}${l.attempts ? ` · ${l.attempts} tr${l.attempts === 1 ? "y" : "ies"} so far` : ""}` };
  }
  if (b === "later") return { tone: C.tealDark, icon: Clock, text: `Call back ${fmtDateTime(l.next_action_at)}${l.last_outcome === "not_answering" ? ` · not answering (${l.attempts} tr${l.attempts === 1 ? "y" : "ies"})` : ""}` };
  if (b === "booked") {
    const late = new Date(l.pickup_at).getTime() < now;
    return { tone: late ? C.red : C.green, icon: Truck, text: `Pickup ${late ? "was due" : "booked for"} ${fmtDateTime(l.pickup_at)}` };
  }
  if (b === "won") return { tone: C.green, icon: CheckCircle2, text: `Order placed${l.closed_at ? ` · ${fmtDay(l.closed_at)}` : ""}` };
  return { tone: C.textMute, icon: XCircle, text: `Closed · ${l.lost_reason || outcomeLabel(l.last_outcome)}` };
}

function LeadCard({ lead: l, now, orders, customers, outlets, multiOutlet, onLog, onOpen, onBill, byName, toast, onSaved }) {
  const st = statusLine(l, now);
  const ph = leadPhone(l.phone);
  const wa = waLink(ph, `Namaste${l.name ? " " + l.name.split(" ")[0] : ""}, this is Whites & Brights. `);
  const match = l.status !== "won" && l.status !== "lost" ? matchingOrder(l, orders) : null;
  const known = customers.find((c) => leadPhone(c.phone) === ph && (!l.outlet_id || c.outlet_id === l.outlet_id));
  const [busy, setBusy] = useState(false);
  const markWon = async () => {
    const r = applyOutcome(l, "won", { order_id: match.id, note: `Order #${orderRef(match)} (${inr(match.total)})`, by_name: byName });
    setBusy(true);
    try { onSaved(await api.logLeadOutcome(l.id, r.patch, r.event)); toast(`Lead marked won · #${orderRef(match)}`); }
    catch (e) { toast("Could not update the lead: " + e.message, "error"); }
    setBusy(false);
  };
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderLeft: `4px solid ${st.tone}`, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: 14.5, color: C.navy }}>{l.name || "Name not known"} <span style={{ color: C.textFaint, fontWeight: 500, fontSize: 12 }}>#{l.lead_no}</span></p>
          <p style={{ fontSize: 13, color: C.textMute, marginTop: 2 }}>{fmtPhone(l.phone)}{l.area ? ` · ${l.area}` : ""}</p>
        </button>
        <div className="flex items-center gap-1 flex-wrap" style={{ justifyContent: "flex-end" }}>
          <Badge tone={l.kind === "pickup" ? "info" : l.kind === "bulk" ? "navy" : "muted"}>{kindLabel(l.kind)}</Badge>
          {multiOutlet && <Badge tone="muted">{outletShort(outlets, l.outlet_id)}</Badge>}
        </div>
      </div>
      <p className="inline-flex items-center gap-2" style={{ fontSize: 12.5, fontWeight: 600, color: st.tone }}><st.icon size={14} /> {st.text}</p>
      {(l.note || l.last_note) && (
        <div style={{ fontSize: 12.5, color: C.text, background: C.paper, borderRadius: 8, padding: "7px 10px", lineHeight: 1.45 }}>
          {l.note && <p><span style={{ color: C.textFaint }}>Note:</span> {l.note}</p>}
          {l.last_note && l.last_note !== l.note && <p style={{ marginTop: l.note ? 3 : 0 }}><span style={{ color: C.textFaint }}>Latest:</span> {l.last_note}</p>}
        </div>
      )}
      <p style={{ fontSize: 11.5, color: C.textFaint }}>
        {sourceLabel(l.source)} · added {ago(l.created_at, now)}{l.created_by_name ? ` by ${l.created_by_name}` : ""}
        {known && <span style={{ color: C.tealDark, fontWeight: 600 }}> · existing customer</span>}
      </p>
      {match && (
        <div className="flex items-center justify-between gap-2 flex-wrap" style={{ background: C.greenLt, borderRadius: 8, padding: "7px 10px", fontSize: 12.5, color: C.green, fontWeight: 600 }}>
          <span>Order #{orderRef(match)} ({inr(match.total)}) placed by this number</span>
          <Btn small variant="success" icon={UserCheck} onClick={markWon} disabled={busy}>Mark won</Btn>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 2 }}>
        {leadIsOpen(l) && <Btn small icon={PhoneCall} onClick={onLog}>Log call</Btn>}
        <a href={`tel:${ph}`} className="wb-press inline-flex items-center gap-1" style={{ textDecoration: "none", border: `1px solid ${C.border}`, borderRadius: 12, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, color: C.navy }}><Phone size={14} /> Call</a>
        {wa && <a href={wa} target="_blank" rel="noreferrer" className="wb-press inline-flex items-center gap-1" style={{ textDecoration: "none", border: `1px solid ${C.border}`, borderRadius: 12, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, color: C.green }}><MessageCircle size={14} /> WhatsApp</a>}
        {onBill && leadIsOpen(l) && <Btn small variant="outline" icon={ShoppingCart} onClick={() => onBill(l)}>Bill now</Btn>}
        {!leadIsOpen(l) && <Btn small variant="ghost" onClick={onOpen}>Details</Btn>}
      </div>
    </div>
  );
}

/* ── "What happened on the call?" ───────────────────────────────────── */
const OUTCOME_ICON = { not_answering: PhoneCall, call_back: CalendarClock, booked: Truck, won: CheckCircle2, enquiry: MessageCircle, not_interested: XCircle, wrong_number: AlertTriangle, note: StickyNote };
const OUTCOME_TONE = { not_answering: C.amber, call_back: C.tealDark, booked: C.green, won: C.green, enquiry: C.textMute, not_interested: C.red, wrong_number: C.red, note: C.navy };

export function LogCallModal({ lead, byName, orders = [], toast, onClose, onSaved, onBill }) {
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const retries = useMemo(() => retryChoices(), []);
  const [retry, setRetry] = useState("10m");
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 2 * 3600e3)));
  const [pickup, setPickup] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(11, 0, 0, 0); return toLocalInput(d); });
  const [area, setArea] = useState(lead.area || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const match = matchingOrder(lead, orders);

  const save = async () => {
    setErr("");
    const opts = { note, by_name: byName, area };
    if (outcome === "not_answering") opts.next_action_at = retries.find((r) => r.key === retry)?.at;
    if (outcome === "call_back") opts.next_action_at = fromLocalInput(when);
    if (outcome === "booked") opts.pickup_at = fromLocalInput(pickup);
    if (outcome === "won" && match) opts.order_id = match.id;
    const r = applyOutcome(lead, outcome, opts);
    if (r.error) return setErr(r.error);
    setBusy(true);
    try {
      const updated = await api.logLeadOutcome(lead.id, r.patch, r.event);
      onSaved(updated || { ...lead, ...r.patch });
      toast(outcome === "note" ? "Note added" : `${lead.name || fmtPhone(lead.phone)}: ${outcomeLabel(outcome)}`);
    } catch (e) { setErr("Could not save: " + e.message); setBusy(false); }
  };
  const tries = Number(lead.attempts || 0);

  return (
    <Modal title="What happened on the call?" sub={`${lead.name || "Lead"} · ${fmtPhone(lead.phone)}${tries ? ` · ${tries} call${tries === 1 ? "" : "s"} so far` : ""}`} onClose={onClose} width={560}>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", marginBottom: 14 }}>
        {Object.entries(OUTCOMES).map(([k, d]) => {
          const Icon = OUTCOME_ICON[k]; const on = outcome === k;
          return (
            <button key={k} type="button" onClick={() => { setOutcome(k); setErr(""); }} className="wb-press"
              style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "10px 12px", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600,
                border: on ? `2px solid ${OUTCOME_TONE[k]}` : `1px solid ${C.border}`, background: on ? OUTCOME_TONE[k] + "12" : "#fff", color: C.navy }}>
              <Icon size={16} color={OUTCOME_TONE[k]} /> {d.label}
            </button>
          );
        })}
      </div>

      {outcome === "not_answering" && (
        <div style={{ marginBottom: 12 }}>
          <label style={fieldLabel}>Try again</label>
          <FilterChips value={retry} onChange={setRetry} chips={retries.map((r) => ({ key: r.key, label: r.label }))} />
          {tries >= 2 && <p style={{ fontSize: 12, color: C.amber, marginTop: 8 }}>This will be try number {tries + 1}. If they still don't pick up, consider closing it as “Wrong / invalid number”.</p>}
        </div>
      )}
      {outcome === "call_back" && (
        <div style={{ marginBottom: 12 }}>
          <label style={fieldLabel}>Call them back at</label>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={field} />
        </div>
      )}
      {outcome === "booked" && (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 12 }}>
          <div><label style={fieldLabel}>Pickup date & time</label><input type="datetime-local" value={pickup} onChange={(e) => setPickup(e.target.value)} style={field} /></div>
          <div><label style={fieldLabel}>Pickup address / area</label><input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Boring Road, near…" style={field} /></div>
        </div>
      )}
      {outcome === "won" && (
        <p style={{ fontSize: 12.5, color: match ? C.green : C.textMute, marginBottom: 12, lineHeight: 1.5 }}>
          {match ? `Linked to order #${orderRef(match)} (${inr(match.total)}).` : "No bill found for this number yet. Make the bill in Point of Sale; it will show against this lead."}
        </p>
      )}

      {outcome && (
        <div style={{ marginBottom: 12 }}>
          <label style={fieldLabel}>{outcome === "note" ? "Note" : "What did they say? (optional)"}</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={outcome === "enquiry" ? "e.g. asked saree polish rate, will come Sunday" : "e.g. wants pickup after 5 pm, 2 blankets + curtains"} style={{ ...field, resize: "vertical" }} />
        </div>
      )}

      {err && <p style={{ color: C.red, fontSize: 12.5, marginBottom: 10 }}>{err}</p>}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {outcome === "won" && !match && onBill ? <Btn variant="outline" icon={ShoppingCart} onClick={() => { onClose(); onBill(lead); }}>Make the bill</Btn> : <span />}
        <div className="flex gap-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={!outcome || busy}>{busy ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ── Add a lead ─────────────────────────────────────────────────────── */
export function AddLeadModal({ leads, customers = [], outlets = [], needOutlet, defaultOutletId = "", byName, onClose, onCreated, onSaved, toast }) {
  const [f, setF] = useState({ phone: "", name: "", outlet_id: defaultOutletId || "", kind: "pickup", source: "whatsapp", area: "", note: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [force, setForce] = useState(false);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErr(""); if (k === "phone" || k === "outlet_id") setForce(false); };
  const activeOutlets = outlets.filter((o) => o.active !== false);

  const ph = leadPhone(f.phone);
  const outletForCheck = needOutlet ? f.outlet_id : (leads[0]?.outlet_id || null);
  const dup = ph.length === 10 ? (needOutlet ? (f.outlet_id ? openDuplicate(leads, ph, f.outlet_id) : null)
    : leads.find((l) => leadIsOpen(l) && leadPhone(l.phone) === ph) || null) : null;
  const known = ph.length === 10 ? customers.find((c) => leadPhone(c.phone) === ph && (!outletForCheck || !needOutlet || c.outlet_id === f.outlet_id)) : null;

  // Fill the name from the customer list when the number is known.
  useEffect(() => {
    if (known && !f.name) setF((x) => ({ ...x, name: [known.first_name, known.last_name].filter(Boolean).join(" ") || known.name || "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known?.id]);

  const addToExisting = async () => {
    if (!dup) return;
    const note = [f.note.trim(), `(lead added again${f.source ? " via " + sourceLabel(f.source) : ""})`].filter(Boolean).join(" ");
    setBusy(true);
    try {
      const updated = await api.logLeadOutcome(dup.id, dup.status === "follow_up" ? { status: "follow_up", next_action_at: new Date().toISOString(), last_note: note } : { last_note: note }, { outcome: "note", note, by_name: byName });
      onSaved(updated || dup); toast(`Added to lead #${dup.lead_no}`); onClose();
    } catch (e) { setErr("Could not save: " + e.message); setBusy(false); }
  };

  const save = async () => {
    if (!validLeadPhone(f.phone)) return setErr("Enter a 10-digit mobile number.");
    if (needOutlet && !f.outlet_id) return setErr("Choose which outlet should call this lead.");
    if (dup && !force) return setErr("This number already has an open lead. Add your note to it, or add a new lead anyway.");
    setBusy(true);
    try {
      const row = { phone: ph, name: f.name.trim() || null, kind: f.kind, source: f.source, area: f.area.trim() || null, note: f.note.trim() || null, created_by_name: byName || null };
      if (needOutlet) row.outlet_id = f.outlet_id;
      const created = await api.createLead(row, { by_name: byName });
      toast(`Lead #${created.lead_no} added`);
      onCreated(created);
    } catch (e) {
      setErr(api.leadsMissing(e) ? "Leads aren't set up yet: run supabase/leads.sql once." : "Could not add: " + e.message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Add a lead" sub="Someone who asked for a pickup or a price. The outlet will call them." onClose={onClose} width={560}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div><label style={fieldLabel}>Mobile number *</label><input value={f.phone} onChange={set("phone")} inputMode="tel" placeholder="10-digit number" style={field} autoFocus /></div>
        <div><label style={fieldLabel}>Name</label><input value={f.name} onChange={set("name")} placeholder="If known" style={field} /></div>
        {needOutlet && (
          <div><label style={fieldLabel}>Outlet to call *</label>
            <select value={f.outlet_id} onChange={set("outlet_id")} style={field}>
              <option value="">Choose outlet…</option>
              {activeOutlets.map((o) => <option key={o.id} value={o.id}>{outletShort(outlets, o.id)}</option>)}
            </select>
          </div>
        )}
        <div><label style={fieldLabel}>What they want</label>
          <select value={f.kind} onChange={set("kind")} style={field}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        <div><label style={fieldLabel}>Came from</label>
          <select value={f.source} onChange={set("source")} style={field}>{SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        <div><label style={fieldLabel}>Area / address</label><input value={f.area} onChange={set("area")} placeholder="e.g. Kankarbagh" style={field} /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={fieldLabel}>Note for the outlet</label>
        <textarea value={f.note} onChange={set("note")} rows={2} placeholder="e.g. wants pickup today evening, 2 suits + 1 lehenga" style={{ ...field, resize: "vertical" }} />
      </div>
      {known && <p style={{ fontSize: 12.5, color: C.tealDark, marginTop: 10 }}>Existing customer: {[known.first_name, known.last_name].filter(Boolean).join(" ") || known.name || "—"}{known.code ? ` (${known.code})` : ""}.</p>}
      {dup && (
        <div style={{ background: C.amberLt, borderRadius: 10, padding: "10px 12px", marginTop: 10, fontSize: 12.5, color: C.text }}>
          <p><b>Lead #{dup.lead_no}</b> for this number is still open ({bucketLabel(dup)}).</p>
          <div className="flex gap-2 flex-wrap" style={{ marginTop: 8 }}>
            <Btn small variant="navy" onClick={addToExisting} disabled={busy}>Add note to #{dup.lead_no}</Btn>
            <Btn small variant="outline" onClick={() => { setForce(true); setErr(""); }}>{force ? "Will add a new lead" : "Add new lead anyway"}</Btn>
          </div>
        </div>
      )}
      {err && <p style={{ color: C.red, fontSize: 12.5, marginTop: 10 }}>{err}</p>}
      <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
        <Btn variant="outline" onClick={onClose}>Cancel</Btn>
        <Btn icon={Plus} onClick={save} disabled={busy}>{busy ? "Adding…" : "Add lead"}</Btn>
      </div>
    </Modal>
  );
}
const bucketLabel = (l) => ({ call: "waiting for a call", later: "call back later", booked: "pickup booked" }[bucket(l)] || l.status);

/* ── Details + timeline ─────────────────────────────────────────────── */
export function LeadDrawer({ lead: l, orders, outlets, canDelete, byName, toast, onClose, onSaved, onDeleted, onLog }) {
  const [events, setEvents] = useState(null);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    api.fetchLeadEvents(l.id).then((e) => alive && setEvents(e)).catch(() => alive && setEvents([]));
    return () => { alive = false; };
  }, [l.id, l.updated_at, l.status, l.attempts, l.last_note]);
  const match = matchingOrder(l, orders);
  const linked = l.order_id ? orders.find((o) => o.id === l.order_id) : null;

  const startEdit = () => { setF({ name: l.name || "", phone: l.phone || "", area: l.area || "", note: l.note || "", kind: l.kind, source: l.source }); setEdit(true); };
  const saveEdit = async () => {
    if (!validLeadPhone(f.phone)) return toast("Enter a 10-digit mobile number.", "error");
    setBusy(true);
    try {
      const u = await api.updateLead(l.id, { name: f.name.trim() || null, phone: leadPhone(f.phone), area: f.area.trim() || null, note: f.note.trim() || null, kind: f.kind, source: f.source });
      onSaved(u); setEdit(false); toast("Lead updated");
    } catch (e) { toast("Could not update: " + e.message, "error"); }
    setBusy(false);
  };
  const doReopen = async () => {
    const r = reopen(l, byName);
    setBusy(true);
    try { onSaved(await api.logLeadOutcome(l.id, r.patch, r.event)); toast(`Lead #${l.lead_no} is back on the call list`); }
    catch (e) { toast("Could not reopen: " + e.message, "error"); }
    setBusy(false);
  };
  const doDelete = async () => {
    if (!confirm(`Delete lead #${l.lead_no} (${l.name || fmtPhone(l.phone)}) and its call history? This cannot be undone.`)) return;
    setBusy(true);
    try { await api.deleteLead(l.id); toast(`Lead #${l.lead_no} deleted`); onDeleted(l.id); }
    catch (e) { toast("Could not delete: " + e.message, "error"); setBusy(false); }
  };

  return (
    <Drawer title={`${l.name || "Lead"} · #${l.lead_no}`} sub={`${fmtPhone(l.phone)} · ${outletShort(outlets, l.outlet_id)}`} onClose={onClose}
      footer={
        <div className="flex gap-2 flex-wrap">
          {leadIsOpen(l) ? <Btn icon={PhoneCall} onClick={onLog}>Log call</Btn> : <Btn variant="outline" icon={RotateCcw} onClick={doReopen} disabled={busy}>Reopen</Btn>}
          {!edit && <Btn variant="outline" icon={Pencil} onClick={startEdit}>Edit</Btn>}
          {canDelete && <Btn variant="danger" icon={Trash2} onClick={doDelete} disabled={busy}>Delete</Btn>}
        </div>
      }>
      {edit ? (
        <div className="flex flex-col gap-3">
          <div><label style={fieldLabel}>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={field} /></div>
          <div><label style={fieldLabel}>Mobile number</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} style={field} /></div>
          <div><label style={fieldLabel}>Area / address</label><input value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} style={field} /></div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div><label style={fieldLabel}>What they want</label><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} style={field}>{KINDS.map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></div>
            <div><label style={fieldLabel}>Came from</label><select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} style={field}>{SOURCES.map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></div>
          </div>
          <div><label style={fieldLabel}>Note</label><textarea value={f.note} rows={3} onChange={(e) => setF({ ...f, note: e.target.value })} style={{ ...field, resize: "vertical" }} /></div>
          <div className="flex gap-2"><Btn onClick={saveEdit} disabled={busy}>Save</Btn><Btn variant="outline" onClick={() => setEdit(false)}>Cancel</Btn></div>
        </div>
      ) : (
        <>
          <KV k="Status" v={statusLine(l, Date.now()).text} color={statusLine(l, Date.now()).tone} />
          <KV k="Wants" v={kindLabel(l.kind)} />
          <KV k="Came from" v={sourceLabel(l.source)} />
          {l.area && <KV k="Area" v={l.area} />}
          <KV k="Added" v={`${fmtDateTime(l.created_at)}${l.created_by_name ? ` · ${l.created_by_name}` : ""}`} />
          <KV k="First call" v={l.first_contact_at ? `${fmtDateTime(l.first_contact_at)} (${Math.max(0, Math.round((new Date(l.first_contact_at) - new Date(l.created_at)) / 60000))} min later)` : "not called yet"} />
          <KV k="Calls" v={String(l.attempts || 0)} />
          {(linked || match) && <KV k="Order" v={`#${orderRef(linked || match)} · ${inr((linked || match).total)}`} color={C.green} />}
          {l.note && <div style={{ fontSize: 13, background: C.paper, borderRadius: 10, padding: "8px 12px", marginTop: 8, lineHeight: 1.5 }}>{l.note}</div>}
        </>
      )}

      <p className="wb-eyebrow" style={{ margin: "20px 0 8px" }}>What happened</p>
      {events == null ? <p style={{ fontSize: 13, color: C.textFaint }}>Loading…</p> : events.length === 0 ? <p style={{ fontSize: 13, color: C.textFaint }}>No calls logged yet.</p> : (
        <div className="flex flex-col" style={{ borderLeft: `2px solid ${C.borderSoft}`, marginLeft: 6 }}>
          {[...events].reverse().map((e) => {
            const Icon = OUTCOME_ICON[e.outcome] || (e.outcome === "created" ? Megaphone : e.outcome === "reopened" ? RotateCcw : StickyNote);
            return (
              <div key={e.id} style={{ position: "relative", padding: "0 0 14px 18px" }}>
                <span style={{ position: "absolute", left: -9, top: 0, width: 16, height: 16, borderRadius: 99, background: "#fff", border: `2px solid ${OUTCOME_TONE[e.outcome] || C.teal}`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={9} color={OUTCOME_TONE[e.outcome] || C.teal} />
                </span>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{outcomeLabel(e.outcome)}
                  {e.next_action_at && <span style={{ fontWeight: 500, color: C.textMute }}> · {e.outcome === "booked" ? "pickup" : "next call"} {fmtDateTime(e.next_action_at)}</span>}
                </p>
                {e.note && <p style={{ fontSize: 12.5, color: C.text, marginTop: 2 }}>{e.note}</p>}
                <p style={{ fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>{fmtDateTime(e.created_at)}{e.by_name ? ` · ${e.by_name}` : ""}</p>
              </div>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}

export { needsAction };

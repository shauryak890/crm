import React, { useState, useEffect, useCallback } from "react";
import { Bike, MapPin, Phone, RefreshCw, UserPlus, Package, Link2, Check, UserCheck, Copy } from "lucide-react";
import { C, DISPLAY } from "../theme";
import { Card, PageHead, Badge, Btn, IconCircle, Modal, field, fieldLabel } from "../components/ui";
import * as api from "../lib/api";

const TASK_TONE = {
  assigned: "warn",
  accepted: "info",
  en_route: "info",
  arrived: "info",
  done: "success",
  cancelled: "muted",
};
const DRIVER_TONE = { free: "success", on_task: "info", off: "muted" };
const DRIVER_LABEL = { free: "Available", on_task: "On task", off: "Off duty" };

export default function LiveTracking({ toast }) {
  const [drivers, setDrivers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [accounts, setAccounts] = useState([]); // all driver-app signups (legacy link modal)
  const [pending, setPending] = useState([]); // signups awaiting approval at THIS outlet
  const [outlet, setOutlet] = useState(null); // this manager's outlet (for the join code)
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [linkFor, setLinkFor] = useState(null); // driver row being linked
  const [approving, setApproving] = useState(null); // user_id being approved

  const load = useCallback(async () => {
    try {
      const [d, t, acc, pend, out] = await Promise.all([
        api.fetchDrivers(),
        api.fetchTasks(),
        api.fetchDriverAccounts(),
        api.fetchPendingDriverAccounts(),
        api.fetchMyOutlet(),
      ]);
      setDrivers(d);
      setTasks(t);
      setAccounts(acc);
      setPending(pend);
      setOutlet(out);
    } catch (e) {
      toast && toast("Load error: " + e.message);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // The current (non-done) task per driver, for the "current task" column.
  const currentTaskFor = (driverId) =>
    tasks.find((t) => t.driver_id === driverId && t.status !== "done" && t.status !== "cancelled");

  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");

  // `pending` (this outlet's unapproved signups) comes from the
  // pending_driver_accounts RPC — scoped server-side by the driver's
  // chosen outlet code. Once approved they move into the drivers list.
  const approve = async (account) => {
    setApproving(account.id);
    try {
      await api.approveDriverAccount(account.id);
      toast && toast(`${account.name || account.email} approved`);
      await load();
    } catch (e) {
      toast && toast("Approve failed: " + e.message);
    }
    setApproving(null);
  };

  const copyCode = async () => {
    if (!outlet?.code) return;
    try {
      await navigator.clipboard.writeText(outlet.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast && toast(`Outlet code: ${outlet.code}`);
    }
  };

  return (
    <div>
      <PageHead title="Live Tracking & Drivers" sub="Pickup & delivery riders and their current jobs">
        <div className="flex items-center gap-2">
          <Btn variant="ghost" small icon={RefreshCw} onClick={load}>Refresh</Btn>
          <Btn small icon={UserPlus} onClick={() => setAdding(true)}>Add driver</Btn>
        </div>
      </PageHead>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", marginBottom: 22 }}>
        <Stat label="Drivers" value={drivers.length} tone="navy" icon={Bike} />
        <Stat label="Available now" value={drivers.filter((d) => d.status === "free").length} tone="green" icon={Bike} />
        <Stat label="Open tasks" value={openTasks.length} tone="teal" icon={Package} />
      </div>

      {/* Join-code banner — what a manager tells a new driver to enter at
          signup. The driver enters this code in the driver app, then the
          manager approves them below. */}
      {outlet?.code && (
        <Card style={{ marginBottom: 22, background: C.navy }}>
          <div className="flex items-center justify-between gap-4" style={{ flexWrap: "wrap" }}>
            <div style={{ minWidth: 240 }}>
              <p style={{ color: "#9FBECB", fontSize: 12.5, fontWeight: 600 }}>Add a driver to {outlet.name}</p>
              <p style={{ color: "#fff", fontSize: 13.5, marginTop: 4, lineHeight: 1.5, maxWidth: 460 }}>
                Tell your new driver to sign up in the Rider app and enter this outlet code.
                Then approve them below — they can only join once you do.
              </p>
            </div>
            <button
              onClick={copyCode}
              className="wb-press inline-flex items-center gap-2"
              style={{
                background: "#fff", border: "none", borderRadius: 12, cursor: "pointer",
                padding: "12px 16px",
              }}>
              <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 20, color: C.navy, letterSpacing: ".04em" }}>{outlet.code}</span>
              {copied
                ? <Check size={16} color={C.green} />
                : <Copy size={16} color={C.tealDark} />}
            </button>
          </div>
        </Card>
      )}

      {/* Pending approval — driver-app signups not yet approved */}
      {!loading && pending.length > 0 && (
        <Card style={{ marginBottom: 18, borderColor: C.amber, borderWidth: 1 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
            <UserCheck size={16} color={C.amber} />
            <h3 style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 800, color: C.navy }}>Pending approval</h3>
            <Badge tone="warn">{pending.length}</Badge>
          </div>
          <p style={{ fontSize: 12.5, color: C.textMute, marginBottom: 14, lineHeight: 1.5 }}>
            These drivers signed up in the app. Approve to add them to this outlet and let them receive tasks.
          </p>
          <div className="flex flex-col gap-2">
            {pending.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3" style={{ padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 12 }}>
                <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                  <IconCircle icon={Bike} tone="amber" size={38} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 700, color: C.navy, fontSize: 14 }}>{a.name || a.email.split("@")[0]}</p>
                    <p style={{ fontSize: 12, color: C.textMute, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.phone ? `${a.phone} · ` : ""}{a.email}
                    </p>
                  </div>
                </div>
                <Btn small icon={UserCheck} onClick={() => approve(a)} disabled={approving === a.id}>
                  {approving === a.id ? "Approving…" : "Approve"}
                </Btn>
              </div>
            ))}
          </div>
        </Card>
      )}

      {loading ? (
        <Card><p style={{ color: C.textMute, fontSize: 14, padding: 8 }}>Loading drivers…</p></Card>
      ) : drivers.length === 0 && pending.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: "32px 8px" }}>
            <div style={{ margin: "0 auto 14px" }}><IconCircle icon={Bike} tone="navy" size={52} /></div>
            <h3 style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 800, color: C.navy }}>No drivers yet</h3>
            <p style={{ color: C.textMute, fontSize: 13.5, maxWidth: 440, margin: "8px auto 0", lineHeight: 1.55 }}>
              Ask your riders to sign up in the <strong>Rider app</strong> — they’ll appear here under
              “Pending approval” for you to approve in one tap. You can also add a driver manually.
            </p>
            <div style={{ marginTop: 16 }}><Btn small icon={UserPlus} onClick={() => setAdding(true)}>Add a driver manually</Btn></div>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {drivers.map((d) => {
            const task = currentTaskFor(d.id);
            return (
              <Card key={d.id} hover>
                <div className="flex items-center justify-between gap-4" style={{ flexWrap: "wrap" }}>
                  <div className="flex items-center gap-3" style={{ minWidth: 200 }}>
                    <IconCircle icon={Bike} tone={d.status === "free" ? "green" : "navy"} size={42} />
                    <div>
                      <p style={{ fontWeight: 700, color: C.navy, fontSize: 14.5 }}>{d.name}</p>
                      {d.phone && <p className="inline-flex items-center gap-1.5" style={{ fontSize: 12.5, color: C.textMute, marginTop: 2 }}><Phone size={12} /> {d.phone}</p>}
                      {d.user_id ? (
                        <span className="inline-flex items-center gap-1" style={{ fontSize: 11.5, color: C.green, fontWeight: 600, marginTop: 3 }}><Check size={12} /> App linked</span>
                      ) : (
                        <button onClick={() => setLinkFor(d)} className="inline-flex items-center gap-1" style={{ fontSize: 11.5, color: C.tealDark, fontWeight: 600, marginTop: 3, background: "none", border: "none", cursor: "pointer", padding: 0 }}><Link2 size={12} /> Link Rider app</button>
                      )}
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 220 }}>
                    {task ? (
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge tone={TASK_TONE[task.status] || "muted"}>{task.type} · {task.status.replace("_", " ")}</Badge>
                          {task.order && <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>#{task.order.order_no}</span>}
                        </div>
                        {task.order?.address && <p className="inline-flex items-start gap-1.5" style={{ fontSize: 12.5, color: C.textMute, marginTop: 4 }}><MapPin size={13} style={{ marginTop: 2, flexShrink: 0 }} /> {task.order.address}</p>}
                      </div>
                    ) : (
                      <span style={{ fontSize: 12.5, color: C.textFaint }}>No active task</span>
                    )}
                  </div>

                  <Badge tone={DRIVER_TONE[d.status] || "muted"}>{DRIVER_LABEL[d.status] || d.status}</Badge>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {adding && (
        <AddDriverModal
          onClose={() => setAdding(false)}
          onAdded={async () => { setAdding(false); await load(); }}
          toast={toast}
        />
      )}

      {linkFor && (
        <LinkAccountModal
          driver={linkFor}
          accounts={accounts}
          linkedUserIds={drivers.map((d) => d.user_id).filter(Boolean)}
          onClose={() => setLinkFor(null)}
          onLinked={async () => { setLinkFor(null); await load(); }}
          toast={toast}
        />
      )}
    </div>
  );
}

function LinkAccountModal({ driver, accounts, linkedUserIds, onClose, onLinked, toast }) {
  // Only offer accounts not already linked to another driver row.
  const available = accounts.filter((a) => !linkedUserIds.includes(a.id));
  const [userId, setUserId] = useState(available[0]?.id || "");
  const [saving, setSaving] = useState(false);

  const link = async () => {
    if (!userId) { toast && toast("No driver account selected"); return; }
    setSaving(true);
    try {
      await api.linkDriverAccount(driver.id, userId);
      toast && toast(`${driver.name} linked to their app account`);
      await onLinked();
    } catch (e) {
      toast && toast("Link failed: " + e.message);
    }
    setSaving(false);
  };

  return (
    <Modal title={`Link ${driver.name}`} sub="Connect this driver to their Rider app login" onClose={onClose} width={440}>
      {available.length === 0 ? (
        <p style={{ fontSize: 13.5, color: C.textMute, lineHeight: 1.55 }}>
          No unlinked driver accounts yet. Ask the driver to sign up in the driver app first — their
          account will then appear here to link.
        </p>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabel}>Driver app account</label>
            <select style={field} value={userId} onChange={(e) => setUserId(e.target.value)}>
              {available.map((a) => (
                <option key={a.id} value={a.id}>{a.name || a.email} ({a.email})</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Btn variant="ghost" small onClick={onClose}>Cancel</Btn>
            <Btn small onClick={link} disabled={saving}>{saving ? "Linking…" : "Link account"}</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

function Stat({ label, value, tone, icon }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p style={{ fontSize: 12.5, color: C.textMute, fontWeight: 600 }}>{label}</p>
          <p style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 800, color: C.navy, marginTop: 4, lineHeight: 1 }}>{value}</p>
        </div>
        <IconCircle icon={icon} tone={tone} />
      </div>
    </Card>
  );
}

function AddDriverModal({ onClose, onAdded, toast }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast && toast("Driver name required"); return; }
    setSaving(true);
    try {
      await api.createDriver({ name: name.trim(), phone: phone.trim() || null });
      toast && toast("Driver added");
      await onAdded();
    } catch (e) {
      toast && toast("Could not add driver: " + e.message);
    }
    setSaving(false);
  };

  return (
    <Modal title="Add driver" sub="Pickup & delivery rider for this outlet" onClose={onClose} width={420}>
      <div style={{ marginBottom: 12 }}>
        <label style={fieldLabel}>Driver name</label>
        <input style={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ramesh K." autoFocus />
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={fieldLabel}>Phone (optional)</label>
        <input style={field} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number" />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Btn variant="ghost" small onClick={onClose}>Cancel</Btn>
        <Btn small onClick={save} disabled={saving}>{saving ? "Saving…" : "Save driver"}</Btn>
      </div>
    </Modal>
  );
}

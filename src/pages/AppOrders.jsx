import React, { useState, useEffect, useCallback } from "react";
import { Smartphone, Bike, MapPin, Phone, RefreshCw, UserPlus, Clock } from "lucide-react";
import { C, DISPLAY, inr } from "../theme";
import { Card, PageHead, Badge, Btn, IconCircle, Modal, field, fieldLabel } from "../components/ui";
import * as api from "../lib/api";

// Human labels for the app-order lifecycle states (lowercase in the DB).
const STATE_LABEL = {
  pending_pickup: "Pending pickup",
  pickup_assigned: "Driver assigned",
  picked_up: "Picked up",
  at_outlet: "At outlet",
  washing: "Washing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const STATE_TONE = {
  pending_pickup: "warn",
  pickup_assigned: "info",
  picked_up: "info",
  at_outlet: "info",
  washing: "info",
  ready: "info",
  out_for_delivery: "info",
  delivered: "success",
  cancelled: "danger",
};

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AppOrders({ toast }) {
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignFor, setAssignFor] = useState(null); // { order, type } being assigned
  const [weighFor, setWeighFor] = useState(null);   // order being weighed at outlet
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, d, t] = await Promise.all([api.fetchAppOrders(), api.fetchDrivers(), api.fetchTasks()]);
      setOrders(o);
      setDrivers(d);
      setTasks(t);
    } catch (e) {
      toast && toast("Load error: " + e.message);
    }
    setLoading(false);
  }, [toast]);

  // Order ids that already have an OPEN task of each type → so we don't
  // show "Assign" again (prevents duplicate assignments).
  const openTaskTypes = (orderId) =>
    new Set(
      tasks
        .filter((t) => t.order_id === orderId && t.status !== "done" && t.status !== "cancelled")
        .map((t) => t.type)
    );

  useEffect(() => { load(); }, [load]);

  // Realtime: re-load whenever any order row changes. RLS guarantees we
  // only receive this outlet's rows; we filter to channel='app' in load().
  useEffect(() => {
    const ch = api.subscribeAppOrders(() => load());
    // supabase status callback flips `live` once subscribed.
    if (ch && ch.state) setLive(true);
    const t = setTimeout(() => setLive(true), 800);
    return () => { clearTimeout(t); api.unsubscribe(ch); };
  }, [load]);

  // Advance an app order through its lifecycle from the CRM. Optimistic
  // update, then persist; the realtime subscription keeps the apps in sync.
  const onStatus = useCallback(async (id, status) => {
    // Marking an order "At outlet" requires weighing it first: open the
    // weigh-in modal instead of setting the status directly. Once staff
    // submit the actual weights, the modal advances the status to at_outlet.
    // (Skip the gate if it's somehow already weighed.)
    if (status === "at_outlet") {
      const order = orders.find((o) => o.id === id);
      if (order && !order.weighed_at) {
        setWeighFor(order);
        return;
      }
    }
    setOrders((p) => p.map((o) => (o.id === id ? { ...o, order_status: status } : o)));
    try { await api.updateOrderStatus(id, status); }
    catch (e) { toast && toast("Update failed: " + e.message); load(); }
  }, [toast, load, orders]);

  const pending = orders.filter((o) => o.order_status === "pending_pickup");
  const active = orders.filter((o) => o.order_status !== "pending_pickup" && o.order_status !== "delivered");
  const done = orders.filter((o) => o.order_status === "delivered");

  return (
    <div>
      <PageHead title="App Orders" sub="Orders placed from the customer app, live">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2" style={{ fontSize: 12, fontWeight: 600, color: live ? C.green : C.textFaint }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: live ? C.green : C.textFaint, boxShadow: live ? `0 0 0 4px ${C.greenLt}` : "none" }} />
            {live ? "Live" : "Connecting…"}
          </span>
          <Btn variant="ghost" small icon={RefreshCw} onClick={load}>Refresh</Btn>
        </div>
      </PageHead>

      {/* Summary tiles */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", marginBottom: 22 }}>
        <Stat label="Awaiting pickup" value={pending.length} tone="amber" icon={Smartphone} />
        <Stat label="In progress" value={active.length} tone="teal" icon={Bike} />
        <Stat label="Delivered" value={done.length} tone="green" icon={MapPin} />
      </div>

      {loading ? (
        <Card><p style={{ color: C.textMute, fontSize: 14, padding: 8 }}>Loading app orders…</p></Card>
      ) : orders.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: "32px 8px" }}>
            <div style={{ margin: "0 auto 14px" }}><IconCircle icon={Smartphone} tone="teal" size={52} /></div>
            <h3 style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 800, color: C.navy }}>No app orders yet</h3>
            <p style={{ color: C.textMute, fontSize: 13.5, maxWidth: 420, margin: "8px auto 0", lineHeight: 1.55 }}>
              When a customer places an order in the app it lands here instantly — no refresh needed.
              Assign a driver to start the pickup.
            </p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((o) => (
            <OrderRow key={o.id} o={o} assignedTypes={openTaskTypes(o.id)} onAssign={(type) => setAssignFor({ order: o, type })} onStatus={onStatus} />
          ))}
        </div>
      )}

      {assignFor && (
        <AssignModal
          order={assignFor.order}
          type={assignFor.type}
          drivers={drivers}
          onClose={() => setAssignFor(null)}
          onAssigned={async () => { setAssignFor(null); await load(); }}
          onNeedDriver={load}
          toast={toast}
        />
      )}

      {weighFor && (
        <WeighModal
          order={weighFor}
          onClose={() => setWeighFor(null)}
          onWeighed={async () => { setWeighFor(null); await load(); }}
          toast={toast}
        />
      )}
    </div>
  );
}

// Weigh-in at the outlet. Lists the order's kg items with an actual-weight
// input each (piece items shown read-only). On save: submit the actual
// weights (recomputes prices server-side) AND advance the order to
// "At outlet". This is the required step before an order can be processed.
function WeighModal({ order, onClose, onWeighed, toast }) {
  const [items, setItems] = useState([]);
  const [weights, setWeights] = useState({}); // itemId → string
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.fetchItemsForOrder(order.id)
      .then((rows) => {
        setItems(rows);
        const init = {};
        rows.forEach((it) => {
          if (it.unit === "kg") {
            // Pre-fill with the customer's estimate for convenience.
            init[it.id] = it.weight_kg != null ? String(it.weight_kg) : "";
          }
        });
        setWeights(init);
      })
      .catch((e) => setErr(e.message || "Could not load items."))
      .finally(() => setLoading(false));
  }, [order.id]);

  const kgItems = items.filter((it) => it.unit === "kg");
  const pieceItems = items.filter((it) => it.unit !== "kg");

  const preview = kgItems.reduce((sum, it) => {
    const w = Number(weights[it.id]);
    const mult = it.express ? 1.6 : 1;
    const line = Number.isFinite(w) && w > 0 ? Math.round((it.unit_price || 0) * w * mult) : Number(it.line_total || 0);
    return sum + line;
  }, 0) + pieceItems.reduce((s, it) => s + Number(it.line_total || 0), 0);

  const save = async () => {
    setErr("");
    // Every kg item must have a valid, positive weight.
    for (const it of kgItems) {
      const w = Number(weights[it.id]);
      if (!weights[it.id] || !Number.isFinite(w) || w <= 0) {
        setErr(`Enter the weighed value for "${it.product_name}".`);
        return;
      }
    }
    setSaving(true);
    try {
      const payload = kgItems.map((it) => ({ id: it.id, weight_kg: Number(weights[it.id]) }));
      await api.applyActualWeights(order.id, payload);
      // Advance to at_outlet now that it's weighed + priced.
      await api.updateOrderStatus(order.id, "at_outlet");
      toast && toast(`#${order.order_no} weighed — customer notified of the updated total`);
      await onWeighed();
    } catch (e) {
      setErr(e.message || "Could not save weights.");
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Weigh order · #${order.order_no}`}
      sub="Enter the actual weight for each item. The price updates and the customer is notified."
      onClose={onClose}
      width={480}
    >
      {loading ? (
        <p style={{ fontSize: 13, color: C.textMute, padding: "20px 0", textAlign: "center" }}>Loading items…</p>
      ) : (
        <>
          {kgItems.length === 0 && (
            <p style={{ fontSize: 13, color: C.textMute, marginBottom: 12 }}>
              This order has no weight-based items — nothing to weigh. You can still mark it at outlet.
            </p>
          )}

          {kgItems.map((it) => (
            <div key={it.id} style={{ marginBottom: 14 }}>
              <label style={fieldLabel}>
                {it.product_name}{it.express ? " ⚡" : ""}
                <span style={{ color: C.textFaint, fontWeight: 500 }}>
                  {"  "}· est. {it.weight_kg ?? "?"} kg · ₹{it.unit_price}/kg
                </span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  style={{ ...field, maxWidth: 140 }}
                  type="number"
                  min="0"
                  step="0.1"
                  value={weights[it.id] ?? ""}
                  onChange={(e) => setWeights((w) => ({ ...w, [it.id]: e.target.value }))}
                  placeholder="Actual kg"
                  autoFocus={it === kgItems[0]}
                />
                <span style={{ fontSize: 13, color: C.textMute }}>kg</span>
              </div>
            </div>
          ))}

          {pieceItems.length > 0 && (
            <div style={{ marginTop: 6, marginBottom: 8 }}>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: C.textMute, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
                Priced by piece (no weighing)
              </p>
              {pieceItems.map((it) => (
                <div key={it.id} className="flex items-center justify-between" style={{ fontSize: 13, color: C.text, padding: "3px 0" }}>
                  <span>{it.product_name}{it.express ? " ⚡" : ""} × {it.qty}</span>
                  <span style={{ fontWeight: 600, color: C.navy }}>{inr(it.line_total)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between" style={{ borderTop: `1px solid ${C.borderSoft}`, paddingTop: 12, marginTop: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>New subtotal (preview)</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 800, color: C.navy }}>{inr(preview)}</span>
          </div>
          {(() => {
            const disc = Number(order.coins_discount || 0) + Number(order.coupon_discount || 0);
            if (disc <= 0) return null;
            const belowDiscount = preview <= disc;
            return (
              <p style={{ fontSize: 11.5, color: belowDiscount ? C.red : C.textFaint, marginTop: 4, fontWeight: belowDiscount ? 700 : 400 }}>
                {belowDiscount
                  ? `⚠ New subtotal is at/below the ₹${disc} discount on this order — remove the discount or re-check the weight, or saving will be blocked.`
                  : `A ₹${disc} discount stays applied → final total ₹${Math.max(0, preview - disc)}.`}
              </p>
            );
          })()}

          {err && <div style={{ background: C.redLt, color: C.red, fontSize: 12.5, fontWeight: 600, padding: "9px 12px", borderRadius: 9, marginTop: 12 }}>{err}</div>}

          <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
            <Btn variant="outline" small onClick={onClose}>Cancel</Btn>
            <Btn small onClick={save} disabled={saving}>{saving ? "Saving…" : "Save weights & mark at outlet"}</Btn>
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

// Stages an outlet can set manually from the CRM. (Pickup/delivery are
// driven by the Assign buttons + the driver app, but the in-plant stages
// and the final delivered mark are the outlet's to advance.)
const APP_STAGES = ["picked_up", "at_outlet", "washing", "ready", "out_for_delivery", "delivered"];

function OrderRow({ o, assignedTypes, onAssign, onStatus }) {
  const has = assignedTypes ?? new Set();
  // Only assignable if the right status AND no open task of that type yet
  // (prevents re-assigning + flooding the driver with duplicates).
  // Terminal states the CRM must never reopen — a customer-cancelled order
  // (or a delivered one) is final. No status control for these.
  const terminal = o.order_status === "cancelled" || o.order_status === "delivered";
  const pickupAssignable = o.order_status === "pending_pickup" && !has.has("pickup");
  const deliveryAssignable = o.order_status === "ready" && !has.has("delivery");
  // Show a status dropdown once the bag is in the plant's hands (and the
  // order isn't in a terminal state).
  const showStatus = !pickupAssignable && !terminal;
  const stageOptions = APP_STAGES.includes(o.order_status) ? APP_STAGES : [o.order_status, ...APP_STAGES];
  return (
    <Card hover>
      <div className="flex items-center justify-between gap-4" style={{ flexWrap: "wrap" }}>
        <div className="flex items-center gap-3" style={{ minWidth: 220 }}>
          <IconCircle icon={Smartphone} tone="teal" size={40} />
          <div>
            <div className="flex items-center gap-2">
              <span style={{ fontWeight: 700, color: C.navy, fontSize: 14.5 }}>#{o.order_no}</span>
              <Badge tone={STATE_TONE[o.order_status] || "muted"}>{STATE_LABEL[o.order_status] || o.order_status}</Badge>
            </div>
            <p style={{ fontSize: 13, color: C.text, fontWeight: 600, marginTop: 3 }}>{o.customer_name}</p>
            <p style={{ fontSize: 12, color: C.textFaint, marginTop: 1 }}>{timeAgo(o.created_at)}</p>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          {o.pickup_slot && <p className="inline-flex items-center gap-1.5" style={{ fontSize: 12.5, color: C.tealDark, fontWeight: 600 }}><Clock size={13} /> Pickup {o.due_date ? `${o.due_date} ` : ""}· {o.pickup_slot}</p>}
          {o.address && <p className="inline-flex items-start gap-1.5" style={{ fontSize: 12.5, color: C.textMute, marginTop: 3 }}><MapPin size={13} style={{ marginTop: 2, flexShrink: 0 }} /> {o.address}</p>}
          {o.phone && <p className="inline-flex items-center gap-1.5" style={{ fontSize: 12.5, color: C.textMute, marginTop: 3 }}><Phone size={13} /> {o.phone}</p>}
        </div>

        <div className="flex items-center gap-3" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, color: C.navy, fontSize: 16 }}>{inr(o.total)}</span>
          {terminal && (
            <Badge tone={o.order_status === "cancelled" ? "danger" : "success"}>
              {o.order_status === "cancelled" ? "Cancelled by customer" : "Delivered"}
            </Badge>
          )}
          {showStatus && (
            <select value={o.order_status} onChange={(e) => onStatus(o.id, e.target.value)}
              style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", fontSize: 12.5, fontWeight: 600, color: C.navy, background: "#fff" }}>
              {stageOptions.map((s) => <option key={s} value={s}>{STATE_LABEL[s] || s}</option>)}
            </select>
          )}
          {!terminal && (pickupAssignable
            ? <Btn small icon={UserPlus} onClick={() => onAssign("pickup")}>Assign pickup</Btn>
            : deliveryAssignable
            ? <Btn small icon={Bike} onClick={() => onAssign("delivery")}>Assign delivery</Btn>
            : has.has("delivery")
            ? <Badge tone="info">Delivery assigned</Badge>
            : has.has("pickup") && o.order_status === "pending_pickup"
            ? <Badge tone="info">Pickup assigned</Badge>
            : null)}
        </div>
      </div>
    </Card>
  );
}

function AssignModal({ order, type = "pickup", drivers, onClose, onAssigned, onNeedDriver, toast }) {
  const [driverId, setDriverId] = useState(drivers[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const isDelivery = type === "delivery";
  const verb = isDelivery ? "delivery" : "pickup";

  const submit = async () => {
    if (!driverId) { toast && toast("Pick a driver, or add one first"); return; }
    setSaving(true);
    try {
      await api.assignDriver({ order_id: order.id, driver_id: driverId, type });
      toast && toast(`${isDelivery ? "Delivery" : "Pickup"} assigned for #${order.order_no}`);
      await onAssigned();
    } catch (e) {
      toast && toast("Assign failed: " + e.message);
    }
    setSaving(false);
  };

  const addDriver = async () => {
    if (!newName.trim()) { toast && toast("Driver name required"); return; }
    setSaving(true);
    try {
      const d = await api.createDriver({ name: newName.trim(), phone: newPhone.trim() || null });
      toast && toast("Driver added");
      setAdding(false); setNewName(""); setNewPhone("");
      await onNeedDriver();
      setDriverId(d.id);
    } catch (e) {
      toast && toast("Could not add driver: " + e.message);
    }
    setSaving(false);
  };

  return (
    <Modal title={`Assign ${verb} · #${order.order_no}`} sub={order.customer_name} onClose={onClose} width={440}>
      {drivers.length === 0 && !adding && (
        <p style={{ fontSize: 13, color: C.textMute, marginBottom: 14, lineHeight: 1.5 }}>
          No drivers yet. Add one to assign this pickup.
        </p>
      )}

      {!adding ? (
        <>
          {drivers.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label style={fieldLabel}>Driver</label>
              <select style={field} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}{d.status === "on_task" ? " · busy" : ""}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center justify-between gap-3" style={{ marginTop: 6 }}>
            <Btn variant="ghost" small icon={UserPlus} onClick={() => setAdding(true)}>Add driver</Btn>
            <div className="flex items-center gap-2">
              <Btn variant="ghost" small onClick={onClose}>Cancel</Btn>
              <Btn small onClick={submit} disabled={saving || drivers.length === 0}>{saving ? "Assigning…" : `Assign ${verb}`}</Btn>
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={fieldLabel}>Driver name</label>
            <input style={field} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Ramesh K." autoFocus />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabel}>Phone (optional)</label>
            <input style={field} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="10-digit number" />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Btn variant="ghost" small onClick={() => setAdding(false)}>Back</Btn>
            <Btn small onClick={addDriver} disabled={saving}>{saving ? "Saving…" : "Save driver"}</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

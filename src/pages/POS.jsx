import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, Shirt, ShoppingCart, Trash2, Banknote, Printer, X, Plus, UserCheck, Camera, FileText, Pencil,
  Users as UsersIcon, Maximize2, Minimize2, Image as ImageIcon,
} from "lucide-react";
import { C, DISPLAY, SERVICE_TYPES, PAYMENT_METHODS, DAILY_CAPACITY, inr } from "../theme";
import * as api from "../lib/api";
import { Card, PageHead, Btn, iconBtn, Modal, field, fieldLabel } from "../components/ui";
import CameraCapture from "../components/CameraCapture";

const posLbl = { fontSize: 11.5, fontWeight: 700, color: C.textMute, marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: ".03em" };
const posField = { width: "100%", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 13.5, outline: "none", background: "#fff", color: C.text };
const miniField = { width: 64, border: `1px solid ${C.border}`, borderRadius: 9, padding: "6px 9px", fontSize: 13, outline: "none" };
const tog = (active) => ({ padding: "10px 0", borderRadius: 11, fontWeight: 700, fontSize: 13, cursor: "pointer", border: active ? "none" : `1px solid ${C.border}`, background: active ? C.teal : "#fff", color: active ? "#fff" : C.textMute });

const todayPlus = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const fmtDay = (iso) => {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
  } catch { return iso; }
};
const splitName = (full) => {
  const parts = (full || "").trim().split(/\s+/);
  return { first_name: parts[0] || "", last_name: parts.slice(1).join(" ") };
};

export default function POS({ products, customers, orders = [], onPay, focusMode, setFocusMode, isAdmin, onQuickAddProduct }) {
  const [cart, setCart] = useState([]);
  const [modal, setModal] = useState(null);          // product object
  const [editingKey, setEditingKey] = useState(null); // cart key being edited (null = adding new)
  const scrollRef = useRef(null);                     // scroll container around form+cart
  const cartRef = useRef(null);                       // cart items block
  const [svc, setSvc] = useState("Laundry");
  const [express, setExpress] = useState(false);
  const [qty, setQty] = useState(1);                 // piece count
  const [weight, setWeight] = useState("1");          // kg for kg-priced items
  const [method, setMethod] = useState("UPI");
  const [amountReceived, setAmountReceived] = useState(""); // blank = pay in full
  const [disc, setDisc] = useState(0);
  const [tax, setTax] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Inline client details (no dropdown — typing the phone matches an
  // existing customer; otherwise a new one is created on bill).
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [fulfilment, setFulfilment] = useState("pickup");
  const [dueDate, setDueDate] = useState(() => todayPlus(2));

  // Client picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

  const pickClient = (c) => {
    const full = `${c.first_name} ${c.last_name || ""}`.trim();
    setName(full);
    setPhone(c.phone || "");
    setAddress(c.address || "");
    setPickerOpen(false);
    setPickerQuery("");
  };

  // Damage / notes — text note + staged image files (uploaded on Pay).
  const [damageNote, setDamageNote] = useState("");
  const [photos, setPhotos] = useState([]); // [{ file, preview }]
  const [cameraOpen, setCameraOpen] = useState(false);
  const onPickPhotos = (e) => {
    const files = Array.from(e.target.files || []);
    setPhotos((cur) => [...cur, ...files.map((f) => ({ file: f, preview: URL.createObjectURL(f) }))]);
    e.target.value = ""; // allow picking the same file again later
  };
  const onCameraShot = (file) => {
    setPhotos((cur) => [...cur, { file, preview: URL.createObjectURL(file) }]);
  };

  // Quick-add a missing product to the catalogue from the counter.
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const handleQuickAdd = async (payload) => {
    // payload = { name, price, category, unit } → create + open service modal
    const created = await onQuickAddProduct(payload);
    if (created) {
      setQuickAddOpen(false);
      setModal(created);      // straight into the "select service" flow
      setEditingKey(null);
      setQty(1); setWeight("1"); setExpress(false); setSvc("Laundry");
    }
    return created;
  };
  const removePhoto = (idx) => setPhotos((cur) => {
    const next = cur.slice();
    const [gone] = next.splice(idx, 1);
    if (gone) URL.revokeObjectURL(gone.preview);
    return next;
  });

  // Phone → existing customer. Normalise to the last 10 digits so
  // '+91 87579 38961', '08757938961' and '8757938961' all match.
  const normPhone = (s) => {
    const digits = String(s || "").replace(/\D/g, "");
    return digits.length >= 10 ? digits.slice(-10) : digits;
  };
  const matched = useMemo(() => {
    const p = normPhone(phone);
    if (p.length < 10) return null;
    return customers.find((c) => normPhone(c.phone) === p) || null;
  }, [phone, customers]);

  // Auto-fill name + address from a matched customer (but only when
  // they're still blank — never trample what the cashier just typed).
  useEffect(() => {
    if (!matched) return;
    const full = `${matched.first_name} ${matched.last_name}`.trim();
    if (!name.trim()) setName(full);
    if (!address.trim() && matched.address) setAddress(matched.address);
  }, [matched]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category || "General"));
    return ["All", ...Array.from(set).sort()];
  }, [products]);

  const visible = products.filter((p) => {
    const matchesQuery = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCat = category === "All" || (p.category || "General") === category;
    return matchesQuery && matchesCat;
  });

  const closeModal = () => {
    setModal(null); setEditingKey(null);
    setQty(1); setWeight("1"); setExpress(false); setSvc("Laundry"); setErr("");
  };

  const editItem = (item) => {
    // Reopen the modal pre-filled with the cart line's values.
    const product = products.find((p) => p.name === item.product_name)
                 || { name: item.product_name, price: item.unit_price, unit: item.unit || "piece" };
    setModal(product);
    setEditingKey(item.key);
    setSvc(item.service_type || "Laundry");
    setExpress(!!item.express);
    setQty(item.qty || 1);
    setWeight(item.weight_kg != null ? String(item.weight_kg) : "1");
  };

  const add = () => {
    const base = Number(modal.price) || 0;
    const unit = modal.unit === "kg" ? "kg" : "piece"; // resilient default
    const isKg = unit === "kg";
    const w = Number(weight);
    if (isKg && (!Number.isFinite(w) || w <= 0)) {
      setErr("Enter a valid weight in kilograms.");
      return;
    }
    const multiplier = express ? 1.6 : 1;
    const price = isKg
      ? Math.round(base * w * multiplier)
      : Math.round(base * qty * multiplier);
    const entry = {
      key: editingKey || Date.now(),
      product_name: modal.name,
      service_type: svc,
      express,
      qty: isKg ? Math.max(1, qty) : qty,
      weight_kg: isKg ? w : null,
      unit,
      unit_price: base,
      line_total: price,
    };
    const wasAdding = !editingKey;
    setCart((c) => editingKey
      ? c.map((x) => (x.key === editingKey ? entry : x))
      : [...c, entry]
    );
    closeModal();
    // After a new item lands, scroll the right column so the cart row is
    // visible — otherwise the form section can crowd it out of view.
    if (wasAdding) {
      requestAnimationFrame(() => {
        const container = scrollRef.current;
        const target = cartRef.current;
        if (container && target) {
          container.scrollTo({ top: target.offsetTop - 8, behavior: "smooth" });
        }
      });
    }
  };

  const sub = cart.reduce((a, i) => a + i.line_total, 0);
  const total = Math.max(0, Math.round(sub - (sub * disc) / 100 + (sub * tax) / 100));

  // ---- Daily processing capacity -----------------------------------
  // Garment count this cart adds (qty is the piece count on both piece-
  // and kg-priced lines) and how many are already booked for a given day.
  const cartPieces = cart.reduce((a, i) => a + (Number(i.qty) || 0), 0);
  const bookedFor = (date) => orders
    .filter((o) => o.due_date === date && o.order_status !== "Delivered")
    .reduce((a, o) => a + (Number(o.pieces) || 0), 0);
  const bookedToday = useMemo(() => bookedFor(dueDate), [orders, dueDate]); // eslint-disable-line react-hooks/exhaustive-deps
  const projected = bookedToday + cartPieces;
  const overCapacity = projected > DAILY_CAPACITY;
  // Earliest day (from today out 60 days) where this cart still fits.
  const earliestFree = useMemo(() => {
    if (!cartPieces) return null;
    for (let i = 0; i <= 60; i++) {
      const d = todayPlus(i);
      if (bookedFor(d) + cartPieces <= DAILY_CAPACITY) return d;
    }
    return null;
  }, [orders, cartPieces]); // eslint-disable-line react-hooks/exhaustive-deps
  // Block billing only when the day is over capacity AND a free day
  // exists. A single order larger than a whole day's capacity can't be
  // helped by moving it, so we let it through with a warning.
  const blockBill = overCapacity && earliestFree !== null;

  const pay = async (received) => {
    if (!cart.length || busy) return;
    setErr("");
    // Required fields (per project decision: everything required).
    if (!name.trim())    { setErr("Customer name is required."); return; }
    if (!phone.trim())   { setErr("Phone number is required."); return; }
    if (!dueDate)        { setErr("Delivery date is required."); return; }
    if (!address.trim()) { setErr("Address is required."); return; }
    if (blockBill) {
      setErr(`${fmtDay(dueDate)} is full (${bookedToday}/${DAILY_CAPACITY} clothes). Pick a free day — earliest is ${fmtDay(earliestFree)}.`);
      return;
    }

    // Derive payment status from what the customer actually paid.
    const paid = Math.max(0, Math.min(Number(received) || 0, total));
    const status = paid >= total ? "Paid" : paid <= 0 ? "Unpaid" : "Partial";

    setBusy(true);
    try {
      // Match by phone, otherwise create a new customer so their history
      // accumulates across visits.
      let customer = matched;
      if (!customer) {
        const { first_name, last_name } = splitName(name);
        customer = await api.createCustomer({
          first_name,
          last_name,
          phone: phone.trim(),
          address: address.trim(),
        });
      }

      // Upload any staged damage photos to Storage and collect the URLs.
      const image_urls = [];
      for (const p of photos) {
        const url = await api.uploadOrderPhoto(p.file);
        image_urls.push(url);
      }

      const order = {
        customer_id: customer.id,
        customer_name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        fulfilment,
        due_date: dueDate,
        subtotal: sub,
        discount_pct: disc,
        tax_pct: tax,
        total,
        pieces: cartPieces,
        payment_method: method,
        payment_status: status,
        amount_paid: paid,
        delivery_status: "Pending",
        order_status: "Order Placed",
        channel: "walk-in",
        damage_note: damageNote.trim() || null,
        image_urls,
      };
      const items = cart.map(({ key, ...rest }) => rest);
      const ok = await onPay(order, items);
      if (ok) {
        setCart([]); setDisc(0); setTax(0); setAmountReceived("");
        setName(""); setPhone(""); setAddress("");
        setFulfilment("pickup"); setDueDate(todayPlus(2));
        photos.forEach((p) => URL.revokeObjectURL(p.preview));
        setPhotos([]); setDamageNote("");
      }
    } catch (e) {
      setErr(e.message || "Could not save order.");
    }
    setBusy(false);
  };

  return (
    <div>
      <PageHead title="Point of Sale" sub="Walk-in counter billing">
        <Btn variant="outline" small icon={focusMode ? Minimize2 : Maximize2}
          onClick={() => setFocusMode && setFocusMode((s) => !s)}>
          {focusMode ? "Exit focus" : "Focus mode"}
        </Btn>
      </PageHead>
      <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", height: "calc(100vh - 132px)", minHeight: 0 }}>
        {/* product grid */}
        <Card pad={false} style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          <div style={{ padding: 16, borderBottom: `1px solid ${C.borderSoft}`, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl" style={{ border: `1px solid ${C.border}`, padding: "9px 12px", flex: 1 }}>
                <Search size={15} color={C.textFaint} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a product…" style={{ border: "none", outline: "none", fontSize: 13.5, width: "100%", background: "transparent" }} />
              </div>
              {isAdmin && (
                <button type="button" onClick={() => setQuickAddOpen(true)} title="Add a new item to the catalogue"
                  className="wb-press inline-flex items-center gap-1"
                  style={{ background: C.teal, color: "#fff", border: "none", borderRadius: 11, padding: "9px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                  <Plus size={15} /> New item
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {categories.map((cat) => {
                const active = category === cat;
                return (
                  <button key={cat} type="button" onClick={() => setCategory(cat)}
                    className="wb-press"
                    style={{ padding: "6px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                      border: active ? "none" : `1px solid ${C.border}`,
                      background: active ? C.navy : "#fff",
                      color: active ? "#fff" : C.textMute }}>
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(118px,1fr))", padding: 16, flex: 1, minHeight: 0, overflowY: "auto", alignContent: "start" }}>
            {visible.length === 0 && (
              <div style={{ gridColumn: "1/-1", padding: "48px 0", textAlign: "center", color: C.textFaint, fontSize: 13 }}>
                No products. Load your price list (seed_catalogue.sql) or add products in the catalogue.
              </div>
            )}
            {visible.map((p) => (
              <button key={p.id} onClick={() => setModal(p)}
                className="flex flex-col items-center justify-center rounded-xl"
                style={{ background: "#F7FAFB", border: `1px solid ${C.borderSoft}`, padding: "16px 8px", cursor: "pointer", borderTop: `3px solid ${C.teal}` }}>
                <Shirt size={26} color={C.navy} />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: C.text, marginTop: 9, textAlign: "center", lineHeight: 1.25 }}>{p.name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.tealDark, marginTop: 4 }}>{inr(p.price)}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* cart */}
        <Card pad={false} style={{
          display: "flex", flexDirection: "column",
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
        }}>
          {/* Everything above the footer scrolls together as one stream so
              the cart line is never starved of space. */}
          <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ padding: 18, borderBottom: `1px solid ${C.borderSoft}`, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: -4 }}>
              <span className="wb-eyebrow">Client</span>
              <button type="button" onClick={() => setPickerOpen(true)}
                className="wb-press inline-flex items-center gap-1"
                style={{ background: C.bg, color: C.navy, border: `1px solid ${C.border}`,
                  padding: "5px 10px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                <UsersIcon size={12} /> Pick from list
              </button>
            </div>
            {matched && (
              <div className="flex items-center gap-2 rounded-xl" style={{ background: C.tealLight, color: C.tealDark, padding: "8px 12px", fontSize: 12, fontWeight: 700 }}>
                <UserCheck size={14} /> Existing client · {matched.code}
              </div>
            )}
            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <label style={posLbl}>Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" style={posField} />
              </div>
              <div>
                <label style={posLbl}>Phone *</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number" style={posField} inputMode="tel" />
              </div>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <label style={posLbl}>Fulfilment *</label>
                <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <button type="button" onClick={() => setFulfilment("pickup")} style={tog(fulfilment === "pickup")}>Pickup</button>
                  <button type="button" onClick={() => setFulfilment("delivery")} style={tog(fulfilment === "delivery")}>Delivery</button>
                </div>
              </div>
              <div>
                <label style={posLbl}>Delivery date *</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} min={todayPlus(0)} style={posField} />
              </div>
            </div>

            {/* Daily plant-capacity meter for the chosen delivery date. */}
            <div className="rounded-xl" style={{ border: `1px solid ${overCapacity ? C.red : C.border}`, background: overCapacity ? C.redLt : C.paper, padding: "10px 12px" }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 7 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: overCapacity ? C.red : C.textMute, textTransform: "uppercase", letterSpacing: ".03em" }}>
                  Plant load · {fmtDay(dueDate)}
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: overCapacity ? C.red : C.tealDark }}>
                  {projected} / {DAILY_CAPACITY} {cartPieces ? `(+${cartPieces})` : ""}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: C.border, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 99,
                  width: `${Math.min(100, (projected / DAILY_CAPACITY) * 100)}%`,
                  background: overCapacity ? C.red : projected > DAILY_CAPACITY * 0.85 ? C.amber : C.teal,
                  transition: "width .25s var(--ease)" }} />
              </div>
              {overCapacity && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: C.red, fontWeight: 600, lineHeight: 1.45 }}>
                  {earliestFree ? (
                    <>This day is full — taking it on will run the order late.{" "}
                      Earliest free day: <b>{fmtDay(earliestFree)}</b>{" "}
                      <button type="button" onClick={() => setDueDate(earliestFree)}
                        style={{ border: "none", background: C.red, color: "#fff", fontWeight: 700, fontSize: 11, padding: "3px 9px", borderRadius: 7, cursor: "pointer", marginLeft: 2 }}>
                        Use this date
                      </button>
                    </>
                  ) : (
                    <>This single order is larger than a full day's capacity ({DAILY_CAPACITY}). It will be split across days.</>
                  )}
                </div>
              )}
            </div>

            <div>
              <label style={posLbl}>Address *</label>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Flat / street / area / pincode" rows={2}
                style={{ ...posField, resize: "vertical", fontFamily: "inherit" }} />
            </div>
            <div>
              <label style={posLbl}>Payment</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} style={posField}>
                {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>

            <div style={{ borderTop: `1px dashed ${C.border}`, paddingTop: 12, marginTop: 4 }}>
              <label style={posLbl}><FileText size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />Damage / notes</label>
              <textarea value={damageNote} onChange={(e) => setDamageNote(e.target.value)} rows={2}
                placeholder="e.g. small tear on left sleeve, faded collar…"
                style={{ ...posField, resize: "vertical", fontFamily: "inherit", marginBottom: 8 }} />
              <div className="flex items-center gap-2 flex-wrap">
                {/* Open the live in-app camera (works on desktop webcams too) */}
                <button type="button" onClick={() => setCameraOpen(true)}
                  className="wb-press"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "#fff", background: C.teal }}>
                  <Camera size={14} /> Take photo
                </button>
                {/* Upload — pick existing images from the device */}
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", border: `1px dashed ${C.border}`, borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: C.tealDark, background: "#F7FAFB" }}>
                  <ImageIcon size={14} /> Upload
                  <input type="file" accept="image/*" multiple onChange={onPickPhotos} style={{ display: "none" }} />
                </label>
                {photos.map((p, i) => (
                  <div key={i} style={{ position: "relative", width: 56, height: 56, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}` }}>
                    <img src={p.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button type="button" onClick={() => removePhoto(i)}
                      style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 9, border: "none", background: "rgba(10,34,49,.75)", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div ref={cartRef} style={{ minHeight: 120 }}>
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center" style={{ minHeight: 120, color: C.textFaint, gap: 10, padding: "20px 0" }}>
                <ShoppingCart size={28} /><span style={{ fontSize: 13 }}>Cart is empty — tap a product</span>
              </div>
            ) : cart.map((i) => (
              <div key={i.key} className="flex items-center justify-between" style={{ padding: "13px 18px", borderBottom: `1px solid ${C.borderSoft}` }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13.5, color: C.navy }}>{i.product_name}</p>
                  <p style={{ fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>
                    {i.service_type} · {i.express ? "Express" : "Normal"} ·{" "}
                    {i.unit === "kg" ? `${i.weight_kg} kg (${i.qty} pcs)` : `×${i.qty}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontWeight: 800, color: C.navy }}>{inr(i.line_total)}</span>
                  <button onClick={() => editItem(i)} title="Edit" style={iconBtn(C.tealLight, C.tealDark)}><Pencil size={14} /></button>
                  <button onClick={() => setCart((c) => c.filter((x) => x.key !== i.key))} title="Remove" style={iconBtn(C.redLt, C.red)}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>

          </div>
          {/* Sticky footer — always visible. */}
          <div style={{ flexShrink: 0, padding: "11px 16px 12px", borderTop: `1px solid ${C.borderSoft}`, background: "#F7FAFB" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <span style={{ color: C.textMute, fontSize: 12.5 }}>Subtotal · {cart.length} services</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span style={{ fontSize: 12, color: C.textMute }}>Disc</span>
                  <input type="number" value={disc} onChange={(e) => setDisc(+e.target.value || 0)} style={{ ...miniField, width: 48, padding: "5px 7px" }} />
                </span>
                <span className="flex items-center gap-1.5">
                  <span style={{ fontSize: 12, color: C.textMute }}>Tax</span>
                  <input type="number" value={tax} onChange={(e) => setTax(+e.target.value || 0)} style={{ ...miniField, width: 48, padding: "5px 7px" }} />
                </span>
                <span style={{ fontWeight: 700, color: C.navy, fontSize: 13 }}>{inr(sub)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between" style={{ marginBottom: 9 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: C.navy }}>Total</span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 19, color: C.tealDark }}>{inr(total)}</span>
            </div>

            {/* Amount received — leave blank to pay in full. Anything less
                than the total bills the order as a Partial payment. */}
            <div className="flex items-center justify-between" style={{ marginBottom: 9 }}>
              <span style={{ fontSize: 12.5, color: C.textMute }}>Amount received</span>
              <div className="flex items-center gap-1">
                <span style={{ fontSize: 13, color: C.textMute }}>₹</span>
                <input type="number" min={0} value={amountReceived}
                  onChange={(e) => setAmountReceived(e.target.value)}
                  placeholder={String(total)}
                  style={{ ...miniField, width: 90, textAlign: "right" }} />
              </div>
            </div>
            {(() => {
              if (amountReceived === "") return null;
              const paid = Math.max(0, Math.min(Number(amountReceived) || 0, total));
              const due = total - paid;
              if (due <= 0) return null;
              return (
                <div className="flex items-center justify-between" style={{ background: C.amberLt, color: C.amber, fontSize: 12, fontWeight: 700, padding: "6px 11px", borderRadius: 9, marginBottom: 9 }}>
                  <span>Balance due · marked Partial</span>
                  <span>{inr(due)}</span>
                </div>
              );
            })()}

            {err && (
              <div style={{ background: C.redLt, color: C.red, fontSize: 12, fontWeight: 600, padding: "7px 11px", borderRadius: 9, marginBottom: 9 }}>{err}</div>
            )}
            <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 0.7fr" }}>
              <Btn variant="success" icon={Banknote} onClick={() => pay(amountReceived === "" ? total : Number(amountReceived))} small disabled={busy || blockBill}>Pay &amp; Bill</Btn>
              <Btn variant="navy" icon={Printer} onClick={() => pay(0)} small disabled={busy || blockBill}>Save Unpaid</Btn>
              <Btn variant="danger" icon={X} small onClick={() => setCart([])}>Clear</Btn>
            </div>
          </div>
        </Card>
      </div>

      {/* live camera */}
      {cameraOpen && (
        <CameraCapture onCapture={onCameraShot} onClose={() => setCameraOpen(false)} />
      )}

      {/* quick-add product */}
      {quickAddOpen && (
        <QuickAddProduct
          categories={categories.filter((c) => c !== "All")}
          onClose={() => setQuickAddOpen(false)}
          onSave={handleQuickAdd}
        />
      )}

      {/* client picker */}
      {pickerOpen && (() => {
        const q = pickerQuery.trim().toLowerCase();
        const filtered = !q ? customers : customers.filter((c) => {
          const full = `${c.first_name} ${c.last_name || ""}`.toLowerCase();
          return full.includes(q)
              || String(c.phone || "").includes(q)
              || String(c.code || "").toLowerCase().includes(q);
        });
        return (
          <div className="flex items-center justify-center wb-fade-in"
            style={{ position: "fixed", inset: 0, background: "rgba(15,42,59,.45)", backdropFilter: "blur(4px)", zIndex: 50, padding: 16 }}
            onClick={() => setPickerOpen(false)}>
            <div onClick={(e) => e.stopPropagation()} className="wb-modal-in"
              style={{ background: "#fff", borderRadius: 18, width: 520, maxWidth: "100%", maxHeight: "82vh",
                display: "flex", flexDirection: "column", boxShadow: "0 30px 80px -20px rgba(15,42,59,.45)", border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between" style={{ padding: "18px 22px", borderBottom: `1px solid ${C.borderSoft}` }}>
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: 17, color: C.navy, letterSpacing: "-.01em" }}>Pick a client</h3>
                  <p style={{ fontSize: 12, color: C.textMute, marginTop: 3 }}>{customers.length} customer{customers.length === 1 ? "" : "s"} on file</p>
                </div>
                <button onClick={() => setPickerOpen(false)} style={iconBtn(C.bg, C.textMute)}><X size={16} /></button>
              </div>
              <div style={{ padding: "14px 22px" }}>
                <div className="flex items-center gap-2 rounded-xl" style={{ border: `1px solid ${C.border}`, padding: "9px 12px", background: C.bg }}>
                  <Search size={15} color={C.textFaint} />
                  <input autoFocus value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Search by name, phone or code…"
                    style={{ border: "none", outline: "none", fontSize: 13.5, width: "100%", background: "transparent" }} />
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 14px" }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: "40px 0", textAlign: "center", color: C.textFaint, fontSize: 13 }}>
                    No matches. Just type the new client's details below.
                  </div>
                ) : filtered.slice(0, 80).map((c) => {
                  const full = `${c.first_name} ${c.last_name || ""}`.trim();
                  return (
                    <button key={c.id} onClick={() => pickClient(c)}
                      className="wb-press w-full flex items-center gap-3 text-left"
                      style={{ background: "transparent", border: "none", padding: "12px 14px", borderRadius: 10, cursor: "pointer", color: C.text,
                        transition: "background .15s var(--ease)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = C.bg)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <div className="flex items-center justify-center rounded-full" style={{ width: 36, height: 36, background: C.tealSoft, color: C.tealDark, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                        {(full || "?")[0].toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="flex items-center gap-2">
                          <p style={{ fontWeight: 600, fontSize: 13.5, color: C.navy }}>{full || "Unnamed"}</p>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: C.tealDark, background: C.tealLight, padding: "2px 7px", borderRadius: 99 }}>{c.code}</span>
                        </div>
                        <p style={{ fontSize: 11.5, color: C.textFaint, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.phone || "—"}{c.address ? " · " + c.address : ""}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* service modal */}
      {modal && (
        <div className="flex items-center justify-center" style={{ position: "fixed", inset: 0, background: "rgba(10,34,49,.5)", zIndex: 50, padding: 16 }} onClick={closeModal}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, width: 480, maxWidth: "100%", boxShadow: "0 30px 80px -20px rgba(10,34,49,.5)" }}>
            <div className="flex items-center justify-between" style={{ padding: "20px 24px", borderBottom: `1px solid ${C.borderSoft}` }}>
              <div>
                <h3 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 18, color: C.navy }}>{editingKey ? "Edit line" : "Select Service Type"}</h3>
                <p style={{ fontSize: 12.5, color: C.textMute, marginTop: 2 }}>{modal.name} · base {inr(modal.price)}{modal.unit === "kg" ? " / kg" : ""}</p>
              </div>
              <button onClick={closeModal} style={iconBtn("#EEF2F5", C.textMute)}><X size={16} /></button>
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr", padding: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {SERVICE_TYPES.map((s) => (
                  <button key={s} onClick={() => setSvc(s)}
                    style={{ textAlign: "left", padding: "11px 14px", borderRadius: 11, fontWeight: 700, fontSize: 13, cursor: "pointer", border: "none",
                      background: svc === s ? C.navy : "#F2F6F9", color: svc === s ? "#fff" : C.text }}>{s}</button>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <button onClick={() => setExpress(false)} style={tog(!express)}>Normal</button>
                  <button onClick={() => setExpress(true)} style={tog(express)}>Express</button>
                </div>
                {modal.unit === "kg" ? (
                  <>
                    <div>
                      <label style={posLbl}>Weight (kg)</label>
                      <input type="number" value={weight} min={0} step="0.1"
                        onChange={(e) => setWeight(e.target.value)} style={posField} placeholder="e.g. 1.5" />
                    </div>
                    <div>
                      <label style={posLbl}>No. of clothes</label>
                      <input type="number" value={qty} min={1} step={1}
                        onChange={(e) => setQty(Math.max(1, Math.floor(+e.target.value || 1)))} style={posField} />
                    </div>
                  </>
                ) : (
                  <div>
                    <label style={posLbl}>Quantity</label>
                    <input type="number" value={qty} min={1} step={1}
                      onChange={(e) => setQty(Math.max(1, Math.floor(+e.target.value || 1)))} style={posField} />
                  </div>
                )}
                {err && <div style={{ background: C.redLt, color: C.red, fontSize: 12, fontWeight: 600, padding: "8px 12px", borderRadius: 9 }}>{err}</div>}
                <div className="flex items-center justify-between rounded-xl" style={{ background: C.tealLight, padding: "10px 14px", marginTop: 4 }}>
                  <span style={{ fontSize: 12.5, color: C.tealDark, fontWeight: 700 }}>Est. price</span>
                  <span style={{ fontWeight: 800, color: C.navy }}>
                    {(() => {
                      const base = Number(modal.price) || 0;
                      const m = express ? 1.6 : 1;
                      const w = Number(weight) || 0;
                      const v = modal.unit === "kg" ? base * w * m : base * qty * m;
                      return inr(Math.round(v));
                    })()}
                  </span>
                </div>
                {modal.unit === "kg" && (
                  <p style={{ fontSize: 11, color: C.textFaint, lineHeight: 1.4 }}>Priced at {inr(modal.price)} / kg. Pieces are for the laundry tag.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end" style={{ padding: "0 24px 22px" }}>
              <Btn variant="primary" icon={editingKey ? Pencil : Plus} onClick={add}>
                {editingKey ? "Save changes" : "Add to Cart"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Quick-add a missing product (admin) ─────────────── */
function QuickAddProduct({ categories = [], onClose, onSave }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("piece");
  const [category, setCategory] = useState(categories[0] || "General");
  const [newCat, setNewCat] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setErr("");
    const nm = name.trim();
    const pr = Number(price);
    if (!nm) { setErr("Item name is required."); return; }
    if (!Number.isFinite(pr) || pr < 0) { setErr("Enter a valid price."); return; }
    const cat = (category === "__new" ? newCat.trim() : category) || "General";
    setBusy(true);
    const created = await onSave({ name: nm, price: pr, category: cat, unit });
    setBusy(false);
    if (!created) setErr("Could not save. Check your connection / permissions.");
  };

  return (
    <Modal title="Add a new item" sub="Saved to the catalogue and added to this order" onClose={onClose} width={460}>
      <div>
        <label style={fieldLabel}>Item name *</label>
        <input style={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Designer Kurti" autoFocus />
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
        <div>
          <label style={fieldLabel}>Charged by</label>
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <button type="button" onClick={() => setUnit("piece")}
              style={{ padding: "9px 0", borderRadius: 10, fontWeight: 600, fontSize: 12.5, cursor: "pointer",
                border: unit === "piece" ? "none" : `1px solid ${C.border}`,
                background: unit === "piece" ? C.teal : "#fff", color: unit === "piece" ? "#fff" : C.textMute }}>Per piece</button>
            <button type="button" onClick={() => setUnit("kg")}
              style={{ padding: "9px 0", borderRadius: 10, fontWeight: 600, fontSize: 12.5, cursor: "pointer",
                border: unit === "kg" ? "none" : `1px solid ${C.border}`,
                background: unit === "kg" ? C.teal : "#fff", color: unit === "kg" ? "#fff" : C.textMute }}>Per kg</button>
          </div>
        </div>
        <div>
          <label style={fieldLabel}>Price (₹) {unit === "kg" ? "per kg" : "per piece"} *</label>
          <input style={field} type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <label style={fieldLabel}>Category</label>
        <select style={field} value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value="__new">+ New category…</option>
        </select>
      </div>
      {category === "__new" && (
        <div style={{ marginTop: 12 }}>
          <label style={fieldLabel}>New category name</label>
          <input style={field} value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="e.g. Specials" />
        </div>
      )}
      {err && <div style={{ background: C.redLt, color: C.red, fontSize: 12.5, fontWeight: 600, padding: "9px 12px", borderRadius: 9, marginTop: 14 }}>{err}</div>}
      <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
        <Btn variant="outline" small onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" small icon={Plus} onClick={save} disabled={busy}>Add &amp; continue</Btn>
      </div>
    </Modal>
  );
}

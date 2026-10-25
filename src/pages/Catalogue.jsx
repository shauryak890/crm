import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Plus, Pencil, Archive, RotateCcw, ImagePlus, Star, Search, ChevronDown, ChevronRight, Percent } from "lucide-react";
import { C, inr } from "../theme";
import * as api from "../lib/api";
import { PageHead, Btn, Badge, Card, Modal, field, fieldLabel } from "../components/ui";
import { usePersistentState } from "../components/kit";

/* Raise (or lower) prices by a percentage, for one category or all,
   rounded to a sensible step. Shows every change before applying. */
function BulkPriceModal({ rows, categories, onClose, onApply }) {
  const [pct, setPct] = useState("10");
  const [cat, setCat] = useState("");
  const [step, setStep] = useState(5);
  const [busy, setBusy] = useState(false);
  const p = Number(pct) || 0;
  const changes = rows
    .filter((r) => !cat || (r.category || "General").trim() === cat)
    .map((r) => {
      const raw = Number(r.price) * (1 + p / 100);
      const to = Math.max(1, Math.round(raw / step) * step);
      return { id: r.id, name: r.name, from: Number(r.price), to };
    })
    .filter((c) => c.to !== c.from);
  return (
    <Modal title="Change prices by %" sub="Preview every change before it's saved" onClose={onClose} width={520}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1.4fr 1fr" }}>
        <div><label style={fieldLabel}>Change %</label><input style={field} type="number" value={pct} onChange={(e) => setPct(e.target.value)} /></div>
        <div><label style={fieldLabel}>Category</label>
          <select style={field} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div><label style={fieldLabel}>Round to</label>
          <select style={field} value={step} onChange={(e) => setStep(+e.target.value)}>
            {[1, 5, 10].map((s) => <option key={s} value={s}>₹{s}</option>)}
          </select>
        </div>
      </div>
      <div style={{ maxHeight: 260, overflowY: "auto", marginTop: 14, border: `1px solid ${C.borderSoft}`, borderRadius: 10 }}>
        {changes.length === 0 ? <p style={{ padding: 16, color: C.textFaint, fontSize: 13 }}>No prices would change.</p>
          : changes.map((c) => (
            <div key={c.id} className="flex justify-between" style={{ padding: "7px 12px", borderTop: `1px solid ${C.borderSoft}`, fontSize: 13 }}>
              <span>{c.name}</span><span><span style={{ color: C.textFaint }}>{inr(c.from)}</span> → <b style={{ color: C.navy }}>{inr(c.to)}</b></span>
            </div>
          ))}
      </div>
      <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
        <Btn variant="outline" small onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" small disabled={!changes.length || busy} onClick={async () => { setBusy(true); await onApply(changes); setBusy(false); }}>
          Update {changes.length} price{changes.length === 1 ? "" : "s"}
        </Btn>
      </div>
    </Modal>
  );
}

const EMPTY = { name: "", category: "General", price: "", unit: "piece", image_url: "", description: "", popular: false, outlet_id: "" };

export default function Catalogue({ onRefresh, toast, isSuperAdmin = false, outlets = [] }) {
  const [outletFilter, setOutletFilter] = useState("");
  const outletName = (id) => outlets.find((o) => o.id === id)?.name?.replace(/^Patna\s*-\s*/i, "") || "—";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState(null); // null = closed, {} = add, {...row} = edit
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.fetchAllProducts();
      setRows(data);
    } catch (e) {
      toast("Load error: " + e.message);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { reload(); }, [reload]);

  const openAdd = () => { setEditing({}); setForm({ ...EMPTY, outlet_id: outletFilter }); setErr(""); };
  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name,
      category: row.category || "General",
      price: String(row.price),
      unit: row.unit || "piece",
      image_url: row.image_url || "",
      description: row.description || "",
      popular: !!row.popular,
    });
    setErr("");
  };
  const close = () => { setEditing(null); setForm(EMPTY); setErr(""); };

  const onPickImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr("");
    try {
      const url = await api.uploadServiceImage(file);
      setForm((f) => ({ ...f, image_url: url }));
    } catch (er) {
      setErr("Image upload failed: " + er.message);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const save = async () => {
    setErr("");
    const name = form.name.trim();
    const price = Number(form.price);
    if (!name) { setErr("Name is required."); return; }
    if (!Number.isFinite(price) || price <= 0) { setErr("Enter a price above ₹0."); return; }
    // A super_admin has no home outlet; without an explicit one the row
    // would fall to the DB default and land in the wrong store's POS.
    if (isSuperAdmin && !editing?.id && !form.outlet_id) { setErr("Pick which outlet's price list this goes in."); return; }
    const dupe = rows.find((r) => r.active && r.id !== editing?.id
      && r.name.trim().toLowerCase() === name.toLowerCase()
      && (r.category || "General").trim().toLowerCase() === (form.category.trim() || "General").toLowerCase()
      && (!isSuperAdmin || r.outlet_id === (editing?.id ? editing.outlet_id : form.outlet_id)));
    if (dupe) { setErr(`"${dupe.name}" already exists in ${dupe.category || "General"}.`); return; }
    const payload = {
      name,
      category: form.category.trim() || "General",
      price,
      unit: form.unit || "piece",
      image_url: form.image_url || null,
      description: form.description.trim() || null,
      popular: !!form.popular,
    };
    if (isSuperAdmin && !editing?.id) payload.outlet_id = form.outlet_id;
    setBusy(true);
    try {
      if (editing && editing.id) {
        await api.updateProduct(editing.id, payload);
        toast("Product updated");
      } else {
        await api.createProduct(payload);
        toast("Product added");
      }
      close();
      await reload();
      onRefresh && onRefresh();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  // Archive without a confirm — the toast offers Undo instead.
  const archive = async (row) => {
    try {
      await api.deleteProduct(row.id);
      setRows((r) => r.map((x) => (x.id === row.id ? { ...x, active: false } : x)));
      toast(`"${row.name}" archived`, "success", { undo: () => restore(row) });
      onRefresh && onRefresh();
    } catch (e) {
      toast("Archive failed: " + e.message);
    }
  };

  const restore = async (row) => {
    try {
      await api.updateProduct(row.id, { active: true });
      setRows((r) => r.map((x) => (x.id === row.id ? { ...x, active: true } : x)));
      toast(`"${row.name}" restored`);
      onRefresh && onRefresh();
    } catch (e) {
      toast("Restore failed: " + e.message);
    }
  };

  // Click a price to edit it in place; Enter saves, Esc cancels.
  const [priceEdit, setPriceEdit] = useState(null); // { id, value }
  const savePrice = async () => {
    if (!priceEdit) return;
    const row = rows.find((r) => r.id === priceEdit.id);
    const v = Number(priceEdit.value);
    setPriceEdit(null);
    if (!row || !Number.isFinite(v) || v <= 0 || v === Number(row.price)) return;
    try {
      await api.updateProduct(row.id, { price: v });
      setRows((r) => r.map((x) => (x.id === row.id ? { ...x, price: v } : x)));
      toast(`${row.name}: ${inr(row.price)} → ${inr(v)}`, "success", { undo: async () => {
        await api.updateProduct(row.id, { price: row.price });
        setRows((r) => r.map((x) => (x.id === row.id ? { ...x, price: row.price } : x)));
        onRefresh && onRefresh();
      } });
      onRefresh && onRefresh();
    } catch (e) { toast("Could not update price: " + e.message); }
  };

  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = usePersistentState("catalogue:collapsed", []);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [dupesOpen, setDupesOpen] = useState(false);

  const data = (showInactive ? rows : rows.filter((r) => r.active))
    .filter((r) => !outletFilter || r.outlet_id === outletFilter)
    .filter((r) => !q.trim() || `${r.name} ${r.category}`.toLowerCase().includes(q.trim().toLowerCase()));
  // Existing categories, for the datalist — nudges staff to reuse "Dry
  // Clean" instead of inventing "DRY CLINING".
  const categoryOptions = Array.from(new Set(rows.filter((r) => r.active).map((r) => (r.category || "General").trim()))).sort();
  const groups = useMemo(() => {
    const m = new Map();
    data.forEach((r) => { const k = (r.category || "General").trim(); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([k, list]) => [k, list.sort((a, b) => a.name.localeCompare(b.name))]);
  }, [data]);
  // Same outlet + same name + same category, both active = duplicate.
  const dupeGroups = useMemo(() => {
    const m = new Map();
    rows.filter((r) => r.active).forEach((r) => {
      const k = `${r.outlet_id}|${r.name.trim().toLowerCase()}|${(r.category || "General").trim().toLowerCase()}`;
      if (!m.has(k)) m.set(k, []); m.get(k).push(r);
    });
    return [...m.values()].filter((g) => g.length > 1);
  }, [rows]);

  return (
    <div>
      <PageHead title="Catalogue" sub={`${rows.filter((r) => r.active).length} active items in ${categoryOptions.length} categories · click a price to change it`}>
        {isSuperAdmin && (
          <select value={outletFilter} onChange={(e) => setOutletFilter(e.target.value)}
            style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "7px 10px", fontSize: 12.5, fontWeight: 600, color: C.navy, background: "#fff" }}>
            <option value="">All outlets</option>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        {dupeGroups.length > 0 && <Btn variant="outline" small onClick={() => setDupesOpen(true)}>Duplicates · {dupeGroups.length}</Btn>}
        <Btn variant="outline" small icon={Percent} onClick={() => setBulkOpen(true)}>Raise prices</Btn>
        <Btn variant="primary" icon={Plus} small onClick={openAdd}>Add Product</Btn>
      </PageHead>

      <Card pad={false}>
        <div className="flex items-center justify-between flex-wrap gap-3" style={{ padding: "14px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
          <div className="flex items-center gap-2 rounded-xl" style={{ border: `1px solid ${C.border}`, padding: "8px 12px", minWidth: 260 }}>
            <Search size={15} color={C.textFaint} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items or categories…"
              style={{ border: "none", outline: "none", fontSize: 13.5, width: "100%", background: "transparent" }} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setCollapsed(collapsed.length ? [] : groups.map(([k]) => k))}
              style={{ border: "none", background: "none", color: C.tealDark, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              {collapsed.length ? "Expand all" : "Collapse all"}
            </button>
            <label className="flex items-center gap-2" style={{ fontSize: 12.5, color: C.textMute, fontWeight: 600 }}>
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show archived
            </label>
          </div>
        </div>
        {loading ? (
          <div style={{ padding: 20 }}>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="wb-skel" style={{ height: 14, width: `${60 + (i * 9) % 35}%`, marginBottom: 14 }} />)}</div>
        ) : groups.length === 0 ? (
          <p style={{ padding: 40, textAlign: "center", color: C.textFaint, fontSize: 13 }}>{q ? `Nothing matches "${q}".` : "No products yet."}</p>
        ) : groups.map(([cat, list]) => {
          const shut = collapsed.includes(cat) && !q;
          return (
            <div key={cat} style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
              <button onClick={() => setCollapsed(shut ? collapsed.filter((c) => c !== cat) : [...collapsed, cat])}
                className="flex items-center justify-between w-full" style={{ padding: "11px 20px", background: C.paper, border: "none", cursor: "pointer", textAlign: "left" }}>
                <span className="flex items-center gap-2" style={{ fontWeight: 700, fontSize: 13.5, color: C.navy }}>
                  {shut ? <ChevronRight size={15} /> : <ChevronDown size={15} />} {cat}
                  <span style={{ color: C.textFaint, fontWeight: 500, fontSize: 12 }}>· {list.length}</span>
                </span>
                <span style={{ fontSize: 12, color: C.textFaint }}>{inr(Math.min(...list.map((r) => Number(r.price))))} – {inr(Math.max(...list.map((r) => Number(r.price))))}</span>
              </button>
              {!shut && list.map((p) => (
                <div key={p.id} className="flex items-center gap-3" style={{ padding: "9px 20px 9px 44px", borderTop: `1px solid ${C.borderSoft}`, opacity: p.active ? 1 : 0.55 }}>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13.5 }}>
                    {p.name}{p.popular && <Star size={12} color={C.amber} fill={C.amber} style={{ marginLeft: 6, verticalAlign: "-1px" }} />}
                    {isSuperAdmin && !outletFilter && <span style={{ color: C.textFaint, fontWeight: 500, fontSize: 12 }}> · {outletName(p.outlet_id)}</span>}
                  </span>
                  <Badge tone={p.unit === "kg" ? "info" : "muted"}>{p.unit === "kg" ? "per kg" : "per piece"}</Badge>
                  {priceEdit?.id === p.id ? (
                    <input autoFocus type="number" min="1" value={priceEdit.value} onChange={(e) => setPriceEdit({ id: p.id, value: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") savePrice(); if (e.key === "Escape") { e.stopPropagation(); setPriceEdit(null); } }}
                      onBlur={savePrice}
                      style={{ ...field, width: 90, padding: "5px 8px", textAlign: "right" }} />
                  ) : (
                    <button onClick={() => p.active && setPriceEdit({ id: p.id, value: String(p.price) })} title="Click to change price"
                      style={{ width: 90, textAlign: "right", border: `1px dashed transparent`, background: "none", borderRadius: 8, padding: "5px 8px", fontWeight: 700, color: Number(p.price) > 0 ? C.navy : C.red, cursor: "text", fontSize: 13.5 }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.border)} onMouseLeave={(e) => (e.currentTarget.style.borderColor = "transparent")}>
                      {inr(p.price)}
                    </button>
                  )}
                  <div className="inline-flex items-center gap-1">
                    <Btn variant="ghost" small icon={Pencil} onClick={() => openEdit(p)}>Edit</Btn>
                    {p.active
                      ? <Btn variant="ghost" small icon={Archive} onClick={() => archive(p)}>Archive</Btn>
                      : <Btn variant="success" small icon={RotateCcw} onClick={() => restore(p)}>Restore</Btn>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </Card>

      {bulkOpen && (
        <BulkPriceModal rows={rows.filter((r) => r.active && (!outletFilter || r.outlet_id === outletFilter))} categories={categoryOptions}
          onClose={() => setBulkOpen(false)}
          onApply={async (changes) => {
            let n = 0;
            for (const c of changes) { try { await api.updateProduct(c.id, { price: c.to }); n++; } catch { /* keep going */ } }
            await reload(); onRefresh && onRefresh();
            toast(`${n} price${n === 1 ? "" : "s"} updated`, n === changes.length ? "success" : "error");
            setBulkOpen(false);
          }} />
      )}

      {dupesOpen && (
        <Modal title="Duplicate items" sub="Same name and category in the same outlet. Keep one — the others are archived (old orders are unaffected)." onClose={() => setDupesOpen(false)} width={560}>
          {dupeGroups.length === 0 ? <p style={{ color: C.green, fontWeight: 600 }}>No duplicates left.</p> : dupeGroups.map((g) => (
            <div key={g[0].id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <p style={{ fontWeight: 700, color: C.navy, fontSize: 13.5 }}>{g[0].name} · {g[0].category || "General"}{isSuperAdmin ? ` · ${outletName(g[0].outlet_id)}` : ""}</p>
              {g.map((r) => (
                <div key={r.id} className="flex items-center justify-between" style={{ marginTop: 8, fontSize: 13 }}>
                  <span>{inr(r.price)} {r.unit === "kg" ? "/ kg" : "/ piece"}{r.description ? ` · ${r.description}` : ""}</span>
                  <Btn variant="outline" small onClick={async () => {
                    for (const o of g) if (o.id !== r.id) { try { await api.deleteProduct(o.id); } catch { /* skip */ } }
                    await reload(); onRefresh && onRefresh();
                    toast(`Kept ${r.name} at ${inr(r.price)} · ${g.length - 1} archived`);
                  }}>Keep this one</Btn>
                </div>
              ))}
            </div>
          ))}
        </Modal>
      )}

      {editing && (
        <Modal
          title={editing.id ? "Edit Product" : "Add Product"}
          sub={editing.id ? "Update name, category or price" : "New entry in the price list"}
          onClose={close}
        >
          {isSuperAdmin && !editing.id && (
            <div style={{ marginBottom: 14 }}>
              <label style={fieldLabel}>Outlet *</label>
              <select style={field} value={form.outlet_id} onChange={(e) => setForm({ ...form, outlet_id: e.target.value })}>
                <option value="">— Select outlet —</option>
                {outlets.filter((o) => o.active !== false).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={fieldLabel}>Name *</label>
            <input style={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Shirt — Dry Clean" />
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
            <div>
              <label style={fieldLabel}>Category</label>
              <input style={field} list="wb-catalogue-cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="General" />
              <datalist id="wb-catalogue-cats">{categoryOptions.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label style={fieldLabel}>Charged by</label>
              <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <button type="button" onClick={() => setForm({ ...form, unit: "piece" })}
                  style={{ padding: "10px 0", borderRadius: 10, fontWeight: 600, fontSize: 12.5, cursor: "pointer",
                    border: form.unit === "piece" ? "none" : `1px solid ${C.border}`,
                    background: form.unit === "piece" ? C.teal : "#fff",
                    color: form.unit === "piece" ? "#fff" : C.textMute }}>Per piece</button>
                <button type="button" onClick={() => setForm({ ...form, unit: "kg" })}
                  style={{ padding: "10px 0", borderRadius: 10, fontWeight: 600, fontSize: 12.5, cursor: "pointer",
                    border: form.unit === "kg" ? "none" : `1px solid ${C.border}`,
                    background: form.unit === "kg" ? C.teal : "#fff",
                    color: form.unit === "kg" ? "#fff" : C.textMute }}>Per kg</button>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={fieldLabel}>Price (₹) {form.unit === "kg" ? "per kg" : "per piece"} *</label>
            <input style={field} type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
          </div>

          {/* Description — shown on the customer app's service detail */}
          <div style={{ marginTop: 14 }}>
            <label style={fieldLabel}>Description <span style={{ color: C.textFaint, fontWeight: 500 }}>(shown in the app)</span></label>
            <input style={field} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Everyday wash, dried & neatly folded" />
          </div>

          {/* Service image + Popular toggle */}
          <div className="grid gap-3" style={{ gridTemplateColumns: "auto 1fr", marginTop: 14, alignItems: "center" }}>
            <div>
              <label style={fieldLabel}>Image</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage} style={{ display: "none" }} />
              {form.image_url ? (
                <button type="button" onClick={() => fileRef.current?.click()} style={{ position: "relative", width: 72, height: 72, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}`, padding: 0, cursor: "pointer" }}>
                  <img src={form.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </button>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  style={{ width: 72, height: 72, borderRadius: 12, border: `1px dashed ${C.border}`, background: C.bg, color: C.textMute, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <ImagePlus size={18} />
                  <span style={{ fontSize: 10 }}>{uploading ? "…" : "Upload"}</span>
                </button>
              )}
            </div>
            <div>
              <label style={fieldLabel}>Highlight</label>
              <button type="button" onClick={() => setForm({ ...form, popular: !form.popular })}
                className="inline-flex items-center gap-2"
                style={{ padding: "10px 14px", borderRadius: 10, fontWeight: 600, fontSize: 12.5, cursor: "pointer",
                  border: form.popular ? "none" : `1px solid ${C.border}`,
                  background: form.popular ? C.amber : "#fff",
                  color: form.popular ? "#fff" : C.textMute }}>
                <Star size={14} fill={form.popular ? "#fff" : "none"} /> {form.popular ? "Marked Popular" : "Mark as Popular"}
              </button>
              <p style={{ fontSize: 11, color: C.textFaint, marginTop: 6 }}>Popular services appear in the app&apos;s Recommended row.</p>
            </div>
          </div>

          {err && <div style={{ background: C.redLt, color: C.red, fontSize: 12.5, fontWeight: 600, padding: "9px 12px", borderRadius: 9, marginTop: 14 }}>{err}</div>}
          <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
            <Btn variant="outline" small onClick={close}>Cancel</Btn>
            <Btn variant="primary" small icon={Plus} onClick={save} disabled={busy}>
              {editing.id ? "Save Changes" : "Add Product"}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

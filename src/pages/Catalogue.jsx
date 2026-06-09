import React, { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Archive, RotateCcw } from "lucide-react";
import { C, inr } from "../theme";
import * as api from "../lib/api";
import { PageHead, Btn, Badge, DataTable, Modal, td, field, fieldLabel } from "../components/ui";

const EMPTY = { name: "", category: "General", price: "", unit: "piece" };

export default function Catalogue({ onRefresh, toast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState(null); // null = closed, {} = add, {...row} = edit
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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

  const openAdd = () => { setEditing({}); setForm(EMPTY); setErr(""); };
  const openEdit = (row) => {
    setEditing(row);
    setForm({ name: row.name, category: row.category || "General", price: String(row.price), unit: row.unit || "piece" });
    setErr("");
  };
  const close = () => { setEditing(null); setForm(EMPTY); setErr(""); };

  const save = async () => {
    setErr("");
    const name = form.name.trim();
    const price = Number(form.price);
    if (!name) { setErr("Name is required."); return; }
    if (!Number.isFinite(price) || price < 0) { setErr("Enter a valid price."); return; }
    const payload = { name, category: form.category.trim() || "General", price, unit: form.unit || "piece" };
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

  const archive = async (row) => {
    if (!confirm(`Archive "${row.name}"? It will be hidden from the POS.`)) return;
    try {
      await api.deleteProduct(row.id);
      toast("Product archived");
      await reload();
      onRefresh && onRefresh();
    } catch (e) {
      toast("Archive failed: " + e.message);
    }
  };

  const restore = async (row) => {
    try {
      await api.updateProduct(row.id, { active: true });
      toast("Product restored");
      await reload();
      onRefresh && onRefresh();
    } catch (e) {
      toast("Restore failed: " + e.message);
    }
  };

  const data = showInactive ? rows : rows.filter((r) => r.active);

  return (
    <div>
      <PageHead title="Catalogue" sub="Service price list — visible to the POS">
        <label className="flex items-center gap-2" style={{ fontSize: 12.5, color: C.textMute, fontWeight: 600 }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show archived
        </label>
        <Btn variant="primary" icon={Plus} small onClick={openAdd}>Add Product</Btn>
      </PageHead>

      <DataTable
        loading={loading}
        columns={["Name", "Category", "Unit", "Price", "Status", ""]}
        data={data}
        searchKeys={["name", "category"]}
        placeholder="Search products…"
        renderRow={(p) => (
          <tr key={p.id}>
            <td style={td}><span style={{ fontWeight: 600 }}>{p.name}</span></td>
            <td style={{ ...td, color: C.textMute }}>{p.category || "General"}</td>
            <td style={td}>
              <Badge tone={p.unit === "kg" ? "info" : "muted"}>{p.unit === "kg" ? "per kg" : "per piece"}</Badge>
            </td>
            <td style={{ ...td, fontWeight: 700, color: C.navy }}>
              {inr(p.price)}{p.unit === "kg" ? <span style={{ fontSize: 11, color: C.textFaint, fontWeight: 500 }}> / kg</span> : null}
            </td>
            <td style={td}>
              <Badge tone={p.active ? "success" : "muted"}>{p.active ? "Active" : "Archived"}</Badge>
            </td>
            <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
              <div className="inline-flex items-center gap-2">
                <Btn variant="outline" small icon={Pencil} onClick={() => openEdit(p)}>Edit</Btn>
                {p.active ? (
                  <Btn variant="danger" small icon={Archive} onClick={() => archive(p)}>Archive</Btn>
                ) : (
                  <Btn variant="success" small icon={RotateCcw} onClick={() => restore(p)}>Restore</Btn>
                )}
              </div>
            </td>
          </tr>
        )}
      />

      {editing && (
        <Modal
          title={editing.id ? "Edit Product" : "Add Product"}
          sub={editing.id ? "Update name, category or price" : "New entry in the price list"}
          onClose={close}
        >
          <div>
            <label style={fieldLabel}>Name *</label>
            <input style={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Shirt — Dry Clean" />
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
            <div>
              <label style={fieldLabel}>Category</label>
              <input style={field} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="General" />
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

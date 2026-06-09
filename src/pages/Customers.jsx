import React, { useState } from "react";
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import { C, inr } from "../theme";
import { PageHead, Btn, Badge, DataTable, Modal, td, iconBtn, field, fieldLabel } from "../components/ui";
import { rollupCustomer } from "../lib/api";

export default function Customers({ customers, orders, loading, onAdd, onDelete }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", address: "", package: "No Package" });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.first_name.trim() || busy) return;
    setBusy(true);
    const ok = await onAdd(form);
    setBusy(false);
    if (ok) { setOpen(false); setForm({ first_name: "", last_name: "", phone: "", address: "", package: "No Package" }); }
  };

  const rows = customers.map((c) => ({ ...c, ...rollupCustomer(c, orders) }));

  return (
    <div>
      <PageHead title="Customers" sub={`${customers.length} total clients`}>
        <Btn variant="primary" icon={Plus} small onClick={() => setOpen(true)}>Add Customer</Btn>
      </PageHead>
      <DataTable
        loading={loading}
        columns={["Code", "Name", "Phone", "Address", "Total", "Paid", "Rest", "Package", "Action"]}
        data={rows}
        searchKeys={["first_name", "last_name", "phone", "code"]}
        placeholder="Search : code, name…"
        renderRow={(c) => (
          <tr key={c.id}>
            <td style={{ ...td, fontWeight: 700, color: C.tealDark }}>{c.code}</td>
            <td style={{ ...td, fontWeight: 600 }}>{c.first_name} {c.last_name}</td>
            <td style={{ ...td, color: C.textMute }}>{c.phone || "—"}</td>
            <td style={{ ...td, color: C.textMute, maxWidth: 220 }}>{c.address || "—"}</td>
            <td style={{ ...td, fontWeight: 700 }}>{inr(c.total)}</td>
            <td style={{ ...td, color: C.green, fontWeight: 700 }}>{inr(c.paid)}</td>
            <td style={{ ...td, color: c.rest ? C.red : C.textFaint, fontWeight: 700 }}>{inr(c.rest)}</td>
            <td style={td}>{c.package === "No Package" ? <span style={{ color: C.textFaint }}>No Package</span> : <Badge tone="info">{c.package}</Badge>}</td>
            <td style={td}>
              <div className="flex items-center gap-2">
                <button style={iconBtn("#E8EEF2", C.navy)} title="Ledger"><BookOpen size={14} /></button>
                <button onClick={() => onDelete(c)} style={iconBtn(C.redLt, C.red)} title="Delete"><Trash2 size={14} /></button>
              </div>
            </td>
          </tr>
        )}
      />

      {open && (
        <Modal title="Add Customer" sub="New client record" onClose={() => setOpen(false)}>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div><label style={fieldLabel}>First name *</label><input style={field} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
            <div><label style={fieldLabel}>Last name</label><input style={field} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 14 }}><label style={fieldLabel}>Phone</label><input style={field} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div style={{ marginTop: 14 }}><label style={fieldLabel}>Address</label><input style={field} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div style={{ marginTop: 14 }}><label style={fieldLabel}>Package</label>
            <select style={field} value={form.package} onChange={(e) => setForm({ ...form, package: e.target.value })}>
              <option>No Package</option><option>Monthly Saver</option><option>30kg / month</option><option>Premium Care</option>
            </select>
          </div>
          <div className="flex justify-end gap-2" style={{ marginTop: 22 }}>
            <Btn variant="outline" small onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="primary" small icon={Plus} onClick={save} disabled={busy}>Save Customer</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

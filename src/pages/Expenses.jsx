import React, { useState } from "react";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { C, inr } from "../theme";
import { PageHead, Btn, Badge, DataTable, Modal, td, iconBtn, field, fieldLabel } from "../components/ui";

const CATS = ["Supplies", "Logistics", "Utilities", "Rent", "Salary", "Maintenance", "General"];

export default function Expenses({ expenses, loading, onAdd, onDelete }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", category: "Supplies", amount: "", spent_on: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);

  const total = expenses.reduce((a, e) => a + Number(e.amount), 0);

  const save = async () => {
    if (!form.title.trim() || busy) return;
    setBusy(true);
    const ok = await onAdd({ ...form, amount: Number(form.amount) || 0 });
    setBusy(false);
    if (ok) { setOpen(false); setForm({ title: "", category: "Supplies", amount: "", spent_on: new Date().toISOString().slice(0, 10) }); }
  };

  return (
    <div>
      <PageHead title="Expenses" sub={`${inr(total)} recorded`}>
        <Btn variant="primary" icon={Plus} small onClick={() => setOpen(true)}>Add Expense</Btn>
      </PageHead>
      <DataTable
        loading={loading}
        columns={["Date", "Num", "Title", "Category", "Amount", "Action"]}
        data={expenses}
        searchKeys={["title", "category", "expense_no"]}
        placeholder="Search : num, title…"
        renderRow={(e) => (
          <tr key={e.id}>
            <td style={{ ...td, color: C.textMute }}>{new Date(e.spent_on).toLocaleDateString("en-GB")}</td>
            <td style={{ ...td, fontWeight: 700, color: C.navy }}>{e.expense_no}</td>
            <td style={{ ...td, fontWeight: 600 }}>{e.title}</td>
            <td style={td}><Badge tone="navy">{e.category}</Badge></td>
            <td style={{ ...td, fontWeight: 800 }}>{inr(e.amount)}</td>
            <td style={td}>
              <button onClick={() => onDelete(e)} style={iconBtn(C.redLt, C.red)}><Trash2 size={14} /></button>
            </td>
          </tr>
        )}
      />

      {open && (
        <Modal title="Add Expense" sub="Record an outgoing cost" onClose={() => setOpen(false)}>
          <div><label style={fieldLabel}>Title *</label><input style={field} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Detergent stock" /></div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
            <div><label style={fieldLabel}>Category</label>
              <select style={field} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label style={fieldLabel}>Amount (₹)</label><input style={field} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 14 }}><label style={fieldLabel}>Date</label><input style={field} type="date" value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })} /></div>
          <div className="flex justify-end gap-2" style={{ marginTop: 22 }}>
            <Btn variant="outline" small onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="primary" small icon={Plus} onClick={save} disabled={busy}>Save Expense</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

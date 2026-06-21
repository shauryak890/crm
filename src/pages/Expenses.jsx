import React, { useState } from "react";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { C, inr } from "../theme";
import { PageHead, Btn, Badge, DataTable, Modal, td, iconBtn, field, fieldLabel } from "../components/ui";

const CATS = ["Chemicals", "Packaging Material", "Supplies", "Logistics", "Utilities", "Rent", "Salary", "Maintenance", "General"];
const blankForm = () => ({ title: "", category: "Chemicals", amount: "", qty: "1", unit_price: "", spent_on: new Date().toISOString().slice(0, 10) });

export default function Expenses({ expenses, loading, onAdd, onDelete }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);

  const total = expenses.reduce((a, e) => a + Number(e.amount), 0);

  // If qty × unit price is filled, it drives the amount; otherwise the
  // manual amount is used. Lets you log "50 covers × ₹4" as one purchase.
  const computed = (Number(form.qty) || 0) * (Number(form.unit_price) || 0);
  const finalAmount = computed > 0 ? computed : (Number(form.amount) || 0);

  const save = async () => {
    if (!form.title.trim() || busy) return;
    setBusy(true);
    // Stamp qty into the title so the purchase detail survives (no extra
    // columns needed). e.g. "Poly covers ×50".
    const qtyN = Number(form.qty) || 0;
    const title = qtyN > 1 ? `${form.title.trim()} ×${qtyN}` : form.title.trim();
    const ok = await onAdd({ title, category: form.category, amount: finalAmount, spent_on: form.spent_on });
    setBusy(false);
    if (ok) { setOpen(false); setForm(blankForm()); }
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
        <Modal title="Add Expense / Supply Purchase" sub="Chemicals, packaging & other costs — reflects in HQ reports" onClose={() => setOpen(false)}>
          <div><label style={fieldLabel}>Item / title *</label><input style={field} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Perc cleaning fluid, poly covers" /></div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
            <div><label style={fieldLabel}>Category</label>
              <select style={field} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label style={fieldLabel}>Date</label><input style={field} type="date" value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })} /></div>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
            <div><label style={fieldLabel}>Quantity</label><input style={field} type="number" min="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></div>
            <div><label style={fieldLabel}>Price per unit (₹)</label><input style={field} type="number" min="0" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} placeholder="optional" /></div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={fieldLabel}>{computed > 0 ? "Total (qty × price)" : "Amount (₹) *"}</label>
            {computed > 0 ? (
              <div style={{ ...field, fontWeight: 800, color: C.navy, display: "flex", alignItems: "center" }}>{inr(computed)}</div>
            ) : (
              <input style={field} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Enter the total spent" />
            )}
          </div>

          <div className="flex justify-end gap-2" style={{ marginTop: 22 }}>
            <Btn variant="outline" small onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="primary" small icon={Plus} onClick={save} disabled={busy || finalAmount <= 0}>Save</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

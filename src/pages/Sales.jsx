import React from "react";
import { Printer, FileText } from "lucide-react";
import { C, KANBAN, inr, balanceDue } from "../theme";
import { PageHead, Btn, Badge, DataTable, td, iconBtn } from "../components/ui";

export default function Sales({ orders, loading, onStatus, onTogglePaid, onOpenInvoice }) {
  return (
    <div>
      <PageHead title="Sales" sub={`${orders.length} invoices · all channels`}>
        <Btn variant="outline" icon={Printer} small onClick={() => window.print()}>Print</Btn>
      </PageHead>
      <DataTable
        loading={loading}
        columns={["Num", "Date", "Client", "Due", "Total", "Status", "Delivery", "Method", "Order Status", ""]}
        data={orders}
        searchKeys={["customer_name", "order_no", "payment_method", "phone"]}
        placeholder="Search by client / num / phone…"
        renderRow={(o) => (
          <tr key={o.id}>
            <td style={{ ...td, fontWeight: 800, color: C.navy }}>#{o.order_no}</td>
            <td style={{ ...td, color: C.textMute }}>{new Date(o.created_at).toLocaleDateString("en-GB")}</td>
            <td style={td}>
              <div style={{ fontWeight: 600 }}>{o.customer_name}</div>
              {o.phone && <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>{o.phone}</div>}
            </td>
            <td style={td}>
              <Badge tone={o.fulfilment === "delivery" ? "info" : "muted"}>
                {o.fulfilment === "delivery" ? "Delivery" : "Pickup"}
              </Badge>
              <div style={{ fontSize: 11.5, color: C.textMute, marginTop: 4 }}>
                {o.due_date ? new Date(o.due_date).toLocaleDateString("en-GB") : "—"}
              </div>
            </td>
            <td style={{ ...td, fontWeight: 800 }}>{inr(o.total)}</td>
            <td style={td}>
              <button onClick={() => onTogglePaid(o)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
                <Badge tone={o.payment_status === "Paid" ? "success" : o.payment_status === "Partial" ? "warn" : "danger"}>
                  {o.payment_status === "Partial" ? `Partial · ${inr(balanceDue(o))} due` : o.payment_status}
                </Badge>
              </button>
            </td>
            <td style={td}><Badge tone={o.delivery_status === "Delivered" ? "success" : "warn"}>{o.delivery_status}</Badge></td>
            <td style={td}><Badge tone="navy">{o.payment_method}</Badge></td>
            <td style={td}>
              <select value={o.order_status} onChange={(e) => onStatus(o.id, e.target.value)}
                style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "7px 10px", fontSize: 12.5, fontWeight: 600, color: C.navy, background: "#fff", maxWidth: 180 }}>
                {KANBAN.map((s) => <option key={s}>{s}</option>)}
              </select>
            </td>
            <td style={{ ...td, textAlign: "right" }}>
              <button onClick={() => onOpenInvoice && onOpenInvoice(o)} title="Invoice / Tags"
                style={iconBtn(C.tealLight, C.tealDark)}><FileText size={14} /></button>
            </td>
          </tr>
        )}
      />
    </div>
  );
}

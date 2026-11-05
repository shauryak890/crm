import React, { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { C, waLink } from "../theme";
import { Btn, Modal } from "./ui";

// Steps through a list of WhatsApp messages one click at a time —
// browsers block a burst of pop-ups, so "send all" has to be a walk.
// items: [{ key, title, sub?, phone, text }]
// onSent(item) is called after each message is opened.
export default function WhatsAppQueue({ title, items, onSent, onClose }) {
  const sendable = items.filter((i) => waLink(i.phone));
  const skipped = items.length - sendable.length;
  const [i, setI] = useState(0);
  const [sent, setSent] = useState(0);
  const [text, setText] = useState(sendable[0]?.text || "");
  const cur = sendable[i];
  const go = (n) => { setI(n); setText(sendable[n]?.text || ""); };

  return (
    <Modal title={title} sub={`${sendable.length} with a valid number${skipped ? ` · ${skipped} skipped (no / bad number)` : ""}`} onClose={onClose} width={500}>
      {!cur ? (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <CheckCircle2 size={28} color={C.green} />
          <p style={{ fontWeight: 700, color: C.navy, marginTop: 8 }}>Done — {sent} message{sent === 1 ? "" : "s"} opened.</p>
          <div style={{ marginTop: 14 }}><Btn variant="outline" small onClick={onClose}>Close</Btn></div>
        </div>
      ) : (
        <>
          <div style={{ height: 6, borderRadius: 99, background: C.bg, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ width: `${(i / sendable.length) * 100}%`, height: "100%", background: C.green }} />
          </div>
          <p style={{ fontSize: 12, color: C.textMute }}>{i + 1} of {sendable.length}</p>
          <p style={{ fontWeight: 700, color: C.navy, fontSize: 15, marginTop: 2 }}>{cur.title}</p>
          {cur.sub && <p style={{ fontSize: 12.5, color: C.textMute }}>{cur.sub}</p>}
          {/* Editable, so staff can personalise before sending. */}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9}
            style={{ width: "100%", fontFamily: "inherit", fontSize: 12.5, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginTop: 10, color: C.text, resize: "vertical" }} />
          <div className="flex justify-between gap-2" style={{ marginTop: 14 }}>
            <Btn variant="ghost" small onClick={() => go(i + 1)}>Skip</Btn>
            <Btn variant="success" small icon={Send} onClick={() => {
              window.open(waLink(cur.phone, text), "_blank");
              onSent && onSent(cur);
              setSent(sent + 1); go(i + 1);
            }}>Send &amp; next</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

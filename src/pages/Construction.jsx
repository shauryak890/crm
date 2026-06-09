import React from "react";
import { Construction as ConIcon, Check } from "lucide-react";
import { C, DISPLAY } from "../theme";
import { Card, PageHead, Badge } from "../components/ui";

export default function Construction({ icon: Icon, title, sub, features, eta }) {
  return (
    <div>
      <PageHead title={title} sub={sub} />
      <Card style={{ position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.5, backgroundImage: `linear-gradient(${C.borderSoft} 1px,transparent 1px),linear-gradient(90deg,${C.borderSoft} 1px,transparent 1px)`, backgroundSize: "26px 26px" }} />
        <div style={{ position: "relative", padding: "26px 6px", textAlign: "center" }}>
          <div className="flex items-center justify-center rounded-2xl" style={{ width: 76, height: 76, background: C.navy, margin: "0 auto 20px" }}>
            <Icon size={36} color={C.tealMid} />
          </div>
          <div className="flex items-center justify-center gap-2" style={{ marginBottom: 12 }}>
            <Badge tone="warn"><ConIcon size={13} /> Under Construction</Badge>
            <Badge tone="info">Live ETA · {eta}</Badge>
          </div>
          <h2 style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 800, color: C.navy, letterSpacing: "-.02em" }}>{title}</h2>
          <p style={{ color: C.textMute, fontSize: 14, maxWidth: 520, margin: "10px auto 26px", lineHeight: 1.55 }}>
            This panel connects your store CRM to the customer app &amp; HQ super-admin. It is wired into the
            roadmap and will activate once the backend channel goes live — no rebuild needed.
          </p>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", maxWidth: 760, margin: "0 auto", textAlign: "left" }}>
            {features.map((f) => (
              <div key={f} className="flex items-start gap-3 rounded-xl" style={{ background: "#fff", border: `1px solid ${C.border}`, padding: "14px 16px" }}>
                <div className="flex items-center justify-center rounded-lg" style={{ width: 30, height: 30, background: C.tealLight, flexShrink: 0 }}>
                  <Check size={16} color={C.tealDark} />
                </div>
                <span style={{ fontSize: 13, color: C.text, fontWeight: 600, lineHeight: 1.4 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

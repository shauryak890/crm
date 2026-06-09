import React, { useState } from "react";
import { ArrowRight, Loader2, ShieldCheck, Shirt, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabase";
import { C } from "../theme";
import { Logo, Btn, field, fieldLabel } from "../components/ui";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    setBusy(false);
  };

  return (
    <div className="wb-login-shell" style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1.05fr 1fr", background: C.bg }}>
      {/* ─────────── Left: brand canvas ─────────── */}
      <aside className="wb-login-brand wb-fade-in"
        style={{ position: "relative", overflow: "hidden",
          background: `linear-gradient(160deg, ${C.navy} 0%, ${C.navyDeep} 100%)`,
          color: "#fff", padding: "48px 56px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>

        {/* drifting orbs for depth */}
        <span aria-hidden style={{ position: "absolute", top: -100, right: -120, width: 360, height: 360,
          borderRadius: "50%", background: `radial-gradient(circle, ${C.teal}55, transparent 65%)`, filter: "blur(8px)" }} />
        <span aria-hidden style={{ position: "absolute", bottom: -120, left: -80, width: 280, height: 280,
          borderRadius: "50%", background: `radial-gradient(circle, ${C.teal}30, transparent 60%)`, filter: "blur(12px)" }} />

        <div className="flex items-center gap-3" style={{ position: "relative", zIndex: 2 }}>
          <div className="flex items-center justify-center rounded-2xl"
            style={{ background: "rgba(255,255,255,.08)", width: 50, height: 50, border: "1px solid rgba(255,255,255,.08)" }}>
            <Logo size={32} />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 17, lineHeight: 1, letterSpacing: "-.01em" }}>Whites &amp; Brights</p>
            <p style={{ color: C.tealMid, fontSize: 10.5, fontWeight: 500, letterSpacing: ".12em", marginTop: 5, textTransform: "uppercase" }}>Laundry · Dry Clean · Express Care</p>
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 2 }} className="wb-enter">
          <h1 style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-.025em", maxWidth: 440 }}>
            Run the counter, <span style={{ color: C.tealMid }}>not the chaos.</span>
          </h1>
          <p style={{ color: "#A0B4C2", fontSize: 14, lineHeight: 1.65, marginTop: 18, maxWidth: 420 }}>
            One panel for billing, pickups, deliveries and every customer story.
            Built for the floor, ready for HQ.
          </p>

          <div className="flex flex-col gap-3" style={{ marginTop: 28, maxWidth: 420 }}>
            {[
              { icon: Shirt,       title: "Walk-in billing in 10 seconds", sub: "Inline customer, fulfilment & date." },
              { icon: Sparkles,    title: "Damage notes with photos",       sub: "Captured at intake, auto-cleared on delivery." },
              { icon: ShieldCheck, title: "Admin vs staff, enforced in DB", sub: "Row-Level Security from Supabase." },
            ].map((f) => (
              <div key={f.title} className="flex items-start gap-3" style={{ padding: "10px 0" }}>
                <div className="flex items-center justify-center rounded-xl" style={{ width: 36, height: 36, background: "rgba(43,169,199,.16)", color: C.tealMid, flexShrink: 0 }}>
                  <f.icon size={17} strokeWidth={1.9} />
                </div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 13.5 }}>{f.title}</p>
                  <p style={{ color: "#7C97AA", fontSize: 12, marginTop: 2 }}>{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ position: "relative", zIndex: 2, color: "#5F7B8C", fontSize: 11, letterSpacing: ".06em" }}>
          © {new Date().getFullYear()} Whites &amp; Brights · Main Outlet
        </p>
      </aside>

      {/* ─────────── Right: sign-in card ─────────── */}
      <main className="wb-login-form wb-enter"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 56px" }}>
        <div style={{ width: 400, maxWidth: "100%" }}>
          <div className="flex items-center justify-center rounded-xl" style={{ background: C.tealSoft, width: 48, height: 48, marginBottom: 18 }}>
            <Logo size={30} />
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: C.navy, letterSpacing: "-.02em", lineHeight: 1.15, marginBottom: 6 }}>
            Sign in to your store
          </h2>
          <p style={{ color: C.textMute, fontSize: 13.5, lineHeight: 1.55, marginBottom: 26 }}>
            Use the email your admin set up for you. Lost access? Ask an admin to add you from System Users.
          </p>

          <form onSubmit={submit}>
            <div style={{ marginBottom: 14 }}>
              <label style={fieldLabel}>Email</label>
              <input style={field} type="email" autoComplete="username" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@whitesandbrights.in" required />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={fieldLabel}>Password</label>
              <input style={field} type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>

            {err && (
              <div className="wb-fade-in" style={{ background: C.redLt, color: C.red, fontSize: 13, fontWeight: 500, padding: "10px 14px", borderRadius: 10, marginBottom: 16, border: `1px solid ${C.red}22` }}>
                {err}
              </div>
            )}

            <Btn type="submit" variant="navy" full icon={busy ? undefined : ArrowRight} disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {busy ? "Signing in…" : "Sign in"}
            </Btn>
          </form>

          <p style={{ color: C.textFaint, fontSize: 11.5, marginTop: 20, lineHeight: 1.55, textAlign: "center" }}>
            By signing in you agree to operate this outlet's data with care.
            All actions are recorded against your account.
          </p>
        </div>
      </main>
    </div>
  );
}

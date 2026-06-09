import React, { useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import { C, DISPLAY } from "../theme";
import { Card, PageHead, Btn, field, fieldLabel } from "../components/ui";

export default function Settings({ profile, session, toast, onRefresh }) {
  const [name, setName] = useState(profile?.name || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      if (name && name !== profile?.name) {
        await supabase.from("profiles").update({ name }).eq("id", session.user.id);
        await supabase.auth.updateUser({ data: { name } });
      }
      if (password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      }
      toast("Profile updated");
      setPassword("");
      onRefresh();
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  };

  return (
    <div>
      <PageHead title="Settings" sub="Account & profile" />
      <div style={{ maxWidth: 560 }}>
        <Card>
          <h3 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 17, color: C.navy, marginBottom: 20 }}>Account</h3>
          <div style={{ marginBottom: 16 }}><label style={fieldLabel}>Name</label><input style={field} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div style={{ marginBottom: 16 }}><label style={fieldLabel}>Email</label><input style={{ ...field, background: "#F2F6F9", color: C.textMute }} value={session?.user?.email || ""} disabled /></div>
          <p style={{ fontSize: 12.5, color: C.textFaint, marginBottom: 16 }}>Leave the password field blank if you don't want to change it.</p>
          <div style={{ marginBottom: 22 }}><label style={fieldLabel}>New Password</label><input type="password" style={field} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></div>
          {msg && <div style={{ background: C.redLt, color: C.red, fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 10, marginBottom: 16 }}>{msg}</div>}
          <Btn variant="navy" icon={Check} onClick={save} disabled={busy}>Update Profile</Btn>
        </Card>
      </div>
    </div>
  );
}

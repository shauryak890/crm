import React, { useEffect, useState } from "react";
import { Check, Clock } from "lucide-react";
import { supabase } from "../lib/supabase";
import { C, DISPLAY } from "../theme";
import { Card, PageHead, Btn, field, fieldLabel } from "../components/ui";

export default function Settings({ profile, session, toast, onRefresh }) {
  const [name, setName] = useState(profile?.name || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Outlet opening hours (shown to customers as Open/Closed in the app).
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");
  const [outletName, setOutletName] = useState("");
  const [savingHours, setSavingHours] = useState(false);

  useEffect(() => {
    if (!profile?.outlet_id) return;
    supabase
      .from("outlets")
      .select("name, opening_time, closing_time")
      .eq("id", profile.outlet_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setOutletName(data.name || "");
        setOpening((data.opening_time || "").slice(0, 5)); // 'HH:MM'
        setClosing((data.closing_time || "").slice(0, 5));
      });
  }, [profile?.outlet_id]);

  const saveHours = async () => {
    if (!profile?.outlet_id) return;
    setSavingHours(true);
    try {
      const { error } = await supabase
        .from("outlets")
        .update({
          opening_time: opening || null,
          closing_time: closing || null,
        })
        .eq("id", profile.outlet_id);
      if (error) throw error;
      toast("Outlet hours updated");
    } catch (e) {
      toast("Could not save hours: " + e.message);
    }
    setSavingHours(false);
  };

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

        {profile?.outlet_id && (
          <Card style={{ marginTop: 18 }}>
            <h3 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 17, color: C.navy, marginBottom: 6 }}>Outlet hours</h3>
            <p style={{ fontSize: 12.5, color: C.textMute, marginBottom: 18 }}>
              Shown to customers as “Open now / Closed” for {outletName || "this outlet"} in the app.
            </p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 20 }}>
              <div>
                <label style={fieldLabel}>Opens</label>
                <input type="time" style={field} value={opening} onChange={(e) => setOpening(e.target.value)} />
              </div>
              <div>
                <label style={fieldLabel}>Closes</label>
                <input type="time" style={field} value={closing} onChange={(e) => setClosing(e.target.value)} />
              </div>
            </div>
            <Btn variant="navy" icon={Clock} onClick={saveHours} disabled={savingHours}>
              {savingHours ? "Saving…" : "Save hours"}
            </Btn>
          </Card>
        )}
      </div>
    </div>
  );
}

import React, { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Plus, ShieldCheck } from "lucide-react";
import { C } from "../theme";
import { supabase } from "../lib/supabase";
import { PageHead, Btn, Badge, DataTable, Modal, td, field, fieldLabel } from "../components/ui";

// Throwaway client so creating a staff login never disturbs the
// currently signed-in admin's session.
function makeSignupClient() {
  return createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "wb-signup-tmp" },
  });
}

export default function Users({ profiles, loading, onRefresh, toast }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // System Users lists outlet STAFF only. Super-admins (corporate) are
  // hidden by RLS + this backstop; app customers also live in `profiles`
  // (role='customer', no outlet) and must never appear in the staff list.
  const visibleProfiles = profiles.filter(
    (p) => p.role !== "super_admin" && p.role !== "customer"
  );

  const save = async () => {
    setErr("");
    if (!form.email.trim() || form.password.length < 6) { setErr("Email and a 6+ char password are required."); return; }
    setBusy(true);
    const tmp = makeSignupClient();
    // Note: only `name` is passed via signup metadata. Role is set by an
    // RLS-checked UPDATE below so non-admins cannot self-promote.
    const { data, error } = await tmp.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { name: form.name } },
    });
    if (error) { setBusy(false); setErr(error.message); return; }

    if (form.role === "admin" && data?.user?.id) {
      const { error: upErr } = await supabase
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", data.user.id);
      if (upErr) { setBusy(false); setErr("Account created, but role upgrade failed: " + upErr.message); return; }
    }

    setBusy(false);
    setOpen(false);
    setForm({ name: "", email: "", password: "", role: "staff" });
    toast("Staff login created. They may need to confirm via email.");
    setTimeout(onRefresh, 800);
  };

  return (
    <div>
      <PageHead title="System Users" sub="Outlet staff & access roles">
        <Btn variant="primary" icon={Plus} small onClick={() => setOpen(true)}>Add User</Btn>
      </PageHead>
      <DataTable
        loading={loading}
        columns={["Name", "Email", "Role", "Outlet"]}
        data={visibleProfiles}
        searchKeys={["name", "email"]}
        placeholder="Search staff…"
        renderRow={(u) => (
          <tr key={u.id}>
            <td style={td}>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: C.navy, color: "#fff", fontWeight: 700, fontSize: 13 }}>{(u.name || u.email || "?")[0].toUpperCase()}</div>
                <span style={{ fontWeight: 600 }}>{u.name || "—"}</span>
              </div>
            </td>
            <td style={{ ...td, color: C.textMute }}>{u.email}</td>
            <td style={td}><Badge tone={u.role === "admin" ? "info" : "muted"}>{u.role}</Badge></td>
            <td style={{ ...td, color: C.textMute }}>{u.outlet || "—"}</td>
          </tr>
        )}
      />

      {open && (
        <Modal title="Add Staff Login" sub="Creates a Supabase auth account" onClose={() => setOpen(false)}>
          <div><label style={fieldLabel}>Full name</label><input style={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div style={{ marginTop: 14 }}><label style={fieldLabel}>Email *</label><input style={field} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
            <div><label style={fieldLabel}>Password *</label><input style={field} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="min 6 chars" /></div>
            <div><label style={fieldLabel}>Role</label>
              <select style={field} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="staff">staff</option><option value="admin">admin</option>
              </select>
            </div>
          </div>
          {err && <div style={{ background: C.redLt, color: C.red, fontSize: 12.5, fontWeight: 600, padding: "9px 12px", borderRadius: 9, marginTop: 14 }}>{err}</div>}
          <div className="flex items-center gap-2" style={{ marginTop: 16, color: C.textFaint, fontSize: 11.5 }}>
            <ShieldCheck size={14} /> The new account follows your Supabase email-confirmation setting.
          </div>
          <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
            <Btn variant="outline" small onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="primary" small icon={Plus} onClick={save} disabled={busy}>Create Login</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

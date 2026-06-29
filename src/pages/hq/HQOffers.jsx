import React, { useEffect, useState } from "react";
import { Tag, Plus, Trash2, Pencil, Image as ImageIcon, Upload } from "lucide-react";
import { C, inr } from "../../theme";
import * as api from "../../lib/api";
import { Card, Btn, Badge, Modal, field, fieldLabel } from "../../components/ui";

const EMPTY = {
  description: "",
  coupon_code: "",
  discount_type: "flat",
  discount_value: "",
  max_discount: "",
  min_order: "",
  is_active: true,
};

// HQ-managed promotional banners shown in the customer app. Each offer has a
// banner image, a description, and a working coupon code (flat or percent).
export default function HQOffers({ toast }) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);   // offer being edited, or null
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);          // newly picked image File
  const [preview, setPreview] = useState("");      // local preview / existing url
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const load = async () => {
    setLoading(true); setErr("");
    try { setOffers(await api.fetchOffers()); }
    catch (e) { setErr(e.message || "Could not load offers."); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null); setForm(EMPTY); setFile(null); setPreview(""); setFormErr(""); setOpen(true);
  };
  const openEdit = (o) => {
    setEditing(o);
    setForm({
      description: o.description || "",
      coupon_code: o.coupon_code || "",
      discount_type: o.discount_type || "flat",
      discount_value: String(o.discount_value ?? ""),
      max_discount: String(o.max_discount ?? ""),
      min_order: String(o.min_order ?? ""),
      is_active: !!o.is_active,
    });
    setFile(null); setPreview(o.image_url || ""); setFormErr(""); setOpen(true);
  };

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    setFormErr("");
    const description = form.description.trim();
    const coupon_code = form.coupon_code.trim().toUpperCase();
    const dval = Number(form.discount_value);
    const dmax = Number(form.max_discount);
    const dmin = Number(form.min_order);

    // All fields mandatory.
    if (!description) return setFormErr("A description is required.");
    if (!coupon_code) return setFormErr("A coupon code is required.");
    if (!editing && !file) return setFormErr("A banner image is required.");
    if (editing && !file && !preview) return setFormErr("A banner image is required.");
    if (!form.discount_value || isNaN(dval) || dval <= 0) return setFormErr("Enter a discount value greater than 0.");
    if (form.discount_type === "percent" && dval > 100) return setFormErr("Percentage discount can't exceed 100.");
    if (form.max_discount === "" || isNaN(dmax) || dmax < 0) return setFormErr("Enter a max discount (0 means no cap).");
    if (form.min_order === "" || isNaN(dmin) || dmin < 0) return setFormErr("Enter a minimum order (0 means none).");

    setSaving(true);
    try {
      let image_url = editing?.image_url || "";
      if (file) image_url = await api.uploadOfferBanner(file);

      const payload = {
        image_url,
        description,
        coupon_code,
        discount_type: form.discount_type,
        discount_value: dval,
        max_discount: dmax,
        min_order: dmin,
        is_active: form.is_active,
      };

      if (editing) {
        await api.updateOffer(editing.id, payload);
        toast?.("Offer updated.");
      } else {
        await api.createOffer(payload);
        toast?.("Offer published.");
      }
      setOpen(false);
      await load();
    } catch (e) {
      setFormErr(e.code === "23505" ? "That coupon code is already in use." : (e.message || "Could not save offer."));
    }
    setSaving(false);
  };

  const toggle = async (o) => {
    try {
      await api.updateOffer(o.id, { is_active: !o.is_active });
      setOffers((prev) => prev.map((x) => (x.id === o.id ? { ...x, is_active: !o.is_active } : x)));
    } catch (e) { toast?.(e.message || "Could not update.", "error"); }
  };

  const remove = async (o) => {
    if (!window.confirm(`Delete the offer "${o.coupon_code}"? This can't be undone.`)) return;
    try {
      await api.deleteOffer(o.id);
      setOffers((prev) => prev.filter((x) => x.id !== o.id));
      toast?.("Offer deleted.");
    } catch (e) { toast?.(e.message || "Could not delete.", "error"); }
  };

  const discountLabel = (o) =>
    o.discount_type === "percent"
      ? `${o.discount_value}% off${o.max_discount > 0 ? ` (max ${inr(o.max_discount)})` : ""}`
      : `${inr(o.discount_value)} off`;

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3" style={{ marginBottom: 22 }}>
        <div>
          <p className="wb-eyebrow" style={{ color: "#9FB5C5" }}>Corporate · marketing</p>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: "#fff", letterSpacing: "-.02em", marginTop: 6 }}>Offers &amp; Banners</h1>
          <p style={{ color: "#9FB5C5", fontSize: 13.5, marginTop: 6 }}>Promo banners shown in the customer app. Each has a working coupon code.</p>
        </div>
        <Btn variant="primary" icon={Plus} onClick={openNew}>New offer</Btn>
      </div>

      {err && <div style={{ background: "rgba(224,72,77,.15)", color: "#FCA5A8", fontSize: 13, padding: "12px 16px", borderRadius: 12, marginBottom: 18 }}>{err}</div>}

      {loading ? (
        <Card><div style={{ padding: "40px 0", textAlign: "center", color: C.textFaint }}>Loading…</div></Card>
      ) : offers.length === 0 ? (
        <Card><div style={{ padding: "48px 0", textAlign: "center", color: C.textFaint, fontSize: 14 }}>No offers yet. Create your first banner.</div></Card>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
          {offers.map((o) => (
            <Card key={o.id} pad={false} style={{ overflow: "hidden" }}>
              <div style={{ position: "relative", aspectRatio: "16/7", background: C.bg }}>
                {o.image_url ? (
                  <img src={o.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <div className="flex items-center justify-center" style={{ width: "100%", height: "100%", color: C.textFaint }}><ImageIcon size={28} /></div>
                )}
                <div style={{ position: "absolute", top: 10, right: 10 }}>
                  <Badge tone={o.is_active ? "success" : "muted"}>{o.is_active ? "Active" : "Hidden"}</Badge>
                </div>
              </div>
              <div style={{ padding: 16 }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                  <Tag size={14} color={C.tealDark} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.navy, letterSpacing: ".02em" }}>{o.coupon_code}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: C.tealDark, fontWeight: 600 }}>{discountLabel(o)}</span>
                </div>
                <p style={{ fontSize: 13, color: C.text, marginBottom: 8, minHeight: 36 }}>{o.description}</p>
                <p style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 12 }}>
                  Min order {o.min_order > 0 ? inr(o.min_order) : "none"}
                </p>
                <div className="flex items-center gap-2">
                  <Btn variant="outline" small icon={Pencil} onClick={() => openEdit(o)}>Edit</Btn>
                  <Btn variant={o.is_active ? "ghost" : "navy"} small onClick={() => toggle(o)}>{o.is_active ? "Hide" : "Show"}</Btn>
                  <Btn variant="danger" small icon={Trash2} onClick={() => remove(o)} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {open && (
        <Modal
          title={editing ? "Edit offer" : "New offer"}
          sub="All fields are required. The coupon code must work at checkout."
          onClose={() => setOpen(false)}
          width={560}
        >
          {/* Banner image */}
          <label style={fieldLabel}>Banner image *</label>
          <label
            style={{
              display: "block", border: `1.5px dashed ${C.border}`, borderRadius: 12, overflow: "hidden",
              cursor: "pointer", marginBottom: 16, background: C.bg,
            }}
          >
            {preview ? (
              <img src={preview} alt="" style={{ width: "100%", aspectRatio: "16/7", objectFit: "cover", display: "block" }} />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2" style={{ padding: "32px 0", color: C.textMute }}>
                <Upload size={22} />
                <span style={{ fontSize: 13 }}>Click to upload a banner (16:7 works best)</span>
              </div>
            )}
            <input type="file" accept="image/*" onChange={pickFile} style={{ display: "none" }} />
          </label>

          <div style={{ marginBottom: 14 }}>
            <label style={fieldLabel}>Description *</label>
            <input style={field} value={form.description} maxLength={140}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Flat ₹50 off your first wash this monsoon!" />
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
            <div>
              <label style={fieldLabel}>Coupon code *</label>
              <input style={{ ...field, textTransform: "uppercase", letterSpacing: ".04em" }} value={form.coupon_code}
                onChange={(e) => setForm({ ...form, coupon_code: e.target.value.toUpperCase() })}
                placeholder="MONSOON50" />
            </div>
            <div>
              <label style={fieldLabel}>Discount type *</label>
              <select style={field} value={form.discount_type}
                onChange={(e) => setForm({ ...form, discount_type: e.target.value })}>
                <option value="flat">Flat (₹ off)</option>
                <option value="percent">Percentage (% off)</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 14 }}>
            <div>
              <label style={fieldLabel}>{form.discount_type === "percent" ? "Percent *" : "Amount (₹) *"}</label>
              <input style={field} type="number" min="1" value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                placeholder={form.discount_type === "percent" ? "20" : "50"} />
            </div>
            <div>
              <label style={fieldLabel}>Max discount (₹) *</label>
              <input style={field} type="number" min="0" value={form.max_discount}
                onChange={(e) => setForm({ ...form, max_discount: e.target.value })}
                placeholder="0 = no cap" />
            </div>
            <div>
              <label style={fieldLabel}>Min order (₹) *</label>
              <input style={field} type="number" min="0" value={form.min_order}
                onChange={(e) => setForm({ ...form, min_order: e.target.value })}
                placeholder="0 = none" />
            </div>
          </div>

          <label className="flex items-center gap-2" style={{ fontSize: 13.5, color: C.text, cursor: "pointer", marginBottom: 4 }}>
            <input type="checkbox" checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Active (visible in the app right now)
          </label>

          {formErr && <div style={{ background: C.redLt, color: C.red, fontSize: 12.5, fontWeight: 600, padding: "9px 12px", borderRadius: 9, marginTop: 14 }}>{formErr}</div>}

          <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
            <Btn variant="outline" small onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="primary" small icon={editing ? Pencil : Plus} onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Publish offer"}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, Inbox, BookOpen, Check, X, Plus, Search, Save, Clock3, MessageCircleQuestion, ShoppingCart, Camera, Brain, Trash2, ShieldCheck, Upload } from "lucide-react";
import { loadVision, fileToImage, analyzePhoto, thumbnail, encodeEmbedding } from "../../lib/assistant/vision";
import { C, inr, fmtDateTime } from "../../theme";
import * as api from "../../lib/api";
import { Card, Btn, Modal, field, fieldLabel } from "../../components/ui";
import "../../components/assistant.css";

const SERVICES = ["Dry Clean", "Steam Press", "Polish", "Starching", "Wash & Iron", "Laundry", "Shoe Cleaning", "Bag Cleaning", "Business", "Add-on", "Subscription"];
const UNITS = ["piece", "set", "pair", "kg", "panel", "sq ft", "month", "offer"];
const ago = (d) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${m} min`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} d`;
};

export default function HQAssistant({ toast, profile }) {
  const [tab, setTab] = useState("questions");
  const [questions, setQuestions] = useState([]);
  const [knowledge, setKnowledge] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState([]);
  const [learning, setLearning] = useState([]);
  const [v2Missing, setV2Missing] = useState(false);   // assistant_v2.sql not run yet

  const load = useCallback(async () => {
    try {
      const [q, k, o] = await Promise.all([api.fetchAssistantQuestions({ limit: 500 }), api.fetchAssistantKnowledge(), api.fetchOutlets().catch(() => [])]);
      setQuestions(q); setKnowledge(k); setOutlets(o); setMissing(false);
    } catch (e) {
      if (api.isMissingTable(e)) setMissing(true); else toast("Could not load the assistant: " + e.message);
    }
    try {
      const [ph, le] = await Promise.all([api.fetchAssistantPhotos({ withImages: true }), api.fetchAssistantLearning()]);
      setPhotos(ph); setLearning(le); setV2Missing(false);
    } catch (e) {
      if (/assistant_photos|assistant_learning|schema cache|does not exist/i.test(e.message)) setV2Missing(true);
    }
    setLoading(false);
  }, [toast]);
  useEffect(() => {
    load();
    let ch = null;
    try { ch = api.subscribeAssistantQuestions(() => load(), "hq-assistant"); } catch { /* realtime unavailable */ }
    return () => api.unsubscribe(ch);
  }, [load]);

  const open = questions.filter((q) => q.status === "open");
  const outletName = (id) => outlets.find((o) => o.id === id)?.name?.replace(/^Patna\s*-\s*/i, "") || "HQ";

  const weekAgo = Date.now() - 7 * 864e5;
  const answeredWeek = questions.filter((q) => q.status === "answered" && new Date(q.answered_at).getTime() > weekAgo);
  const avgMins = answeredWeek.length
    ? Math.round(answeredWeek.reduce((a, q) => a + (new Date(q.answered_at) - new Date(q.created_at)) / 60000, 0) / answeredWeek.length) : null;
  const learned = knowledge.filter((k) => k.source === "hq_answer").length;
  const selfLearned = learning.filter((l) => l.picks >= 3).length;
  const autoCount = questions.filter((q) => q.status === "auto").length;

  if (missing) {
    return (
      <Card>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>One-time setup needed</h2>
        <p style={{ fontSize: 13.5, color: C.textMute, marginTop: 6, lineHeight: 1.6 }}>
          Run <code style={{ background: C.bg, padding: "1px 6px", borderRadius: 6 }}>supabase/assistant.sql</code> in the Supabase SQL editor. It creates the assistant's price list,
          rules and the question queue. Until then the assistant answers from each outlet's counter catalogue only.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3" style={{ marginBottom: 20 }}>
        <div className="flex items-center gap-3">
          <div className="wb-ai-orb" style={{ width: 44, height: 44, borderRadius: 14 }}><Sparkles size={21} /></div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fff", letterSpacing: "-.02em" }}>Brighty</h1>
            <p style={{ color: "#9FB5C5", fontSize: 13.5, marginTop: 3 }}>Answer the outlets' questions once. The assistant remembers the answer for next time.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="wb-hq-ai-tab" data-active={tab === "questions"} onClick={() => setTab("questions")}>
            <Inbox size={15} /> Questions {open.length > 0 && <span className="wb-ai-badge">{open.length}</span>}
          </button>
          <button className="wb-hq-ai-tab" data-active={tab === "knowledge"} onClick={() => setTab("knowledge")}><BookOpen size={15} /> Price list &amp; rules</button>
          <button className="wb-hq-ai-tab" data-active={tab === "photos"} onClick={() => setTab("photos")}><Camera size={15} /> Photos</button>
          <button className="wb-hq-ai-tab" data-active={tab === "learned"} onClick={() => setTab("learned")}><Brain size={15} /> Learned</button>
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(170px,100%),1fr))", marginBottom: 18 }}>
        <MiniStat label="Waiting for HQ" value={open.length} tone={open.length ? C.amber : C.green} sub={open.length ? `oldest ${ago(open[open.length - 1].created_at)} ago` : "all clear"} />
        <MiniStat label="Answered this week" value={answeredWeek.length} sub={avgMins != null ? `avg ${avgMins < 90 ? `${avgMins} min` : `${Math.round(avgMins / 60)} h`} to answer` : "—"} />
        <MiniStat label="Learned by itself" value={selfLearned + learned} sub={`${learned} from HQ answers · ${photos.length} photos · ${autoCount} safe-price bills`} />
        <MiniStat label="Price list" value={knowledge.filter((k) => k.kind === "price" && k.active !== false).length} sub={`${knowledge.filter((k) => k.kind === "policy" && k.active !== false).length} rules`} />
      </div>

      {v2Missing && (tab === "photos" || tab === "learned") && (
        <Card style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 13.5, color: C.navy, fontWeight: 700 }}>One more database update needed</p>
          <p style={{ fontSize: 13, color: C.textMute, marginTop: 4 }}>Run <code style={{ background: C.bg, padding: "1px 6px", borderRadius: 6 }}>supabase/assistant_v2.sql</code> in the Supabase SQL editor to turn on photos and self-learning.</p>
        </Card>
      )}
      {loading ? <Card><p style={{ color: C.textMute, fontSize: 13.5 }}>Loading…</p></Card>
        : tab === "questions"
          ? <Questions questions={questions} knowledge={knowledge} outletName={outletName} profile={profile} toast={toast} onChanged={load} />
          : tab === "photos"
            ? <Photos knowledge={knowledge} photos={photos} disabled={v2Missing} profile={profile} toast={toast} onChanged={load} />
            : tab === "learned"
              ? <Learned learning={learning} knowledge={knowledge} questions={questions} toast={toast} onChanged={load} />
              : <Knowledge rows={knowledge} toast={toast} onChanged={load} profile={profile} />}
    </div>
  );
}

function MiniStat({ label, value, sub, tone }) {
  return (
    <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: "14px 16px" }}>
      <p style={{ fontSize: 11.5, color: "#9FB5C5", fontWeight: 600 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 800, color: tone || "#fff", marginTop: 4, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11.5, color: "#7C97AA", marginTop: 6 }}>{sub}</p>}
    </div>
  );
}

/* ── Question queue ─────────────────────────────────────────────── */

function Questions({ questions, knowledge, outletName, profile, toast, onChanged }) {
  const [filter, setFilter] = useState("open");
  const list = questions.filter((q) => filter === "all" || q.status === filter);
  return (
    <Card>
      <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: 14 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>From the outlets</h3>
        <div className="flex gap-1">
          {[["open", "Waiting"], ["auto", "Safe-price bills"], ["answered", "Answered"], ["dismissed", "Closed"], ["all", "All"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{ border: `1px solid ${filter === k ? C.teal : C.border}`, background: filter === k ? C.tealLight : "#fff",
              color: filter === k ? C.tealDark : C.textMute, fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 99, cursor: "pointer" }}>{l}</button>
          ))}
        </div>
      </div>
      {!list.length && (
        <div style={{ textAlign: "center", padding: "34px 10px", color: C.textMute }}>
          <Check size={26} style={{ margin: "0 auto 8px", color: C.green }} />
          <p style={{ fontSize: 13.5, fontWeight: 600, color: C.navy }}>{filter === "open" ? "Nothing waiting" : "Nothing here"}</p>
          <p style={{ fontSize: 12.5, marginTop: 3 }}>{filter === "auto" ? "Unknown items billed at the safe (top-of-range) price show here, so you can glance at them. Nobody waits for these." : "Questions staff send with “Ask HQ” appear here."}</p>
        </div>
      )}
      <div className="flex flex-col" style={{ gap: 12 }}>
        {list.map((q) => <QuestionRow key={q.id} q={q} knowledge={knowledge} outletName={outletName} profile={profile} toast={toast} onChanged={onChanged} />)}
      </div>
    </Card>
  );
}

function QuestionRow({ q, knowledge = [], outletName, profile, toast, onChanged }) {
  const [price, setPrice] = useState(q.answer_price != null ? String(q.answer_price) : q.suggested_price != null ? String(q.suggested_price) : "");
  const [text, setText] = useState(q.answer || "");
  // How the assistant should learn from this answer:
  //  new  — save it as a new item in the price list
  //  same — it's an item we already have; remember these words for it
  //  none — just answer this once
  const [learn, setLearn] = useState("new");
  const [item, setItem] = useState(q.item || "");
  const [variant, setVariant] = useState(q.variant || "");
  const [service, setService] = useState(q.service && SERVICES.includes(q.service) ? q.service : "Dry Clean");
  const [unit, setUnit] = useState(q.unit && UNITS.includes(q.unit) ? q.unit : "piece");
  const [sameQ, setSameQ] = useState("");
  const [sameId, setSameId] = useState("");
  const [busy, setBusy] = useState(false);
  const isOpen = q.status === "open" || q.status === "auto";
  const priced = useMemo(() => knowledge.filter((k) => k.kind === "price" && k.active !== false && k.price != null), [knowledge]);
  const sameOptions = useMemo(() => {
    const t = sameQ.trim().toLowerCase();
    return (t ? priced.filter((k) => `${k.item} ${k.variant || ""} ${k.service || ""}`.toLowerCase().includes(t)) : priced).slice(0, 60);
  }, [priced, sameQ]);
  const sameRow = priced.find((k) => k.id === sameId);
  const by = profile?.name || "HQ";

  const send = async () => {
    const p = learn === "same" && sameRow ? Number(sameRow.price) : price === "" ? null : Number(price);
    if (p == null && !text.trim()) { toast("Write a price or an answer first."); return; }
    if (learn === "same" && !sameRow) { toast("Pick the item it's the same as."); return; }
    setBusy(true);
    try {
      await api.updateAssistantQuestion(q.id, {
        status: "answered", answer: text.trim() || (learn === "same" && sameRow ? `Same as ${sameRow.item}${sameRow.variant ? ` (${sameRow.variant})` : ""}` : null),
        answer_price: p, answered_by: by, answered_at: new Date().toISOString(), seen_by_asker: false,
      });
      if (learn === "same" && sameRow) {
        // Teach the words: next time this question finds that item directly.
        const aliases = [...new Set([...(sameRow.aliases || []), q.question.trim().toLowerCase()])].slice(-20);
        await api.saveAssistantKnowledge({ id: sameRow.id, aliases, updated_by: by });
      } else if (learn === "new" && p != null && item.trim()) {
        const existing = knowledge.find((k) => k.kind === "price" && (k.section || "") === "Answered by HQ"
          && k.item.toLowerCase() === item.trim().toLowerCase() && (k.variant || "").toLowerCase() === variant.trim().toLowerCase());
        await api.saveAssistantKnowledge({
          ...(existing ? { id: existing.id } : {}),
          kind: "price", section: "Answered by HQ", service, item: item.trim(), variant: variant.trim() || null, unit, price: p,
          note: text.trim() || null, source: "hq_answer", sort: 900, updated_by: by, active: true,
          aliases: [...new Set([...(existing?.aliases || []), q.question.trim().toLowerCase()])].slice(-20),
        });
      }
      toast(learn === "none" ? "Answer sent" : "Answer sent, and the assistant will know it next time");
      onChanged();
    } catch (e) { toast("Could not send: " + e.message); }
    setBusy(false);
  };
  const dismiss = async () => {
    setBusy(true);
    try { await api.updateAssistantQuestion(q.id, { status: "dismissed", answered_by: by, answered_at: new Date().toISOString() }); onChanged(); }
    catch (e) { toast("Could not close: " + e.message); }
    setBusy(false);
  };
  const remove = async () => {
    if (!confirm(`Delete this question for good?\n\n“${q.question}”`)) return;
    setBusy(true);
    try { await api.deleteAssistantQuestion(q.id); toast("Question deleted"); onChanged(); }
    catch (e) { toast(/policy|permission|denied/i.test(e.message) ? "Deleting needs supabase/assistant_v2.sql." : "Could not delete: " + e.message); }
    setBusy(false);
  };

  const smallField = { ...field, padding: "8px 11px", fontSize: 13 };
  return (
    <div style={{ border: `1px solid ${q.status === "open" ? "#F1D9AE" : C.border}`, background: q.status === "open" ? "#FFFCF5" : "#fff", borderRadius: 14, padding: 16 }}>
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="flex items-center flex-wrap gap-2" style={{ fontSize: 12, color: C.textMute }}>
            <b style={{ color: C.navy }}>{outletName(q.outlet_id)}</b><span>·</span><span>{q.asker || "Staff"}</span><span>·</span>
            <span>{fmtDateTime(q.created_at)}</span>
            {q.status === "open" && <span className="wb-ai-st" style={{ color: C.amber, background: C.amberLt }}><Clock3 size={11} /> {ago(q.created_at)}</span>}
            {q.status === "auto"
              ? <span className="wb-ai-st" style={{ color: C.tealDark, background: C.tealLight }}><ShieldCheck size={11} /> Billed at safe price · FYI</span>
              : q.kind === "price_to_confirm"
                ? <span className="wb-ai-st" style={{ color: C.tealDark, background: C.tealLight }}><ShoppingCart size={11} /> Billed · price to confirm</span>
                : <span className="wb-ai-st" style={{ color: C.textMute, background: C.bg }}><MessageCircleQuestion size={11} /> Question</span>}
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, color: C.text, marginTop: 6 }}>“{q.question}”</p>
          {(q.item || q.suggested_price != null) && (
            <p style={{ fontSize: 12.5, color: C.textMute, marginTop: 3 }}>
              {q.kind === "price_to_confirm" ? "Billed as" : "Assistant's best guess"}: {q.item ? <b>{q.item}{q.variant ? ` (${q.variant})` : ""}</b> : "—"}
              {q.service ? ` · ${q.service}` : ""}{q.suggested_price != null ? ` · ${inr(q.suggested_price)}` : ""}
              {q.order_label ? <> · on bill <b>#{q.order_label}</b></> : q.kind === "price_to_confirm" ? " · bill not saved yet" : ""}
            </p>
          )}
        </div>
        <div className="flex items-start gap-2">
          {!isOpen && (
            <div style={{ textAlign: "right" }}>
              {q.answer_price != null && <p style={{ fontSize: 18, fontWeight: 800, color: C.navy }}>{inr(q.answer_price)}</p>}
              <p style={{ fontSize: 11.5, color: C.textMute }}>{q.status === "dismissed" ? "Closed" : "Answered"} by {q.answered_by || "HQ"} · {fmtDateTime(q.answered_at)}</p>
            </div>
          )}
          <button onClick={remove} disabled={busy} title="Delete" style={{ border: `1px solid ${C.border}`, background: "#fff", borderRadius: 9, padding: 6, cursor: "pointer", color: C.textMute, display: "inline-flex" }}><Trash2 size={14} /></button>
        </div>
      </div>
      {!isOpen && q.answer && <p style={{ fontSize: 13, color: C.text, marginTop: 8, background: C.greenLt, padding: "8px 12px", borderRadius: 10 }}>{q.answer}</p>}

      {isOpen && (
        <div style={{ marginTop: 12 }}>
          {q.status === "auto" && <p style={{ fontSize: 12.5, color: C.textMute, marginBottom: 8 }}>Nobody is waiting on this. Confirm the price (or change it) so the assistant learns it properly.</p>}
          <div className="flex flex-wrap gap-1" style={{ marginBottom: 10 }}>
            {[["new", "New item for the price list"], ["same", "Same as an item we have"], ["none", "Just answer this once"]].map(([k, l]) => (
              <button key={k} onClick={() => setLearn(k)} style={{ border: `1px solid ${learn === k ? C.teal : C.border}`, background: learn === k ? C.tealLight : "#fff",
                color: learn === k ? C.tealDark : C.textMute, fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 99, cursor: "pointer" }}>{l}</button>
            ))}
          </div>
          {learn === "same" ? (
            <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(140px,1fr) 2fr" }}>
              <input value={sameQ} onChange={(e) => setSameQ(e.target.value)} style={smallField} placeholder="Search items…" />
              <select value={sameId} onChange={(e) => setSameId(e.target.value)} style={smallField}>
                <option value="">Pick the item…</option>
                {sameOptions.map((k) => <option key={k.id} value={k.id}>{k.item}{k.variant ? ` · ${k.variant}` : ""} · {k.service || ""} · ₹{Number(k.price)}</option>)}
              </select>
            </div>
          ) : (
            <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(110px,150px) 1fr" }}>
              <div>
                <label style={{ ...fieldLabel, fontSize: 11.5 }}>Price (₹)</label>
                <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" style={{ ...field, padding: "9px 12px" }} placeholder="e.g. 450" />
              </div>
              <div>
                <label style={{ ...fieldLabel, fontSize: 11.5 }}>Answer for the staff (optional)</label>
                <input value={text} onChange={(e) => setText(e.target.value)} style={{ ...field, padding: "9px 12px" }} placeholder="e.g. Heavy zari work, so the bridal rate applies" />
              </div>
            </div>
          )}
          {learn === "same" && sameRow && <p style={{ fontSize: 12, color: C.textMute, marginTop: 6 }}>Staff get {inr(sameRow.price)}, and “{q.question}” will find {sameRow.item} straight away next time.</p>}
          {learn === "new" && (
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(130px,100%),1fr))", marginTop: 8 }}>
              <input value={item} onChange={(e) => setItem(e.target.value)} style={smallField} placeholder="Item (e.g. Kids gown)" />
              <input value={variant} onChange={(e) => setVariant(e.target.value)} style={smallField} placeholder="Type (e.g. Heavy)" />
              <select value={service} onChange={(e) => setService(e.target.value)} style={smallField}>
                {SERVICES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <select value={unit} onChange={(e) => setUnit(e.target.value)} style={smallField}>
                {UNITS.map((u) => <option key={u} value={u}>per {u}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-2 flex-wrap" style={{ marginTop: 12 }}>
            <Btn small icon={Check} onClick={send} disabled={busy}>{q.status === "auto" ? "Confirm price" : "Send answer"}</Btn>
            <Btn small variant="outline" icon={X} onClick={dismiss} disabled={busy}>Close without answer</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Photo library: teach the assistant what garments look like ──── */

function Photos({ knowledge, photos, disabled, profile, toast, onChanged }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState("");
  const counts = useMemo(() => {
    const m = new Map();
    photos.forEach((p) => m.set(p.knowledge_id, (m.get(p.knowledge_id) || 0) + 1));
    return m;
  }, [photos]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return knowledge.filter((k) => k.kind === "price" && k.active !== false && (!t || `${k.item} ${k.variant || ""} ${k.section || ""}`.toLowerCase().includes(t)));
  }, [knowledge, q]);
  const withPhotos = knowledge.filter((k) => counts.get(k.id)).length;
  const selRow = knowledge.find((k) => k.id === sel);
  const selPhotos = photos.filter((p) => p.knowledge_id === sel);
  const staffRecent = photos.filter((p) => p.source === "staff").slice(0, 12);

  const upload = async (files) => {
    if (!selRow || !files.length) return;
    setBusy("Getting the photo reader ready…");
    try {
      await loadVision();
      let done = 0;
      for (const f of files) {
        setBusy(`Learning photo ${done + 1} of ${files.length}…`);
        const { img, url } = await fileToImage(f);
        const a = await analyzePhoto(img);
        const blob = await thumbnail(img);
        URL.revokeObjectURL(url);
        const image_url = await api.uploadAssistantPhoto(blob);
        const { emb, emb_scale } = encodeEmbedding(a.embedding);
        await api.saveAssistantPhoto({ knowledge_id: selRow.id, label: selRow.variant ? `${selRow.item} · ${selRow.variant}` : selRow.item, emb, emb_scale, image_url, source: "hq", added_by_name: profile?.name || "HQ" });
        done++;
      }
      toast(`${done} photo${done === 1 ? "" : "s"} learned for ${selRow.item}`);
      onChanged();
    } catch (e) { toast("Could not add photos: " + e.message); }
    setBusy("");
  };
  const remove = async (p) => {
    if (!confirm("Remove this photo? The assistant will stop using it.")) return;
    try { await api.deleteAssistantPhoto(p); toast("Photo removed"); onChanged(); }
    catch (e) { toast("Could not remove: " + e.message); }
  };

  return (
    <Card>
      <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>Teach it what garments look like</h3>
      <p style={{ fontSize: 12.5, color: C.textMute, marginTop: 4, lineHeight: 1.55 }}>
        Add 5–10 clear photos per item and grade (e.g. plain vs heavy lehenga). When staff send a photo, the assistant compares it with these.
        It also learns by itself: every photo staff bill or confirm is added automatically. {withPhotos} of {rows.length} items have photos so far.
      </p>
      {staffRecent.length > 0 && (
        <>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginTop: 14 }}>Learned from staff recently (remove any that look wrong)</p>
          <div className="flex flex-wrap" style={{ gap: 8, marginTop: 8 }}>
            {staffRecent.map((p) => <PhotoTile key={p.id} p={p} onRemove={remove} />)}
          </div>
        </>
      )}
      <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(220px, 320px) 1fr", marginTop: 16 }}>
        <div>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 11, top: 11, color: C.textFaint }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item…" style={{ ...field, padding: "8px 12px 8px 32px", fontSize: 13 }} />
          </div>
          <div style={{ maxHeight: "52vh", overflowY: "auto", marginTop: 8, border: `1px solid ${C.borderSoft}`, borderRadius: 12 }}>
            {rows.map((k) => (
              <button key={k.id} onClick={() => setSel(k.id)} className="flex items-center justify-between"
                style={{ width: "100%", textAlign: "left", gap: 8, padding: "9px 12px", border: "none", borderBottom: `1px solid ${C.borderSoft}`, cursor: "pointer",
                  background: sel === k.id ? C.tealLight : "#fff", fontSize: 13, color: C.navy }}>
                <span style={{ minWidth: 0 }}>{k.item}{k.variant ? <span style={{ color: C.textMute }}> · {k.variant}</span> : null}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: counts.get(k.id) ? C.green : C.textFaint, whiteSpace: "nowrap" }}><Camera size={11} style={{ display: "inline", verticalAlign: -1 }} /> {counts.get(k.id) || 0}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          {!selRow ? (
            <div style={{ border: `1px dashed ${C.border}`, borderRadius: 14, padding: 30, textAlign: "center", color: C.textMute, fontSize: 13 }}>Pick an item on the left to see and add its photos.</div>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{selRow.item}{selRow.variant ? ` · ${selRow.variant}` : ""} <span style={{ fontSize: 12.5, color: C.textMute, fontWeight: 500 }}>· {selRow.service}</span></p>
                <label className="wb-press" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: disabled || busy ? C.border : C.teal, color: "#fff", fontSize: 13, fontWeight: 600,
                  padding: "8px 14px", borderRadius: 10, cursor: disabled || busy ? "not-allowed" : "pointer" }}>
                  <Upload size={14} /> Add photos
                  <input type="file" accept="image/*" multiple disabled={disabled || !!busy} style={{ display: "none" }}
                    onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; upload(f); }} />
                </label>
              </div>
              {busy && <p style={{ fontSize: 12.5, color: C.tealDark, marginTop: 8 }}>{busy}</p>}
              <div className="flex flex-wrap" style={{ gap: 10, marginTop: 12 }}>
                {selPhotos.map((p) => <PhotoTile key={p.id} p={p} onRemove={remove} />)}
                {!selPhotos.length && <p style={{ fontSize: 13, color: C.textMute }}>No photos yet.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function PhotoTile({ p, onRemove }) {
  return (
    <div style={{ position: "relative", width: 112 }}>
      {p.image_url
        ? <img src={p.image_url} alt={p.label || "Reference"} style={{ width: 112, height: 112, objectFit: "cover", borderRadius: 12, border: `1px solid ${C.border}`, display: "block" }} />
        : <div style={{ width: 112, height: 112, borderRadius: 12, background: C.bg }} />}
      <button onClick={() => onRemove(p)} title="Remove" style={{ position: "absolute", top: 5, right: 5, width: 24, height: 24, borderRadius: 7, border: "none", background: "rgba(15,32,48,.65)", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={13} /></button>
      <p style={{ fontSize: 10.5, color: C.textMute, marginTop: 3, lineHeight: 1.3 }}>{p.source === "staff" ? `Staff · ${p.added_by_name || ""}` : "HQ"}<br />{p.label}</p>
    </div>
  );
}

/* ── What it learned by itself ──────────────────────────────────── */

function Learned({ learning, knowledge, questions, toast, onChanged }) {
  const byId = useMemo(() => new Map(knowledge.map((k) => [k.id, k])), [knowledge]);
  const billed = questions.filter((q) => q.kind === "price_to_confirm" && q.status === "auto");
  const remove = async (l) => {
    if (!confirm(`Forget that “${l.phrase.split("|")[0]}” means ${byId.get(l.knowledge_id)?.item || "this item"}?`)) return;
    try { await api.deleteAssistantLearning(l.id); toast("Forgotten"); onChanged(); }
    catch (e) { toast("Could not remove: " + e.message); }
  };
  return (
    <Card>
      <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>Learned from staff</h3>
      <p style={{ fontSize: 12.5, color: C.textMute, marginTop: 4, lineHeight: 1.55 }}>
        Every time staff tap through to an item, the assistant notes what they typed and what they picked. After 3 agreeing picks it answers those words straight away.
        Remove anything that's wrong.
      </p>
      <div style={{ marginTop: 12, border: `1px solid ${C.borderSoft}`, borderRadius: 12, maxHeight: "50vh", overflowY: "auto" }}>
        {!learning.length && <p style={{ padding: 18, fontSize: 13, color: C.textMute }}>Nothing yet. It starts learning as staff use it.</p>}
        {learning.map((l) => {
          const k = byId.get(l.knowledge_id);
          const [words, svc, aud] = l.phrase.split("|");
          return (
            <div key={l.id} className="flex items-center gap-3" style={{ padding: "9px 14px", borderBottom: `1px solid ${C.borderSoft}` }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                <b style={{ color: C.navy }}>“{words}”</b>{svc ? <span style={{ color: C.textMute }}> · {svc}</span> : null}{aud ? <span style={{ color: C.textMute }}> · {aud}</span> : null}
                <span style={{ color: C.textMute }}> → </span>{k ? `${k.item}${k.variant ? ` · ${k.variant}` : ""}` : "(item removed)"}
              </div>
              <span className="wb-ai-st" style={{ color: l.picks >= 3 ? C.green : C.textMute, background: l.picks >= 3 ? C.greenLt : C.bg }}>{l.picks} pick{l.picks === 1 ? "" : "s"}{l.picks >= 3 ? " · auto" : ""}</span>
              <button onClick={() => remove(l)} title="Forget" style={{ border: `1px solid ${C.border}`, background: "#fff", borderRadius: 9, padding: 6, cursor: "pointer", color: C.textMute, display: "inline-flex" }}><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>
      <h3 style={{ fontWeight: 700, fontSize: 15, color: C.navy, marginTop: 20 }}>Learned from bills</h3>
      <p style={{ fontSize: 12.5, color: C.textMute, marginTop: 4 }}>
        Unknown items billed at a safe price become known prices for next time. Confirm or change them in Questions → Safe-price bills. {billed.length} so far.
      </p>
    </Card>
  );
}

/* ── Knowledge editor ───────────────────────────────────────────── */

function Knowledge({ rows, toast, onChanged, profile }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("price");
  const [adding, setAdding] = useState(false);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => r.kind === kind && (!t || `${r.section} ${r.item} ${r.variant || ""} ${r.service || ""} ${r.answer || ""}`.toLowerCase().includes(t)));
  }, [rows, q, kind]);

  return (
    <Card>
      <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: 12 }}>
        <div className="flex gap-1">
          {[["price", "Prices"], ["policy", "Rules"]].map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} style={{ border: `1px solid ${kind === k ? C.teal : C.border}`, background: kind === k ? C.tealLight : "#fff",
              color: kind === k ? C.tealDark : C.textMute, fontSize: 12.5, fontWeight: 600, padding: "6px 14px", borderRadius: 99, cursor: "pointer" }}>{l}</button>
          ))}
        </div>
        <div className="flex gap-2 items-center" style={{ flex: 1, justifyContent: "flex-end", minWidth: 220 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
            <Search size={14} style={{ position: "absolute", left: 11, top: 11, color: C.textFaint }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" style={{ ...field, padding: "8px 12px 8px 32px", fontSize: 13 }} />
          </div>
          {kind === "price" && <Btn small icon={Plus} onClick={() => setAdding(true)}>Add item</Btn>}
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: C.textMute, marginBottom: 10 }}>
        {kind === "price"
          ? "Change a price and press Enter (or click away) to save. Every outlet's assistant uses the new price straight away."
          : "These are the answers the assistant gives for rules. Mark a rule as “HQ deciding” while it isn't settled."}
      </p>
      <div style={{ maxHeight: "62vh", overflowY: "auto", border: `1px solid ${C.borderSoft}`, borderRadius: 12 }}>
        {kind === "price"
          ? list.map((r) => <PriceRow key={r.id} r={r} toast={toast} onChanged={onChanged} profile={profile} />)
          : list.map((r) => <PolicyRow key={r.id} r={r} toast={toast} onChanged={onChanged} profile={profile} />)}
        {!list.length && <p style={{ padding: 20, fontSize: 13, color: C.textMute }}>No matches.</p>}
      </div>
      {adding && <AddItem onClose={() => setAdding(false)} toast={toast} onChanged={onChanged} profile={profile} />}
    </Card>
  );
}

function PriceRow({ r, toast, onChanged, profile }) {
  const [price, setPrice] = useState(r.price != null ? String(r.price) : r.price_text || "");
  const save = async (fields) => {
    try { await api.saveAssistantKnowledge({ id: r.id, ...fields, updated_by: profile?.name || "HQ" }); toast(`Saved · ${r.item}`); onChanged(); }
    catch (e) { toast("Could not save: " + e.message); }
  };
  const commit = () => {
    const v = price.trim();
    const num = /^\d+(\.\d+)?$/.test(v) ? Number(v) : null;
    if (num != null ? num === Number(r.price) : v === (r.price_text || "")) return;
    save(num != null ? { price: num, price_text: null } : { price: null, price_text: v || null });
  };
  return (
    <div className="flex items-center gap-3" style={{ padding: "9px 14px", borderBottom: `1px solid ${C.borderSoft}`, opacity: r.active !== false ? 1 : .5 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600, color: C.navy }}>
          {r.item}{r.variant ? <span style={{ color: C.textMute, fontWeight: 500 }}> · {r.variant}</span> : null}
          {r.source === "hq_answer" && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.green, background: C.greenLt, padding: "2px 6px", borderRadius: 99 }}>FROM HQ ANSWER</span>}
        </p>
        <p style={{ fontSize: 11.5, color: C.textFaint }}>{r.section}{r.service ? ` · ${r.service}` : ""} · per {r.unit || "piece"}</p>
      </div>
      <div style={{ position: "relative", width: 110 }}>
        <span style={{ position: "absolute", left: 10, top: 8, fontSize: 13, color: C.textMute }}>₹</span>
        <input value={price} onChange={(e) => setPrice(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          style={{ ...field, padding: "7px 10px 7px 22px", fontSize: 13.5, fontWeight: 700, color: C.navy }} />
      </div>
      <button onClick={() => save({ active: r.active === false })} title={r.active !== false ? "Hide from the assistant" : "Show again"}
        style={{ border: `1px solid ${C.border}`, background: "#fff", borderRadius: 9, fontSize: 11.5, fontWeight: 600, padding: "6px 9px", cursor: "pointer", color: r.active !== false ? C.textMute : C.green, whiteSpace: "nowrap" }}>
        {r.active !== false ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function PolicyRow({ r, toast, onChanged, profile }) {
  const [answer, setAnswer] = useState(r.answer || "");
  const [busy, setBusy] = useState(false);
  const save = async (fields, msg = `Saved · ${r.item}`) => {
    setBusy(true);
    try { await api.saveAssistantKnowledge({ id: r.id, ...fields, updated_by: profile?.name || "HQ" }); toast(msg); onChanged(); }
    catch (e) { toast("Could not save: " + e.message); }
    setBusy(false);
  };
  return (
    <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.borderSoft}` }}>
      <div className="flex items-center justify-between gap-2">
        <p style={{ fontSize: 13.5, fontWeight: 700, color: C.navy }}>{r.item}</p>
        <label className="flex items-center gap-2" style={{ fontSize: 12, color: r.pending ? C.amber : C.textMute, fontWeight: 600, cursor: "pointer" }}>
          <input type="checkbox" checked={!!r.pending} onChange={(e) => save({ pending: e.target.checked })} /> HQ deciding
        </label>
      </div>
      <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} style={{ ...field, marginTop: 8, fontSize: 13, lineHeight: 1.5, resize: "vertical" }} />
      <div className="flex items-center justify-between gap-2" style={{ marginTop: 6 }}>
        <p style={{ fontSize: 11.5, color: C.textFaint, flex: 1 }}>Triggered by: {(r.keywords || []).join(", ")}</p>
        {answer !== (r.answer || "") && <Btn small icon={Save} onClick={() => save({ answer })} disabled={busy}>Save</Btn>}
      </div>
    </div>
  );
}

function AddItem({ onClose, toast, onChanged, profile }) {
  const [f, setF] = useState({ item: "", variant: "", service: "Dry Clean", unit: "piece", price: "", aliases: "" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    if (!f.item.trim() || !(Number(f.price) > 0)) { toast("Give the item a name and a price."); return; }
    try {
      await api.saveAssistantKnowledge({
        kind: "price", section: "Added by HQ", service: f.service, item: f.item.trim(), variant: f.variant.trim() || null, unit: f.unit,
        price: Number(f.price), aliases: f.aliases.split(",").map((s) => s.trim()).filter(Boolean), source: "hq", sort: 950, updated_by: profile?.name || "HQ",
      });
      toast(`${f.item} added. The assistant knows it now`); onChanged(); onClose();
    } catch (e) { toast("Could not add: " + e.message); }
  };
  return (
    <Modal title="Add an item" sub="The assistant answers with this price at every outlet." onClose={onClose}>
      <div className="grid gap-3">
        <div><label style={fieldLabel}>Item *</label><input style={field} value={f.item} onChange={set("item")} placeholder="e.g. Kids gown" /></div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div><label style={fieldLabel}>Type</label><input style={field} value={f.variant} onChange={set("variant")} placeholder="e.g. Heavy" /></div>
          <div><label style={fieldLabel}>Price (₹) *</label><input style={field} value={f.price} onChange={(e) => setF((x) => ({ ...x, price: e.target.value.replace(/[^\d.]/g, "") }))} inputMode="decimal" /></div>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div><label style={fieldLabel}>Service</label><select style={field} value={f.service} onChange={set("service")}>{SERVICES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label style={fieldLabel}>Unit</label><select style={field} value={f.unit} onChange={set("unit")}>{UNITS.map((u) => <option key={u} value={u}>per {u}</option>)}</select></div>
        </div>
        <div><label style={fieldLabel}>Other names staff use (comma-separated)</label><input style={field} value={f.aliases} onChange={set("aliases")} placeholder="e.g. bacche ka gown, kids dress" /></div>
        <div className="flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn icon={Plus} onClick={save}>Add</Btn></div>
      </div>
    </Modal>
  );
}

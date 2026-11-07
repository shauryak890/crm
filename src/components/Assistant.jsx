import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, X, SendHorizonal, ShoppingCart, Copy, MessageCircleQuestion, Check, RotateCcw,
  Info, AlertTriangle, ChevronRight, Minus, Plus, Inbox, ExternalLink, Clock3, Camera, Brain, Receipt, ShieldCheck,
  ImagePlus, Webcam, ClipboardPaste,
} from "lucide-react";
import CameraCapture from "./CameraCapture";
import { C, inr, fmtDateTime, fmtDate, localIsoDate, collected, balanceDue, isCancelled, isDelivered } from "../theme";
import * as api from "../lib/api";
import { useEscape } from "./ui";
import "./assistant.css";
import { sendToBill } from "../lib/billBridge";
import {
  buildIndex, answer, answerWithService, narrow, applyPick, lineFor, toCartLine, quoteText, memoForRow, learnKey, buildLearned,
  fmtPrice, unitLabel, safeEstimate, productRows, answeredRows, SERVICE_LABEL, EXPRESS_MULTIPLIER,
} from "../lib/assistant/engine";
import {
  loadVision, visionReady, fileToImage, analyzePhoto, thumbnail, encodeEmbedding, decodeEmbedding, matchReferences, matchConfidence,
} from "../lib/assistant/vision";

const EXAMPLES = [
  "lehenga heavy kitna lagega?",
  "3 piece suit rate",
  "120 shirt 60 pant press urgent",
  "pickup ka rule kya hai?",
  "kambal double",
  "5 kg wash and fold",
];
const isKnowledgeId = (id) => /^[0-9a-f-]{36}$/i.test(String(id || ""));
const HEAVY_GRADES = ["heavy", "bridal", "designer"];
const PLAIN_GRADES = ["normal", "single", "small"];

let msgSeq = 0;
const mk = (role, data) => ({ id: ++msgSeq, role, ...data });

export default function Assistant({ open, onClose, profile, products = [], orders = [], orderItems = [], outlets = [],
  isSuperAdmin, billingOutletId, go, toast, onUnreadChange }) {
  const [tab, setTab] = useState("chat");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(null);       // null, or the status line to show
  const [knowledge, setKnowledge] = useState(null);     // rows, or null while loading
  const [kbMissing, setKbMissing] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [qMissing, setQMissing] = useState(false);
  const [refs, setRefs] = useState(null);               // reference photos [{ knowledge_id, vec }]
  const [photosMissing, setPhotosMissing] = useState(false);
  const [learnedRows, setLearnedRows] = useState([]);    // what staff picked for what they typed
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const [photoMenu, setPhotoMenu] = useState(false);  // upload / webcam chooser
  const [camOpen, setCamOpen] = useState(false);      // webcam window
  const [dragOver, setDragOver] = useState(false);
  const prevMemo = useRef(null);       // last item asked about, for follow-ups
  const pendingPhoto = useRef(null);   // a photo waiting for the staff member to name it
  const announced = useRef(new Set()); // HQ answers already shown as a pop-up
  const myId = profile?.id;

  useEscape(onClose, open && !camOpen);
  useEscape(() => setPhotoMenu(false), open && photoMenu);

  /* knowledge — loaded when the panel first opens, kept live after that */
  const loadKnowledge = useCallback(async () => {
    try {
      const rows = await api.fetchAssistantKnowledge();
      setKnowledge(rows); setKbMissing(false);
    } catch (e) {
      if (api.isMissingTable(e)) { setKbMissing(true); setKnowledge([]); }
      else { setKnowledge((k) => k || []); toast?.("Could not load the assistant's price list: " + e.message, "error"); }
    }
  }, [toast]);
  useEffect(() => { if (open && knowledge === null) loadKnowledge(); }, [open, knowledge, loadKnowledge]);
  // Self-learning: refresh what the assistant has learned each time it opens.
  useEffect(() => {
    if (!open) return;
    api.fetchAssistantLearning().then(setLearnedRows).catch(() => {});
  }, [open]);
  useEffect(() => {
    if (knowledge === null || kbMissing) return;
    let t = null, ch = null;
    try { ch = api.subscribeTable("assistant_knowledge", () => { clearTimeout(t); t = setTimeout(loadKnowledge, 800); }, `assistant-kb-${myId}`); } catch { /* realtime unavailable */ }
    return () => { clearTimeout(t); api.unsubscribe(ch); };
  }, [knowledge === null, kbMissing, loadKnowledge, myId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* questions to HQ — kept live so answers show up anywhere in the app */
  const loadQuestions = useCallback(async () => {
    try { setQuestions(await api.fetchAssistantQuestions()); setQMissing(false); }
    catch (e) { if (api.isMissingTable(e)) setQMissing(true); }
  }, []);
  useEffect(() => {
    if (!myId) return;
    loadQuestions();
    let ch = null;
    try {
      ch = api.subscribeAssistantQuestions((p) => {
        const n = p.new;
        // Live updates don't carry the old row, so remember which answers
        // were already announced (marking one "seen" is also an update).
        if (p.eventType === "UPDATE" && n?.asked_by === myId && n.status === "answered" && n.seen_by_asker === false && !announced.current.has(n.id)) {
          announced.current.add(n.id);
          toast?.(`HQ answered: "${String(n.question).slice(0, 60)}"`);
        }
        loadQuestions();
      }, `assistant-q-${myId}`);
    } catch { /* realtime unavailable */ }
    const t = setInterval(loadQuestions, 120000);
    return () => { clearInterval(t); api.unsubscribe(ch); };
  }, [myId, loadQuestions, toast]);

  const mine = useMemo(() => questions.filter((q) => q.asked_by === myId), [questions, myId]);
  const unread = mine.filter((q) => q.status === "answered" && !q.seen_by_asker).length;
  useEffect(() => { onUnreadChange?.(unread); }, [unread, onUnreadChange]);
  useEffect(() => {
    if (open && tab === "hq" && unread) {
      const ids = mine.filter((q) => q.status === "answered" && !q.seen_by_asker).map((q) => q.id);
      api.markAssistantAnswersSeen(ids).then(loadQuestions).catch(() => {});
    }
  }, [open, tab, unread, mine, loadQuestions]);

  /* engine context */
  const outletProducts = useMemo(() => {
    if (isSuperAdmin) {
      const oid = billingOutletId || outlets[0]?.id;
      return oid ? products.filter((p) => p.outlet_id === oid) : products;
    }
    return products;
  }, [products, isSuperAdmin, billingOutletId, outlets]);
  const datedItems = useMemo(() => {
    const at = new Map(orders.map((o) => [o.id, o.created_at]));
    return orderItems.map((i) => ({ ...i, created_at: at.get(i.order_id) }));
  }, [orders, orderItems]);
  const index = useMemo(() => buildIndex(knowledge || []), [knowledge]);
  // Second sources the assistant tries before saying "I don't know":
  // this outlet's counter catalogue and HQ's earlier answers.
  const fallback = useMemo(() => buildIndex([...productRows(outletProducts), ...answeredRows(questions)]), [outletProducts, questions]);
  const scopedOrders = useMemo(() => {
    const oid = isSuperAdmin ? billingOutletId : null;
    return oid ? orders.filter((o) => o.outlet_id === oid) : orders;
  }, [orders, isSuperAdmin, billingOutletId]);
  const learned = useMemo(() => buildLearned(learnedRows), [learnedRows]);
  const ctx = useMemo(() => ({ index, fallback, learned, products: outletProducts, orderItems: datedItems, orders: scopedOrders }),
    [index, fallback, learned, outletProducts, datedItems, scopedOrders]);
  const outletName = useMemo(() => {
    const oid = isSuperAdmin ? billingOutletId : profile?.outlet_id;
    return outlets.find((o) => o.id === oid)?.name?.replace(/^Patna\s*-\s*/i, "") || "";
  }, [outlets, isSuperAdmin, billingOutletId, profile]);
  const rowById = useCallback((id) => index.prices.find((r) => r.id === id), [index]);

  /* chat */
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open, tab]);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const remember = (res) => {
    if (res?.memo) prevMemo.current = res.memo;
    else if (res?.type === "answer" && res.lines?.length > 1) prevMemo.current = null;
  };
  const botSay = (data, delay = 380 + Math.random() * 320) => {
    setThinking("");
    setTimeout(() => { remember(data.res); setMessages((m) => [...m, mk("bot", data)]); setThinking(null); }, delay);
  };

  const ask = (text) => {
    const t = String(text || "").trim();
    if (!t || thinking !== null) return;
    setMessages((m) => [...m, mk("user", { text: t })]);
    setInput("");
    const res = answer(t, { ...ctx, prev: prevMemo.current });
    // A photo the assistant couldn't name: the next item typed names it.
    const photo = pendingPhoto.current && (res.type === "answer" || res.type === "clarify") ? pendingPhoto.current : null;
    if (photo) pendingPhoto.current = null;
    botSay({ res, text: t, photo });
  };

  // One vote: these words → this item. Enough agreeing votes and the
  // assistant answers straight away next time.
  const vote = (q, row) => {
    const key = learnKey(q);
    if (!key || !isKnowledgeId(row?.id)) return;
    setLearnedRows((rs) => {
      const hit = rs.find((r) => r.phrase === key && r.knowledge_id === row.id);
      return hit ? rs.map((r) => (r === hit ? { ...r, picks: r.picks + 1 } : r)) : [...rs, { phrase: key, knowledge_id: row.id, picks: 1 }];
    });
    api.learnAssistant(key, row.id).catch(() => {});
  };

  const pick = (msg, opt) => {
    if (msg.photo && pendingPhoto.current === msg.photo) pendingPhoto.current = null;
    setMessages((m) => [...m, mk("user", { text: opt.label, tap: true })]);
    if (msg.res.type === "clarify-quote") {
      botSay({ res: answerWithService(msg.text, opt.value, ctx), text: msg.text, photo: msg.photo }, 280);
      return;
    }
    const rows = applyPick(msg.res.rows, opt.dim, opt.value);
    if (!rows.length) return;
    const step = narrow(rows);
    if (!step) vote(msg.res.q, rows[0]);
    const res = step
      ? { ...msg.res, rows, step }
      : { type: "answer", lines: [lineFor(rows[0], msg.res.q || {}, ctx)], confidence: msg.res.fuzzy || msg.res.fromFallback ? "medium" : "high",
          corrections: msg.res.corrections, policyNote: msg.res.policyNote, memo: memoForRow(rows[0], msg.res.q) };
    botSay({ res, text: msg.text, photo: msg.photo }, 280);
  };

  const showRow = (msg, row) => {
    setMessages((m) => [...m, mk("user", { text: row.label, tap: true })]);
    vote(msg.res.q, row);
    botSay({ res: { type: "answer", lines: [lineFor(row, { qty: 1, garments: [] }, ctx)], confidence: "medium", memo: memoForRow(row) }, text: msg.text, photo: msg.photo }, 280);
  };

  /* ── Photos ── */
  const ensureRefs = useCallback(async () => {
    if (refs) return refs;
    try {
      const rows = await api.fetchAssistantPhotos();
      const list = rows.map((r) => ({ knowledge_id: r.knowledge_id, vec: decodeEmbedding(r.emb, r.emb_scale) })).filter((r) => r.vec);
      setRefs(list); setPhotosMissing(false);
      return list;
    } catch (e) {
      if (api.isMissingPhotos(e)) setPhotosMissing(true);
      setRefs([]);
      return [];
    }
  }, [refs]);

  const askPhoto = async (file, text = "") => {
    if (!file || thinking !== null) return;
    let opened;
    try { opened = await fileToImage(file); } catch (e) { toast?.(e.message, "error"); return; }
    const t = String(text || "").trim();
    setMessages((m) => [...m, mk("user", { text: t, image: opened.url })]);
    setInput("");
    setThinking(visionReady() ? "Looking at the photo…" : "Getting the photo reader ready (first time only, ~14 MB)…");
    try {
      await loadVision();
      setThinking("Looking at the photo…");
      const [analysis, list] = await Promise.all([analyzePhoto(opened.img), ensureRefs()]);
      const blob = await thumbnail(opened.img);
      const matches = matchReferences(analysis.embedding, list).filter((m) => rowById(m.knowledge_id)).slice(0, 4)
        .map((m) => ({ ...m, row: rowById(m.knowledge_id) }));
      const conf = matchConfidence(matches);
      const photo = { url: opened.url, blob, analysis, matches, conf };
      let res = null;
      const textRes = t ? answer(t, { ...ctx, prev: prevMemo.current }) : null;
      if (textRes && (textRes.type === "clarify" || textRes.type === "answer")) {
        // The words say what it is; the photo settles the grade if it can.
        res = textRes;
        if (res.type === "clarify" && matches.length && conf !== "low") {
          const hit = res.rows.find((r) => r.id === matches[0].knowledge_id);
          if (hit) res = { type: "answer", lines: [lineFor(hit, res.q, ctx)], confidence: conf === "high" ? "high" : "medium", memo: memoForRow(hit, res.q), fromPhoto: true };
        }
      } else if (textRes && textRes.type !== "unknown" && textRes.type !== "greet") {
        res = textRes;
      } else if (conf === "high") {
        const r = matches[0].row;
        res = { type: "answer", lines: [lineFor(r, {}, ctx)], confidence: "high", memo: memoForRow(r), fromPhoto: true };
      } else if (conf === "medium") {
        const rows = matches.filter((m) => m.sim >= matches[0].sim - 0.08).map((m) => m.row);
        res = rows.length === 1
          ? { type: "answer", lines: [lineFor(rows[0], {}, ctx)], confidence: "medium", memo: memoForRow(rows[0]), fromPhoto: true }
          : { type: "clarify", q: {}, rows, step: { dim: "id", question: "Which one is it?", options: rows.map((r) => ({ dim: "id", value: r.id, label: r.label, sub: fmtPrice(r) })) } };
      } else if (analysis.guess?.word) {
        res = answer(analysis.guess.word, ctx);
        if (res.type === "unknown" || res.type === "greet") res = null;
        // Only a rough guess: if staff type what it really is next, that
        // answer gets this photo so it can be remembered properly.
        else pendingPhoto.current = photo;
      }
      if (!res) {
        pendingPhoto.current = photo;
        res = { type: "photo-unknown" };
      }
      remember(res);
      setMessages((m) => [...m, mk("bot", { res, text: t || (res.type === "photo-unknown" ? "" : photo.matches[0]?.row?.label || analysis.guess?.word || "photo"), photo })]);
    } catch (e) {
      console.error(e);
      setMessages((m) => [...m, mk("bot", { res: { type: "photo-error", message: e.message } })]);
    }
    setThinking(null);
  };

  const teach = async (photo, row) => {
    if (!photo?.blob || !photo?.analysis || !isKnowledgeId(row?.id)) return false;
    try {
      const image_url = await api.uploadAssistantPhoto(photo.blob);
      const { emb, emb_scale } = encodeEmbedding(photo.analysis.embedding);
      await api.saveAssistantPhoto({
        knowledge_id: row.id, label: row.label, emb, emb_scale, image_url, source: "staff",
        added_by_name: profile?.name || profile?.email || "Staff",
        ...(isSuperAdmin && billingOutletId ? { outlet_id: billingOutletId } : {}),
      });
      setRefs((r) => [...(r || []), { knowledge_id: row.id, vec: photo.analysis.embedding }]);
      return true;
    } catch (e) {
      if (api.isMissingPhotos(e)) { setPhotosMissing(true); toast?.("Saving photos needs the second database update (supabase/assistant_v2.sql).", "error"); }
      else toast?.("Couldn't save the photo: " + e.message, "error");
      return false;
    }
  };

  /* ── HQ & bills ── */
  const askHQ = async ({ text, line, price, kind = "question", status }) => {
    if (qMissing) { toast?.("Ask HQ needs a one-time database update (supabase/assistant.sql).", "error"); return null; }
    const row = {
      kind,
      question: text || line?.row?.label || "Question",
      asker: profile?.name || profile?.email || "Staff",
      item: line ? line.row.item : null,
      variant: line ? line.row.variant || null : null,
      service: line ? (line.row.svcKey === "other" ? line.row.service || null : SERVICE_LABEL[line.row.svcKey]) : null,
      unit: line ? line.row.unit : null,
      qty: line ? line.qty : null,
      suggested_price: price ?? (line ? line.unitPrice : null),
      ...(status ? { status } : {}),
      ...(isSuperAdmin && billingOutletId ? { outlet_id: billingOutletId } : {}),
    };
    try {
      const q = await api.createAssistantQuestion(row);
      loadQuestions();
      return q;
    } catch (e) {
      // Before assistant_v2.sql the 'auto' status doesn't exist yet.
      if (status === "auto" && /check constraint|status/i.test(e.message)) {
        try { const q = await api.createAssistantQuestion({ ...row, status: undefined }); loadQuestions(); return { ...q, fellBack: true }; } catch { /* fall through */ }
      }
      toast?.("Could not send to HQ: " + e.message, "error");
      return null;
    }
  };

  const addToBill = (lines, extra) => {
    if (!lines.length) return;
    sendToBill(lines.map((l) => toCartLine(l, extra)));
    toast?.(lines.length > 1 ? `${lines.length} items added to the bill` : `${lines[0].row.label} added to the bill`);
    go?.("pos");
  };

  const openBill = (orderId) => { go?.("sales", { orderId }); onClose(); };
  const reset = () => { setMessages([]); setInput(""); prevMemo.current = null; pendingPhoto.current = null; };

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) askPhoto(f, input);
  };
  // On a PC: right-click a photo (e.g. in WhatsApp Web) → Copy image → Ctrl+V here.
  const imageFrom = (dt) => {
    const f = [...(dt?.files || [])].find((x) => /^image\//.test(x.type));
    if (f) return f;
    const it = [...(dt?.items || [])].find((x) => x.kind === "file" && /^image\//.test(x.type));
    return it ? it.getAsFile() : null;
  };
  const onPaste = (e) => {
    const f = imageFrom(e.clipboardData);
    if (f) { e.preventDefault(); askPhoto(f, input); }
  };
  // Drag a photo from a folder (or the desktop) onto the chat.
  const onDragOver = (e) => {
    if (tab !== "chat" || ![...(e.dataTransfer?.types || [])].includes("Files")) return;
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  };
  const onDrop = (e) => {
    setDragOver(false);
    const f = imageFrom(e.dataTransfer);
    if (f) { e.preventDefault(); askPhoto(f, input); }
  };

  return (
    <aside className={`wb-assistant${open ? " is-open" : ""}`} aria-hidden={!open} aria-label="Brighty"
      onDragOver={onDragOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }} onDrop={onDrop}>
      {dragOver && <div className="wb-ai-drop"><ImagePlus size={28} /><p>Drop the photo to check it</p></div>}
      {camOpen && <CameraCapture onCapture={(file) => { setCamOpen(false); askPhoto(file, input); }} onClose={() => setCamOpen(false)} />}
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #1D5677 100%)`, color: "#fff", padding: "16px 18px 0" }}>
        <div className="flex items-center justify-between" style={{ gap: 10 }}>
          <div className="flex items-center" style={{ gap: 10, minWidth: 0 }}>
            <div className="wb-ai-orb"><Sparkles size={17} /></div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-.01em" }}>Brighty</p>
              <p style={{ fontSize: 11.5, color: "#A9C6D6", marginTop: 1 }}>Prices, rules, photos &amp; orders, answered instantly</p>
            </div>
          </div>
          <div className="flex items-center" style={{ gap: 6 }}>
            {tab === "chat" && messages.length > 0 && (
              <button onClick={reset} title="New chat" className="wb-ai-hbtn"><RotateCcw size={15} /></button>
            )}
            <button onClick={onClose} title="Close (Esc)" className="wb-ai-hbtn"><X size={16} /></button>
          </div>
        </div>
        <div className="flex" style={{ gap: 4, marginTop: 14 }}>
          {[["chat", "Chat"], ["hq", "HQ replies"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="wb-ai-tab" data-active={tab === k}>
              {l}
              {k === "hq" && unread > 0 && <span className="wb-ai-badge">{unread}</span>}
            </button>
          ))}
        </div>
      </div>

      {tab === "chat" ? (
        <>
          <div ref={listRef} className="wb-ai-list">
            {kbMissing && (
              <div className="wb-ai-note" style={{ marginBottom: 12 }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>Using the counter catalogue for now. HQ needs to run the one-time database update (<code>supabase/assistant.sql</code>) to load the full price list and rules.</span>
              </div>
            )}
            {!messages.length && <Welcome onPick={ask} />}
            {messages.map((m) => m.role === "user"
              ? <UserBubble key={m.id} text={m.text} tap={m.tap} image={m.image} />
              : <BotMessage key={m.id} msg={m} ctx={ctx} outletName={outletName} onPick={pick} onShowRow={showRow} onAsk={ask}
                  onAskHQ={askHQ} onAddToBill={addToBill} toast={toast} qMissing={qMissing} onTeach={teach}
                  canTeach={!photosMissing} onOpenBill={openBill} />)}
            {thinking !== null && <Thinking text={thinking} />}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="wb-ai-composer" style={{ position: "relative" }}>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: "none" }} />
            {photoMenu && (
              <div className="wb-ai-photomenu" onMouseLeave={() => setPhotoMenu(false)}>
                <button type="button" onClick={() => { setPhotoMenu(false); fileRef.current?.click(); }}>
                  <ImagePlus size={16} /><span><b>Choose a photo</b><small>From this computer, or the phone's camera</small></span>
                </button>
                <button type="button" onClick={() => { setPhotoMenu(false); setCamOpen(true); }}>
                  <Webcam size={16} /><span><b>Use the webcam</b><small>Hold the garment up to the camera</small></span>
                </button>
                <div className="wb-ai-photomenu-tip">
                  <ClipboardPaste size={14} /><span>From WhatsApp Web: right-click the photo → <b>Copy image</b>, then press <b>Ctrl+V</b> in the box below. You can also drag a photo onto this panel.</span>
                </div>
              </div>
            )}
            <button type="button" className="wb-ai-cam" onClick={() => setPhotoMenu((m) => !m)} disabled={thinking !== null}
              title="Send a photo of the garment" aria-label="Send a photo" aria-expanded={photoMenu}><Camera size={18} /></button>
            <textarea ref={inputRef} rows={1} value={input} placeholder="Ask a price, rule or order… or send a photo"
              onChange={(e) => setInput(e.target.value)} onPaste={onPaste}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }} />
            <button type="submit" disabled={!input.trim() || thinking !== null} aria-label="Send" className="wb-ai-send"><SendHorizonal size={17} /></button>
          </form>
        </>
      ) : (
        <HQReplies questions={mine} missing={qMissing} onOpenBill={openBill} />
      )}
    </aside>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────── */

function Welcome({ onPick }) {
  return (
    <div className="wb-fade-in" style={{ padding: "6px 2px 4px" }}>
      <BotShell>
        <p style={{ fontSize: 14, color: C.text, lineHeight: 1.55 }}>
          Namaste, I'm Brighty! Ask me any price, rule, quote or order, the way you'd ask on WhatsApp. Hindi, Hinglish or English all work.
          You can also send a <b>photo</b> of the garment.
        </p>
        <p style={{ fontSize: 12.5, color: C.textMute, marginTop: 8 }}>Try one:</p>
        <div className="flex flex-wrap" style={{ gap: 6, marginTop: 8 }}>
          {EXAMPLES.map((e) => <button key={e} className="wb-ai-chip" onClick={() => onPick(e)}>{e}</button>)}
        </div>
      </BotShell>
    </div>
  );
}

function UserBubble({ text, tap, image }) {
  return (
    <div className="wb-ai-row wb-ai-user">
      <div className="wb-ai-bubble-user" data-tap={!!tap} style={image ? { padding: 5 } : undefined}>
        {image && <img src={image} alt="Garment" className="wb-ai-userimg" />}
        {text && <div style={image ? { padding: "6px 8px 3px" } : undefined}>{text}</div>}
      </div>
    </div>
  );
}

function BotShell({ children }) {
  return (
    <div className="wb-ai-row">
      <div className="wb-ai-avatar"><Sparkles size={13} /></div>
      <div className="wb-ai-bubble-bot">{children}</div>
    </div>
  );
}

function Thinking({ text }) {
  return (
    <div className="wb-ai-row">
      <div className="wb-ai-avatar"><Sparkles size={13} /></div>
      <div className="wb-ai-bubble-bot" style={{ padding: "12px 14px" }}>
        <span className="wb-ai-dots"><i /><i /><i /></span>
        {text && <span style={{ fontSize: 12.5, color: C.textMute, marginLeft: 10 }}>{text}</span>}
      </div>
    </div>
  );
}

const CONF = {
  high: { label: "Sure", fg: C.green, bg: C.greenLt, tip: "Straight from the price list" },
  medium: { label: "Likely", fg: C.amber, bg: C.amberLt, tip: "Best match, check the details" },
  low: { label: "Estimate", fg: C.red, bg: C.redLt, tip: "Not in the price list" },
};
function ConfPill({ level }) {
  const c = CONF[level] || CONF.medium;
  return <span title={c.tip} style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: c.fg, background: c.bg, padding: "3px 8px", borderRadius: 99, textTransform: "uppercase", whiteSpace: "nowrap" }}>{c.label}</span>;
}

function Tag({ children, tone = "teal" }) {
  const t = tone === "amber" ? { bg: C.amberLt, fg: "#9A6514" } : { bg: C.tealLight, fg: C.tealDark };
  return <span style={{ fontSize: 11.5, fontWeight: 600, color: t.fg, background: t.bg, padding: "3px 9px", borderRadius: 99 }}>{children}</span>;
}

function Corrections({ list }) {
  if (!list?.length) return null;
  return (
    <p style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 6 }}>
      Read {list.map((c, i) => <span key={i}>{i ? ", " : ""}<s>{c.from}</s> as <b style={{ color: C.textMute }}>{c.to}</b></span>)}
    </p>
  );
}

const WORK_LABEL = { heavy: "lots of fine detail / shine, looks heavy", medium: "some detail", plain: "plain, little work" };
function PhotoNote({ photo }) {
  if (!photo?.analysis) return null;
  const top = photo.matches?.[0];
  const g = photo.analysis.guess;
  return (
    <div className="wb-ai-photo">
      <Camera size={13} style={{ flexShrink: 0, marginTop: 2, color: C.tealDark }} />
      <div style={{ minWidth: 0 }}>
        {top && photo.conf !== "low"
          ? <p>Looks like <b>{top.row.label}</b>: {Math.round(top.best * 100)}% match with {top.n} saved photo{top.n === 1 ? "" : "s"}.</p>
          : g ? <p>First guess from the photo: <b>{g.word}</b> <span style={{ color: C.textFaint }}>(rough, I haven't been taught this one yet)</span>.</p>
            : <p>I haven't been taught this garment yet.</p>}
        <p style={{ color: C.textMute }}>Work: {WORK_LABEL[photo.analysis.work.level]} <span style={{ color: C.textFaint }}>(rough)</span></p>
      </div>
    </div>
  );
}

function BotMessage(props) {
  const { msg, onPick, onAsk } = props;
  const { res } = msg;
  const head = msg.photo ? <PhotoNote photo={msg.photo} /> : null;
  if (res.type === "greet") return <Welcome onPick={onAsk} />;
  if (res.type === "thanks") return <BotShell><p style={{ fontSize: 14 }}>Happy to help! Ask me anything else.</p></BotShell>;
  if (res.type === "script") {
    return <BotShell><p style={{ fontSize: 13.5, lineHeight: 1.5 }}>Please type in English letters (Hinglish), like <i>“lehenga kitna”</i>. I can't read Devanagari yet.</p></BotShell>;
  }
  if (res.type === "photo-error") {
    return <BotShell><p style={{ fontSize: 13.5, lineHeight: 1.5 }}>I couldn't read that photo{res.message ? ` (${res.message})` : ""}. Try another photo, or type the item.</p></BotShell>;
  }
  if (res.type === "photo-unknown") {
    return (
      <BotShell>
        {head}
        <p style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 8 }}>
          What is it? Type the item (e.g. <i>“lehenga heavy”</i>). I'll give you the price, and you can tap <b>Remember this photo</b> so I recognise it next time.
        </p>
      </BotShell>
    );
  }
  if (res.type === "order" || res.type === "customer") return <OrderCard res={res} onOpenBill={props.onOpenBill} />;
  if (res.type === "policy") return <PolicyCard res={res} onAsk={onAsk} onAskHQ={props.onAskHQ} text={msg.text} qMissing={props.qMissing} />;
  if (res.type === "clarify" || res.type === "clarify-quote") {
    const work = msg.photo?.analysis?.work?.level;
    const suggests = (o) => res.step.dim === "id" && o.grades && work && work !== "medium"
      && o.grades.some((g) => (work === "heavy" ? HEAVY_GRADES : PLAIN_GRADES).includes(g));
    // Learned from staff: the option people usually pick for these words.
    const picksOf = (o) => (res.usual ? applyPick(res.rows, o.dim, o.value).reduce((a, r) => a + (res.usual[r.id] || 0), 0) : 0);
    const best = res.usual ? Math.max(0, ...res.step.options.map(picksOf)) : 0;
    const usual = (o) => best >= 2 && picksOf(o) === best;
    return (
      <BotShell>
        {head}
        <Corrections list={res.corrections} />
        {res.followUp && <p style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 4 }}>Following on from your last item.</p>}
        <p style={{ fontSize: 14, fontWeight: 600, color: C.navy, marginTop: head ? 8 : 0 }}>{res.step.question}</p>
        {res.step.hint && <p style={{ fontSize: 12, color: C.textMute, marginTop: 3 }}>{res.step.hint}</p>}
        <div className="flex flex-wrap" style={{ gap: 7, marginTop: 10 }}>
          {res.step.options.map((o) => (
            <button key={`${o.dim}:${o.value}`} className="wb-ai-option" data-suggest={suggests(o) || usual(o)} onClick={() => onPick(msg, o)}>
              <span>{o.label}</span>
              {o.sub && <span className="wb-ai-option-sub">{o.sub}</span>}
              {suggests(o) && <span className="wb-ai-option-hint"><Camera size={10} /> photo suggests</span>}
              {usual(o) && <span className="wb-ai-option-hint"><Brain size={10} /> usually picked</span>}
            </button>
          ))}
        </div>
      </BotShell>
    );
  }
  if (res.type === "unknown") return <UnknownCard {...props} />;
  return <AnswerCard {...props} head={head} />;
}

function AnswerCard({ msg, ctx, outletName, onAskHQ, onAddToBill, toast, qMissing, onTeach, canTeach, head }) {
  const [lines, setLines] = useState(msg.res.lines);
  const [sent, setSent] = useState(false);
  const [taught, setTaught] = useState(null); // null | 'saving' | 'done'
  const res = msg.res;
  const single = lines.length === 1 ? lines[0] : null;
  const total = lines.reduce((a, l) => a + (l.total || 0), 0);
  const priced = lines.length > 0 && lines.every((l) => l.unitPrice != null);
  const stepper = single && single.unitPrice != null && !["bill", "month", "offer"].includes(single.row.unit);

  const setQty = (i, d) => setLines((ls) => ls.map((l, k) => {
    if (k !== i) return l;
    const isKg = l.row.unit === "kg";
    const q = isKg
      ? { ...l.q, kg: Math.max(0.5, Math.round(((Number(l.weight) || 1) + d * 0.5) * 2) / 2), qty: null }
      : { ...l.q, qty: Math.max(1, (Number(l.qty) || 1) + d) };
    return { ...lineFor(l.row, q, ctx), alternatives: l.alternatives };
  }));
  const swap = (i, rowId) => setLines((ls) => ls.map((l, k) => {
    if (k !== i) return l;
    const r = l.alternatives.find((x) => x.id === rowId);
    return r ? { ...lineFor(r, l.q, ctx), alternatives: l.alternatives } : l;
  }));
  const copy = async () => {
    const t = quoteText(lines, { outletName });
    try { await navigator.clipboard.writeText(t); toast?.("Quote copied, paste it in WhatsApp"); }
    catch { toast?.("Couldn't copy here. Select the text and copy it instead.", "error"); }
  };
  const whatsapp = () => window.open(`https://wa.me/?text=${encodeURIComponent(quoteText(lines, { outletName }))}`, "_blank", "noopener");
  const askHQ = async () => { if (await onAskHQ({ text: msg.text, line: single || lines[0] })) setSent(true); };
  const teachable = msg.photo?.analysis && single && isKnowledgeId(single.row.id) && canTeach;
  const doTeach = async () => { setTaught("saving"); setTaught((await onTeach(msg.photo, single.row)) ? "done" : null); };

  return (
    <BotShell>
      {head}
      <Corrections list={res.corrections} />
      {res.followUp && <p style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 4 }}>Following on from your last item.</p>}
      {res.learned && <p style={{ fontSize: 11.5, color: C.tealDark, marginBottom: 4 }}><Brain size={11} style={{ display: "inline", verticalAlign: -1 }} /> Learned: staff picked this {res.learned.picks} of {res.learned.total} times for these words.</p>}
      {single ? (
        <>
          <div className="flex items-start justify-between" style={{ gap: 10, marginTop: head ? 8 : 0 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: C.navy, lineHeight: 1.3 }}>{single.row.item}</p>
              <div className="flex flex-wrap" style={{ gap: 5, marginTop: 6 }}>
                {single.row.variant && <Tag>{single.row.variant}</Tag>}
                {single.row.svcKey !== "other" && <Tag>{SERVICE_LABEL[single.row.svcKey]}</Tag>}
                {single.row.audience && <Tag>{{ men: "Men", women: "Women", kids: "Kids" }[single.row.audience]}</Tag>}
                {single.urgent && <Tag tone="amber">Express ×{EXPRESS_MULTIPLIER}</Tag>}
              </div>
            </div>
            <ConfPill level={res.confidence} />
          </div>
          <div className="wb-ai-price">
            <div>
              <p style={{ fontSize: 28, fontWeight: 800, color: C.navy, letterSpacing: "-.02em", lineHeight: 1 }}>{fmtPrice(single.row)}</p>
              {stepper && (
                <p style={{ fontSize: 12, color: C.textMute, marginTop: 5 }}>
                  {single.row.unit === "kg" ? `${single.weight} kg` : `${single.qty} ×`} → <b style={{ color: C.text }}>{inr(single.total)}</b>
                  {single.urgent ? " incl. express" : ""}
                </p>
              )}
            </div>
            {stepper && (
              <div className="wb-ai-stepper">
                <button onClick={() => setQty(0, -1)} aria-label="Less"><Minus size={13} /></button>
                <span>{single.row.unit === "kg" ? `${single.weight} kg` : single.qty}</span>
                <button onClick={() => setQty(0, 1)} aria-label="More"><Plus size={13} /></button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>Quote · {lines.length} items</p>
            <ConfPill level={res.confidence} />
          </div>
          <div className="wb-ai-quote">
            {lines.map((l, i) => (
              <div key={i} className="wb-ai-qrow">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                    {l.row.unit === "kg" ? `${l.weight} kg` : `${l.qty} ×`} {l.row.item}
                  </p>
                  {l.alternatives ? (
                    <select value={l.row.id} onChange={(e) => swap(i, e.target.value)} className="wb-ai-select">
                      {l.alternatives.map((r) => <option key={r.id} value={r.id}>{r.label}{new Set(l.alternatives.map((x) => x.svcKey)).size > 1 ? ` · ${SERVICE_LABEL[r.svcKey]}` : ""} · {fmtPrice(r)}</option>)}
                    </select>
                  ) : (
                    <p style={{ fontSize: 11.5, color: C.textMute }}>{[l.row.variant, l.row.svcKey !== "other" ? SERVICE_LABEL[l.row.svcKey] : null].filter(Boolean).join(" · ")}{l.row.variant || l.row.svcKey !== "other" ? " · " : ""}{fmtPrice(l.row)}</p>
                  )}
                </div>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: C.navy, whiteSpace: "nowrap" }}>{l.total != null ? inr(l.total) : "—"}</p>
              </div>
            ))}
            <div className="wb-ai-qrow" style={{ borderBottom: "none", paddingTop: 10 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>Total{lines.some((l) => l.urgent) ? " (incl. express)" : ""}</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: C.navy }}>{inr(total)}</p>
            </div>
          </div>
          {res.assumed?.length > 0 && (
            <p style={{ fontSize: 11.5, color: C.textMute, marginTop: 6 }}>I picked the standard type where it wasn't clear. Change it in the list above.</p>
          )}
          {res.missing?.length > 0 && (
            <p style={{ fontSize: 11.5, color: C.red, marginTop: 4 }}>Not in the price list: {res.missing.join(", ")}. Ask about each one on its own.</p>
          )}
        </>
      )}

      {single && <Evidence line={single} />}
      {res.policyNote && (
        <div className="wb-ai-note" style={{ marginTop: 10 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2, color: C.amber }} />
          <span>{res.policyNote.answer}</span>
        </div>
      )}

      {teachable && (
        <div className="wb-ai-teach">
          {taught === "done"
            ? <span style={{ color: C.green, fontWeight: 600 }}><Check size={13} style={{ display: "inline", verticalAlign: -2 }} /> Saved. I'll recognise this next time.</span>
            : <>
                <span><Brain size={13} style={{ display: "inline", verticalAlign: -2 }} /> Is the photo a <b>{single.row.label}</b>?</span>
                <button className="wb-ai-action" disabled={taught === "saving"} onClick={doTeach}>{taught === "saving" ? "Saving…" : "Yes, remember this photo"}</button>
              </>}
        </div>
      )}

      <div className="flex flex-wrap" style={{ gap: 6, marginTop: 12 }}>
        {priced && <button className="wb-ai-action primary" onClick={() => {
          onAddToBill(lines);
          // Billing it is confirmation enough: remember the photo for next time.
          if (teachable && taught === null) doTeach();
        }}><ShoppingCart size={14} /> Add to bill</button>}
        {priced && <button className="wb-ai-action" onClick={copy}><Copy size={14} /> Copy quote</button>}
        {priced && <button className="wb-ai-action" onClick={whatsapp}><ExternalLink size={14} /> WhatsApp</button>}
        {!qMissing && (sent
          ? <span className="wb-ai-action" style={{ cursor: "default", color: C.green }}><Check size={14} /> Sent to HQ</span>
          : <button className="wb-ai-action" onClick={askHQ}><MessageCircleQuestion size={14} /> Ask HQ</button>)}
      </div>
    </BotShell>
  );
}

function Evidence({ line }) {
  const r = line.row;
  const items = [];
  const src = { hq_answer: "HQ's answer", hq: "Added by HQ", crm: "Counter catalogue", hq_reply: `HQ answered this${r.answered_at ? ` on ${fmtDate(r.answered_at)}` : ""}`,
    billed_before: `Billed before${r.answered_at ? ` on ${fmtDate(r.answered_at)}` : ""}` }[r.source] || "Price list (Nov 2026)";
  items.push({ k: src, v: fmtPrice(r) });
  if (line.product && r.source !== "crm") {
    const differs = r.price != null && Number(line.product.price) !== Number(r.price);
    items.push({
      k: "Billing software",
      v: `${line.product.name} · ${inr(line.product.price)}${line.product.unit === "kg" ? unitLabel("kg") : ""}`,
      warn: differs ? `The counter still has ${inr(line.product.price)}. It'll be updated to the price list.` : null,
    });
  }
  if (line.past) items.push({ k: "Past bills", v: `${line.past.count} in the last 90 days, usually ${inr(line.past.usual)}` });
  return (
    <div className="wb-ai-evidence">
      <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", color: C.textFaint, marginBottom: 4 }}>WHERE THIS COMES FROM</p>
      {items.map((it) => (
        <div key={it.k} style={{ padding: "4px 0" }}>
          <div className="flex justify-between" style={{ gap: 10, fontSize: 12.5 }}>
            <span style={{ color: C.textMute }}>{it.k}</span>
            <span style={{ color: C.text, fontWeight: 600, textAlign: "right" }}>{it.v}</span>
          </div>
          {it.warn && <p style={{ fontSize: 11.5, color: "#9A6514", marginTop: 2 }}>{it.warn}</p>}
        </div>
      ))}
      {r.note && <p style={{ fontSize: 12, color: C.textMute, marginTop: 4 }}><Info size={12} style={{ display: "inline", verticalAlign: -2 }} /> {r.note}</p>}
    </div>
  );
}

function PolicyCard({ res, onAsk, onAskHQ, text, qMissing }) {
  const [sent, setSent] = useState(false);
  const p = res.policy;
  return (
    <BotShell>
      <div className="flex items-start justify-between" style={{ gap: 10 }}>
        <p style={{ fontSize: 14.5, fontWeight: 700, color: C.navy }}>{p.item}</p>
        {p.pending ? <span style={{ fontSize: 10.5, fontWeight: 700, color: C.amber, background: C.amberLt, padding: "3px 8px", borderRadius: 99, whiteSpace: "nowrap" }}>HQ DECIDING</span> : <ConfPill level="high" />}
      </div>
      <p style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55, marginTop: 6, whiteSpace: "pre-wrap" }}>{p.answer}</p>
      {res.also?.length > 0 && (
        <div className="flex flex-wrap" style={{ gap: 6, marginTop: 10 }}>
          <span style={{ fontSize: 11.5, color: C.textFaint, alignSelf: "center" }}>Related:</span>
          {res.also.map((a) => <button key={a.id} className="wb-ai-chip" onClick={() => onAsk(a.kws[0] || a.item)}>{a.item}</button>)}
        </div>
      )}
      {p.pending && !qMissing && (
        <div style={{ marginTop: 10 }}>
          {sent
            ? <span className="wb-ai-action" style={{ cursor: "default", color: C.green }}><Check size={14} /> Sent to HQ</span>
            : <button className="wb-ai-action" onClick={async () => { if (await onAskHQ({ text })) setSent(true); }}><MessageCircleQuestion size={14} /> Ask HQ about this case</button>}
        </div>
      )}
    </BotShell>
  );
}

const STATUS_TONE = (o) => {
  if (isCancelled(o)) return { label: "Cancelled", fg: C.textMute, bg: C.bg };
  if (isDelivered(o)) return { label: "Delivered", fg: C.green, bg: C.greenLt };
  const overdue = o.due_date && o.due_date < localIsoDate();
  return overdue ? { label: `${o.order_status || "Open"} · overdue`, fg: C.red, bg: C.redLt } : { label: o.order_status || "Open", fg: C.tealDark, bg: C.tealLight };
};

function OrderCard({ res, onOpenBill }) {
  const list = res.orders || [];
  const due = list.filter((o) => !isCancelled(o)).reduce((a, o) => a + balanceDue(o), 0);
  return (
    <BotShell>
      {res.type === "customer" ? (
        <>
          <p style={{ fontSize: 14.5, fontWeight: 700, color: C.navy }}>{list[0]?.customer_name || "Customer"} · {res.phone}</p>
          <p style={{ fontSize: 12.5, color: C.textMute, marginTop: 2 }}>
            {list.length ? `${list.length} order${list.length === 1 ? "" : "s"} at this outlet${due > 0 ? ` · ${inr(due)} to collect` : " · nothing owed"}` : "No orders with this number at this outlet yet. New customer: 25% off the first order."}
          </p>
        </>
      ) : !list.length ? (
        <p style={{ fontSize: 13.5 }}>I can't find order <b>#{res.ref}</b> at this outlet. Check the number on the receipt.</p>
      ) : null}
      <div className="flex flex-col" style={{ gap: 8, marginTop: list.length && res.type === "customer" ? 10 : 0 }}>
        {list.slice(0, 4).map((o) => {
          const st = STATUS_TONE(o);
          const bal = balanceDue(o);
          return (
            <div key={o.id} className="wb-ai-order">
              <div className="flex items-center justify-between" style={{ gap: 8 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.navy }}><Receipt size={13} style={{ display: "inline", verticalAlign: -2 }} /> #{o.order_label || o.order_no}</p>
                <span className="wb-ai-st" style={{ color: st.fg, background: st.bg }}>{st.label}</span>
              </div>
              {res.type === "order" && <p style={{ fontSize: 12.5, color: C.textMute, marginTop: 3 }}>{o.customer_name}</p>}
              <div className="flex flex-wrap justify-between" style={{ gap: 6, fontSize: 12.5, marginTop: 6 }}>
                <span>Due <b>{fmtDate(o.due_date)}</b></span>
                <span>Bill <b>{inr(o.total)}</b></span>
                <span style={{ color: bal > 0 ? C.red : C.green }}>{bal > 0 ? <>To collect <b>{inr(bal)}</b></> : <>Paid <b>{inr(collected(o))}</b></>}</span>
              </div>
              <button className="wb-ai-action" style={{ marginTop: 8 }} onClick={() => onOpenBill(o.id)}>Open bill <ChevronRight size={13} /></button>
            </div>
          );
        })}
      </div>
    </BotShell>
  );
}

function UnknownCard({ msg, onShowRow, onAskHQ, onAddToBill, qMissing }) {
  const res = msg.res;
  const tiers = res.tiers || [];
  const nearestTop = safeEstimate(res.suggestions);
  const [tier, setTier] = useState(null);
  const [price, setPrice] = useState(nearestTop ? String(nearestTop) : "");
  const [name, setName] = useState(() => (res.words || []).join(" ").replace(/^\w/, (c) => c.toUpperCase()));
  const [state, setState] = useState(null); // 'asked' | 'billed' | 'billed-auto' | 'busy'
  const what = (res.words || []).join(" ");
  const p = Number(price);
  // The price is "safe" when it's at least the top of the size picked (or
  // of the closest items) — then HQ only gets a note, nobody waits.
  const safeAt = tier?.safe ?? nearestTop;
  const isSafe = safeAt != null && p >= safeAt;

  const pickTier = (t) => { setTier(t); setPrice(String(t.safe)); };
  const bill = async () => {
    if (!(p > 0) || !name.trim()) return;
    setState("busy");
    const svcKey = tier?.svc || res.suggestions?.[0]?.svcKey || "dryclean";
    const line = { row: { item: name.trim(), variant: tier ? `${tier.label} size` : null, unit: "piece", svcKey, label: name.trim() }, qty: 1, unitPrice: p, urgent: false };
    if (qMissing) { onAddToBill([line]); setState("billed"); return; }
    const q = await onAskHQ({ text: msg.text, line, price: p, kind: "price_to_confirm", status: isSafe ? "auto" : undefined });
    if (!q) { setState(null); return; }
    const auto = isSafe && !q.fellBack;
    onAddToBill([line], { qid: q.id, ptc: !auto });
    setState(auto ? "billed-auto" : "billed");
  };

  return (
    <BotShell>
      <p style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>
        {what ? <>I don't have <b>“{what}”</b> in the price list or the counter catalogue yet.</> : <>I didn't catch an item there. Try the garment name, e.g. <i>“saree heavy”</i>.</>}
      </p>
      {res.suggestions?.length > 0 && (
        <>
          <p style={{ fontSize: 12.5, color: C.textMute, marginTop: 8 }}>Closest items:</p>
          <div className="flex flex-wrap" style={{ gap: 7, marginTop: 7 }}>
            {res.suggestions.map((r) => (
              <button key={r.id} className="wb-ai-option" onClick={() => onShowRow(msg, r)}>
                <span>{r.label}</span><span className="wb-ai-option-sub">{fmtPrice(r)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {what && (
        <div className="wb-ai-ptc">
          <p style={{ fontSize: 12.5, fontWeight: 700, color: C.navy }}>Bill it now: no need to wait for HQ</p>
          {tiers.length > 0 && (
            <>
              <p style={{ fontSize: 12, color: C.textMute, marginTop: 2 }}>How big is it? ({SERVICE_LABEL[tiers[0].svc] || "Dry Clean"} prices)</p>
              <div className="flex flex-wrap" style={{ gap: 6, marginTop: 6 }}>
                {tiers.map((t) => (
                  <button key={t.key} className="wb-ai-option" data-active={tier?.key === t.key} onClick={() => pickTier(t)} title={t.eg}>
                    <span>{t.label}</span><span className="wb-ai-option-sub">₹{t.lo}–{t.hi}</span>
                  </button>
                ))}
              </div>
              {tier && <p style={{ fontSize: 11.5, color: C.textFaint, marginTop: 4 }}>{tier.label}: {tier.eg}.</p>}
            </>
          )}
          {state === "billed" || state === "billed-auto" ? (
            <p style={{ fontSize: 12.5, color: C.green, fontWeight: 600, marginTop: 8 }}>
              <Check size={13} style={{ display: "inline", verticalAlign: -2 }} />{" "}
              {qMissing ? "Added to the bill." : state === "billed-auto" ? "Added to the bill at the safe price. HQ gets a note; nobody needs to wait." : "Added to the bill. HQ will confirm the price before pickup."}
            </p>
          ) : (
            <>
              <div className="flex" style={{ gap: 6, marginTop: 8 }}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" className="wb-ai-input" style={{ flex: 1.4 }} />
                <div style={{ position: "relative", flex: 1 }}>
                  <span style={{ position: "absolute", left: 10, top: 8, fontSize: 13, color: C.textMute }}>₹</span>
                  <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="Price" className="wb-ai-input" style={{ paddingLeft: 22, width: "100%" }} />
                </div>
              </div>
              {p > 0 && safeAt != null && !qMissing && (
                <p style={{ fontSize: 11.5, marginTop: 5, color: isSafe ? C.green : "#9A6514" }}>
                  {isSafe
                    ? <><ShieldCheck size={12} style={{ display: "inline", verticalAlign: -2 }} /> Safe price (at the top of the range): billed straight away, HQ just gets a note.</>
                    : <>Below the safe price of {inr(safeAt)}: HQ will check it before pickup.</>}
                </p>
              )}
              <div className="flex flex-wrap" style={{ gap: 6, marginTop: 8 }}>
                <button className="wb-ai-action primary" disabled={!(p > 0) || !name.trim() || state === "busy"} onClick={bill}>
                  <ShoppingCart size={14} /> {qMissing || isSafe ? "Add to bill" : "Bill · price to confirm"}
                </button>
                {!qMissing && (state === "asked"
                  ? <span className="wb-ai-action" style={{ cursor: "default", color: C.green }}><Check size={14} /> Sent to HQ</span>
                  : <button className="wb-ai-action" onClick={async () => { if (await onAskHQ({ text: msg.text, price: p || null })) setState("asked"); }}><MessageCircleQuestion size={14} /> Just ask HQ</button>)}
              </div>
            </>
          )}
        </div>
      )}
    </BotShell>
  );
}

function HQReplies({ questions, missing, onOpenBill }) {
  if (missing) {
    return <div className="wb-ai-list"><div className="wb-ai-note"><Info size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span>Ask HQ needs a one-time database update (<code>supabase/assistant.sql</code>).</span></div></div>;
  }
  if (!questions.length) {
    return (
      <div className="wb-ai-list" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: C.textMute, maxWidth: 260 }}>
          <Inbox size={28} style={{ margin: "0 auto 10px", color: C.textFaint }} />
          <p style={{ fontSize: 13.5, fontWeight: 600, color: C.navy }}>Nothing sent to HQ yet</p>
          <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>When you tap “Ask HQ” or bill a “price to confirm” item, HQ's answer appears here.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="wb-ai-list">
      {questions.map((q) => {
        const changed = q.status === "answered" && q.answer_price != null && q.suggested_price != null && Number(q.answer_price) !== Number(q.suggested_price);
        return (
          <div key={q.id} className="wb-ai-reply" data-new={q.status === "answered" && !q.seen_by_asker}>
            <div className="flex items-center justify-between" style={{ gap: 8 }}>
              <span style={{ fontSize: 11, color: C.textFaint }}>{fmtDateTime(q.created_at)}{q.kind === "price_to_confirm" ? " · billed" : ""}</span>
              {q.status === "open" && <span className="wb-ai-st" style={{ color: C.amber, background: C.amberLt }}><Clock3 size={11} /> Waiting</span>}
              {q.status === "auto" && <span className="wb-ai-st" style={{ color: C.tealDark, background: C.tealLight }}><ShieldCheck size={11} /> Safe price</span>}
              {q.status === "answered" && <span className="wb-ai-st" style={{ color: C.green, background: C.greenLt }}><Check size={11} /> Answered</span>}
              {q.status === "dismissed" && <span className="wb-ai-st" style={{ color: C.textMute, background: C.bg }}>Closed</span>}
            </div>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: C.navy, marginTop: 5 }}>“{q.question}”</p>
            {q.suggested_price != null && <p style={{ fontSize: 12, color: C.textMute, marginTop: 2 }}>{q.item ? `${q.item}${q.variant ? ` (${q.variant})` : ""} · ` : ""}{q.kind === "price_to_confirm" ? "billed at" : "suggested"} {inr(q.suggested_price)}</p>}
            {q.status === "answered" && (
              <div style={{ marginTop: 8, background: C.greenLt, borderRadius: 10, padding: "8px 10px" }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: ".04em" }}>HQ{q.answered_by ? ` · ${q.answered_by}` : ""}</p>
                {q.answer_price != null && <p style={{ fontSize: 17, fontWeight: 800, color: C.navy, marginTop: 2 }}>{inr(q.answer_price)}</p>}
                {q.answer && <p style={{ fontSize: 13, color: C.text, marginTop: 2, whiteSpace: "pre-wrap" }}>{q.answer}</p>}
              </div>
            )}
            {q.order_id && (
              <div className="flex items-center justify-between" style={{ marginTop: 8, gap: 8 }}>
                <p style={{ fontSize: 12, color: changed ? C.red : C.textMute, fontWeight: changed ? 600 : 400 }}>
                  {changed ? `Update bill #${q.order_label}: ${inr(q.suggested_price)} → ${inr(q.answer_price)}` : `On bill #${q.order_label}`}
                </p>
                <button className="wb-ai-action" onClick={() => onOpenBill(q.order_id)}>Open bill <ChevronRight size={13} /></button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

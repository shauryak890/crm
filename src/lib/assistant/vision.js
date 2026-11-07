// Photo understanding for Brighty — runs entirely in the browser
// (no outside AI service, no photo leaves the device for analysis).
//
//  • A small image model (MobileNet v2, served from /models) turns a photo
//    into a "fingerprint" of 1280 numbers. Photos of the same kind of
//    garment have similar fingerprints, so the assistant compares a new
//    photo with reference photos HQ (or staff) have labelled — and gets
//    better with every photo it's taught.
//  • The same model's general labels ("suit", "jersey", "kimono"…) give a
//    rough first guess before any reference photos exist.
//  • A detail/shine measure gives a rough work level (plain vs heavy).

const MODEL_URL = "/models/mobilenet_v2/model.json";
let loading = null;

export function loadVision() {
  if (!loading) {
    loading = (async () => {
      const tf = await import("@tensorflow/tfjs");
      const mobilenet = await import("@tensorflow-models/mobilenet");
      try { await tf.setBackend("webgl"); } catch { /* fall back below */ }
      await tf.ready().catch(async () => { await tf.setBackend("cpu"); await tf.ready(); });
      const model = await mobilenet.load({ version: 2, alpha: 1.0, modelUrl: MODEL_URL, inputRange: [0, 1] });
      return { tf, model };
    })();
    loading.catch(() => { loading = null; });
  }
  return loading;
}
export const visionReady = () => !!loading;

/* ── Image helpers ───────────────────────────────────────────────── */

export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type || "")) { reject(new Error("That isn't a photo.")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't open that photo.")); };
    img.src = url;
  });
}

// Fit the whole photo into a square (white padding) so nothing is cropped.
function squareCanvas(img, size) {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#fff";
  g.fillRect(0, 0, size, size);
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = Math.min(size / w, size / h);
  g.drawImage(img, (size - w * s) / 2, (size - h * s) / 2, w * s, h * s);
  return c;
}

// A small JPEG for storing as a reference photo.
export function thumbnail(img, max = 360) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", 0.8));
}

/* ── Fingerprints ────────────────────────────────────────────────── */

function l2normalize(v) {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

// Store a fingerprint compactly: 1 byte per number (+ one scale).
export function encodeEmbedding(vec) {
  let max = 0;
  for (const x of vec) max = Math.max(max, Math.abs(x));
  const scale = max / 127 || 1;
  const bytes = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) bytes[i] = Math.max(-127, Math.min(127, Math.round(vec[i] / scale)));
  let bin = "";
  const u = new Uint8Array(bytes.buffer);
  for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
  return { emb: btoa(bin), emb_scale: scale };
}

export function decodeEmbedding(b64, scale = 1) {
  try {
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const bytes = new Int8Array(u.buffer);
    const v = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) v[i] = bytes[i] * scale;
    return l2normalize(v);
  } catch { return null; }
}

const cosine = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/* ── Work level (plain vs heavy) ─────────────────────────────────── */

// Embroidery, zari and stone work show up as lots of fine edges and small
// bright sparkles. Measured on the middle of the photo (less background).
export function workLevel(canvas) {
  const size = canvas.width;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const m = Math.round(size * 0.15), w = size - 2 * m;
  const { data } = g.getImageData(m, m, w, w);
  const lum = new Float32Array(w * w);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) lum[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  let edges = 0, sparkle = 0, n = 0, flat = 0;
  for (let y = 1; y < w - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] + lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1];
      const gy = -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] + lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      const mag = Math.sqrt(gx * gx + gy * gy);
      n++;
      if (mag > 140) edges++;
      if (mag < 20) flat++;
      if (lum[i] > 215) {
        const around = (lum[i - 1] + lum[i + 1] + lum[i - w] + lum[i + w]) / 4;
        if (lum[i] - around > 22) sparkle++;
      }
    }
  }
  const detail = edges / n, shine = sparkle / n, plain = flat / n;
  const score = Math.min(1, detail * 3.2 + shine * 60);
  const level = score >= 0.55 ? "heavy" : score <= 0.22 && plain > 0.55 ? "plain" : "medium";
  return { level, score: Math.round(score * 100) / 100, detail: Math.round(detail * 1000) / 1000, shine: Math.round(shine * 10000) / 10000 };
}

/* ── General labels → price-list words (rough first guess) ───────── */

const IMAGENET_MAP = [
  [/jersey|t-shirt|tee shirt/, "tshirt"], [/sweatshirt|cardigan/, "sweater"], [/^suit|suit of clothes/, "suit"],
  [/trench coat|fur coat/, "coat"], [/lab coat/, "apron"], [/abaya/, "burqa"], [/kimono|hoopskirt|overskirt|vestment|academic gown/, "gown"],
  [/miniskirt/, "skirt"], [/\bjean\b|blue jean|denim/, "jeans"], [/pajama|pyjama/, "pajama"], [/sarong/, "lungi"],
  [/\bstole\b|feather boa/, "muffler"], [/windsor tie|bow tie/, "tie"], [/running shoe|loafer|cowboy boot/, "shoes"], [/\bclog\b/, "crocs"],
  [/backpack/, "bag"], [/purse|wallet/, "handbag"], [/mailbag/, "bag"], [/quilt|comforter/, "razai"], [/pillow/, "pillow"],
  [/shower curtain|window shade|theater curtain/, "curtain"], [/bath towel/, "towel"], [/umbrella/, "umbrella"], [/teddy/, "toy"],
  [/\bapron\b/, "apron"], [/military uniform/, "uniform"], [/poncho|cloak/, "shawl"], [/crash helmet|football helmet/, "helmet"],
  [/studio couch|day bed/, "sofa"], [/prayer rug|doormat/, "carpet"], [/bulletproof vest/, "waistcoat"],
  [/cowboy hat|sombrero|bonnet/, "cap"], [/sleeping bag/, "blanket"], [/\bwool\b/, "sweater"], [/sandal/, "sandal"],
];
export function guessWord(classes = []) {
  for (const c of classes) {
    if (c.probability < 0.08) continue;
    const name = String(c.className || "").toLowerCase();
    const hit = IMAGENET_MAP.find(([re]) => re.test(name));
    if (hit) return { word: hit[1], from: name.split(",")[0], p: c.probability };
  }
  return null;
}

/* ── Analysis ────────────────────────────────────────────────────── */

export async function analyzePhoto(img) {
  const { tf, model } = await loadVision();
  const canvas = squareCanvas(img, 224);
  const emb = tf.tidy(() => model.infer(canvas, true));
  const raw = await emb.data();
  emb.dispose();
  const classes = await model.classify(canvas, 5);
  return { embedding: l2normalize(raw), classes, guess: guessWord(classes), work: workLevel(canvas) };
}

// Compare with reference photos. refs: [{ knowledge_id, vec }]
// Returns one entry per item, best first: { knowledge_id, sim, n }.
export function matchReferences(embedding, refs = []) {
  const by = new Map();
  for (const r of refs) {
    if (!r.vec) continue;
    const s = cosine(embedding, r.vec);
    const cur = by.get(r.knowledge_id) || { knowledge_id: r.knowledge_id, sims: [], n: 0 };
    cur.sims.push(s); cur.n++;
    by.set(r.knowledge_id, cur);
  }
  // Score = best match, nudged up when several of the item's photos agree.
  return [...by.values()].map((x) => {
    const top = x.sims.sort((a, b) => b - a);
    const second = top[1] ?? top[0];
    return { knowledge_id: x.knowledge_id, sim: top[0] * 0.75 + second * 0.25, best: top[0], n: x.n };
  }).sort((a, b) => b.sim - a.sim);
}

// How sure to be about the top match.
export function matchConfidence(matches) {
  const [a, b] = matches;
  if (!a) return "none";
  const margin = a.sim - (b?.sim ?? 0);
  if (a.sim >= 0.82 && margin >= 0.04) return "high";
  if (a.sim >= 0.72) return "medium";
  return "low";
}

// How staff actually type: Hindi, Hinglish and English, with spelling
// mistakes. Everything here maps what they write onto the words used in
// the price list, so "lehnga bhari kitna" reads as "lehenga heavy price".

// Canonical word → the ways people write it.
const SYNONYMS = {
  // garments
  lehenga: ["lehnga", "lahenga", "lengha", "lahnga", "lehanga", "lehenge", "ghagra", "ghaghra", "lehngha"],
  saree: ["sari", "saari", "sadi", "saaree", "sarees", "saris", "sarree"],
  shirt: ["shirts", "shrt", "sirt", "shart", "sharts", "kamiz"],
  tshirt: ["t-shirt", "tshirts", "t-shirts", "tee", "tees", "teeshirt", "tshrt"],
  trouser: ["trousers", "trouzer", "patloon", "patlun", "paint", "pant", "pants", "pent", "pents"],
  jeans: ["jean", "jeens", "jins", "denim"],
  kurta: ["kurtas", "kurte", "kurtaa", "kurtha"],
  kurti: ["kurtis", "kurtee", "kurthi"],
  pajama: ["pyjama", "payjama", "pyjma", "paijama", "paijama", "pajamas", "pyjamas", "paisama", "pajma", "payjaama"],
  salwar: ["shalwar", "salvar", "selwar"],
  suit: ["suits", "soot", "sut", "coat pant", "kot pant", "coat pent", "kot pent", "pant coat", "pant kot", "coat paint"],
  dupatta: ["dupata", "duppata", "chunni", "chunri", "chunari", "odhni", "orhni", "dupatte"],
  blouse: ["blause", "blouz", "blaus", "blouses"],
  gown: ["gowns", "gaun", "goun", "maxi", "nighty", "naiti"],
  anarkali: ["anarkalli", "anarkli"],
  sherwani: ["serwani", "sherwaani", "shervani", "sherwni"],
  waistcoat: ["waist coat", "vest coat", "koti", "jacket bandi"],
  bandi: ["baandi", "bundi", "dandi"],
  blazer: ["blazers", "blezer", "blejar"],
  coat: ["kot", "coats", "kote"],
  jacket: ["jackets", "jaket", "jakit", "jacet", "jeket", "jackit"],
  sweater: ["sweter", "swetar", "swater", "sweatshirt", "pullover", "cardigan", "jersey", "jarsi"],
  shawl: ["shaal", "shal", "shawls", "loi", "chadar shawl"],
  muffler: ["mufler", "scarf", "stole"],
  blanket: ["kambal", "kambel", "blankets", "blanket", "kammal"],
  razai: ["rajai", "rajaai", "razaai", "quilt", "comforter"],
  bedsheet: ["chadar", "chaddar", "chaadar", "bed sheet", "bedsheets", "bedcover", "bed cover"],
  curtain: ["parda", "parde", "pardah", "curtains", "pardaa"],
  pillow: ["takiya", "takia", "pillows", "cushion"],
  carpet: ["kalin", "kaleen", "qaleen", "dari", "durrie", "rug", "carpets"],
  towel: ["tauliya", "tolia", "towels", "taulia", "talia", "toliya", "tauliye", "tawal", "gamcha", "gamchha", "angocha"],
  shoes: ["shoe", "joota", "joote", "jute", "juta", "jootey", "sneakers", "sneaker"],
  sandal: ["chappal", "chappals", "sandals", "slipper"],
  heels: ["heel", "sandal heels"],
  bag: ["bags", "bagg", "thaila", "jhola"],
  handbag: ["purse", "handbags", "hand bag"],
  cap: ["topi", "caps", "hat"],
  tie: ["tai", "ties"],
  frock: ["frok", "frocks", "dress frock", "farak", "frak"],
  dress: ["dresses", "dres"],
  top: ["tops"],
  skirt: ["scurt", "skirts", "lehnga skirt"],
  petticoat: ["peticot", "petikot", "petticot", "saya"],
  ganji: ["baniyan", "banyan", "baniyaan", "vest", "inner", "banian"],
  dhoti: ["dhotis", "dhoti"],
  lungi: ["lungee"],
  kameez: ["kamiz", "kameej", "kamij"],
  palazzo: ["plazo", "palazo", "plazzo", "palazzos"],
  leggings: ["legging", "leggins", "jeggings"],
  burqa: ["burka", "burkha", "abaya", "bukha"],
  uniform: ["uniforms", "school dress"],
  sofa: ["sofa cover", "sofas"],
  toy: ["toys", "teddy", "soft toy", "khilona"],
  apron: ["lab coat", "labcoat"],
  umbrella: ["chhata", "chhatri", "chata"],
  bathrobe: ["bath robe", "robe"],
  // grades / types
  heavy: ["bhari", "bhaari", "heavey", "hevy", "zari", "stone", "work", "kaam", "kadhai", "embroidered", "sequin"],
  normal: ["plain", "simple", "sada", "saada", "sadha", "light", "halka", "halki", "regular", "basic", "normal"],
  designer: ["designer", "desiner", "fancy"],
  bridal: ["dulhan", "shaadi", "shadi", "wedding", "bridal"],
  silk: ["resham", "reshmi", "silky"],
  woollen: ["wool", "woolen", "woolien", "ooni", "uni", "garam", "winter"],
  single: ["ek wala", "singal"],
  double: ["dabal", "dubble", "dbl"],
  small: ["chota", "chhota", "choti", "chhoti", "sm"],
  large: ["bada", "badi", "big", "lg"],
  leather: ["chamda", "chamde", "lether", "leathar"],
  // services
  dryclean: ["dry clean", "dryclean", "dry cleaning", "drycleaning", "dc", "dry laundry", "drycln", "dryclening"],
  press: ["steam press", "steampress", "iron", "ironing", "istri", "istree", "isteri", "estri", "press karna", "pres"],
  polish: ["polis", "polishing", "palish"],
  starch: ["starching", "kalaf", "kalf", "maad", "maaf", "kalap"],
  washiron: ["wash and iron", "wash & iron", "wash iron", "washiron", "dhulai press", "dhona press"],
  laundry: ["kg wash", "dhulai", "dhona", "wash", "laundry"],
  fold: ["wash fold", "wash and fold", "wash & fold", "washfold", "wash n fold"],
  // audience
  kids: ["kid", "baccha", "bacche", "bachcha", "bachche", "bacha", "child", "children", "bachon", "bachho"],
  baby: ["babies", "infant", "newborn", "navjaat"],
  women: ["ladies", "lady", "womens", "woman", "female", "mahila", "aurat", "girls", "ladis"],
  men: ["gents", "mens", "man", "male", "boys", "gent"],
  // modifiers
  urgent: ["express", "jaldi", "urgent", "aaj hi", "turant", "fast", "asap"],
};

// Words that carry no meaning for a price lookup.
const STOP = new Set(`rate rates kitna kitne kitni kitnaa price prices cost costs charge charges daam dam lagega lagegi lagta lagti lag hai hain h ka ki ke ko se me mein mai main mujhe hume humein
  kya kia bata batao batado batana btao bolo please pls plz sir ji customer cust wala wali wale ek a an the of for is are what how much and aur or ya bhi to toh ye yeh woh wo
  kar karna karne karo krna hoga hogi chahiye chaiye want need needs needed please. tell me you u ur your our hamara apna pe par per pc pcs piece pieces item items
  gaya gayi gaye gye raha rahi rahe tha thi the karte karta karti karenge karega karwana karwani karna hota hoti hote ho sakte sakta sakti milega milegi milenge din kab kaun kaunsa kon konsa rule rules
  dete deti dega degi diya liya lete leti chal chalega theek thik sahi accha acha haan nahi nhi mat bhai bhaiya didi madam mam
  sabse sasta sasti saste mehnga mehngi cheapest cheap costly total sleeve sleeves half full aadha poora wale ho jayega jayegi bolo boliye dijiye dedo dena
  ok okay hello hi hey namaste order orders kapde kapda kapdo kapdon clothes cloth garment garments wash-karna dena lena hoga clean cleaning saaf`.split(/\s+/));

const HINDI_NUM = { ek: 1, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, saat: 7, sat: 7, aath: 8, ath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, pandrah: 15, bees: 20, tees: 30, chalis: 40, pachas: 50, sau: 100,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, dozen: 12, darjan: 12 };

/* ── Devanagari → Roman ──────────────────────────────────────────────
   Staff who type (or dictate) in Hindi script get the same answers. Common
   words map straight to how they're written in Hinglish; anything else is
   transliterated letter by letter, and the sound-alike matcher below takes
   care of the vowels it gets slightly wrong. */
const DEV_WORDS = {
  "रेट": "rate", "दाम": "daam", "कीमत": "price", "प्राइस": "price", "चार्ज": "charge", "कितना": "kitna", "कितने": "kitne", "कितनी": "kitni",
  "का": "ka", "की": "ki", "के": "ke", "को": "ko", "है": "hai", "हैं": "hain", "में": "me", "से": "se", "और": "aur", "या": "ya", "क्या": "kya",
  "लगेगा": "lagega", "लगेगी": "lagegi", "बताओ": "batao", "बताइए": "batao", "चाहिए": "chahiye", "होगा": "hoga", "कब": "kab", "कैसे": "kaise", "कहाँ": "kahan", "कहां": "kahan",
  "ड्राई": "dry", "क्लीन": "clean", "ड्राईक्लीन": "dryclean", "स्टीम": "steam", "प्रेस": "press", "इस्त्री": "istri", "आयरन": "iron", "पॉलिश": "polish", "पालिश": "polish",
  "धुलाई": "dhulai", "वॉश": "wash", "वाश": "wash", "स्टार्च": "starch", "कलफ": "kalaf", "लॉन्ड्री": "laundry", "किलो": "kg", "केजी": "kg",
  "शर्ट": "shirt", "टीशर्ट": "tshirt", "पैंट": "pant", "पेंट": "pant", "जींस": "jeans", "सूट": "suit", "कोट": "coat", "ब्लेज़र": "blazer", "ब्लेजर": "blazer", "जैकेट": "jacket",
  "स्वेटर": "sweater", "शॉल": "shawl", "साड़ी": "saree", "साडी": "saree", "लहंगा": "lehenga", "लहँगा": "lehenga", "ब्लाउज": "blouse", "ब्लाउज़": "blouse", "कुर्ता": "kurta", "कुर्ती": "kurti",
  "पजामा": "pajama", "पायजामा": "pajama", "पाजामा": "pajama", "सलवार": "salwar", "दुपट्टा": "dupatta", "चुन्नी": "chunni", "शेरवानी": "sherwani", "गाउन": "gown", "अनारकली": "anarkali",
  "फ्रॉक": "frock", "स्कर्ट": "skirt", "टॉप": "top", "पेटीकोट": "petticoat", "बनियान": "baniyan", "गंजी": "ganji", "धोती": "dhoti", "लुंगी": "lungi", "टाई": "tie", "टोपी": "topi",
  "कंबल": "kambal", "कम्बल": "kambal", "रजाई": "razai", "चादर": "chadar", "बेडशीट": "bedsheet", "पर्दा": "parda", "परदा": "parda", "पर्दे": "parde", "तकिया": "takiya", "कालीन": "kalin",
  "तौलिया": "tauliya", "जूता": "joota", "जूते": "joote", "चप्पल": "chappal", "बैग": "bag", "पर्स": "purse", "बुर्का": "burka", "यूनिफॉर्म": "uniform",
  "बच्चे": "bacche", "बच्चों": "bacche", "बच्चा": "baccha", "लेडीज": "ladies", "लेडीज़": "ladies", "जेंट्स": "gents", "महिला": "mahila",
  "भारी": "bhari", "हैवी": "heavy", "हल्का": "halka", "सादा": "sada", "प्लेन": "plain", "नॉर्मल": "normal", "डिज़ाइनर": "designer", "डिजाइनर": "designer", "सिल्क": "silk", "रेशम": "resham", "ऊनी": "ooni",
  "सिंगल": "single", "डबल": "double", "छोटा": "chota", "बड़ा": "bada", "अर्जेंट": "urgent", "जल्दी": "jaldi", "एक्सप्रेस": "express",
  "ऑर्डर": "order", "बिल": "bill", "पिकअप": "pickup", "डिलीवरी": "delivery", "डिस्काउंट": "discount", "ऑफर": "offer", "प्लान": "plan", "पेमेंट": "payment", "नियम": "rule", "रूल": "rule",
  "दिन": "din", "आज": "aaj", "कल": "kal", "ग्राहक": "customer", "कस्टमर": "customer", "नया": "naya", "पहला": "pehla", "बाकी": "baki", "पता": "pata", "नंबर": "number",
};
const DEV_CONS = { "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n", "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n", "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h" };
const DEV_NUKTA = { "ड": "r", "ढ": "rh", "ज": "z", "फ": "f", "क": "q", "ख": "kh", "ग": "g" };
const DEV_VOWEL = { "अ": "a", "आ": "aa", "इ": "i", "ई": "i", "उ": "u", "ऊ": "oo", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऋ": "ri", "ऑ": "o" };
const DEV_MATRA = { "ा": "aa", "ि": "i", "ी": "i", "ु": "u", "ू": "oo", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri", "ॉ": "o", "ं": "n", "ँ": "n", "ः": "" };
const DEV_DIGIT = "०१२३४५६७८९";

export const hasDevanagari = (s) => /[ऀ-ॿ]/.test(String(s || ""));

function transliterateWord(w) {
  let out = "";
  const ch = [...w];
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i], next = ch[i + 1];
    if (DEV_DIGIT.includes(c)) { out += DEV_DIGIT.indexOf(c); continue; }
    if (DEV_VOWEL[c] != null) { out += DEV_VOWEL[c]; continue; }
    if (DEV_MATRA[c] != null) { out += DEV_MATRA[c]; continue; }
    if (c === "्" || c === "़") continue; // halant / stray nukta
    if (DEV_CONS[c] != null) {
      let base = DEV_CONS[c], j = i + 1;
      if (next === "़") { base = DEV_NUKTA[c] || base; j++; }
      out += base;
      const after = ch[j];
      // Inherent "a" unless a vowel sign / halant follows or the word ends.
      if (after !== undefined && DEV_MATRA[after] == null && after !== "्") out += "a";
      i = j - 1;
      continue;
    }
    out += c;
  }
  return out;
}

export function romanize(text) {
  const s = String(text || "");
  if (!hasDevanagari(s)) return s;
  return s.replace(/[ऀ-ॿ]+/g, (w) => ` ${DEV_WORDS[w] || transliterateWord(w)} `).replace(/\s+/g, " ").trim();
}

/* ── Sound-alike matching ────────────────────────────────────────────
   "lahanga", "lhenga", "lehnga" all sound like "lehenga": same consonants
   in the same order. Used only when the spelling check finds nothing. */
export function skeleton(w) {
  return String(w || "").toLowerCase()
    .replace(/ph/g, "f").replace(/sh/g, "s").replace(/chh?/g, "c").replace(/th/g, "t").replace(/dh/g, "d").replace(/bh/g, "b")
    .replace(/kh/g, "k").replace(/gh/g, "g").replace(/ck/g, "k").replace(/z/g, "j").replace(/w/g, "v").replace(/q/g, "k")
    .replace(/[aeiouyh]/g, "")
    .replace(/(.)\1+/g, "$1");
}

// Phrase → canonical word (longest phrases first so "dry clean" wins over "clean").
const PHRASES = [];
const WORD = new Map();
for (const [canon, list] of Object.entries(SYNONYMS)) {
  WORD.set(canon, canon);
  for (const v of list) {
    if (v.includes(" ") || v.includes("&") || v.includes("-")) PHRASES.push([v, canon]);
    else WORD.set(v, canon);
  }
}
PHRASES.sort((a, b) => b[0].length - a[0].length);

export const GRADE_WORDS = new Set(["heavy", "normal", "designer", "bridal", "silk", "woollen", "single", "double", "small", "large", "leather"]);
export const SERVICE_WORDS = { dryclean: "Dry Clean", press: "Steam Press", polish: "Polish", starch: "Starching", washiron: "Wash & Iron", laundry: "Laundry" };
export const AUDIENCE_WORDS = { kids: "kids", women: "women", men: "men" };

export const isStopWord = (w) => STOP.has(w);

export function canon(word) {
  return WORD.get(word) || word;
}

// Damerau-free Levenshtein, capped — enough for typos like "lehnga".
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

const allowedTypos = (w) => (w.length >= 8 ? 2 : w.length >= 5 ? 1 : 0);

// Turn free text into canonical tokens plus the numbers found in it.
// vocab: extra words the fuzzy matcher may correct towards (from the price list).
export function tokenize(text, vocab) {
  let t = ` ${romanize(text).toLowerCase().replace(/[’']/g, "").replace(/₹/g, " rs ")} `;
  // "3 piece suit" / "suit (3 piece)" / "suit 3pc" name a kind of suit, not
  // three suits. Mark those first so the quantity rule below leaves them alone.
  // Quantities written as "2pcs", "x2", "2x", "2 nos", "qty 2" — but not a
  // "3 piece" that sits next to "suit"/"set".
  t = t.replace(/\bx\s*(\d+)\b/g, " $1 ")
    .replace(/(?<!\b(?:suit|set|sut|soot)\s*\(?\s*)(\d+)\s*(?:x|nos?|pcs?|pieces?|pis)\b(?!\.?\s*\)?\s*(?:suit|set|sut|soot)\b)/g, " $1 ")
    .replace(/\bqty\s*/g, " ");
  t = t.replace(/(\d)\s*-?\s*(?:piece|pc|pcs|pis)\.?\s+(?=(suit|set|sut|soot)\b)/g, "$1piece ");
  t = t.replace(/\b(suit|set|sut|soot)\s*\(?\s*(\d)\s*-?\s*(?:pieces?|pcs?|pis)\b\s*\)?/g, "$1 $2piece ");
  t = t.replace(/(\d)\s*(kgs?|kilos?|kilogram)\b/g, "$1 kg ");
  // Commas, new lines, "+" and ";" separate items.
  t = t.replace(/[,;\n+|]+/g, " | ");
  t = t.replace(/[^a-z0-9.&\-| ]+/g, " ").replace(/\s+/g, " ");
  t = ` ${t.trim()} `;
  for (const [p, c] of PHRASES) {
    if (t.includes(` ${p} `)) t = t.split(` ${p} `).join(` ${c} `);
  }
  // "shirt and lehenga" / "saree aur blouse" / "shirt & pant" are two items
  // (phrases like "wash and fold" were already turned into one word above).
  t = t.replace(/ (and|aur|or|ya|&|n) /g, " | ");
  // "indo-western" reads like the price list's "Indo-Western" → indo western.
  t = t.replace(/([a-z])-([a-z])/g, "$1 $2");
  const raw = t.split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "|") { if (out.length && !out[out.length - 1].sep) out.push({ sep: true }); continue; }
    let w = raw[i].replace(/^[-.]+|[-.]+$/g, "");
    if (!w) continue;
    if (/^\d+(\.\d+)?$/.test(w)) { out.push({ num: Number(w), kg: raw[i + 1] === "kg" }); continue; }
    if (w === "kg" || w === "rs") { out.push({ word: w }); continue; }
    if (HINDI_NUM[w] != null && raw[i + 1] && !STOP.has(raw[i + 1])) { out.push({ num: HINDI_NUM[w], kg: raw[i + 1] === "kg" }); continue; }
    if (STOP.has(w)) continue;
    let c = canon(w);
    let fixed = false;
    if (c === w && !SYNONYMS[w] && vocab && !vocab.has(w)) {
      // Fuzzy-correct a typo towards a known word ("lehnga" → "lehenga").
      const max = allowedTypos(w);
      let best = null, bestD = max + 1;
      if (max) {
        for (const v of vocab) {
          const d = editDistance(w, v, max);
          if (d < bestD) { bestD = d; best = v; }
        }
        for (const v of WORD.keys()) {
          if (v.length < 4) continue;
          const d = editDistance(w, v, max);
          if (d < bestD) { bestD = d; best = canon(v); }
        }
      }
      if (best && bestD <= max) { c = canon(best); fixed = true; }
      // No close spelling: try words that sound the same ("lahanga" → lehenga).
      if (!fixed && w.length >= 4) {
        const sk = skeleton(w);
        if (sk.length >= 3) {
          const hits = new Set();
          for (const v of [...vocab, ...WORD.keys()]) {
            if (v.length >= 4 && v[0] === w[0] && Math.abs(v.length - w.length) <= 3 && skeleton(v) === sk) hits.add(canon(v));
          }
          if (hits.size === 1) { c = [...hits][0]; fixed = true; }
        }
      }
      // Two words run together ("kurtapajama", "sareeblouse").
      if (!fixed && w.length >= 7) {
        for (let k = 3; k <= w.length - 3; k++) {
          const a = w.slice(0, k), b = w.slice(k);
          const known = (x) => WORD.has(x) || vocab.has(x);
          if (known(a) && known(b)) {
            out.push({ word: canon(a), raw: a, fixed: false });
            c = canon(b); w = b;
            break;
          }
        }
      }
    }
    out.push({ word: c, raw: w, fixed });
  }
  return out;
}

// Canonical tokens for a price-list name (used to build the vocabulary).
// Uses the same phrase rules as tokenize() so a name and a message about
// it always produce the same words ("bed cover" → bedsheet in both).
export function nameTokens(s) {
  let t = ` ${String(s || "")
    .toLowerCase()
    .replace(/(\d)\s*piece/g, "$1piece")
    .replace(/[^a-z0-9&\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
  for (const [p, c] of PHRASES) {
    if (t.includes(` ${p} `)) t = t.split(` ${p} `).join(` ${c} `);
  }
  return t
    .replace(/[&\-]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w))
    .map(canon);
}

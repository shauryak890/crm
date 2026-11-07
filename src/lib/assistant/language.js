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
  suit: ["suits", "soot", "sut"],
  dupatta: ["dupata", "duppata", "chunni", "chunri", "chunari", "odhni", "orhni", "dupatte"],
  blouse: ["blause", "blouz", "blaus", "blouses"],
  gown: ["gowns", "gaun", "goun"],
  anarkali: ["anarkalli", "anarkli"],
  sherwani: ["serwani", "sherwaani", "shervani", "sherwni"],
  waistcoat: ["waist coat", "vest coat", "koti", "jacket bandi"],
  bandi: ["baandi", "bundi", "dandi"],
  blazer: ["blazers", "blezer", "blejar"],
  coat: ["kot", "coats", "kote"],
  jacket: ["jackets", "jaket", "jakit", "jacet"],
  sweater: ["sweter", "swetar", "swater", "sweatshirt", "pullover", "cardigan"],
  shawl: ["shaal", "shal", "shawls", "loi"],
  muffler: ["mufler", "scarf", "stole"],
  blanket: ["kambal", "kambel", "blankets", "blanket", "kammal"],
  razai: ["rajai", "rajaai", "razaai", "quilt", "comforter"],
  bedsheet: ["chadar", "chaddar", "chaadar", "bed sheet", "bedsheets", "bedcover", "bed cover"],
  curtain: ["parda", "parde", "pardah", "curtains", "pardaa"],
  pillow: ["takiya", "takia", "pillows", "cushion"],
  carpet: ["kalin", "kaleen", "qaleen", "dari", "durrie", "rug", "carpets"],
  towel: ["tauliya", "tolia", "towels", "taulia"],
  shoes: ["shoe", "joota", "joote", "jute", "juta", "jootey", "sneakers", "sneaker"],
  sandal: ["chappal", "chappals", "sandals", "slipper"],
  heels: ["heel", "sandal heels"],
  bag: ["bags", "bagg", "thaila", "jhola"],
  handbag: ["purse", "handbags", "hand bag"],
  cap: ["topi", "caps", "hat"],
  tie: ["tai", "ties"],
  frock: ["frok", "frocks", "dress frock"],
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
  ok okay hello hi hey namaste order orders kapde kapda kapdo kapdon clothes cloth garment garments wash-karna dena lena hoga clean cleaning saaf`.split(/\s+/));

const HINDI_NUM = { ek: 1, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, saat: 7, sat: 7, aath: 8, ath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, pandrah: 15, bees: 20, tees: 30, chalis: 40, pachas: 50, sau: 100 };

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

// Messages typed in Devanagari can't be read yet: the price list is in
// English letters. The UI asks the staff member to type in Hinglish.
export const hasDevanagari = (s) => /[ऀ-ॿ]/.test(String(s || ""));

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
  let t = ` ${String(text || "").toLowerCase().replace(/[’']/g, "").replace(/₹/g, " rs ")} `;
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

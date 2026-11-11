// Search engine: forgiving, offline, no dependencies.
// Handles abbreviations (ACDF, EVD, TLIF), typos, plurals, "w/ / w/o", code lookups and modifiers.

const STOP = new Set(['a', 'an', 'the', 'of', 'for', 'to', 'in', 'on', 'at', 'by', 'and', 'or', 'per', 'is', 'what', 'whats', 's']);
// Words that help when they match but shouldn't sink a result when they don't.
const SOFT = new Set(['with', 'surgery', 'surgical', 'procedure', 'operation', 'scan', 'test', 'testing', 'study', 'exam', 'examination', 'code', 'cpt', 'done', 'performed', 'patient', 'pt']);
// Tokens that only match exactly (no prefix or typo matching).
const EXACT = new Set(['with', 'without', 'no', 'non', 'new', 'left', 'right', 'first', 'each', 'one', 'two']);

const ALIAS = {
  xr: 'xray', radiograph: 'xray', radiography: 'xray', films: 'xray', film: 'xray',
  ekg: 'ecg', electrocardiogram: 'ecg',
  sono: 'ultrasound', sonogram: 'ultrasound', ultrasonography: 'ultrasound', us: 'ultrasound',
  lap: 'laparoscopic', laparoscopy: 'laparoscopic',
  bx: 'biopsy', fx: 'fracture', inj: 'injection', shot: 'injection',
  lami: 'laminectomy', lam: 'laminectomy',
  crani: 'craniotomy', crany: 'craniotomy',
  stim: 'stimulator', neurostim: 'neurostimulator',
  appy: 'appendectomy', chole: 'cholecystectomy',
  bilat: 'bilateral', unilat: 'unilateral',
  lumb: 'lumbar', cerv: 'cervical', thor: 'thoracic',
  addl: 'additional', ea: 'each',
  min: 'minutes', mins: 'minutes', minute: 'minutes', hr: 'hour', hrs: 'hour',
  cat: 'ct', mr: 'mri', wo: 'without',
};

const PHRASES = [
  [/\bw\s*\/\s*o\b/g, ' without '],
  [/\bw\s*\/\s*/g, ' with '],
  [/\bx[\s-]?rays?\b/g, ' xray '],
  [/\bnon[\s-]?contrast\b/g, ' without contrast '],
  [/\bc[\s-]?sections?\b/g, ' csection '],
  [/\be\s*\/\s*m\b/g, ' em '],
  [/\b([a-z])\s*&\s*([a-z])\b/g, '$1$2'], // i&d -> id, d&c -> dc, t&a -> ta
  [/&/g, ' and '],
  [/\bfollow[\s-]?up\b/g, ' followup '],
  [/\bpost[\s-]?op(erative)?\b/g, ' postop '],
  [/\bpre[\s-]?op(erative)?\b/g, ' preop '],
  [/\bco[\s-]?surg(ery|eon|eons)\b/g, ' cosurgery '],
  [/\bre[\s-]?do\b/g, ' redo '],
  [/\bre[\s-]?exploration\b/g, ' reexploration '],
  [/\bmodifier\b/g, ' mod '],
];

export function normalize(text) {
  let s = String(text || '').toLowerCase();
  s = s.replace(/[’'`]/g, '');
  s = s.replace(/[–—]/g, ' ');
  for (const [re, rep] of PHRASES) s = s.replace(re, rep);
  // keep decimal points between digits (e.g., 2.5 cm), drop other punctuation
  s = s.replace(/\./g, (m, i, str) => (/\d/.test(str[i - 1] || '') && /\d/.test(str[i + 1] || '') ? '.' : ' '));
  s = s.replace(/[^a-z0-9.]+/g, ' ');
  return s.trim().replace(/\s+/g, ' ');
}

function stem(t) {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 3 && t.endsWith('s') && !/(ss|us|is)$/.test(t)) return t.slice(0, -1);
  return t;
}

export function tokenize(text, { keepStop = false } = {}) {
  const out = [];
  for (let t of normalize(text).split(' ')) {
    if (!t) continue;
    if (ALIAS[t]) t = ALIAS[t];
    t = stem(t);
    if (ALIAS[t]) t = ALIAS[t];
    if (!keepStop && STOP.has(t)) continue;
    out.push(t);
  }
  return out;
}

// Optimal string alignment distance; returns the distance, or -1 once it exceeds `max`.
function editDistance(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return -1;
  let d0 = null;
  let d1 = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) d1[j] = j;
  for (let i = 1; i <= la; i++) {
    const d2 = new Array(lb + 1);
    d2[0] = i;
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(d1[j] + 1, d2[j - 1] + 1, d1[j - 1] + cost);
      if (d0 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d0[j - 2] + 1);
      d2[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return -1;
    d0 = d1;
    d1 = d2;
  }
  return d1[lb] <= max ? d1[lb] : -1;
}

const isNum = (t) => /^\d+(\.\d+)?$/.test(t);

function tokenScore(qt, et) {
  if (et === qt) return 1;
  if (EXACT.has(qt) || EXACT.has(et)) return 0;
  if (isNum(qt)) {
    // "3" should not match "30"; a 3+ digit partial code can prefix-match
    return qt.length >= 3 && et.startsWith(qt) ? 0.7 : 0;
  }
  if (et.startsWith(qt)) {
    if (qt.length >= 3) return 0.82;
    if (qt.length === 2) return 0.5;
    return 0;
  }
  if (qt.length >= 4 && et.length >= 4 && !isNum(et)) {
    const max = qt.length >= 8 ? 2 : 1;
    const d = editDistance(qt, et, max);
    if (d === 1) return 0.66;
    if (d === 2) return 0.52;
    // typo while still typing: compare with the same-length start of the entry token
    if (et.length > qt.length && qt.length >= 5 && editDistance(qt, et.slice(0, qt.length), 1) === 1) return 0.5;
  }
  if (qt.length >= 5 && et.includes(qt)) return 0.45;
  return 0;
}

/**
 * rows: [code, name, synonyms, note, catIndex, sub, priority, system]
 * Returns { entries, vocab } where entry tokens point into a shared vocabulary.
 */
export function createIndex(rows, categories = []) {
  const vocabIds = new Map();
  const vocab = [];
  const idOf = (t) => {
    let id = vocabIds.get(t);
    if (id === undefined) { id = vocab.length; vocab.push(t); vocabIds.set(t, id); }
    return id;
  };
  const entries = rows.map((r, i) => {
    const [code, name, syn, note, cat, sub, p, sys] = r;
    const w = new Map();
    const put = (t, weight) => { if (!w.has(t) || w.get(t) < weight) w.set(t, weight); };
    const nameText = name.replace(/\((?:no|not)\b[^)]*\)/gi, ' ');
    tokenize(nameText).forEach((t, pos) => put(t, 1 - 0.012 * Math.min(pos, 10)));
    const synList = syn ? syn.split('|') : [];
    for (const s of synList) for (const t of tokenize(s)) put(t, 0.9);
    for (const t of tokenize(sub)) put(t, 0.45);
    for (const t of tokenize(categories[cat] || '')) put(t, 0.35);
    if (note) for (const t of tokenize(note.replace(/\b(\d{5}|[A-V]\d{4})\b/g, ' '))) put(t, 0.25);
    put(code.toLowerCase(), 1);
    if (sys === 'MOD') put('mod', 0.6);
    const ids = new Int32Array(w.size);
    const weights = new Float32Array(w.size);
    let k = 0;
    for (const [t, weight] of w) { ids[k] = idOf(t); weights[k] = weight; k++; }
    const phrases = [tokenize(nameText).join(' '), ...synList.map((s) => tokenize(s).join(' '))].filter(Boolean);
    return { i, code, name, syn, note, cat, sub, p, sys, ids, weights, phrases, nameLen: name.length };
  });
  return { entries, vocab };
}

function scoreEntry(e, qScores, qTokens, qNorm) {
  let sum = 0, matched = 0, required = 0;
  for (let q = 0; q < qTokens.length; q++) {
    const soft = SOFT.has(qTokens[q]);
    if (!soft) required++;
    const scores = qScores[q];
    let best = 0;
    for (let k = 0; k < e.ids.length; k++) {
      const s = scores[e.ids[k]] * e.weights[k];
      if (s > best) best = s;
    }
    if (best > 0) { sum += best; if (!soft) matched++; }
  }
  if (sum === 0) return 0;
  const frac = required ? matched / required : 1;
  if (required && frac < 0.5) return 0;
  if (required >= 3 && frac < 0.6) return 0;
  let score = sum * frac * frac;
  let bonus = 0;
  const single = qTokens.length === 1;
  const starts = single ? 0.4 : 1.3;
  const inside = single ? 0.2 : 0.8;
  for (const ph of e.phrases) {
    if (ph === qNorm) { bonus = 2.2; break; }
    if (single && qNorm.length >= 5 && ph.indexOf(' ') < 0 && editDistance(qNorm, ph, qNorm.length >= 8 ? 2 : 1) > 0) bonus = Math.max(bonus, 1.5);
    if (qNorm.length >= 3 && ph.startsWith(qNorm)) bonus = Math.max(bonus, starts);
    else if (qNorm.length >= 4 && ph.includes(qNorm)) bonus = Math.max(bonus, inside);
  }
  score += bonus;
  score += e.p ? 0.35 : 0;
  score += 0.25 / (1 + e.nameLen / 45); // gentle preference for broader, shorter entries
  return score;
}

const CODE_RE = /^(\d{3,5}|\d{4}[tu]|[a-v]\d{1,4})$/;

export function search(index, raw, { category = -1, limit = 60 } = {}) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return [];
  const pool = category >= 0 ? index.entries.filter((e) => e.cat === category) : index.entries;
  const compact = trimmed.toLowerCase().replace(/^(modifier|mod)\s*/, '').replace(/^[-+\s]+/, '').replace(/\s+/g, '');
  const results = new Map();
  const put = (e, s) => { const prev = results.get(e.i); if (!prev || prev.score < s) results.set(e.i, { e, score: s }); };
  const codeNum = (c) => parseInt(c.replace(/\D/g, '') || '0', 10);

  // 1) exact code (also modifiers like 62 or XS)
  for (const e of pool) if (e.code.toLowerCase() === compact) put(e, 100);

  // 2) code prefix (e.g. "6304", "a04")
  if (CODE_RE.test(compact)) {
    for (const e of pool) {
      const c = e.code.toLowerCase();
      if (c !== compact && c.startsWith(compact)) put(e, 50 - codeNum(c) / 1e7);
    }
    if (/^\d{3,5}$/.test(compact)) {
      return [...results.values()].sort((a, b) => b.score - a.score).slice(0, limit).map((r) => r.e);
    }
  }
  // two digits: the modifier (if any) first, then codes starting with those digits
  if (/^\d{2}$/.test(compact)) {
    for (const e of pool) if (e.sys !== 'MOD' && e.code.startsWith(compact)) put(e, 20 - codeNum(e.code) / 1e6);
  }

  // 3) text search
  let qTokens = tokenize(trimmed);
  if (!qTokens.length) qTokens = tokenize(trimmed, { keepStop: true });
  if (qTokens.length) {
    const qNorm = qTokens.join(' ');
    const qScores = qTokens.map((qt) => {
      const arr = new Float32Array(index.vocab.length);
      for (let v = 0; v < index.vocab.length; v++) arr[v] = tokenScore(qt, index.vocab[v]);
      return arr;
    });
    for (const e of pool) {
      const s = scoreEntry(e, qScores, qTokens, qNorm);
      if (s > 0) put(e, s);
    }
  }
  return [...results.values()]
    .sort((a, b) => b.score - a.score || b.e.p - a.e.p || a.e.i - b.e.i)
    .slice(0, limit)
    .map((r) => r.e);
}

// Wrap query matches in <mark>. Text is escaped first.
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function highlight(text, raw) {
  const qTokens = tokenize(raw || '').filter((t) => t.length >= 2 && !EXACT.has(t));
  if (!qTokens.length) return escapeHtml(text);
  return text.split(/(\s+|[\/(),:;–—-])/).map((part) => {
    if (!part || /^\s+$/.test(part) || /^[\/(),:;–—-]$/.test(part)) return escapeHtml(part);
    const toks = tokenize(part, { keepStop: true });
    const hit = toks.some((t) => qTokens.some((q) =>
      t === q || (!isNum(q) && t.startsWith(q)) || (isNum(q) && q.length >= 3 && t.startsWith(q))));
    return hit ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part);
  }).join('');
}

// Search engine: forgiving, offline, no dependencies.
// Handles abbreviations (ACDF, EVD, TLIF), typos, plurals, "w/ / w/o", code lookups and modifiers.

const STOP = new Set(['a', 'an', 'the', 'of', 'for', 'to', 'in', 'on', 'at', 'by', 'and', 'or', 'per', 'is', 'what', 'whats', 's']);
// Words that help when they match but shouldn't sink a result when they don't.
const SOFT = new Set(['with', 'surgery', 'surgical', 'procedure', 'operation', 'scan', 'test', 'testing', 'study', 'exam', 'examination', 'code', 'cpt', 'done', 'performed', 'patient', 'pt']);
// Descriptive words a surgeon adds ("open L2-5 laminectomy", "2 level ACDF"). They help ranking but are never required.
const DESCRIPTIVE = new Set(['open', 'level', 'segment', 'interspace', 'multilevel', 'single']);
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

// `known`: the query word exists as-is in the data, so it is not a typo. Typo matching is skipped for it,
// which keeps "laminotomy" from matching "laminectomy" and "bilateral" from matching "lateral".
function tokenScore(qt, et, known = false) {
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
  if (!known && qt.length >= 4 && et.length >= 4 && !isNum(et)) {
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
    const phraseTokens = [tokenize(nameText), ...synList.map((s) => tokenize(s))];
    const phrases = phraseTokens.map((t) => t.join(' ')).filter(Boolean);
    // The same phrases without spine regions or levels, for queries that name a level ("L4-S1 posterior fusion"
    // should match "posterior lumbar fusion").
    const phrasesNoLevel = phraseTokens.map((t) => t.filter((x) => !regionOf(x)).join(' ')).filter(Boolean);
    return { i, code, name, syn, note, cat, sub, p, sys, ids, weights, phrases, phrasesNoLevel, nameLen: name.length };
  });
  return { entries, vocab };
}

function scoreEntry(e, qScores, softFlags, qNorm, single, typo, descFlags, hasLevel) {
  let sum = 0, matched = 0, required = 0, missingDesc = false;
  for (let q = 0; q < qScores.length; q++) {
    const soft = softFlags[q];
    if (!soft) required++;
    const scores = qScores[q];
    let best = 0;
    for (let k = 0; k < e.ids.length; k++) {
      const s = scores[e.ids[k]] * e.weights[k];
      if (s > best) best = s;
    }
    if (best > 0) { sum += best; if (!soft) matched++; } else if (descFlags && descFlags[q]) missingDesc = true;
  }
  if (sum === 0) return 0;
  const frac = required ? matched / required : 1;
  if (required && frac < 0.5) return 0;
  if (required >= 3 && frac < 0.6) return 0;
  let score = sum * frac * frac;
  let bonus = 0;
  const starts = single ? 0.4 : 1.3;
  const inside = single ? 0.2 : 0.8;
  for (const ph of hasLevel ? e.phrasesNoLevel : e.phrases) {
    if (ph === qNorm) { bonus = 2.2; break; }
    if (typo && qNorm.length >= 5 && ph.indexOf(' ') < 0 && editDistance(qNorm, ph, qNorm.length >= 8 ? 2 : 1) > 0) bonus = Math.max(bonus, 1.5);
    if (qNorm.length >= 3 && ph.startsWith(qNorm)) bonus = Math.max(bonus, starts);
    else if (qNorm.length >= 4 && ph.includes(qNorm)) bonus = Math.max(bonus, inside);
  }
  // "open LP shunt": a code that lacks a descriptive word the user typed gets less credit for the phrase match.
  score += missingDesc ? bonus / 2 : bonus;
  score += e.p ? 0.35 : 0;
  score += 0.25 / (1 + e.nameLen / 45); // gentle preference for broader, shorter entries
  return score;
}

const CODE_RE = /^(\d{3,5}|\d{4}[tu]|[a-v]\d{1,4})$/;

// Spinal levels: "L4-5", "L4-L5", "C5-6", "T12-L1", "L5-S1", "L2 to L5", "C5", "L45".
// They become optional words (the level and its region: cervical, thoracic, lumbar) so a query like
// "open L2-5 laminectomy" ranks lumbar codes first instead of failing on "L2" and "5".
const REGION = { c: 'cervical', t: 'thoracic', l: 'lumbar', s: 'sacral' };
const LAST = { c: 8, t: 12, l: 6, s: 5 };
const START = { c: 0, t: 7, l: 19, s: 24 };
const ORDER = 'ctls';
const LEVEL_RE = /\b([ctls])(\d{1,2})(?:\s*(?:-|–|—|to|through|thru)\s*([ctls])?(\d{1,2})|([ctls])(\d{1,2}))?\b/g;

const REGION_WORDS = new Set(Object.values(REGION));
// "lumbar" -> "lumbar"; a level written in the data such as "c2" or "l5" -> its region.
function regionOf(token) {
  if (REGION_WORDS.has(token)) return token;
  const m = /^([ctls])(\d{1,2})$/.exec(token);
  return m && +m[2] >= 1 && +m[2] <= LAST[m[1]] ? REGION[m[1]] : null;
}

function extractLevels(text) {
  const words = [];
  const valid = ([r, n]) => n >= 1 && n <= LAST[r];
  const rest = text.replace(LEVEL_RE, (m, a, n1, b, n2, c, n3) => {
    let from = [a, +n1];
    let to = null;
    if (n2 !== undefined) to = [b || a, +n2];
    else if (n3 !== undefined) to = [c, +n3];
    else if (n1.length === 2 && !valid(from)) {
      // "l45" = L4-L5, "c56" = C5-C6 (only for neighbouring levels)
      if (+n1[1] !== +n1[0] + 1) return m;
      from = [a, +n1[0]];
      to = [a, +n1[1]];
    }
    if (!valid(from) || (to && !valid(to))) return m;
    const i = ORDER.indexOf(from[0]);
    const j = to ? ORDER.indexOf(to[0]) : i;
    if (j < i) return m;
    words.push(from.join(''));
    if (to) words.push(to.join(''));
    const regions = ORDER.slice(i, j + 1);
    for (const r of regions) if (!(r === 's' && regions.includes('l'))) words.push(REGION[r]); // L5-S1 is lumbar
    // A range of 2+ levels (L2-5, C5-7) also favors the "each additional" and multi-segment codes.
    if (to && START[to[0]] + to[1] - (START[from[0]] + from[1]) >= 2) words.push('additional', 'multilevel');
    return ' ';
  });
  return { rest, words: [...new Set(words)] };
}

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
  const levels = extractLevels(trimmed.toLowerCase());
  let words = tokenize(levels.rest);
  if (!words.length && !levels.words.length) words = tokenize(levels.rest, { keepStop: true });
  if (!index.vocabSet) index.vocabSet = new Set(index.vocab);
  // Weak hints (descriptive words, and the "more than one level" words added for ranges) count half.
  const HALF = new Set([...DESCRIPTIVE, 'additional', 'multilevel']);
  const scoresFor = (qt, hint) => {
    const arr = new Float32Array(index.vocab.length);
    const known = index.vocabSet.has(qt);
    const f = hint && HALF.has(qt) ? 0.5 : 1;
    let any = false;
    for (let v = 0; v < index.vocab.length; v++) { arr[v] = tokenScore(qt, index.vocab[v], known) * f; if (arr[v] > 0) any = true; }
    return any ? arr : null;
  };
  // Words that match nothing at all are left out, so one unknown word doesn't hide every result.
  const typed = [];
  for (const t of words) { const sc = scoresFor(t, DESCRIPTIVE.has(t)); if (sc) typed.push({ t, sc }); }
  const extra = [];
  for (const t of levels.words) { if (!typed.some((x) => x.t === t)) { const sc = scoresFor(t, true); if (sc) extra.push({ t, sc }); } }
  if (typed.length || extra.length) {
    const optional = (t) => SOFT.has(t) || DESCRIPTIVE.has(t) || /^\d{1,2}$/.test(t);
    // Phrase matching uses the words that carry the meaning ("laminectomy", not "open" or "2").
    let core = typed.filter((x) => !DESCRIPTIVE.has(x.t) && !/^\d{1,2}$/.test(x.t)).map((x) => x.t);
    if (!core.length) core = typed.map((x) => x.t);
    const qNorm = core.join(' ');
    const single = core.length === 1;
    const typo = single && !index.vocabSet.has(qNorm); // a one-word query that isn't in the data: probably misspelled
    const qScores = [...typed.map((x) => x.sc), ...extra.map((x) => x.sc)];
    const softFlags = [...typed.map((x) => optional(x.t)), ...extra.map(() => true)];
    const descFlags = typed.some((x) => DESCRIPTIVE.has(x.t)) ? [...typed.map((x) => DESCRIPTIVE.has(x.t)), ...extra.map(() => false)] : null;
    // With a level in the query, codes for a different part of the spine (e.g., lumbar-only codes for "C3-6") drop down.
    const wanted = new Set(levels.words.filter((w) => REGION_WORDS.has(w)));
    for (const e of pool) {
      let s = scoreEntry(e, qScores, softFlags, qNorm, single, typo, descFlags, wanted.size > 0);
      if (s > 0 && wanted.size) {
        let has = false, other = false;
        for (let k = 0; k < e.ids.length; k++) {
          if (e.weights[k] < 0.45) continue; // ignore notes and category words
          const region = regionOf(index.vocab[e.ids[k]]);
          if (region) { if (wanted.has(region)) has = true; else other = true; }
        }
        if (other && !has) s *= 0.5;
      }
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

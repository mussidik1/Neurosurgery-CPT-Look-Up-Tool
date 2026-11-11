import DATA, { CATEGORIES, COUNTS, ADDONS, DATA_EDITION } from './data.js';
import { createIndex, search, highlight, escapeHtml } from './search.js';

const index = createIndex(DATA, CATEGORIES);
const byCode = new Map(index.entries.map((e) => [e.code, e]));
const addons = new Set(ADDONS);

const $ = (s) => document.querySelector(s);
const qEl = $('#q');
const resultsEl = $('#results');
const statusEl = $('#status');
const tabsEl = $('#tabs');
const clearBtn = $('#clear');
const toastEl = $('#toast');

const SLUG = CATEGORIES.map((c) => c.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''));
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';

const QUICK = [
  'ACDF', 'TLIF', 'Lumbar laminectomy', 'Microdiscectomy', 'Craniotomy for tumor', 'Burr hole',
  'EVD', 'VP shunt', 'Chiari decompression', 'Kyphoplasty', 'SCS trial', 'Carpal tunnel release',
  'Stroke thrombectomy', 'Neuromonitoring', 'Critical care', 'Modifier 62',
];

// ---------- storage (best effort; private mode can throw) ----------
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(`neurocpt.${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`neurocpt.${key}`, JSON.stringify(value)); } catch { /* ignore */ }
  },
};
let starred = new Set(store.get('starred', []).filter((c) => byCode.has(c)));
let recent = store.get('recent', []).filter((c) => byCode.has(c));
let category = -1;

// ---------- rendering ----------
function linkCodes(html) {
  return html.replace(/\b(\d{5}|[A-V]\d{4})\b/g, (m) => (byCode.has(m) ? `<button class="ref" type="button" data-ref="${m}">${m}</button>` : m));
}

function hitHTML(e, q, showSub = true) {
  const tags = [];
  if (e.sys === 'MOD') tags.push('<span class="tag">Modifier</span>');
  if (e.sys === 'HCPCS') tags.push('<span class="tag">HCPCS</span>');
  if (addons.has(e.code)) tags.push('<span class="tag">Add-on</span>');
  if (/New for 2026/.test(e.note)) tags.push('<span class="tag new">New in 2026</span>');
  const isStar = starred.has(e.code);
  const label = `Copy ${e.code}: ${e.name}`;
  return `<li class="hit" data-code="${e.code}" style="--tab: var(--cat-${SLUG[e.cat]})">
  <button class="copy" type="button" data-copy="${e.code}" aria-label="${escapeHtml(label)}">
    <span class="code">${e.sys === 'MOD' ? '-' : ''}${escapeHtml(e.code)}</span>
    <span class="name">${q ? highlight(e.name, q) : escapeHtml(e.name)}</span>
    ${showSub || tags.length ? `<span class="meta">${showSub ? `<span class="sub">${escapeHtml(e.sub)}</span>` : ''}${tags.join('')}</span>` : ''}
  </button>${e.note ? `\n  <p class="note">${linkCodes(escapeHtml(e.note))}</p>` : ''}
  <button class="star" type="button" data-star="${e.code}" aria-pressed="${isStar}" aria-label="${isStar ? 'Unstar' : 'Star'} ${e.code}">${STAR}</button>
</li>`;
}

const list = (entries, q, showSub = true) => `<ul class="hits">${entries.map((e) => hitHTML(e, q, showSub)).join('')}</ul>`;

function renderTabs() {
  const tabs = [{ i: -1, name: 'All' }, ...CATEGORIES.map((name, i) => ({ i, name }))];
  tabsEl.innerHTML = `<div class="tabs-inner">${tabs.map((t) => `<button class="tab" type="button" data-cat="${t.i}" aria-pressed="${t.i === category}"${t.i >= 0 ? ` style="--tab-color: var(--cat-${SLUG[t.i]})"` : ''}>${escapeHtml(t.name)}</button>`).join('')}</div>`;
}

function renderHome() {
  const parts = [];
  parts.push(`<div class="home">
    <p class="lede">Type a procedure, abbreviation or code. Tap any result to copy its code.</p>
    <h2>Common searches</h2>
    <div class="chips">${QUICK.map((s) => `<button class="chip" type="button" data-q="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}</div>`);
  const stars = [...starred].map((c) => byCode.get(c)).filter(Boolean);
  if (stars.length) parts.push(`<h2 class="group-title">Starred</h2>${list(stars)}`);
  const rec = recent.map((c) => byCode.get(c)).filter(Boolean).filter((e) => !starred.has(e.code));
  if (rec.length) parts.push(`<h2 class="group-title">Recently copied</h2>${list(rec)}`);
  parts.push('</div>');
  statusEl.textContent = '';
  resultsEl.innerHTML = parts.join('');
}

function renderBrowse() {
  const entries = index.entries.filter((e) => e.cat === category);
  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.sub)) groups.set(e.sub, []);
    groups.get(e.sub).push(e);
  }
  statusEl.textContent = `${entries.length} codes in ${CATEGORIES[category]}`;
  resultsEl.innerHTML = [...groups].map(([sub, es]) => `<h2 class="group-title">${escapeHtml(sub)}</h2>${list(es, '', false)}`).join('');
}

function renderResults(q) {
  const hits = search(index, q, { category });
  const where = category >= 0 ? ` in ${CATEGORIES[category]}` : '';
  if (!hits.length) {
    statusEl.textContent = '';
    resultsEl.innerHTML = `<div class="empty">
      <h2>No match for “${escapeHtml(q)}”${escapeHtml(where)}</h2>
      <p>Try a shorter word, an abbreviation (TLIF, EVD, LP) or the code number.</p>
      ${category >= 0 ? '<p><button class="linkish" type="button" data-all="1">Search all sections</button></p>' : ''}
    </div>`;
    return;
  }
  statusEl.textContent = hits.length >= 60 ? `Top 60 matches${where}` : `${hits.length} match${hits.length === 1 ? '' : 'es'}${where}`;
  resultsEl.innerHTML = list(hits, q);
}

function render() {
  const q = qEl.value.trim();
  clearBtn.hidden = !q;
  if (q) renderResults(q);
  else if (category >= 0) renderBrowse();
  else renderHome();
  syncUrl(q);
}

let frame = 0;
const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); };

// ---------- URL state (#q=...&s=...) ----------
function syncUrl(q) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category >= 0) params.set('s', SLUG[category]);
  const hash = params.toString();
  const url = location.pathname + location.search + (hash ? `#${hash}` : '');
  if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
}
function readUrl() {
  const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  const s = params.get('s');
  const i = s ? SLUG.indexOf(s) : -1;
  category = i;
  qEl.value = params.get('q') || '';
}

// ---------- copy ----------
let toastTimer = 0;
function toast(html) {
  toastEl.innerHTML = html;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-100px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
async function copyCode(code, li) {
  const ok = await copyText(code);
  if (ok) {
    toast(`Copied <span class="t-code">${escapeHtml(code)}</span>`);
    if (navigator.vibrate) navigator.vibrate(12);
  } else {
    toast(`Code <span class="t-code">${escapeHtml(code)}</span>`);
  }
  if (li) {
    li.classList.add('copied');
    setTimeout(() => li.classList.remove('copied'), 450);
  }
  recent = [code, ...recent.filter((c) => c !== code)].slice(0, 12);
  store.set('recent', recent);
}

function toggleStar(code, btn) {
  if (starred.has(code)) starred.delete(code); else starred.add(code);
  store.set('starred', [...starred]);
  const on = starred.has(code);
  document.querySelectorAll(`.star[data-star="${code}"]`).forEach((b) => {
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', `${on ? 'Unstar' : 'Star'} ${code}`);
  });
  if (!qEl.value.trim() && category < 0) {
    // keep focus stable on the home screen re-render
    renderHome();
    const again = document.querySelector(`.star[data-star="${code}"]`);
    if (again) again.focus(); else btn.blur();
  }
}

// ---------- events ----------
qEl.addEventListener('input', schedule);
$('#search-form').addEventListener('submit', (ev) => { ev.preventDefault(); qEl.blur(); });
clearBtn.addEventListener('click', () => { qEl.value = ''; render(); qEl.focus(); });

tabsEl.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.tab');
  if (!btn) return;
  category = Number(btn.dataset.cat);
  tabsEl.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  render();
  window.scrollTo({ top: 0 });
});

resultsEl.addEventListener('click', (ev) => {
  const t = ev.target;
  const ref = t.closest('.ref');
  if (ref) { qEl.value = ref.dataset.ref; category = -1; renderTabs(); render(); window.scrollTo({ top: 0 }); return; }
  const star = t.closest('.star');
  if (star) { toggleStar(star.dataset.star, star); return; }
  const copy = t.closest('.copy');
  if (copy) { copyCode(copy.dataset.copy, copy.closest('.hit')); return; }
  const chip = t.closest('.chip');
  if (chip) { qEl.value = chip.dataset.q; render(); return; }
  if (t.closest('[data-all]')) { category = -1; renderTabs(); render(); }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === '/' && document.activeElement !== qEl && !aboutEl.contains(document.activeElement)) {
    ev.preventDefault(); qEl.focus(); qEl.select();
  } else if (ev.key === 'Escape') {
    if (!aboutEl.hidden) closeAbout();
    else if (document.activeElement === qEl && qEl.value) { qEl.value = ''; render(); }
  }
});

window.addEventListener('hashchange', () => { readUrl(); renderTabs(); render(); });

// ---------- about sheet ----------
const aboutEl = $('#about');
let lastFocus = null;
function openAbout() {
  lastFocus = document.activeElement;
  aboutEl.hidden = false;
  document.body.style.overflow = 'hidden';
  aboutEl.querySelector('.sheet').focus();
}
function closeAbout() {
  aboutEl.hidden = true;
  document.body.style.overflow = '';
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
$('#about-open').addEventListener('click', openAbout);
$('#about-open-2').addEventListener('click', openAbout);
$('#about-close').addEventListener('click', closeAbout);
aboutEl.addEventListener('click', (ev) => { if (ev.target === aboutEl) closeAbout(); });

const fmt = (n) => n.toLocaleString('en-US');
$('#about-count').textContent = `${fmt(COUNTS.total)} entries: ${fmt(COUNTS.CPT)} CPT codes, ${fmt(COUNTS.HCPCS)} HCPCS Level II codes and ${fmt(COUNTS.MOD)} modifiers. Weighted toward neurosurgery and updated for ${DATA_EDITION}.`;
$('#foot-count').textContent = `${fmt(COUNTS.total)} codes in plain language, updated for ${DATA_EDITION}.`;

// ---------- install ----------
const installBtn = $('#install');
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  deferredPrompt = ev;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  try { await deferredPrompt.userChoice; } catch { /* ignore */ }
  deferredPrompt = null;
  installBtn.hidden = true;
});
window.addEventListener('appinstalled', () => { installBtn.hidden = true; });

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const hint = $('#ios-hint');
if (isIOS && !standalone && !store.get('iosHintDismissed', false)) {
  setTimeout(() => { hint.hidden = false; }, 1200);
}
$('#ios-hint-close').addEventListener('click', () => { hint.hidden = true; store.set('iosHintDismissed', true); });

// ---------- offline ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support unavailable */ });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
  });
}

// ---------- start ----------
readUrl();
renderTabs();
render();
if (!qEl.value && !isIOS && window.matchMedia('(hover: hover)').matches) qEl.focus();

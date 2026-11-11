import DATA, { CATEGORIES, COUNTS, ADDONS, DATA_EDITION, BUNDLES, DX, ICD } from './data.js';
import { createIndex, search, highlight, escapeHtml } from './search.js';

const index = createIndex(DATA, CATEGORIES);
const byCode = new Map(index.entries.map((e) => [e.code, e]));
const addons = new Set(ADDONS);

const $ = (s) => document.querySelector(s);
// Attach a listener only when the element exists, so one missing element can never stop the whole app.
const on = (target, type, fn) => {
  const el = typeof target === 'string' ? $(target) : target;
  if (el) el.addEventListener(type, fn);
};
const root = document.documentElement;
const qEl = $('#q');
const resultsEl = $('#results');
const statusEl = $('#status');
const tabsEl = $('#tabs');
const clearBtn = $('#clear');
const toastEl = $('#toast');
const aboutEl = $('#about');
const installPage = $('#install-page');

const SLUG = CATEGORIES.map((c) => c.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''));
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';

const QUICK = [
  'ACDF', 'TLIF', 'Lumbar laminectomy', 'Microdiscectomy', 'Craniotomy for tumor', 'Burr hole',
  'EVD', 'VP shunt', 'Chiari decompression', 'Kyphoplasty', 'SCS trial', 'Carpal tunnel release',
  'Stroke thrombectomy', 'Neuromonitoring', 'Critical care', 'Modifier 62',
];

const ua = navigator.userAgent;
const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isIPhone = /iphone|ipod/i.test(ua);
const isAndroid = /android/i.test(ua);
const inOtherApp = /FBAN|FBAV|Instagram|LinkedInApp|Line\/|Snapchat|GSA\//i.test(ua);
const device = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';
const isApp = root.classList.contains('is-app');

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
let installOpen = false;

// ---------- rendering ----------
const refButton = (c) => (byCode.has(c) ? `<button class="ref" type="button" data-ref="${c}">${c}</button>` : c);

function linkCodes(html) {
  return html.replace(/\b(\d{5}|[A-V]\d{4})\b/g, (m) => refButton(m));
}

function joinCodes(codes) {
  const refs = codes.map(refButton);
  return refs.length <= 2 ? refs.join(' or ') : `${refs.slice(0, -1).join(', ')} or ${refs[refs.length - 1]}`;
}

// Bundling reminders and common diagnoses, shown under the note.
function extrasHTML(e) {
  const parts = [];
  const rules = BUNDLES[e.code];
  if (rules && rules.length) {
    parts.push(`<ul class="bundle">${rules.map(([kind, codes, reason]) =>
      `<li>${kind === 'inc' ? 'Don’t add' : 'Not billed with'} ${joinCodes(codes)}: ${linkCodes(escapeHtml(reason))}.</li>`).join('')}</ul>`);
  }
  const dx = DX[e.code];
  if (dx && dx.length) {
    parts.push(`<details class="dx"><summary>Common diagnoses <span class="count">${dx.length}</span></summary><ul>${dx.map((d) => {
      const name = escapeHtml(ICD[d] || '');
      return `<li><button class="icd" type="button" data-icd="${d}" aria-label="Copy ${d}: ${name}"><span class="icd-code">${d}</span><span class="icd-name">${name}</span></button></li>`;
    }).join('')}</ul></details>`);
  }
  return parts.length ? `\n  <div class="extra">${parts.join('')}</div>` : '';
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
  </button>${e.note ? `\n  <p class="note">${linkCodes(escapeHtml(e.note))}</p>` : ''}${extrasHTML(e)}
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
  parts.push('<div class="home">');
  if (!isApp && !store.get('installCardHidden', false)) {
    parts.push(`<div class="install-card web-only">
      <img src="icons/icon-192.png" alt="" width="52" height="52">
      <p class="ic-title">Use it like an app</p>
      <p class="ic-text">Add it to your Home Screen for one-tap access that works offline.</p>
      <div class="ic-actions">
        <button class="btn primary" type="button" data-open-install>Show me how</button>
        <button class="btn quiet" type="button" data-hide-card>Not now</button>
      </div>
    </div>`);
  }
  parts.push(`<p class="lede">Find a CPT code by procedure, abbreviation or number.</p>
    <p class="lede-sub">Tap any result to copy its code.</p>
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
  if (clearBtn) clearBtn.hidden = !q;
  if (q) renderResults(q);
  else if (category >= 0) renderBrowse();
  else renderHome();
  syncUrl(q);
}

let frame = 0;
const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); };

// ---------- URL state (#q=...&s=...) ----------
function syncUrl(q) {
  if (installOpen) return;
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
  if (!toastEl) return;
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
function flash(el, ms = 450) {
  if (!el) return;
  el.classList.add('copied');
  setTimeout(() => el.classList.remove('copied'), ms);
}
async function copyCode(code, li) {
  const ok = await copyText(code);
  toast(`${ok ? 'Copied' : 'Code'} <span class="t-code">${escapeHtml(code)}</span>`);
  if (ok && navigator.vibrate) navigator.vibrate(12);
  flash(li);
  recent = [code, ...recent.filter((c) => c !== code)].slice(0, 12);
  store.set('recent', recent);
}
async function copyIcd(code, btn) {
  const ok = await copyText(code);
  toast(`${ok ? 'Copied' : 'Diagnosis code'} <span class="t-code">${escapeHtml(code)}</span>`);
  if (ok && navigator.vibrate) navigator.vibrate(12);
  flash(btn);
}

function toggleStar(code, btn) {
  if (starred.has(code)) starred.delete(code); else starred.add(code);
  store.set('starred', [...starred]);
  const isOn = starred.has(code);
  document.querySelectorAll(`.star[data-star="${code}"]`).forEach((b) => {
    b.setAttribute('aria-pressed', String(isOn));
    b.setAttribute('aria-label', `${isOn ? 'Unstar' : 'Star'} ${code}`);
  });
  if (!qEl.value.trim() && category < 0) {
    // keep focus stable on the home screen re-render
    renderHome();
    const again = document.querySelector(`.star[data-star="${code}"]`);
    if (again) again.focus(); else btn.blur();
  }
}

// ---------- events ----------
on(qEl, 'input', schedule);
on('#search-form', 'submit', (ev) => { ev.preventDefault(); qEl.blur(); });
on(clearBtn, 'click', () => { qEl.value = ''; render(); qEl.focus(); });

on(tabsEl, 'click', (ev) => {
  const btn = ev.target.closest('.tab');
  if (!btn) return;
  category = Number(btn.dataset.cat);
  tabsEl.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  render();
  window.scrollTo({ top: 0 });
});

on(resultsEl, 'click', (ev) => {
  const t = ev.target;
  const ref = t.closest('.ref');
  if (ref) { qEl.value = ref.dataset.ref; category = -1; renderTabs(); render(); window.scrollTo({ top: 0 }); return; }
  const star = t.closest('.star');
  if (star) { toggleStar(star.dataset.star, star); return; }
  const copy = t.closest('.copy');
  if (copy) { copyCode(copy.dataset.copy, copy.closest('.hit')); return; }
  const icd = t.closest('.icd');
  if (icd) { copyIcd(icd.dataset.icd, icd); return; }
  const chip = t.closest('.chip');
  if (chip) { qEl.value = chip.dataset.q; render(); return; }
  if (t.closest('[data-hide-card]')) { store.set('installCardHidden', true); renderHome(); return; }
  if (t.closest('[data-all]')) { category = -1; renderTabs(); render(); }
});

document.addEventListener('keydown', (ev) => {
  const aboutOpen = aboutEl && !aboutEl.hidden;
  if (ev.key === '/' && !installOpen && !aboutOpen && document.activeElement !== qEl) {
    ev.preventDefault(); qEl.focus(); qEl.select();
  } else if (ev.key === 'Escape') {
    if (aboutOpen) closeAbout();
    else if (installOpen) closeInstall();
    else if (document.activeElement === qEl && qEl.value) { qEl.value = ''; render(); }
  }
});

window.addEventListener('hashchange', () => {
  if (location.hash === '#install') {
    if (isApp) history.replaceState(null, '', location.pathname + location.search);
    else openInstall(false);
    return;
  }
  if (installOpen) closeInstall(true);
  readUrl(); renderTabs(); render();
});

// ---------- display settings (colors and text size) ----------
const schemeMeta = document.querySelector('meta[name="color-scheme"]');
const lightQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
let theme = store.get('theme', 'dark');
if (!['dark', 'light', 'auto'].includes(theme)) theme = 'dark';
let textSize = store.get('textSize', 1);
if (![1, 2, 3].includes(textSize)) textSize = 1;

function applyTheme() {
  const light = theme === 'light' || (theme === 'auto' && !!lightQuery && lightQuery.matches);
  root.classList.toggle('theme-light', light);
  if (schemeMeta) schemeMeta.setAttribute('content', light ? 'light' : 'dark');
}
function applyTextSize() {
  root.classList.toggle('text-2', textSize === 2);
  root.classList.toggle('text-3', textSize === 3);
}
function syncSettings() {
  document.querySelectorAll('input[name="theme"]').forEach((i) => { i.checked = i.value === theme; });
  document.querySelectorAll('input[name="textSize"]').forEach((i) => { i.checked = Number(i.value) === textSize; });
}
on(aboutEl, 'change', (ev) => {
  const t = ev.target;
  if (t.name === 'theme') { theme = t.value; store.set('theme', theme); applyTheme(); }
  if (t.name === 'textSize') { textSize = Number(t.value); store.set('textSize', textSize); applyTextSize(); }
});
if (lightQuery) {
  const follow = () => { if (theme === 'auto') applyTheme(); };
  if (lightQuery.addEventListener) lightQuery.addEventListener('change', follow);
  else if (lightQuery.addListener) lightQuery.addListener(follow);
}
applyTheme();
applyTextSize();
syncSettings();

// ---------- settings and info sheet ----------
let lastFocus = null;
function openAbout() {
  if (!aboutEl) return;
  lastFocus = document.activeElement;
  syncSettings();
  aboutEl.hidden = false;
  document.body.style.overflow = 'hidden';
  const sheet = aboutEl.querySelector('.sheet');
  if (sheet) { sheet.scrollTop = 0; sheet.focus(); }
}
function closeAbout() {
  if (!aboutEl) return;
  aboutEl.hidden = true;
  document.body.style.overflow = '';
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
on('#about-open', 'click', openAbout);
on('#about-open-2', 'click', openAbout);
on('#about-close', 'click', closeAbout);
on(aboutEl, 'click', (ev) => { if (ev.target === aboutEl) closeAbout(); });

const fmt = (n) => n.toLocaleString('en-US');
const aboutCount = $('#about-count');
if (aboutCount) aboutCount.textContent = `${fmt(COUNTS.total)} entries: ${fmt(COUNTS.CPT)} CPT codes, ${fmt(COUNTS.HCPCS)} HCPCS Level II codes and ${fmt(COUNTS.MOD)} modifiers. Weighted toward neurosurgery and updated for ${DATA_EDITION}.`;
const footCount = $('#foot-count');
if (footCount) footCount.textContent = `${fmt(COUNTS.total)} codes in plain language, updated for ${DATA_EDITION}.`;

// ---------- problem reports: the email is prefilled with the build and the current search ----------
on('#report', 'click', (ev) => {
  const q = qEl.value.trim();
  const where = isApp ? 'Home Screen app' : 'browser';
  const deviceName = isIOS ? (isIPhone ? 'iPhone' : 'iPad') : isAndroid ? 'Android' : 'computer';
  const body = ['What happened?', '', '', '--', ...(q ? [`Search: ${q}`] : []), `Build: ${root.dataset.build || '?'} (${deviceName}, ${where})`].join('\r\n');
  ev.currentTarget.href = `mailto:mussidik1@gmail.com?subject=${encodeURIComponent('Neuro CPT problem report')}&body=${encodeURIComponent(body)}`;
});

// ---------- install (browser only; never shown inside the installed app) ----------
const installBtn = $('#install');
const installNowBtns = [$('#install-now'), $('#install-now-desktop')].filter(Boolean);
let deferredPrompt = null;
const setInstallButtons = (show) => {
  if (installBtn) installBtn.hidden = !show;
  installNowBtns.forEach((b) => { b.hidden = !show; });
};
window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  if (isApp) return;
  deferredPrompt = ev;
  setInstallButtons(true);
});
async function promptInstall() {
  if (!deferredPrompt) { openInstall(); return; }
  deferredPrompt.prompt();
  try { await deferredPrompt.userChoice; } catch { /* ignore */ }
  deferredPrompt = null;
  setInstallButtons(false);
}
on(installBtn, 'click', promptInstall);
installNowBtns.forEach((b) => on(b, 'click', promptInstall));
window.addEventListener('appinstalled', () => setInstallButtons(false));

let installPushed = false;
let focusBeforeInstall = null;

function showDevice(d) {
  if (!installPage) return;
  installPage.querySelectorAll('.device').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.device === d)));
  installPage.querySelectorAll('.howto').forEach((sec) => { sec.hidden = sec.dataset.panel !== d; });
}
function detectedText() {
  const name = isIOS ? (isIPhone ? 'an iPhone' : 'an iPad') : isAndroid ? 'an Android phone' : 'a computer';
  let text = `Showing the steps for ${name}. Pick another device above if that's wrong.`;
  if (inOtherApp) text += ' This page looks like it is open inside another app, so open it in your browser first.';
  return text;
}
function openInstall(push = true) {
  if (isApp || installOpen || !installPage) return;
  focusBeforeInstall = document.activeElement;
  installOpen = true;
  showDevice(device);
  const detected = $('#detected');
  if (detected) detected.textContent = detectedText();
  installPage.hidden = false;
  document.body.style.overflow = 'hidden';
  if (push && location.hash !== '#install') { history.pushState({ install: true }, '', '#install'); installPushed = true; }
  installPage.scrollTop = 0;
  const title = $('#install-title');
  if (title) title.focus({ preventScroll: true });
}
function closeInstall(fromHistory = false) {
  if (!installOpen) return;
  installOpen = false;
  installPage.hidden = true;
  document.body.style.overflow = '';
  if (!fromHistory) {
    if (installPushed) history.back();
    else { history.replaceState(null, '', location.pathname + location.search); render(); }
  }
  installPushed = false;
  if (focusBeforeInstall && focusBeforeInstall.focus) focusBeforeInstall.focus({ preventScroll: true });
}
on('#install-back', 'click', () => closeInstall());
on(installPage && installPage.querySelector('.device-pick'), 'click', (ev) => {
  const b = ev.target.closest('.device');
  if (b) showDevice(b.dataset.device);
});
on('#copy-install-link', 'click', async () => {
  const link = `${location.origin}${location.pathname}#install`;
  const ok = await copyText(link);
  toast(ok ? 'Link copied' : escapeHtml(link));
});
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('[data-open-install]')) return;
  if (aboutEl && !aboutEl.hidden) closeAbout();
  openInstall();
});

// ---------- offline ----------
// Script and style names change with every release and the page is always fetched fresh when online,
// so there is nothing to reload when a new version installs; it is simply ready for the next visit.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => { /* offline */ });
      });
    }).catch(() => { /* offline support unavailable */ });
  });
}

// ---------- start ----------
readUrl();
renderTabs();
if (location.hash === '#install') {
  if (isApp) history.replaceState(null, '', location.pathname + location.search);
  else openInstall(false);
}
render();
if (!qEl.value && !isIOS && window.matchMedia('(hover: hover)').matches) qEl.focus();

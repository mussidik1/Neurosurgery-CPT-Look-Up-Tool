// Build: validate the data files, then assemble the static site into ./site
// Usage: node tools/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'site');

export const CATEGORIES = [
  'Spine', 'Cranial', 'Functional', 'Nerve & Pain', 'Endovascular', 'Neurodiagnostics',
  'E/M', 'Imaging', 'Modifiers', 'HCPCS', 'Other surgery', 'Lab', 'Medicine',
];

// Add-on codes (the "+" codes in the CPT book) that appear in the data. Shown with an "Add-on" tag.
export const ADDONS = [
  '63048', '63035', '63043', '63044', '63052', '63053', '63057', '63066', '63076', '63078', '63082', '63086', '63088', '63091', '63103', '62331', '63032',
  '22552', '22585', '22614', '22632', '22634', '22534', '22840', '22842', '22843', '22844', '22845', '22846', '22847', '22848', '22853', '22854', '22859',
  '20930', '20931', '20936', '20937', '20938', '20939', '61783', '69990', '22208', '22216', '22328', '22858', '22860', '22868', '22870', '22515', '22512', '64629', '63295',
  '61316', '61517', '62148', '62160', '61781', '61782', '61797', '61799', '61800', '63621', '61864', '61868', '95984',
  '64727', '64787', '64913', '64484', '64480', '64491', '64492', '64494', '64495', '64634', '64636', '64643', '64645', '95873', '95874',
  '36227', '36228', '61651', '61641', '61642', '95940', '95941', '95962', '95885', '95886',
  '99292', '99417', '99418', '99498', '99153', '99157', '99458',
  '70472', '76937', '77002', '77003', '29826', '38900', '88341', '94729', '96375', '96366', '96367', '96361', '90472',
  'G2211', 'G2212', 'G0316',
];

// Codes that were deleted or replaced before/at CPT 2026. If any reappear in the data, the build fails.
const DELETED = new Set([
  '0042T', '0275T', '0398T', '0720T', '55700', '27445', '27468', '52647', '37500',
  '92921', '92925', '92929', '92934', '92938', '92944', '92975', '92977', '77385', '77386',
  '37220', '37221', '37222', '37223', '37224', '37225', '37226', '37227', '37228', '37229',
  '37230', '37231', '37232', '37233', '37234', '37235',
  '99201', '99241', '99251', '99441', '99442', '99443', '99217', '99218', '99219', '99220',
  '99354', '99355', '99356', '99357', '49560', '49565', '49570', '49580', '49585', '49587',
  '49590', '21800', '32405', '33010', '33011', '61795', '0191T',
]);

function loadRows() {
  const rows = [];
  let current = '';
  const add = (cat, sub, items) => {
    for (const it of items) {
      let [code, name, syn = '', note = ''] = it;
      let p = 0;
      if (code.startsWith('*')) { p = 1; code = code.slice(1); }
      rows.push({ code, name, syn, note, cat, sub, p, file: current });
    }
  };
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.js')).sort();
  for (const f of files) {
    current = f;
    vm.runInNewContext(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'), { add }, { filename: f });
  }
  return rows;
}

export function validate(rows) {
  const errors = [];
  const seen = new Map();
  const RE = {
    CPT: /^(\d{5}|\d{4}[TU])$/,
    HCPCS: /^[A-V]\d{4}$/,
    MOD: /^(\d{2}|[A-Z]{2})$/,
  };
  for (const r of rows) {
    if (!CATEGORIES.includes(r.cat)) errors.push(`${r.file}: unknown category "${r.cat}"`);
    r.sys = r.cat === 'Modifiers' ? 'MOD' : /^[A-V]\d{4}$/.test(r.code) ? 'HCPCS' : 'CPT';
    if (!RE[r.sys].test(r.code)) errors.push(`${r.file}: bad ${r.sys} code format "${r.code}"`);
    if (seen.has(r.code)) errors.push(`duplicate code ${r.code} (${seen.get(r.code)} and ${r.file})`);
    seen.set(r.code, r.file);
    if (DELETED.has(r.code)) errors.push(`${r.file}: ${r.code} is a deleted/replaced code`);
    if (!r.name || r.name.length < 4) errors.push(`${r.code}: missing name`);
    if (/[?]/.test(r.syn)) errors.push(`${r.code}: "?" found in synonyms`);
    if (/\|\|/.test(r.syn) || /^\||\|$/.test(r.syn)) errors.push(`${r.code}: empty synonym`);
    if (r.sys === 'CPT' && r.cat === 'HCPCS') errors.push(`${r.code}: CPT code filed under HCPCS`);
    // Codes referenced inside notes should exist in the data or be well-known externals.
  }
  // Cross-check: every 5-character code mentioned in a note that we *claim* as a pairing should exist,
  // unless it is in a short allow-list of codes intentionally not in the data.
  const ALLOW_MISSING = new Set(['95717', '95726', '55700', '55708', '55715', '96139']);
  for (const r of rows) {
    const refs = (r.note.match(/\b(\d{5}|[A-V]\d{4})\b/g) || []);
    for (const ref of refs) {
      if (!seen.has(ref) && !ALLOW_MISSING.has(ref)) errors.push(`${r.code}: note references ${ref}, which is not in the data`);
    }
  }
  for (const a of ADDONS) if (!seen.has(a)) errors.push(`add-on list names ${a}, which is not in the data`);
  return errors;
}

function hashFiles(dir) {
  const h = crypto.createHash('sha256');
  const walk = (d) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name !== 'sw.js') { h.update(path.relative(dir, p)); h.update(fs.readFileSync(p)); }
    }
  };
  walk(dir);
  return h.digest('hex').slice(0, 10);
}

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out;
}

function build() {
  const rows = loadRows();
  const errors = validate(rows);
  if (errors.length) {
    console.error(`Data validation failed (${errors.length}):\n  ` + errors.join('\n  '));
    process.exit(1);
  }

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });

  // Static sources
  for (const f of ['index.html', 'app.css', 'app.js', 'search.js', 'manifest.webmanifest']) {
    fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
  }
  for (const f of fs.readdirSync(path.join(SRC, 'icons'))) {
    fs.copyFileSync(path.join(SRC, 'icons', f), path.join(OUT, 'icons', f));
  }
  const fonts = {
    'cardo-400.woff2': '@fontsource/cardo/files/cardo-latin-400-normal.woff2',
    'cardo-400-italic.woff2': '@fontsource/cardo/files/cardo-latin-400-italic.woff2',
    'cardo-700.woff2': '@fontsource/cardo/files/cardo-latin-700-normal.woff2',
  };
  for (const [dest, src] of Object.entries(fonts)) {
    fs.copyFileSync(path.join(ROOT, 'node_modules', src), path.join(OUT, 'fonts', dest));
  }
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  // Data module (compact rows)
  const compact = rows.map((r) => [r.code, r.name, r.syn, r.note, CATEGORIES.indexOf(r.cat), r.sub, r.p, r.sys]);
  const counts = { total: rows.length, CPT: 0, HCPCS: 0, MOD: 0 };
  for (const r of rows) counts[r.sys]++;
  const dataJs =
    `// Generated by tools/build.mjs — do not edit. Plain-language summaries, not official AMA descriptors.\n` +
    `export const CATEGORIES = ${JSON.stringify(CATEGORIES)};\n` +
    `export const COUNTS = ${JSON.stringify(counts)};\n` +
    `export const DATA_EDITION = "CPT 2026";\n` +
    `export const ADDONS = ${JSON.stringify(ADDONS)};\n` +
    `export default ${JSON.stringify(compact)};\n`;
  fs.writeFileSync(path.join(OUT, 'data.js'), dataJs);

  // Service worker: stamp version + precache list
  const version = hashFiles(OUT);
  const precache = ['./', ...listFiles(OUT).filter((f) => f !== 'sw.js' && f !== '.nojekyll' && f !== 'index.html')];
  const sw = fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8')
    .replace('__VERSION__', version)
    .replace('__PRECACHE__', JSON.stringify(precache, null, 2));
  fs.writeFileSync(path.join(OUT, 'sw.js'), sw);

  // Bake the version into the page so "About" can show it
  const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8').replace('__VERSION__', version);
  fs.writeFileSync(path.join(OUT, 'index.html'), html);

  console.log(`Built ${rows.length} codes (CPT ${counts.CPT}, HCPCS ${counts.HCPCS}, modifiers ${counts.MOD}) -> site/  version ${version}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) build();
export { loadRows };

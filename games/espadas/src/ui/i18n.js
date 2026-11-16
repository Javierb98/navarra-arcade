// UI strings live in data/strings.json. Scenario prose carries its own
// { en, es, eu } objects, read with L(). Missing text falls back to Spanish,
// then English. The Basque is machine-drafted: have it checked.

export const LANGS = ['es', 'eu', 'en'];
// The browser's language if it's one of ours; Spanish otherwise.
const browser = (navigator.languages?.length ? navigator.languages : [navigator.language ?? '']).map((l) => String(l).toLowerCase().split('-')[0]);
let lang = browser.find((l) => LANGS.includes(l)) ?? 'es';
let strings = { es: {}, eu: {}, en: {} };

export function initI18n(table) {
  strings = table;
  try {
    const saved = localStorage.getItem('mk.lang');
    if (LANGS.includes(saved)) lang = saved;
  } catch { /* storage blocked: stay on the default */ }
  document.documentElement.lang = lang;
}

export const getLang = () => lang;

export function setLang(l) {
  if (!LANGS.includes(l)) return;
  lang = l;
  document.documentElement.lang = l;
  try { localStorage.setItem('mk.lang', l); } catch { /* ignore */ }
}

function raw(key) {
  const s = strings[lang]?.[key] ?? strings.es?.[key] ?? strings.en?.[key];
  if (s == null) console.warn(`missing string: ${key}`);
  return s ?? key;
}

export function t(key, vars = {}) {
  return raw(key).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// Like t(), but placeholder values may be DOM nodes (coloured unit names).
export function tn(key, vars = {}) {
  const s = raw(key);
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of s.matchAll(/\{(\w+)\}/g)) {
    frag.append(s.slice(last, m.index));
    const v = vars[m[1]];
    frag.append(v instanceof Node ? v : String(v ?? m[0]));
    last = m.index + m[0].length;
  }
  frag.append(s.slice(last));
  return frag;
}

export function L(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v[lang] ?? v.es ?? v.en ?? '';
}

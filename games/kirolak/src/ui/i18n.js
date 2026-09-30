// UI strings live in data/locales/<lang>.json. Spanish is the default and the
// fallback; keys starting with "_" are notes for translators, not strings.

export const LANGS = ['es', 'eu', 'en'];
let lang = 'es';
let strings = { es: {}, eu: {}, en: {} };

export function initI18n(table, initial) {
  strings = table;
  setLang(initial);
}

export const getLang = () => lang;

export function setLang(l) {
  if (!LANGS.includes(l)) return;
  lang = l;
  document.documentElement.lang = l;
}

export function nextLang(step = 1) {
  setLang(LANGS[(LANGS.indexOf(lang) + step + LANGS.length) % LANGS.length]);
}

const warned = new Set();
export function t(key, vars = {}) {
  let s = strings[lang]?.[key] ?? strings.es?.[key];
  if (s == null) {
    if (!warned.has(key)) { warned.add(key); console.warn(`missing string: ${key}`); }
    s = key;
  }
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

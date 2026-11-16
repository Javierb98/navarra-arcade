// Settings and high scores, kept in this browser only. Scores are three
// initials and a number; nothing else about players is stored anywhere.

const SETTINGS = 'pelota.settings';
const SCORES = 'pelota.scores';
const KEEP = 5;

const read = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const write = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: keep going */ }
};

// The browser's own language when it's one we have; Spanish otherwise.
export function browserLang(have = ['es', 'eu', 'en']) {
  const list = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language ?? ''];
  for (const l of list) { const code = String(l).toLowerCase().split('-')[0]; if (have.includes(code)) return code; }
  return 'es';
}

export const settings = { lang: browserLang(), difficulty: 'normal', volume: 7, ...read(SETTINGS, {}) };
export const saveSettings = () => write(SETTINGS, settings);

const table = (course, difficulty) => `${course}.${difficulty}`;

export function topScores(course, difficulty) {
  return read(SCORES, {})[table(course, difficulty)] ?? [];
}

export function qualifies(course, difficulty, score) {
  const list = topScores(course, difficulty);
  return score > 0 && (list.length < KEEP || score > list[list.length - 1].score);
}

export function addScore(course, difficulty, name, score) {
  const all = read(SCORES, {});
  const list = [...(all[table(course, difficulty)] ?? []), { name, score }]
    .sort((a, b) => b.score - a.score).slice(0, KEEP);
  all[table(course, difficulty)] = list;
  write(SCORES, all);
  return list;
}

export const resetScores = () => write(SCORES, {});

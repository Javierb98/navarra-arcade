// Settings and high scores, kept in this browser only. Scores are three
// initials and a number; nothing else about players is stored anywhere.

const SETTINGS = 'paxavant.settings';
const SCORES = 'paxavant.scores';
const KEEP = 5;

const read = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const write = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: keep going */ }
};

export const settings = { lang: 'es', difficulty: 'normal', volume: 7, ...read(SETTINGS, {}) };
export const saveSettings = () => write(SETTINGS, settings);

const table = (board, difficulty) => `${board}.${difficulty}`;

export function topScores(board, difficulty) {
  return read(SCORES, {})[table(board, difficulty)] ?? [];
}

export function qualifies(board, difficulty, score) {
  const list = topScores(board, difficulty);
  return score > 0 && (list.length < KEEP || score > list[list.length - 1].score);
}

export function addScore(board, difficulty, name, score) {
  const all = read(SCORES, {});
  const list = [...(all[table(board, difficulty)] ?? []), { name, score }]
    .sort((a, b) => b.score - a.score).slice(0, KEEP);
  all[table(board, difficulty)] = list;
  write(SCORES, all);
  return list;
}

export const resetScores = () => write(SCORES, {});

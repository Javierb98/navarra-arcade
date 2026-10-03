// Screen flow: title -> map cutscene -> armies -> muster -> deploy -> battle -> results.

import { initI18n, t } from './i18n.js';
import { installArcadeLink } from './arcade.js';
import { padButton, navigate } from './padnav.js';
import { titleScreen, cutsceneScreen, armiesScreen, musterScreen, resultsScreen, helpDialog, customScreen, homageScreen } from './screens.js';
import { deployScreen, battleScreen, newBattle } from './battle_screen.js';

const app = document.getElementById('app');
const BATTLES = ['covadonga', 'roncesvalles', 'simancas', 'las_navas'];

const S = {
  data: null,
  scenarios: {},
  scenario: null,
  counts: null,
  placements: null,
  battle: null,
  seed: null,
  speed: 1,
};

let current = null; // { render, handle }

function show(render) {
  current?.handle?.destroy?.();
  window.scrollTo(0, 0);
  current = { render, handle: render() ?? null };
}
const rerender = () => show(current.render);

const flow = {
  title: () => show(() => titleScreen(app, S, { onPlay: flow.briefing, onHelp: helpDialog, onCustom: flow.custom, onHomage: flow.homage, rerender })),
  custom: () => show(() => customScreen(app, S, { onBack: flow.title, onNext: flow.armies, rerender })),
  homage: () => show(() => homageScreen(app, S, { onBack: flow.title, rerender })),
  briefing: (id) => {
    if (id && S.scenario?.id !== id) { S.scenario = S.scenarios[id]; S.counts = null; S.placements = null; }
    show(() => cutsceneScreen(app, S, { onBack: flow.title, onNext: flow.armies, rerender }));
  },
  armies: () => show(() => armiesScreen(app, S, { onBack: () => (S.scenario.custom ? flow.custom() : flow.briefing()), onNext: flow.muster, rerender })),
  muster: () => show(() => musterScreen(app, S, { onBack: flow.armies, onNext: flow.deploy, rerender })),
  deploy: () => show(() => deployScreen(app, S, {
    onBack: flow.muster,
    onBegin: (placements) => { S.battle = newBattle(S, placements); flow.battle(); },
  })),
  battle: () => show(() => battleScreen(app, S, { onEnd: flow.results, onHelp: helpDialog })),
  results: () => show(() => resultsScreen(app, S, { onAgain: flow.muster, onTitle: flow.title, rerender })),
};

// Keys: an arcade button first (the battle board and deployment take the
// stick themselves; everywhere else it walks the screen's buttons), then the
// screen's own keyboard shortcuts. Minigames listen for themselves.
document.addEventListener('keydown', (e) => {
  if (document.querySelector('.aim-overlay') || document.querySelector('.arcade-dialog')) return;
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
  const b = padButton(e);
  const dialog = document.querySelector('dialog[open]');
  if (b && dialog) { e.preventDefault(); if (b === 'b' || (b === 'start' && !navigate(dialog, 'start'))) dialog.querySelector('[data-back], button')?.click(); else navigate(dialog, b); return; }
  if (dialog) return;
  if (b && current?.handle?.onPad?.(b, e)) { e.preventDefault(); return; }
  current?.handle?.onKey?.(e);
  if (b && !e.defaultPrevented && navigate(app, b)) e.preventDefault();
});

async function boot() {
  const get = async (p) => {
    const r = await fetch(p);
    if (!r.ok) throw new Error(`${p}: ${r.status}`);
    return r.json();
  };
  try {
    const [rules, units, strings, ...battles] = await Promise.all([
      get('data/rules.json'), get('data/units.json'), get('data/strings.json'),
      ...BATTLES.map((id) => get(`data/battles/${id}.json`)),
    ]);
    initI18n(strings);
    installArcadeLink(); // only does anything when opened from the arcade menu
    S.data = { rules, factions: units.factions, units: units.units };
    for (const b of battles) S.scenarios[b.id] = b;
    document.title = t('title.name');
    flow.title();
  } catch (err) {
    console.error(err);
    // Strings may not have loaded, so this one message carries both languages.
    app.textContent = `Could not load game data / No se pudieron cargar los datos (${err.message}). python3 -m http.server`;
  }
}

boot();

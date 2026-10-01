// Boot, the fixed-step loop, sharp scaling, idle reset and the admin menu.
// Screens live in screens.js; this file only moves between them.

import { h } from './dom.js';
import { initI18n, t, setLang, LANGS } from './i18n.js';
import { Input } from './input.js';
import { unlockAudio, setVolume, sfx } from './audio.js';
import { settings, saveSettings, resetScores } from './store.js';
import * as screens from './screens.js';
import { initTouch, playArea } from './touch.js';
import { menuUrl, langParam, backToMenu } from './arcade.js';
import { initKeys, showKeys } from './keys.js';

const FIXED = 1 / 60;
const W = 960;
const H = 540;
const DPR = 2; // the canvas is drawn at twice the stage size
const IDLE_AFTER = 60;
const IDLE_GRACE = 10;

const stage = document.getElementById('stage');
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const ui = document.getElementById('ui');
const overlay = document.getElementById('overlay');

const app = {
  ui, data: null, input: null, time: 0, session: null, images: new Map(),
  screen: null, name: null,
  go(name, arg) {
    try {
      this.name = name;
      this.screen = screens[name](this, arg);
    } catch (err) {
      console.error(`screen ${name} failed`, err);
      if (name !== 'attract') this.go('attract');
    }
  },
};

// CSS zoom (not transform: scale) so text is laid out at full resolution.
function fit() {
  // On a phone or tablet the on-screen controls take part of the screen.
  const a = playArea(W, H);
  const k = Math.min(a.w / W, a.h / H);
  const scale = k;
  stage.style.zoom = scale;
  stage.style.left = `${(a.x + (a.w - W * scale) / 2) / scale}px`;
  stage.style.top = `${(a.y + (a.h - H * scale) / 2) / scale}px`;
}
addEventListener('resize', fit);

// ---- idle: "Still playing?" then back to attract --------------------------

let idleFor = 0;
let idleShown = false;

function updateIdle(dt) {
  if (app.input.activity) {
    idleFor = 0;
    if (idleShown) { idleShown = false; overlay.replaceChildren(); }
    return;
  }
  if (app.screen?.attract) { idleFor = 0; return; }
  idleFor += dt;
  if (idleFor < IDLE_AFTER) return;
  const left = Math.ceil(IDLE_AFTER + IDLE_GRACE - idleFor);
  if (left <= 0) {
    idleShown = false;
    overlay.replaceChildren();
    // Opened from the arcade menu: an abandoned game goes back to the menu.
    if (menuUrl) backToMenu();
    else app.go('attract');
    return;
  }
  if (!idleShown || overlay.dataset.left !== String(left)) {
    idleShown = true;
    overlay.dataset.left = left;
    overlay.replaceChildren(h('div', { class: 'overlay idle' }, h('div', { class: 'card' },
      h('h2', {}, t('idle.title')), h('p', { class: 'count' }, String(left)), h('p', {}, t('idle.hint')))));
  }
}

// ---- admin menu (hidden service button) -------------------------------------

let admin = null;

function openAdmin() {
  admin = { row: 0, note: '' };
  showAdmin();
}

function showAdmin() {
  const rows = [
    [t('admin.volume'), `${settings.volume} / 10`],
    [t('admin.lang'), t(`lang.${settings.lang}`)],
    [t('admin.difficulty'), t(`menu.difficulty.${settings.difficulty}`)],
    [t('admin.reset'), admin.note],
    [t('admin.close'), ''],
  ];
  overlay.replaceChildren(h('div', { class: 'overlay admin' }, h('div', { class: 'card' },
    h('h2', {}, t('admin.title')),
    rows.map(([label, value], i) => h('div', { class: `row ${i === admin.row ? 'sel' : ''}` }, h('span', {}, label), h('span', {}, value))),
    h('p', { class: 'hint' }, screens.rich(t('admin.hint'))))));
}

function updateAdmin() {
  const inp = app.input;
  if (inp.admin) { admin = null; overlay.replaceChildren(); return; }
  if (inp.any('up')) admin.row = (admin.row + 4) % 5;
  if (inp.any('down')) admin.row = (admin.row + 1) % 5;
  const dir = inp.any('left') ? -1 : inp.any('right') || inp.any('a') ? 1 : 0;
  if (dir) {
    if (admin.row === 0) { settings.volume = Math.max(0, Math.min(10, settings.volume + dir)); setVolume(settings.volume); sfx.move(); }
    if (admin.row === 1) { settings.lang = LANGS[(LANGS.indexOf(settings.lang) + dir + LANGS.length) % LANGS.length]; setLang(settings.lang); }
    if (admin.row === 2) settings.difficulty = settings.difficulty === 'easy' ? 'normal' : 'easy';
    if (admin.row === 3 && inp.any('a')) { resetScores(); admin.note = t('admin.resetDone'); }
    if (admin.row === 4 && inp.any('a')) { admin = null; overlay.replaceChildren(); saveSettings(); return; }
    saveSettings();
  }
  if (inp.any('up') || inp.any('down') || dir) showAdmin();
}

// ---- exit: hold START for 2 seconds (or press Esc) ---------------------------

const EXIT_HOLD = 2;
let exitBox = null;
let startHeld = 0;

function wantsExit(dt) {
  startHeld = app.input.players.some((p) => p.start) ? startHeld + dt : 0;
  if (startHeld >= EXIT_HOLD) { startHeld = -1e9; return true; } // once per hold
  if (!app.input.players.some((p) => p.start)) startHeld = 0;
  return app.input.exit;
}

function openExit() {
  exitBox = true;
  overlay.replaceChildren(h('div', { class: 'overlay idle' }, h('div', { class: 'card' },
    h('h2', {}, t(menuUrl ? 'exit.title' : 'exit.titleAlone')),
    h('p', {}, screens.rich(t('exit.hint'))))));
}

function updateExit() {
  const inp = app.input;
  if (inp.any('a') || inp.exit) {
    exitBox = null;
    overlay.replaceChildren();
    if (menuUrl) backToMenu();
    else app.go('attract');
  } else if (inp.any('b')) {
    exitBox = null;
    overlay.replaceChildren();
  }
}

// ---- loop -------------------------------------------------------------------

let last = performance.now();
let acc = 0;
let failures = 0;

function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  try {
    while (acc >= FIXED) {
      acc -= FIXED;
      app.time += FIXED;
      app.input.poll(FIXED);
      showKeys(app.input.keyboard);
      if (app.input.activity) unlockAudio();
      if (exitBox) { updateExit(); continue; }
      if (wantsExit(FIXED)) { openExit(); continue; }
      if (admin) { updateAdmin(); continue; }
      if (app.input.admin) { openAdmin(); continue; }
      updateIdle(FIXED);
      if (!idleShown) app.screen.update(FIXED);
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    app.screen.draw(ctx);
    failures = 0;
  } catch (err) {
    // Never leave a child looking at a frozen screen: log it and start over.
    console.error(err);
    if (++failures > 3) location.reload();
    else app.go('attract');
  }
  requestAnimationFrame(frame);
}

// ---- boot -------------------------------------------------------------------

async function boot() {
  const get = async (p) => {
    const r = await fetch(p);
    if (!r.ok) throw new Error(`${p}: ${r.status}`);
    return r.json();
  };
  fit();
  try {
    const [rules, controls, facts, story, glossary, layout, ...locales] = await Promise.all([
      get('data/rules.json'), get('data/controls.json'), get('data/facts.json'), get('data/story.json'), get('data/glossary.json'), get('data/layout.json'),
      ...LANGS.map((l) => get(`data/locales/${l}.json`)),
    ]);
    initI18n(Object.fromEntries(LANGS.map((l, i) => [l, locales[i]])), langParam ?? settings.lang);
    setVolume(settings.volume);
    app.data = { rules, layout, facts: facts.facts, story, glossary };
    app.input = new Input(controls);
    if (initTouch(controls, { onGesture: unlockAudio, onLayout: fit })) fit();
    initKeys(controls);
    document.title = t('title.name');
    // From the arcade menu, skip the attract demo and go straight to setup.
    app.go(menuUrl ? 'menu' : 'attract');
    requestAnimationFrame(frame);
  } catch (err) {
    console.error(err);
    ui.textContent = `No se pudieron cargar los datos / Could not load game data (${err.message})`;
  }
}

boot();

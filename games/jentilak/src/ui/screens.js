// Every screen is a function (app, arg) -> { update(dt), draw(ctx) } that
// builds its own DOM over the canvas and moves on with app.go(). Flow:
// attract -> select -> match -> result -> select (or attract when idle).

import { h } from './dom.js';
import { t, getLang, nextLang } from './i18n.js';
import { Match } from '../core/fight.js';
import { Cpu } from '../core/cpu.js';
import { drawMatch, drawHud, makeView, finish, portrait, stageThumb, PCOL, S, W, H } from './art.js';
import { ELEMENT_ICON } from './icons.js';
import { isUnlocked, settings } from './store.js';
import { sfx } from './audio.js';
import { keysOn, keyName } from './keys.js';

export function rich(text, p = 0) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/\[(A|B|C|S|START|↑|↓)\]/g)) {
    // [S] is the super button (d in the key map); [↑] [↓] are the stick.
    const stick = { '↑': 'up', '↓': 'down' }[m[1]];
    const b = stick ?? (m[1] === 'S' ? 'd' : m[1].toLowerCase());
    parts.push(text.slice(last, m.index), h('span', { class: `btn btn-${stick ? 'stick' : b}` }, m[1]));
    if (keysOn()) parts.push(h('kbd', {}, keyName(p, b)));
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

const tag = (i) => h('span', { class: `ptag p${i}` });
const elIcon = (el) => h('span', { class: `elicon el-${el}`, html: ELEMENT_ICON[el] });
const seed = (app) => (app.time * 1000 + Date.now()) | 0;

// A match that plays itself in the background: on the title screen two
// computer players really fight; behind the select screen they just circle.
function backdrop(app, live = false) {
  const open = app.data.fighters.filter((k) => !k.unlock || isUnlocked(k.id));
  let m, cpus, n = 0;
  const fresh = () => {
    const s = seed(app) + n++;
    const a = open[Math.abs(s) % open.length].id, b = open[Math.abs(s * 7 + 3) % open.length].id;
    m = new Match(app.data, live ? { fighters: [a, b], seed: s, stocks: 1 } : { seed: 7 });
    cpus = live ? [0, 1].map((i) => new Cpu(m, i, 'normal', s)) : null;
  };
  fresh();
  let t0 = 0;
  return {
    update(dt) {
      t0 += dt;
      if (live) { m.step(cpus.map((c) => c.input())); if (m.phase === 'over' || m.phase === 'game') fresh(); return; }
      const a = Math.sin(t0 * 0.7);
      m.step([{ x: a * 0.4, j: Math.sin(t0 * 1.3) > 0.995 }, { x: -a * 0.4, j: Math.cos(t0 * 1.1) > 0.995 }]);
      if (m.phase !== 'fight' && m.phase !== 'bow') fresh();
    },
    draw(g) { drawMatch(g, m, app.time); finish(g); },
  };
}

// ---- attract ---------------------------------------------------------------------------------

export function attract(app) {
  const bg = backdrop(app, true);
  app.ui.replaceChildren(h('div', { class: 'overlay attract' },
    h('div', { class: 'title-card' }, h('h1', { class: 'logo' }, t('title.name')), h('p', { class: 'subtitle' }, t('title.subtitle')), h('p', { class: 'tag' }, t('title.players'))),
    h('p', { class: 'press' }, rich(t('title.press')))));
  return {
    attract: true,
    update(dt) {
      bg.update(dt);
      if (app.input.any('start') || app.input.any('a')) { sfx.ok(); app.go('select'); }
    },
    draw(g) { bg.draw(g); g.fillStyle = 'rgba(20,12,6,0.35)'; g.fillRect(0, 0, W, H); },
  };
}

// ---- fighter select ----------------------------------------------------------------------------

export function select(app) {
  const bg = backdrop(app);
  const list = app.data.fighters;
  const open = (n) => !list[n].unlock || isUnlocked(list[n].id);
  const pick = [0, Math.min(1, list.length - 1)], locked = [false, false];
  // Player 2 is the computer until someone presses a button on the second
  // controls. Playing alone, player 1 then also chooses the computer's fighter.
  let human2 = false;
  const LEVELS = ['easy', 'normal', 'hard'];
  let level = LEVELS.includes(settings.difficulty) ? settings.difficulty : app.data.rules.cpu.default;
  const cpuPicking = () => !human2 && locked[0] && !locked[1];
  const pips = (label, v) => h('div', { class: 'stat' }, h('span', {}, label), h('span', { class: 'pips5' }, Array.from({ length: 5 }, (_, n) => h('i', { class: n < v ? 'on' : '' }))));
  // The roster: a portrait for each fighter, each player's cursor on it.
  const roster = () => h('div', { class: 'roster' }, list.map((k, n) => h('div', { class: `tile ${open(n) ? '' : 'locked'} ${pick[0] === n ? 'c0' : ''} ${pick[1] === n ? 'c1' : ''}` },
    h('img', { src: portrait(k), alt: '' }),
    elIcon(k.element),
    open(n) ? null : h('span', { class: 'lock' }, '🔒'),
    h('span', { class: 'tname' }, t(`fighter.${k.id}.name`)),
    pick[0] === n ? h('span', { class: 'cur c0' }, tag(0)) : null,
    pick[1] === n ? h('span', { class: 'cur c1' }, tag(1)) : null)));
  const card = (i) => {
    const k = list[pick[i]];
    const cpu = i === 1 && !human2;
    const hint = locked[i] ? t('select.ready')
      : !cpu ? rich(t('select.lock'), i)
      : cpuPicking() ? [...rich(t('select.lock'), 0), ' · ', ...rich(t('select.cpuLevel'), 0)]
      : rich(t('select.join'), 1);
    return h('div', { class: `pick p${i} ${locked[i] ? 'locked' : ''} ${cpu ? 'cpu' : ''} ${cpu && !locked[0] ? 'waiting' : ''}` },
      // A big portrait on the left, like the Smash select screen.
      h('div', { class: 'bigface' }, h('img', { src: portrait(k, 192), alt: '' })),
      h('div', { class: 'pinfo' },
      h('p', { class: 'who' }, tag(i), ' ', cpu ? `${t('select.cpu')} · ${t(`menu.difficulty.${level}`)}` : t(`ui.player${i + 1}`)),
      h('h2', {}, t(`fighter.${k.id}.name`)),
      h('p', { class: 'epithet' }, t(`fighter.${k.id}.epithet`)),
      h('p', { class: 'tags' }, h('span', { class: `el el-${k.element}` }, elIcon(k.element), t(`element.${k.element}`), h('small', {}, ` ${t(`element.${k.element}.means`)}`)), h('span', { class: 'wt' }, t(`weight.${k.weight}`)), h('span', { class: 'wt' }, t(`home.${k.home}`))),
      h('div', { class: 'stat' }, h('span', {}, t('stat.toughness')), h('b', {}, String(k.toughness))),
      pips(t('stat.speed'), k.speed), pips(t('stat.power'), k.power),
      h('p', { class: 'moves' },
        h('b', {}, t('ui.light')), ' ', t(`move.${k.id}.light`), h('br'),
        h('b', {}, t('ui.specials')), ' ', ['neutral', 'side', 'down'].map((d) => t(`move.${k.specials[d].id}`)).join(' · '), h('br'),
        h('b', {}, t('ui.super')), ' ', t(`move.${k.super.id}`), h('br'),
        h('b', {}, t('ui.passive')), ' ', t(`passive.${k.passive}.name`), h('small', {}, ` · ${t(`passive.${k.passive}.text`)}`)),
      h('p', { class: 'hint' }, hint)));
  };
  const show = () => app.ui.replaceChildren(h('div', { class: 'overlay select' },
    h('h1', { class: 'logo small' }, t('select.title')),
    roster(),
    h('div', { class: 'picks' }, card(0), card(1)),
    h('p', { class: 'hint big' }, locked.every(Boolean) ? rich(t('select.start')) : human2 ? t('select.both') : cpuPicking() ? t('select.cpuPick') : rich(t('select.lock'), 0)),
    h('div', { class: 'cycle' }, h('span', {}, elIcon('ura'), ' > ', elIcon('sua'), ' > ', elIcon('basoa'), ' > ', elIcon('harria'), ' > ', elIcon('ura')), h('small', {}, t('select.cycle')))));
  show();
  let t0 = 0;
  const step = (i, d) => { let n = pick[i]; do n = (n + d + list.length) % list.length; while (!open(n)); pick[i] = n; };
  return {
    update(dt) {
      bg.update(dt);
      t0 += dt;
      const inp = app.input;
      const p2 = inp.players[1].pressed;
      if (!human2 && t0 > 0.3 && ['a', 'b', 'c', 'left', 'right', 'up', 'down'].some((b) => p2[b])) {
        // Player 2 joins: the second card becomes theirs.
        human2 = true; locked[1] = false; sfx.ok(); show(); return;
      }
      for (const i of [0, 1]) {
        // Playing alone, player 1's controls choose the computer's fighter too.
        const who = !human2 && i === 1 ? 0 : i, p = inp.players[who];
        if (!human2 && i === 1 && !cpuPicking() && !(locked[0] && locked[1])) continue;
        if (!human2 && i === 0 && locked[0] && (cpuPicking() || locked[1])) continue;
        if (!locked[i]) {
          if (p.pressed.left || p.pressed.right) { step(i, p.pressed.left ? -1 : 1); sfx.move(); show(); }
          if (p.pressed.up || p.pressed.down) { step(i, p.pressed.up ? -6 : 6); sfx.move(); show(); }
          if (p.pressed.a && t0 > 0.3) { locked[i] = true; sfx.ok(); show(); return; }
          if (!human2 && i === 1 && p.pressed.b) { locked[0] = false; sfx.move(); show(); return; }
          if (!human2 && i === 1 && p.pressed.c) { level = LEVELS[(LEVELS.indexOf(level) + 1) % 3]; sfx.move(); show(); }
        } else if (p.pressed.b) { locked[i] = false; sfx.move(); show(); return; }
      }
      if (inp.any('c') && !locked.some(Boolean)) { nextLang(1); show(); }
      if (locked.every(Boolean) && inp.any('start') && t0 > 0.5) {
        sfx.go();
        app.session = { fighters: pick.map((n) => list[n].id), cpu: human2 ? null : { i: 1, level } };
        app.go('stage');
      }
    },
    draw(g) { bg.draw(g); g.fillStyle = 'rgba(20,12,6,0.6)'; g.fillRect(0, 0, W, H); },
  };
}

// ---- stage select ------------------------------------------------------------------------------
//
// A card for each place, a short true fact about the one chosen, and Random.
// Player 1 chooses (either player can, in a 2-player game).

export function stage(app) {
  const arenas = app.data.arenas.filter((a) => !a.hidden), n = arenas.length + 1; // the last card is Random
  let pick = Math.max(0, arenas.findIndex((a) => a.id === app.session.arena)), t0 = 0;
  const card = (a, i) => h('div', { class: `stage-card ${i === pick ? 'on' : ''}` },
    a ? h('img', { src: stageThumb(a, app.data.rules), alt: '' }) : h('div', { class: 'random' }, '?'),
    h('span', {}, a ? t(`arena.${a.id}`) : t('stage.random')));
  const show = () => {
    const a = arenas[pick];
    app.ui.replaceChildren(h('div', { class: 'overlay stages' },
      h('h1', { class: 'logo small' }, t('stage.title')),
      h('div', { class: 'stage-grid' }, [...arenas, null].map(card)),
      h('p', { class: 'stage-fact' }, a ? t(`arena.${a.id}.fact`) : ''),
      h('p', { class: 'hint big' }, rich(t('stage.pick')))));
  };
  show();
  return {
    update(dt) {
      t0 += dt;
      const inp = app.input;
      for (const p of inp.players) {
        if (p.pressed.left || p.pressed.right) { pick = (pick + (p.pressed.left ? -1 : 1) + n) % n; sfx.move(); show(); }
        if (p.pressed.up || p.pressed.down) { pick = (pick + (p.pressed.up ? -3 : 3) + n * 3) % n; sfx.move(); show(); }
      }
      if (inp.any('b')) { sfx.move(); app.go('select'); return; }
      if ((inp.any('a') || inp.any('start')) && t0 > 0.3) {
        sfx.go();
        const chosen = arenas[pick] ?? arenas[Math.floor(Math.random() * arenas.length)];
        app.session = { ...app.session, arena: chosen.id };
        app.go('fight');
      }
    },
    draw(g) { g.fillStyle = '#1a140e'; g.fillRect(0, 0, W, H); },
  };
}

// ---- the match -----------------------------------------------------------------------------------

export function fight(app) {
  const m = new Match(app.data, { fighters: app.session.fighters, arena: app.session.arena, seed: seed(app) });
  // Mirror match: the second fighter is recoloured.
  if (m.kinds[0].id === m.kinds[1].id) m.fighters[1].mirror = true;
  if (new URLSearchParams(location.search).has('debug')) window.match = m;
  // Playing alone: the computer takes player 2's side.
  const cpu = app.session.cpu ? new Cpu(m, app.session.cpu.i, app.session.cpu.level, seed(app)) : null;
  const fx = [], view = makeView();
  const names = m.fighters.map((f) => t(`fighter.${f.kind.id}.name`));
  const sub = h('div', { class: 'sub hidden' });
  app.ui.replaceChildren(h('div', { class: 'overlay match' },
    h('p', { class: 'match-help' }, rich(t(app.profile === 'cabinet' ? 'help.matchCabinet' : 'help.match'))),
    sub));
  if (new URLSearchParams(location.search).has('debug')) window.view = view;

  let subUntil = 0;
  const now = () => performance.now() / 1000;
  // A Basque call in big pixel letters, with its meaning underneath (players
  // learn them by repetition).
  const call = (text, secs = 1.2, meaning = null, colour) => {
    view.call = { text, t0: now(), secs, px: text.length > 8 ? 8 : 10, colour };
    sub.replaceChildren(...(meaning ? rich(meaning) : [])); sub.className = meaning ? 'sub' : 'sub hidden';
    subUntil = app.time + secs;
  };
  const float = (x, y, text, colour, px = 3, d = -1) => view.floats.push({ x, y, text, colour, px, d, t0: now() });
  // Dust thrown up where something lands; a blow also flashes a star.
  const burst = (x, y, n, colour, lift = 0) => { for (let k = 0; k < n; k++) fx.push({ x: x * S + (Math.random() - 0.5) * 20, y: y * S - lift, vx: (Math.random() - 0.5) * 240, vy: -Math.random() * 200, life: 0.45, max: 0.45, size: 3 + Math.random() * 4, colour }); };
  const impact = (x, y, dmg, v = 0) => {
    fx.push({ x: x * S, y: y * S, vx: 0, vy: 0, life: 0.16, max: 0.16, size: 14 + dmg + v * 3, colour: v > 6 ? '#ffd65a' : '#ffffff', star: true, still: true });
    // Sparks flying out from a strong blow.
    const n = v > 4 ? 8 : 4;
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + Math.random() * 0.4; fx.push({ x: x * S, y: y * S, vx: Math.cos(a) * (240 + v * 40), vy: Math.sin(a) * (240 + v * 40), life: 0.18, max: 0.18, size: 3 + v * 0.3, colour: v > 6 ? '#ffe070' : '#ffffff', still: false, nograv: true }); }
    burst(x, y, 4 + Math.round(dmg / 2), 'rgba(236,224,190,0.95)');
  };

  const handle = () => {
    for (const e of m.events) {
      if (e.type === 'prest') { sfx.call(); sfx.bow(); call(t('call.prest'), 99, `${t('call.prest.means')} · ${t('call.bow')}`); }
      else if (e.type === 'foul') { sfx.miss(); const f = m.fighters[e.f]; float(f.x, f.y - f.h, t('call.foul'), '#ffb0a0', 2); sub.replaceChildren(t('call.foulText')); sub.className = 'sub'; subUntil = app.time + 1.5; }
      else if (e.type === 'hasi') { sfx.go(); call(t('call.hasi'), 0.9, t('call.hasi.means'), '#b8f070'); }
      else if (e.type === 'land') { sfx.hit(1.5); burst(e.x, e.y, 10, '#b8ac90'); }
      else if (e.type === 'decoy') { sfx.perfect(); burst(e.x, e.y - 10, 12, '#e04a3a'); }
      else if (e.type === 'marked') { sfx.call(); const f = m.fighters[e.f]; float(f.x, f.y - f.h - 6, t('call.marked'), '#f2c75a', 2); }
      else if (e.type === 'wall') sfx.hit(1.5);
      else if (e.type === 'rooster') { sfx.rooster(); float(e.x, 60, t('call.rooster'), '#f2c75a', 2); }
      else if (e.type === 'dark') sfx.down();
      else if (e.type === 'heal') { sfx.perfect(); burst(e.x, e.y - 10, 14, '#a8d870'); }
      else if (e.type === 'shielded' || e.type === 'shieldHit') sfx.miss();
      else if (e.type === 'shieldBreak') { sfx.down(); view.shake = 10; float(e.x, e.y - 20, '!', '#ffe08a', 4); }
      else if (e.type === 'grabbed' || e.type === 'throw') sfx.swing();
      else if (e.type === 'teleport') { sfx.dodge(); burst(e.x, e.y - 10, 12, 'rgba(90,80,140,0.9)'); }
      else if (e.type === 'counter') { sfx.perfect(); view.shake = 8; float(e.x, e.y - 20, t('call.counter'), '#c8b8ff', 3); }
      else if (e.type === 'stunned') { sfx.miss(); float(m.fighters[e.f].x, m.fighters[e.f].y - m.fighters[e.f].h - 6, t('call.stunned'), '#ffe08a', 2); }
      else if (e.type === 'caught') { sfx.hit(1); float(e.x, e.y - 30, t('call.caught'), '#a8e070', 2); }
      else if (e.type === 'strike') { sfx.hit(1.8); if (e.sky) view.shake = 6; }
      else if (e.type === 'attack' || e.type === 'grab') sfx.swing();
      else if (e.type === 'special' || e.type === 'leap') sfx.special();
      else if (e.type === 'super') { sfx.super(); call(t(`move.${m.fighters[e.f].kind.super.id}`).toUpperCase().replace(/[^A-Z0-9 !?-]/g, ''), 1.0, null, '#ffd65a'); }
      else if (e.type === 'dodge') sfx.dodge();
      else if (e.type === 'jump') { if (e.air) burst(m.fighters[e.f].x, m.fighters[e.f].y, 5, 'rgba(255,255,255,0.9)'); }
      else if (e.type === 'perfect') { sfx.perfect(); float(e.x, e.y - 30, t('call.perfect'), '#ffd65a', 2); burst(e.x, e.y - 20, 10, '#ffd65a'); }
      else if (e.type === 'hit') {
        sfx.hit(Math.min(2, 0.4 + e.v / 4));
        impact(e.x, e.y, e.dmg, e.v);
        float(e.x, e.y - 16, String(Math.max(1, Math.round(e.dmg))), e.v > 6 ? '#ffd65a' : '#ffe0e8', 2, e.d);
        if (e.v > 5) view.shake = Math.min(16, e.v * 1.4);
      } else if (e.type === 'out') {
        // Out of the ring: a blast of light from where they left the screen.
        sfx.down();
        view.shake = 18;
        view.blasts.push({ x: e.x, y: e.y, colour: PCOL[e.f], t0: now() });
        if (m.phase === 'fight') call(t('call.kanpora'), 1.1, t('call.kanpora.means'), '#ffe08a');
      } else if (e.type === 'game') {
        sfx.win();
        if (e.winner === 'draw') call(t('call.draw'), 99, t('call.drawMatch'));
        else call(t('call.irabazlea'), 99, `${t('call.irabazlea.means')} · ${t('call.matchTo', { name: names[e.winner] })}`, '#ffd65a');
      }
    }
  };

  // Clean presses from the stick (the menus' auto-repeat would jump twice),
  // and the held buttons for charging smashes and holding the shield.
  const prev = [{}, {}];
  const inputs = () => app.input.players.map((p, i) => {
    if (cpu && cpu.i === i) return cpu.input();
    const q = prev[i], inp = {
      x: (p.right ? 1 : 0) - (p.left ? 1 : 0), y: (p.down ? 1 : 0) - (p.up ? 1 : 0),
      j: p.up && !q.up, dn: p.down && !q.down,
      a: p.pressed.a, b: p.pressed.b, c: p.pressed.c, s: p.pressed.d,
      ah: p.a, bh: p.b, ch: p.c,
    };
    prev[i] = { up: p.up, down: p.down };
    return inp;
  });

  let overT = 0;
  handle();
  return {
    update(dt) {
      if (subUntil && app.time > subUntil && m.phase === 'fight') { sub.className = 'sub hidden'; subUntil = 0; if (view.call && view.call.secs > 50) view.call = null; }
      for (const q of fx) { q.life -= dt; if (q.still) continue; q.x += q.vx * dt; q.y += q.vy * dt; if (!q.nograv) q.vy += 500 * dt; }
      for (let k = fx.length - 1; k >= 0; k--) if (fx[k].life <= 0) fx.splice(k, 1);
      if (m.phase === 'over') { if ((overT += dt) > 1.2) app.go('result', { m }); return; }
      m.step(inputs());
      handle();
    },
    draw(g) { drawMatch(g, m, app.time, fx, view); finish(g); drawHud(g, m, app.time, view, names); },
  };
}

// ---- the result ------------------------------------------------------------------------------------

export function result(app, { m }) {
  let t0 = 0;
  const row = (label, a, b) => h('div', { class: 'res-row' }, h('span', {}, String(a)), h('span', { class: 'res-label' }, label), h('span', {}, String(b)));
  const [a, b] = m.fighters;
  app.ui.replaceChildren(h('div', { class: 'overlay results' }, h('div', { class: 'card res-card' },
    h('h2', {}, m.winner === 'draw' ? t('call.drawMatch') : t('call.matchTo', { name: t(`fighter.${m.fighters[m.winner].kind.id}.name`) })),
    h('div', { class: 'res-row head' }, h('span', {}, tag(0), ' ', t(`fighter.${a.kind.id}.name`)), h('span', {}), h('span', {}, t(`fighter.${b.kind.id}.name`), ' ', tag(1))),
    row(t('res.stocks'), Math.max(0, a.stocks), Math.max(0, b.stocks)),
    row(t('res.dealt'), `${Math.round(a.stats.dealt)}%`, `${Math.round(b.stats.dealt)}%`),
    row(t('res.outs'), b.stats.outs, a.stats.outs),
    row(t('res.perfects'), a.stats.perfects, b.stats.perfects),
    row(t('res.supers'), a.stats.supers, b.stats.supers),
    h('p', { class: 'respect' }, t('res.respect')),
    h('p', { class: 'hint' }, rich(t('ui.again'))))));
  return {
    update(dt) {
      t0 += dt;
      if (t0 > 1 && (app.input.any('a') || app.input.any('start'))) { sfx.ok(); app.go('select'); }
      if (t0 > 30) app.go('attract');
    },
    draw(g) { drawMatch(g, m, app.time); g.fillStyle = 'rgba(20,12,6,0.55)'; g.fillRect(0, 0, W, H); finish(g); },
  };
}

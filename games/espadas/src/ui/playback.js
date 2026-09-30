// Turns engine events into board animation and chronicle lines.

import { h } from './dom.js';
import { t, tn, L, getLang } from './i18n.js';

const LOGGED_MORALE = new Set(['ambush', 'leaderLost', 'wagonLost', 'rally']);
// Blows to a company's courage that get a callout over it on the field.
// Why a company broke, for the chronicle.
const RESON = { flanked: 'log.routFlanked', rear: 'log.routFlanked', overwhelmed: 'log.routOverwhelmed', heavyLosses: 'log.routLosses', leaderLost: 'log.routLeader', waver: 'log.routWaver' };
const SHOCKS = new Set(['flanked', 'rear', 'overwhelmed', 'heavyLosses']);

export function unitLabel(u) {
  return u.name ? L(u.name) : L(u.kind.name);
}

export function nameTag(u, playerSide = 'player') {
  return h('b', { class: u.side === playerSide ? 'ally' : 'foe' }, unitLabel(u));
}

// ctx: { board, battle, data, log(node, cls?), speed() -> number (0 = instant) }
export async function playEvents(events, ctx) {
  const { board, battle } = ctx;
  const vu = (id) => board.units.get(id);
  const real = (id) => battle.byId(id);
  const ms = (base) => { const s = ctx.speed(); return s <= 0 ? 0 : base / s; };
  const say = (key, vars, cls) => ctx.log(tn(key, vars), cls);
  const tag = (id) => nameTag(real(id));
  const visible = (id) => { const u = vu(id); return u && (u.side === 'player' || !u.hidden); };
  const phase = (key, colour) => ctx.phase?.(key, colour);

  for (let ei = 0; ei < events.length; ei++) {
    const e = events[ei];
    switch (e.t) {
      case 'turn':
        ctx.log(h('span', {}, t('log.turn', { n: e.turn })), 'turn');
        break;

      case 'act':
        ctx.onAct?.(e.ids, e.side);
        await board.animate(ms(120), () => {});
        break;

      case 'steps': {
        phase(e.withdraw ? 'phase.withdraw' : 'phase.march');
        // Join this company's consecutive steps into one continuous walk.
        const ids = e.moves.map((m) => m.id).sort().join();
        const paths = new Map(e.moves.map((m) => [m.id, [m.from, m.to]]));
        while (ei + 1 < events.length && events[ei + 1].t === 'steps'
          && events[ei + 1].moves.map((m) => m.id).sort().join() === ids
          && events[ei + 1].moves.every((m) => { const p = paths.get(m.id); const last = p[p.length - 1]; return last.x === m.from.x && last.y === m.from.y; })) {
          ei++;
          for (const m of events[ei].moves) paths.get(m.id).push(m.to);
        }
        const walkers = [...paths].map(([id, pts]) => ({ u: vu(id), pts })).filter((w) => w.u);
        const cells = Math.max(...walkers.map((w) => w.pts.length - 1));
        // Slow enough to follow where every company is going.
        const perCell = walkers.length > 1 ? 480 : 420;
        await board.animate(ms(250 + cells * perCell), (p) => {
          const q = easeInOut(p);
          for (const w of walkers) {
            const n = w.pts.length - 1;
            const d = q * n;
            const i = Math.min(n - 1, Math.floor(d));
            const t2 = d - i;
            const a = w.pts[i], b = w.pts[i + 1];
            w.u.x = a.x + (b.x - a.x) * t2;
            w.u.y = a.y + (b.y - a.y) * t2;
            if (b.x !== a.x) w.u.facing = Math.sign(b.x - a.x);
          }
        });
        break;
      }

      case 'reveal': {
        const u = vu(e.id);
        if (!u) break;
        const wasHiddenFoe = u.side !== 'player' && u.hidden;
        u.hidden = false;
        if (wasHiddenFoe) { u.alpha = 0; board.animate(ms(450), (p) => { u.alpha = p; }); }
        if (wasHiddenFoe) phase('phase.ambush', '#a8322a');
        if (wasHiddenFoe || e.reason === 'strikes') {
          board.addFx({ kind: 'text', text: t('fx.ambush'), x: u.x, y: u.y, color: '#ffd35a', size: 18, ms: ms(1100) });
        }
        if (u.side === 'player') say(e.reason === 'strikes' ? 'log.revealStrike' : 'log.revealOwn', { a: tag(e.id) });
        else say('log.revealFoe', { a: tag(e.id) }, 'alert');
        await board.animate(ms(e.reason === 'strikes' ? 250 : 350), () => {});
        break;
      }

      case 'vanish': {
        const u = vu(e.id);
        if (u) u.hidden = true;
        say('log.vanish', { a: tag(e.id) });
        break;
      }

      case 'volley': {
        const a = vu(e.a), d = vu(e.d);
        if (!a) break;
        phase(e.result === 'friendly' ? 'phase.friendly' : 'phase.shot', e.result === 'friendly' ? '#a8322a' : null);
        // Where it came down: the landing square, or past/short of the target.
        const to = e.land ?? (d ? { x: d.x + (e.short ? -Math.sign(d.x - a.x) : Math.sign(d.x - a.x)) * 1.2, y: d.y } : { x: a.x, y: a.y });
        const targets = e.spread?.length ? e.spread : [to];
        for (const c of targets) board.addFx({ kind: 'missile', from: { x: a.x, y: a.y }, to: c, style: 'javelin', count: 12, ms: ms(900) });
        if (!e.spread?.length) board.addFx({ kind: 'missile', from: { x: a.x, y: a.y }, to, style: 'javelin', count: 12, ms: ms(900) });
        await board.animate(ms(900), () => {});
        if (e.result === 'miss') {
          board.addFx({ kind: 'text', text: t('aim.miss'), x: to.x, y: Math.round(to.y), color: '#fbf3de', size: 14, ms: ms(900) });
          say('log.volleyMiss', { a: tag(e.a) });
        }
        break;
      }

      case 'strike': {
        const a = vu(e.a), d = vu(e.d);
        if (!a || !d) break;
        if (e.mode !== 'counter') phase(e.ambush ? 'phase.ambush' : `phase.${e.mode}`, e.ambush ? '#a8322a' : null);
        if (e.mode === 'rock') {
          board.addFx({ kind: 'missile', from: { x: a.x, y: a.y }, to: { x: d.x, y: d.y }, style: 'rock', ms: ms(320) });
          await board.animate(ms(320), () => {});
        } else if (e.mode === 'shot') {
          // The volley event already flew the missiles.
        } else {
          const dx = Math.sign(d.x - a.x) * 0.28, dy = Math.sign(d.y - a.y) * 0.28;
          await board.animate(ms(e.mode === 'counter' ? 150 : 200), (p) => { const q = easeOutBack(p); a.ox = dx * q; a.oy = dy * q; });
        }
        d.hp = e.hp;
        board.addFx({ kind: 'flash', id: d.id, color: e.mode === 'counter' ? '#ffe6c4' : '#fff3c4', ms: ms(260) });
        board.addFx({ kind: 'text', text: `-${e.dmg}`, x: d.x, y: d.y, color: '#ff7a5c', size: 17, ms: ms(900) });
        const special = e.mods.find((m) => ['charge', 'wedge', 'shieldWall', 'guarded'].includes(m));
        if (special && e.mode !== 'counter') {
          board.addFx({ kind: 'text', text: t(`mod.${special}`), x: e.mode === 'melee' && special !== 'shieldWall' && special !== 'guarded' ? a.x : d.x, y: a.y, dy: -16, color: '#ffe9a8', size: 14, ms: ms(1000) });
        }
        const mods = e.mods.filter((m) => m !== 'rock').map((m) => t(`mod.${m}`)).join(', ');
        if (e.friendly) board.addFx({ kind: 'text', text: t('aim.friendly'), x: d.x, y: d.y, dy: -18, color: '#ff9a80', size: 15, ms: ms(1200) });
        const key = e.friendly ? 'log.friendly' : { melee: 'log.melee', counter: 'log.counter', shot: 'log.shot', rock: 'log.rock' }[e.mode];
        say(key, { a: tag(e.a), d: tag(e.d), n: e.dmg, mods: mods ? ` (${mods})` : '' }, e.friendly ? 'bad' : e.ambush ? 'alert' : null);
        if (e.mode === 'melee' || e.mode === 'counter') {
          const ox0 = a.ox, oy0 = a.oy;
          await board.animate(ms(220), (p) => { const q = easeInOut(p); a.ox = ox0 * (1 - q); a.oy = oy0 * (1 - q); });
          a.ox = 0; a.oy = 0;
        }
        break;
      }

      case 'morale': {
        const u = vu(e.id);
        if (!u) break;
        u.morale = e.value;
        if (SHOCKS.has(e.reason) && visible(e.id)) {
          board.addFx({ kind: 'text', text: t(`fx.${e.reason}`), x: u.x, y: u.y, dy: -30, color: '#ffb38a', size: 14, ms: ms(1100) });
        }
        if (LOGGED_MORALE.has(e.reason) && Math.abs(e.delta) >= 3 && visible(e.id)) {
          const txt = `${e.delta > 0 ? '+' : ''}${Math.round(e.delta)} ${t('fx.morale')}`;
          board.addFx({ kind: 'text', text: txt, x: u.x, y: u.y, dy: 22, color: e.delta > 0 ? '#bfe3ff' : '#9cc4ff', size: 12, ms: ms(900) });
        }
        break;
      }

      case 'rout': {
        const u = vu(e.id);
        if (!u) break;
        u.status = 'routing';
        u.hidden = false;
        u.facing = real(e.id)?.facing ?? -u.facing;
        board.addFx({ kind: 'text', text: t('fx.routs'), x: u.x, y: u.y, color: '#ffffff', size: 16, ms: ms(1100) });
        say(RESON[e.reason] ?? 'log.rout', { a: tag(e.id) }, u.side === 'player' ? 'bad' : 'good');
        await board.animate(ms(250), () => {});
        break;
      }

      case 'rallied': {
        const u = vu(e.id);
        if (!u) break;
        u.status = 'ok';
        u.morale = e.value;
        say('log.rallied', { a: tag(e.id) }, 'good');
        break;
      }

      case 'dead':
      case 'captured':
      case 'fled':
      case 'escaped': {
        const u = vu(e.id);
        if (!u) break;
        if (e.t === 'captured') board.addFx({ kind: 'text', text: t('fx.captured'), x: u.x, y: u.y, color: '#ffd35a', size: 17, ms: ms(1200) });
        if (e.t === 'escaped') board.addFx({ kind: 'text', text: t('fx.escaped'), x: u.x, y: u.y, color: '#bfe3ff', size: 16, ms: ms(1200) });
        if (e.t === 'fled' || e.t === 'escaped') {
          // Off the stage: out past the nearest edge of the field.
          const g = battle.grid;
          const [dx, dy] = u.x <= 0 ? [-1, 0] : u.x >= g.w - 1 ? [1, 0] : u.y <= 0 ? [0, -1] : [0, 1];
          const x0 = u.x, y0 = u.y;
          if (dx) u.facing = dx;
          await board.animate(ms(900), (p) => {
            const q = easeInOut(p);
            u.x = x0 + dx * 1.8 * q;
            u.y = y0 + dy * 1.2 * q;
            u.alpha = p < 0.5 ? 1 : 1 - (p - 0.5) * 2;
          });
        } else {
          await board.animate(ms(380), (p) => { u.alpha = 1 - p; });
        }
        u.gone = true;
        u.status = e.t;
        const good = (u.side === 'player') === (e.t === 'escaped');
        say(`log.${e.t}`, { a: tag(e.id) }, good ? 'good' : 'bad');
        break;
      }

      case 'leaderFell': {
        const u = real(e.id);
        say('log.leaderFell', { a: tag(e.id) }, u.side === 'player' ? 'bad' : 'good');
        break;
      }

      case 'rally': {
        const u = vu(e.id);
        if (!u) break;
        phase('phase.rally', '#8a6a1a');
        board.addFx({ kind: 'ring', x: u.x, y: u.y, color: '#e6b534', ms: ms(700) });
        say('log.rally', { a: tag(e.id) });
        await board.animate(ms(450), () => {});
        break;
      }

      case 'taunt': {
        const u = vu(e.a);
        if (!u) break;
        phase('phase.taunt', '#8a6a1a');
        const entry = ctx.data.taunts.find((x) => x.id === e.taunt);
        const text = entry ? entry[getLang()] ?? entry.en : '…';
        const dur = ms(Math.min(3200, 1200 + text.length * 28));
        board.addFx({ kind: 'bubble', id: u.id, text, ms: dur });
        if (e.d) say('log.taunt', { a: tag(e.a), d: tag(e.d), text }); else say('log.tauntAll', { a: tag(e.a), text });
        await board.animate(dur * 0.85, () => {});
        break;
      }

      default:
        break;
    }
    if (['strike', 'dead', 'captured', 'fled', 'escaped', 'rout', 'morale', 'rallied'].includes(e.t)) ctx.onChange?.();
  }
}

// Snap the board's view to the engine's true state (after playback, or on load).
export function syncView(board, battle) {
  for (const u of battle.units) {
    const v = board.units.get(u.id);
    if (!v) continue;
    Object.assign(v, {
      x: u.x, y: u.y, hp: u.hp, morale: u.morale, status: u.status, hidden: u.hidden, facing: u.facing,
      gone: !battle.onBoard(u), ox: 0, oy: 0, alpha: 1,
    });
  }
}

const easeInOut = (p) => 0.5 - Math.cos(Math.PI * p) / 2;
const easeOutBack = (p) => { const c = 1.6; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };

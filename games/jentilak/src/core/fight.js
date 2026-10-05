// Myth Brawl (Duelo de Mitos, Mitoen Borroka): one match between two fighters on a side-view stage, a
// platform fighter copying Super Smash Flash as closely as a 3-button arcade
// cabinet allows (DESIGN.md). Pure and deterministic: no DOM, no clock, no
// Math.random (the ±5% damage spread comes from a seeded generator). The UI
// calls step(inputs) once per 1/60 s frame and draws what it finds; the
// tests and the CPU drive it the same way.
//
// Coordinates are stage pixels (480x270), y down. A fighter's (x, y) is the
// middle of its feet. Times are frames.
//
// inputs[i]: the stick { x, y } (-1..1, up is negative), held buttons
// { ah, bh, ch }, and presses this frame { j (stick pushed up), dn (pushed
// down), a, b, c, s }.
//   up        jump: a tap is a short hop, held is a full hop; again in the air
//   down      fast fall in the air; drop through a floating platform
//   A         attack. Neutral: the jab combo. Holding a direction: a tilt.
//             Tapping a direction with A: a smash attack (hold A to charge).
//             In the air: neutral, forward, back, up and down aerials.
//   B         special; up + B is the recovery leap
//   C         hold: shield (C + left/right rolls, C + down dodges on the
//             spot); in the air: air dodge. C + A (or A while shielding): grab;
//             then A pummels and a direction throws.
//   A + B     super (Indarra), at a full meter (or `s`, the 4th button)
//
// Every hit adds to the target's damage percentage, and the higher it is the
// further they fly. Knocked past the edge of the screen, a fighter is out of
// the ring (Kanpora!), loses a stock and floats back in. Last one with stocks
// left wins (Irabazlea!). Nobody is hurt.

import { makeRng } from './rng.js';
import * as SP from './specials.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const unit = (x, y) => { const l = Math.hypot(x, y); return l > 1e-6 ? [x / l, y / l] : [0, 0]; };
const sign = (v) => (v < 0 ? -1 : 1);
// Specials and supers that hit with the body during their active frames.
const MELEE = new Set(['ring', 'cone', 'dash', 'leap']);
const MOVING = new Set(['attack', 'special', 'super', 'grab']);
const FREE = new Set(['idle', 'run', 'air', 'helpless']);

// The element cycle: a hit whose element beats the target's deals more,
// the reverse less; Gaua (night) and same-element hits are neutral.
export function elementModifier(rules, attacker, target) {
  const E = rules.elements;
  if (E.beats[attacker] === target) return E.strong;
  if (E.beats[target] === attacker) return E.weak;
  return 1;
}

// Damage before the ±5% spread: base x (0.8 + 0.1 x Power) x element.
export function baseDamage(rules, move, attackerKind, targetKind, hits = 1) {
  const S = rules.stats;
  const per = move.damage / hits;
  return per * (S.powerBase + S.powerPer * attackerKind.power) * elementModifier(rules, attackerKind.element, targetKind.element);
}

// Launch speed: (base + growth x damage% / 100) x weight x the square root of 100 / toughness.
export function launchSpeed(rules, move, targetKind, pct, extra = 1) {
  const w = rules.stats.weight[targetKind.weight] ?? rules.stats.weight.medium;
  return ((move.kb ?? 0) + (move.growth ?? 0) * (pct / 100)) * w.knock * Math.sqrt(100 / targetKind.toughness) * extra;
}

// A stage, seen by the engine: solid blocks (the first, or `main`, is the
// main platform), floating platforms, its size and blast lines. Older stages
// have just `main`; it becomes the one solid block, with ledges both sides.
export function stageOf(a) {
  const solids = (a.solids ?? [{ ...a.main, ledges: ['l', 'r'] }]).map((s) => ({ ...s, ledges: s.ledges ?? [] }));
  const main = a.main ?? solids.reduce((best, s) => (s.x1 - s.x0 > best.x1 - best.x0 ? s : best), solids[0]);
  return { ...a, solids, main, world: a.world ?? { w: 480, h: 270 } };
}

export class Match {
  constructor(data, { fighters = ['basajaun', 'galtzagorri'], arena = 'olite', seed = 1, stocks, time } = {}) {
    this.R = data.rules;
    this.rng = makeRng(seed);
    this.kinds = fighters.map((id) => {
      const k = data.fighters.find((f) => f.id === id);
      if (!k) throw new Error(`unknown fighter ${id}`);
      return k;
    });
    this.arena = data.arenas.find((a) => a.id === arena) ?? data.arenas[0];
    this.stage = stageOf(this.arena);
    this.passives = data.passives ?? {};
    this.stocks = stocks ?? this.R.match.stocks;
    this.matchTime = (time ?? this.R.match.time) * this.R.fps;
    this.winner = null; // 0, 1, or 'draw'
    this.events = [];
    this.frame = 0;
    this.objects = []; // boulders, shots, decoys, walls, the flock, imps
    this.dark = 0; this.darkOwner = -1; // Gaueko's night
    this.freeze = 0;
    this.fighters = [0, 1].map((i) => this.newFighter(i));
    this.phase = 'bow';
    this.phaseT = 0;
    this.clock = this.matchTime;
    this.emit('prest');
  }

  emit(type, extra = {}) { this.events.push({ type, frame: this.frame, ...extra }); }

  newFighter(i) {
    const k = this.kinds[i], S = this.R.stats, s = this.stage.starts[i];
    return {
      i, kind: k, x: s.x, y: s.y, vx: 0, vy: 0, fx: i === 0 ? 1 : -1,
      // Forest paths: Basandere runs faster.
      speed: (S.speedBase + S.speedPer * k.speed) * ((this.passives[k.passive] ?? {}).speedMul ?? 1), weight: S.weight[k.weight] ?? S.weight.medium,
      w: k.body.w, h: k.body.h,
      pct: 0, stocks: this.stocks, meter: 0, state: 'bow', t: 0,
      grounded: true, jumps: 0, airDodged: false, leapt: false, drop: 0, fastFall: false, regrab: true, ledgeCD: 0,
      shieldHP: this.R.shield.max, invT: 0, lag: 0, hold: 0, holding: -1, heldBy: -1, pummelCD: 0,
      combo: 0, comboOpen: 0, queued: false, move: null, hitDone: new Set(), charge: 0, chargeMul: 1, cooldown: { special: 0, dodge: 0 },
      hitstun: 0, fouled: false, perfect: 0, carried: null, dodgeKind: null, respawnT: 0,
      prevX: 0, prevY: 0, freshX: 99, freshY: 99,
      charges: k.specials.neutral.charges ?? 0, regrow: 0, still: 0, marked: 0, homing: 0, shield: 0, buffer: {},
      stats: { dealt: 0, perfects: 0, supers: 0, fouls: 0, outs: 0 },
    };
  }

  setState(f, s) { f.state = s; f.t = 0; }
  addMeter(f, n) { f.meter = clamp(f.meter + n, 0, this.R.meter.max); }
  rival(f) { return this.fighters[1 - f.i]; }
  passive(f) { return this.passives[f.kind.passive] ?? {}; }
  free(f) { return f.grounded ? 'idle' : 'air'; }
  timeLeft() { return Math.ceil(this.clock / this.R.fps); }

  // ---- the match ------------------------------------------------------------------------------

  // The agurra: both fighters bow. Attacking before "Hasi!" breaks Mari's
  // rule and costs a slice of super meter.
  stepBow(inputs) {
    this.phaseT++;
    for (const f of this.fighters) {
      const inp = inputs[f.i] ?? {};
      if (!f.fouled && (inp.a || inp.b || inp.s)) {
        f.fouled = true;
        f.stats.fouls++;
        f.meter = Math.max(0, f.meter - this.R.bow.foulMeter);
        this.emit('foul', { f: f.i });
      }
    }
    if (this.phaseT >= this.R.round.bowTime * this.R.fps) {
      this.phase = 'fight';
      this.phaseT = 0;
      for (const f of this.fighters) this.setState(f, 'idle');
      this.emit('hasi');
    }
  }

  endMatch(winner, why) {
    this.phase = 'game';
    this.phaseT = 0;
    this.winner = winner;
    this.emit('game', { winner, why });
  }

  step(inputs = []) {
    this.events = [];
    if (this.phase === 'over') return;
    this.frame++;
    if (this.phase === 'bow') { this.stepBow(inputs); return; }
    if (this.phase === 'game') {
      if (++this.phaseT >= this.R.match.endCall * this.R.fps) { this.phase = 'over'; this.emit('irabazlea', { winner: this.winner }); }
      for (const f of this.fighters) if (f.state !== 'out') this.stepFighter(f, {});
      return;
    }
    // During a freeze (a hit landing, a super starting), button presses are
    // kept and played on the first frame after, so none are lost.
    if (this.freeze > 0) {
      this.freeze--;
      for (const f of this.fighters) for (const b of ['a', 'b', 'c', 's', 'j']) if (inputs[f.i]?.[b]) f.buffer[b] = true;
      return;
    }
    for (const f of this.fighters) {
      const inp = { ...(inputs[f.i] ?? {}) };
      for (const b of Object.keys(f.buffer)) inp[b] = true;
      f.buffer = {};
      this.stepFighter(f, inp);
    }
    this.stepObjects();
    this.separate();
    this.resolveHits();
    if (this.clock > 0) this.clock--;
    const gone = this.fighters.filter((f) => f.stocks <= 0);
    if (gone.length === 2) this.endMatch('draw', 'double');
    else if (gone.length === 1) this.endMatch(1 - gone[0].i, 'stocks');
    else if (this.clock <= 0) {
      // Time: more stocks wins; then less damage.
      const [a, b] = this.fighters;
      const w = a.stocks !== b.stocks ? (a.stocks > b.stocks ? 0 : 1) : Math.abs(a.pct - b.pct) < 1e-9 ? 'draw' : a.pct < b.pct ? 0 : 1;
      this.endMatch(w, 'time');
    }
  }

  // ---- one fighter --------------------------------------------------------------------------

  stepFighter(f, inp) {
    const R = this.R, k = f.kind, PH = R.physics, SH = R.shield;
    f.t++;
    // The stick: how long each direction has been pushed (a fresh push with A is a smash).
    const sx = clamp(Number(inp.x) || 0, -1, 1), sy = clamp(Number(inp.y) || 0, -1, 1);
    f.freshX = Math.abs(sx) > 0.5 ? (Math.abs(f.prevX) > 0.5 && sign(sx) === sign(f.prevX) ? f.freshX + 1 : 0) : 99;
    f.freshY = Math.abs(sy) > 0.5 ? (Math.abs(f.prevY) > 0.5 && sign(sy) === sign(f.prevY) ? f.freshY + 1 : 0) : 99;
    f.prevX = sx; f.prevY = sy;
    if (f.state === 'out') {
      if (f.stocks > 0 && --f.respawnT <= 0) this.respawn(f);
      return;
    }
    for (const c of Object.keys(f.cooldown)) if (f.cooldown[c] > 0) f.cooldown[c]--;
    for (const c of ['marked', 'homing', 'shield', 'invT', 'drop', 'ledgeCD', 'pummelCD']) if (f[c] > 0) f[c]--;
    if (f.state !== 'shield') f.shieldHP = Math.min(SH.max, f.shieldHP + SH.regen);
    // Charges (Herensuge's seven heads) grow back one at a time.
    const sp = k.specials.neutral;
    if (sp.charges && f.charges < sp.charges && ++f.regrow >= sp.regrow) { f.regrow = 0; f.charges++; this.emit('regrow', { f: f.i, charges: f.charges }); }
    // Stable guardian: standing still slowly lowers the damage percentage.
    const P = this.passive(f);
    f.still = f.state === 'idle' && f.grounded ? f.still + 1 : 0;
    if (P.regen && f.still > P.regenAfter) f.pct = Math.max(0, f.pct - P.regen / R.fps);
    if (f.comboOpen > 0) f.comboOpen--;
    if (f.perfect > 0) f.perfect--;
    const wantsSuper = inp.s || (inp.a && inp.b);
    const play = this.phase === 'fight';

    if (f.carried) return; // being carried along by the flock
    switch (f.state) {
      case 'respawn':
        // Floating back in on a stone: any input, or time, drops you in.
        if (f.t > 180 || (play && (Math.abs(sx) > 0.5 || inp.j || inp.dn || inp.a || inp.b || inp.c))) { f.grounded = false; this.setState(f, 'air'); }
        return;
      case 'held': if (f.grabbedBy) SP.stepGrabbed(this, f); return; // the holder moves you
      case 'hitstun':
        f.vx *= f.grounded ? 0.8 : PH.drag;
        if (f.t >= f.hitstun) this.setState(f, this.free(f));
        this.physics(f, 0);
        return;
      case 'dizzy':
        f.vx *= 0.8;
        if (f.t >= (f.dizzyFor ?? R.shield.dizzy)) { f.dizzyFor = null; this.setState(f, this.free(f)); }
        this.physics(f, 0);
        return;
      case 'dodge':
        if (f.dodgeKind === 'roll' && f.grounded && this.surfaceBelow(f.x + f.vx * 2, f.y - 0.5) !== f.y) f.vx = 0;
        if (f.t >= R.dodge.frames) { f.vx *= f.grounded ? 0 : 1; this.setState(f, this.free(f)); }
        this.physics(f, 0, f.dodgeKind === 'air');
        return;
      case 'landing':
        f.vx *= 0.6;
        if (f.t >= f.lag) this.setState(f, 'idle');
        this.physics(f, 0);
        return;
      case 'ledge': this.stepLedge(f, inp, sx, sy); return;
      case 'climb':
        if (f.t >= R.ledge.climb) this.climbUp(f);
        return;
      case 'holding': this.stepHolding(f, inp, sx, sy); return;
      case 'jumpsquat':
        // Up and A together (within the jump's windup): an up attack instead
        // of the jump: a smash if up was only just pushed, else the up tilt.
        if (inp.a) { this.startMove(f, 'attack', f.t <= 2 ? k.usmash : k.up, 0); return; }
        if (inp.b) { f.leapt = true; this.startMove(f, 'special', k.recovery, sx); return; }
        if (f.t >= PH.jumpsquat) {
          const full = sy < -0.5;
          f.vy = -PH.jump * k.jump * (full ? 1 : PH.shortHop);
          f.vx = sx * f.speed * 0.8;
          f.grounded = false; f.jumps = 1; f.fastFall = false;
          this.setState(f, 'air');
          this.emit('jump', { f: f.i, short: !full });
        }
        return;
      case 'shield': if (this.stepShield(f, inp, sx, sy)) return; break;
      default: break;
    }
    if (MOVING.has(f.state)) { this.stepMove(f, inp, sx); return; }
    if (!play) { this.physics(f, 0); return; }

    // Free: start something, or move.
    const helpless = f.state === 'helpless';
    if (f.wantLeap > 0) {
      f.wantLeap--;
      if (!helpless && !f.grounded && !f.leapt) { f.wantLeap = 0; f.leapt = true; this.startMove(f, 'special', k.recovery, sx); return; }
    }
    if (!helpless) {
      if (wantsSuper && f.meter >= R.meter.max) { this.startSuper(f); return; }
      if (inp.b && !inp.a) {
        // Special by direction, as in Super Smash Flash: up is the recovery
        // leap, side and down their own moves, neutral the signature one.
        if (sy < -0.5) {
          // Up + special: the recovery; some fighters get more than one (flaps, bounds).
          if (!f.leapt) { f.leaps = (f.leaps ?? 0) + 1; f.leapt = f.leaps >= (k.recovery.flaps ?? 1); this.startMove(f, 'special', k.recovery, sx); return; }
        } else {
          const dir = sy > 0.5 ? 'down' : Math.abs(sx) > 0.5 ? 'side' : 'neutral', mv = k.specials[dir];
          if (dir === 'side') f.fx = sign(sx);
          if (this.specialReady(f, mv, dir)) {
            f.aim = [sx, sy];
            if (dir === 'neutral' && mv.charges) f.charges--;
            this.startMove(f, 'special', mv, dir === 'side' ? sx : 0);
            return;
          }
        }
      }
      if (f.grounded) {
        if ((inp.c && inp.a) || (inp.a && inp.ch)) { this.startMove(f, 'grab', k.grab, sx); return; }
        if (inp.c) {
          const ready = f.cooldown.dodge <= 0;
          if (Math.abs(sx) > 0.5 && ready) { this.dodge(f, 'roll', sign(sx)); return; }
          if (sy > 0.5 && ready) { this.dodge(f, 'spot', 0); return; }
          this.setState(f, 'shield'); f.vx = 0;
          return;
        }
        if (inp.a) { this.startMove(f, 'attack', this.groundAttack(f, sx, sy), sx); return; }
        if (inp.j) { this.setState(f, 'jumpsquat'); f.vx *= 0.5; return; }
        if (inp.dn && this.onPlatform(f)) { f.drop = PH.dropFrames; f.grounded = false; f.y += 1; this.setState(f, 'air'); }
      } else {
        if (inp.c && !f.airDodged && f.cooldown.dodge <= 0) { this.dodge(f, 'air', 0, sx, sy); return; }
        if (inp.a) { this.startMove(f, 'attack', this.airAttack(f, sx, sy), 0); return; }
        if (inp.j && f.jumps < 2) {
          f.vy = -PH.airJump * k.jump; f.jumps = 2; f.fastFall = false;
          if (Math.abs(sx) > 0.3) { f.vx = sx * f.speed * 0.8; f.fx = sign(sx); }
          this.emit('jump', { f: f.i, air: true });
        }
      }
    }
    this.move(f, sx, sy, inp, helpless);
  }

  // A special is ready when its short cooldown is over, Herensuge has a head
  // left, and (for things thrown) the last one has come down.
  specialReady(f, mv, dir) {
    if ((f.cooldown[mv.id] ?? 0) > 0) return false;
    if (dir === 'neutral' && mv.charges && f.charges <= 0) return false;
    if (['shot', 'mark', 'boulder', 'stone'].includes(mv.kind) && this.objects.some((o) => o.owner === f.i && o.move === mv && !o.landed)) return false;
    return true;
  }

  // Which ground attack: neutral jab, tilts held, smashes tapped with A.
  groundAttack(f, sx, sy) {
    const k = f.kind, W = this.R.physics.smashWindow;
    if (sy < -0.5) return f.freshY <= W ? k.usmash : k.up;
    if (sy > 0.5) return f.freshY <= W ? k.dsmash : k.down;
    if (Math.abs(sx) > 0.5) { f.fx = sign(sx); return f.freshX <= W ? k.fsmash : k.ftilt; }
    const step = f.comboOpen > 0 && f.combo < k.light.length ? f.combo : 0;
    f.combo = step;
    return k.light[step];
  }

  // Which aerial: neutral, forward, back (relative to facing), up, down.
  airAttack(f, sx, sy) {
    const k = f.kind;
    if (sy < -0.5) return k.airUp;
    if (sy > 0.5) return k.airDown;
    if (Math.abs(sx) > 0.5) return sign(sx) === f.fx ? k.fair : k.bair;
    return k.air;
  }

  dodge(f, kind, dir, sx = 0, sy = 0) {
    const D = this.R.dodge;
    f.dodgeKind = kind;
    if (kind === 'roll') { f.vx = dir * D.speed; f.fx = -dir; }
    else if (kind === 'spot') f.vx = 0;
    else { const [dx, dy] = unit(sx, sy); f.vx = dx * D.airSpeed; f.vy = dy * D.airSpeed; f.airDodged = true; }
    f.cooldown.dodge = kind === 'air' ? 0 : D.cooldown;
    this.setState(f, 'dodge');
    this.emit('dodge', { f: f.i, kind });
  }

  // Running and steering. Snappy on the ground, a fast fall in the air.
  move(f, sx, sy, inp, helpless) {
    const PH = this.R.physics, P = this.passive(f);
    const water = P.waterSpeed && this.onWater(f) ? P.waterSpeed : 1;
    if (f.grounded) {
      const target = Math.abs(sx) > 0.2 ? sx * f.speed * water : 0;
      // Snappy: almost at full speed at once, turning on the spot.
      if (target) { f.vx += (target - f.vx) * 0.75; f.fx = sign(sx); if (f.state !== 'run') this.setState(f, 'run'); }
      else {
        f.vx = Math.abs(f.vx) <= PH.traction ? 0 : f.vx - sign(f.vx) * PH.traction;
        const r = this.rival(f);
        if (f.vx === 0 && r.state !== 'out' && Math.abs(r.x - f.x) > 2) f.fx = sign(r.x - f.x);
        if (f.state !== 'idle') this.setState(f, 'idle');
      }
    } else {
      const max = f.speed * PH.airMax;
      if (Math.abs(sx) > 0.2) f.vx = clamp(f.vx + sx * PH.airAccel, -max, max);
      else f.vx *= 0.98;
      if (inp.dn && f.vy > -1) f.fastFall = true;
      if (!helpless && f.state !== 'air') this.setState(f, 'air');
    }
    this.physics(f, sx);
  }

  stepShield(f, inp, sx, sy) {
    const SH = this.R.shield, k = f.kind;
    if (!inp.ch && !inp.c) { this.setState(f, 'idle'); return false; }
    f.shieldHP -= SH.decay;
    if (f.shieldHP <= 0) { this.breakShield(f); return true; }
    if (inp.a) { this.startMove(f, 'grab', k.grab, 0); return true; }
    if (inp.j) { this.setState(f, 'jumpsquat'); return true; }
    if (Math.abs(sx) > 0.5 && f.freshX === 0 && f.cooldown.dodge <= 0) { this.dodge(f, 'roll', sign(sx)); return true; }
    if (sy > 0.5 && f.freshY === 0 && f.cooldown.dodge <= 0) { this.dodge(f, 'spot', 0); return true; }
    f.vx *= 0.7;
    this.physics(f, 0);
    return true;
  }

  breakShield(f) {
    const SH = this.R.shield;
    f.shieldHP = SH.afterBreak;
    f.vy = -3; f.grounded = false;
    this.setState(f, 'dizzy');
    this.emit('shieldBreak', { f: f.i, x: f.x, y: f.y - f.h / 2 });
  }

  // ---- grabs and throws ------------------------------------------------------------------------

  stepHolding(f, inp, sx, sy) {
    const r = this.rival(f), G = this.R.grab;
    if (r.state !== 'held') { f.holding = -1; this.setState(f, 'idle'); return; }
    if (r.grabbedBy) return; // a special grab runs itself
    r.x = f.x + f.fx * (f.w + r.w) / 2; r.y = f.y; r.vx = 0; r.vy = 0;
    if (inp.a && f.pummelCD <= 0) {
      f.pummelCD = G.pummelEvery;
      this.hit(f, r, { damage: f.kind.throws.pummel, kb: 0, growth: 0, angle: 0 }, 1, { x: f.x, y: f.y, dir: f.fx }, true);
      r.state = 'held';
      return;
    }
    let throwKind = null;
    if (sy < -0.5) throwKind = 'up'; else if (sy > 0.5) throwKind = 'down';
    else if (Math.abs(sx) > 0.5) throwKind = sign(sx) === f.fx ? 'forward' : 'back';
    if (throwKind) {
      const T = f.kind.throws[throwKind];
      r.heldBy = -1; f.holding = -1;
      r.state = 'hitstun'; r.t = 0;
      this.emit('throw', { f: f.i, kind: throwKind });
      this.hit(f, r, T, 1, { x: f.x, y: f.y, dir: T.back ? -f.fx : f.fx });
      if (throwKind === 'back') f.fx = -f.fx;
      f.lag = 14; this.setState(f, 'landing');
      return;
    }
    if (--f.hold <= 0) {
      // They wriggle free.
      r.heldBy = -1; f.holding = -1;
      r.vx = f.fx * 2.5; r.vy = -2; r.grounded = false; r.hitstun = 14; this.setState(r, 'hitstun');
      f.vx = -f.fx * 1.5; f.lag = 10; this.setState(f, 'landing');
      this.emit('breakFree', { f: r.i });
    }
  }

  // ---- ledges ----------------------------------------------------------------------------------

  ledgeHung(si, side) { return this.fighters.some((g) => g.state === 'ledge' && g.ledge?.s === si && g.ledge?.side === side); }

  // Hands near an outer corner of a solid block while coming down: grab it.
  tryLedge(f) {
    const L = this.R.ledge;
    if (f.vy < 0 || f.ledgeCD > 0 || f.grounded || !['air', 'helpless', 'attack', 'special'].includes(f.state)) return false;
    if (f.state === 'special' && f.move?.kind !== 'leap') return false;
    const hy = f.y - f.h * 0.85;
    for (const [si, S] of this.stage.solids.entries()) for (const side of [-1, 1]) {
      if (!S.ledges.includes(side < 0 ? 'l' : 'r')) continue;
      const cx = side < 0 ? S.x0 : S.x1;
      const outside = side < 0 ? f.x < cx + 2 : f.x > cx - 2;
      if (!outside || Math.abs(f.x - cx) > f.w / 2 + L.reach || hy < S.top - 10 || hy > S.top + 14 || this.ledgeHung(si, side)) continue;
      f.ledge = { s: si, side }; f.ledgeSide = side;
      f.x = cx + side * (f.w / 2 + 1); f.y = S.top + f.h * 0.85; f.vx = 0; f.vy = 0;
      f.fx = -side; f.jumps = 1; f.leapt = false; f.leaps = 0; f.airDodged = false; f.fastFall = false; f.move = null;
      if (f.regrab) { f.invT = Math.max(f.invT, L.invincible); f.regrab = false; }
      this.setState(f, 'ledge');
      this.emit('ledge', { f: f.i });
      return true;
    }
    return false;
  }

  stepLedge(f, inp, sx, sy) {
    const L = this.R.ledge, side = f.ledge.side, PH = this.R.physics, S = this.stage.solids[f.ledge.s];
    if (f.t < 4) return;
    const toward = sx * -side > 0.5, away = sx * side > 0.5;
    if (inp.j || (sy < -0.5 && f.freshY === 0)) {
      f.vy = -PH.jump * f.kind.jump; f.vx = -side * 1.2; f.y = S.top - 2;
      this.setState(f, 'air'); this.emit('jump', { f: f.i }); return;
    }
    if (inp.a) { this.climbUp(f); this.startMove(f, 'attack', f.kind.ledgeAttack, 0); return; }
    if (inp.c) { this.climbUp(f); this.dodge(f, 'roll', -side); return; }
    if (toward && f.freshX === 0) { f.invT = Math.max(f.invT, L.climb); this.setState(f, 'climb'); return; }
    if (inp.dn || away || f.t > L.max) { f.ledgeCD = 30; this.setState(f, 'air'); f.vy = 0.5; return; }
  }

  climbUp(f) {
    const S = this.stage.solids[f.ledge.s], side = f.ledge.side;
    f.x = (side < 0 ? S.x0 : S.x1) - side * (f.w / 2 + 2); f.y = S.top; f.vx = 0; f.vy = 0;
    f.grounded = true; f.jumps = 0;
    this.setState(f, 'idle');
  }

  // ---- attacks, specials, supers -------------------------------------------------------------------

  startMove(f, state, move, sx = 0) {
    f.move = move;
    f.hitDone = new Set();
    f.charge = 0; f.chargeMul = 1;
    // Aim where the stick points; with the stick still, at the rival (on the ground).
    const r = this.rival(f);
    if (Math.abs(sx) > 0.3 && f.grounded) f.fx = sign(sx);
    else if (f.grounded && r.state !== 'out' && Math.abs(r.x - f.x) > 2 && !move.back) f.fx = sign(r.x - f.x);
    this.setState(f, state);
    if (state === 'special' && move.cooldown) f.cooldown[move.id] = move.cooldown;
    const id = move.id ?? (f.kind.light.includes(move) ? `light${f.combo}` : Object.keys(f.kind).find((key) => f.kind[key] === move));
    this.emit(state === 'special' && move.kind === 'leap' ? 'leap' : state, { f: f.i, id });
  }

  startSuper(f) {
    f.meter = 0;
    f.stats.supers++;
    f.queued = false;
    this.startMove(f, 'super', f.kind.super);
    this.freeze = this.R.super.freeze;
  }

  stepMove(f, inp = {}, sx = 0) {
    const mv = f.move, end = mv.startup + mv.active + mv.recovery, PH = this.R.physics;
    // A then B a few frames apart still counts as the super (cabinets).
    const lenient = this.R.super.lenience ?? 4;
    if (f.state !== 'super' && f.state !== 'grab' && mv.kind !== 'leap' && f.t <= lenient && f.meter >= this.R.meter.max && (inp.s || (f.state === 'attack' && inp.b) || (f.state === 'special' && inp.a))) {
      if (f.state === 'special') f.cooldown[mv.id] = 0;
      this.startSuper(f);
      return;
    }
    // A smash attack charges while A is held, frozen halfway through its windup.
    if (mv.charge && f.t === Math.max(1, Math.floor(mv.startup / 2)) && inp.ah && f.charge < PH.chargeMax) {
      f.charge++; f.t--;
      f.chargeMul = 1 + PH.chargeBonus * (f.charge / PH.chargeMax);
      if (f.charge === 1) this.emit('charge', { f: f.i });
    }
    if (f.state === 'attack' && inp.a && f.t > mv.startup) f.queued = true;
    // A shot that grows while B is held (frozen at the end of its windup).
    if (mv.charge && mv.kind === 'shot' && f.t === mv.startup && inp.bh && (f.charge ?? 0) < mv.charge) { f.charge = (f.charge ?? 0) + 1; f.t--; }
    // Up + special in the air: cuts the end of an air attack short, or is
    // remembered for a moment if pressed earlier in it.
    if (inp.b && (inp.y ?? 0) < -0.5 && !f.grounded && !f.leapt && f.state === 'attack') {
      if (f.t > mv.startup + mv.active) { f.leapt = true; this.startMove(f, 'special', f.kind.recovery, sx); return; }
      f.wantLeap = 12;
    }
    const into = f.t - mv.startup, active = into > 0 && into <= mv.active;
    let float = false;
    // Moves that keep hitting (spins, rolls, waterspouts) start over every `rehit` frames.
    if (mv.rehit && active && into % mv.rehit === 0) f.hitDone.clear();
    if (f.state === 'special' || f.state === 'super') {
      const res = SP.stepSpecial(this, f, mv, inp, sx);
      if (res.done) { f.queued = false; f.move = null; this.setState(f, this.free(f)); return; }
      if (res.float) float = true;
    }
    // Herensuge's fire trail: burning patches left behind a charge.
    if (mv.trail && active && into % 5 === 0) this.objects.push({ kind: 'zone', id: mv.trail.id, owner: f.i, x: f.x - f.fx * 6, y: f.grounded ? f.y : (this.surfaceBelow(f.x, f.y) ?? f.y), w: 14, h: 12, life: mv.trail.life, move: mv.trail, tick: 0 });
    // A dash charges ahead during its active frames, in the air too.
    if (mv.kind === 'dash' && active) {
      f.vx = f.fx * (mv.distance / mv.active); f.vy = 0; float = true;
      // A charge along the ground stops at the edge rather than running off it.
      if (f.grounded && this.surfaceBelow(f.x + f.vx * 2, f.y - 0.5) !== f.y) { f.vx = 0; float = false; }
    }
    else if (mv.kind === 'dash' && into > mv.active) f.vx *= f.grounded ? 0.6 : 0.9;
    // The recovery leap: up and a little forward.
    if (mv.kind === 'leap' && f.t === mv.startup + 1) {
      if (!SP.startRecovery(this, f, mv, sx, inp.y ?? 0)) { f.vy = mv.vy * f.kind.jump; f.vx = sx * mv.vx; }
      f.grounded = false; f.fastFall = false;
    }
    // The talking ring: while it's on the rival, Tartalo's attacks lunge at them.
    if (f.homing > 0 && f.state === 'attack' && f.t <= mv.startup + 1) {
      const r = this.rival(f), gap = Math.abs(r.x - f.x) - (f.w + r.w) / 2 - 4;
      if (gap > 0) { f.fx = sign(r.x - f.x); f.x += f.fx * Math.min(gap, this.passive(f).homingSpeed ?? 4); }
    }
    // Specials and supers that make something happen do it as the startup ends.
    if (f.t === mv.startup + 1 && (f.state === 'special' || f.state === 'super') && !MELEE.has(mv.kind)) this.release(f, mv);
    // A grab that catches.
    if (f.state === 'grab' && active) {
      const r = this.rival(f), shape = this.hitShape(f);
      if (['idle', 'run', 'shield', 'landing', 'attack', 'special', 'dizzy', 'jumpsquat', 'grab'].includes(r.state) && r.grounded && !this.invulnerable(r) && this.touches(shape, r)) {
        f.holding = r.i; r.heldBy = f.i; r.move = null;
        f.hold = this.R.grab.hold + this.R.grab.holdPer * r.pct;
        this.setState(r, 'held'); this.setState(f, 'holding');
        this.emit('grabbed', { f: f.i, d: r.i });
        return;
      }
    }
    // In the air, steer a little during any move.
    if (!f.grounded && !float) {
      const max = f.speed * PH.airMax;
      f.vx = clamp(f.vx + sx * PH.airAccel * 0.6, -max, max);
      if (inp.dn && f.vy > -1) f.fastFall = true;
    } else if (f.grounded && mv.kind !== 'dash') f.vx *= 0.7;
    const landed = this.physics(f, sx, float);
    // Landing cuts an aerial short, with its landing lag.
    if (landed && f.state === 'attack' && mv.lag) { f.move = null; f.lag = into <= mv.active ? mv.lag : this.R.physics.landLag; this.setState(f, 'landing'); return; }
    if (f.t >= end) {
      if (mv.kind === 'leap') { f.move = null; this.setState(f, f.grounded ? 'idle' : f.leapt ? 'helpless' : 'air'); return; }
      if (f.state === 'attack' && f.kind.light.includes(mv)) {
        f.combo = (f.combo + 1) % f.kind.light.length;
        f.comboOpen = f.combo === 0 ? 0 : this.R.combo.window;
        if (f.queued && f.combo !== 0 && f.grounded) { f.queued = false; this.startMove(f, 'attack', f.kind.light[f.combo]); return; }
      }
      f.queued = false; f.move = null; this.setState(f, this.free(f));
    }
  }

  // ---- moving: gravity, platforms, ledges, the edge of the ring ---------------------------------

  // Moves a fighter one frame and keeps it on the stage. Returns true on landing.
  physics(f, sx = 0, float = false) {
    const PH = this.R.physics;
    if (!f.grounded && !float) {
      const cap = f.state === 'hitstun' ? PH.fallMax * 2 : f.fastFall ? PH.fastFall : PH.fallMax;
      // Storm-born: Eate falls slower.
      const slow = f.move?.kind === 'leap' && f.move.slow && f.vy < 0 ? f.move.slow : 1;
      const grav = PH.gravity * f.weight.grav * (this.passive(f).grav ?? 1) * slow;
      f.vy = f.fastFall && f.state !== 'hitstun' ? Math.max(f.vy, PH.fastFall) : Math.min(f.vy + grav, cap);
    }
    const px = f.x, py = f.y;
    f.x += f.vx; f.y += f.vy;
    let landed = false;
    const land = (y) => {
      f.y = y; f.vy = 0;
      if (!f.grounded) {
        landed = true; f.grounded = true; f.jumps = 0; f.airDodged = false; f.leapt = false; f.leaps = 0; f.fastFall = false; f.regrab = true;
        this.emit('touchdown', { f: f.i });
        if (f.state === 'air' || f.state === 'helpless') { f.lag = PH.landLag; this.setState(f, 'landing'); }
      }
    };
    // Solid things: the main platform, and landed stones.
    const solids = [...this.stage.solids];
    for (const o of this.objects) if (o.kind === 'boulder' && o.landed) solids.push({ x0: o.x - o.radius, x1: o.x + o.radius, top: o.y - o.radius * (o.dolmen ? 2.2 : 1.6), bottom: o.y });
    const half = f.w / 2;
    let support = false;
    for (const s of solids) {
      if (!(f.x + half > s.x0 && f.x - half < s.x1)) continue;
      if (f.vy >= 0 && py <= s.top + 0.01 && f.y >= s.top) { land(s.top); support = true; continue; }
      if (Math.abs(f.y - s.top) < 0.01 && f.vy >= 0) { support = true; continue; }
      if (f.y > s.top && f.y - f.h < s.bottom) {
        // Inside it: from below, bump the head; from the side, pushed back out.
        if (py - f.h >= s.bottom - 0.01) { f.y = s.bottom + f.h; f.vy = Math.max(0, f.vy); }
        // A low step on the ground is climbed like a stair.
        else if (f.grounded && s.top >= py - (PH.stepUp ?? 24)) { land(s.top); support = true; }
        else { f.x = px < (s.x0 + s.x1) / 2 ? s.x0 - half : s.x1 + half; f.vx = 0; }
      }
    }
    // Floating platforms: land on them from above, unless dropping through.
    for (const p of this.stage.platforms ?? []) {
      if (f.x < p.x0 || f.x > p.x1 || f.drop > 0) continue;
      if (f.vy >= 0 && py <= p.y + 0.01 && f.y >= p.y) { land(p.y); support = true; }
      else if (Math.abs(f.y - p.y) < 0.01 && f.grounded) support = true;
    }
    if (f.grounded && !support) { f.grounded = false; if (['idle', 'run', 'landing', 'shield'].includes(f.state)) this.setState(f, 'air'); }
    if (!f.grounded) this.tryLedge(f);
    // Lamia's wall: her rival stays on their own side of it.
    for (const w of this.objects) if (w.kind === 'wall' && w.life > 0 && w.owner !== f.i) {
      const min = w.w / 2 + half;
      if (w.side > 0 && f.x < w.x + min) { f.x = w.x + min; f.vx = Math.max(0, f.vx); }
      if (w.side < 0 && f.x > w.x - min) { f.x = w.x - min; f.vx = Math.min(0, f.vx); }
    }
    // Past the edge of the screen: out of the ring.
    const B = this.stage.blast;
    if (f.x < B.x0 || f.x > B.x1 || f.y > B.y1 || (f.y < B.y0 && f.state === 'hitstun')) this.ringOut(f);
    return landed;
  }

  ringOut(f) {
    f.stats.outs++;
    f.stocks--;
    const ex = clamp(f.x, 0, this.stage.world.w), ey = clamp(f.y - f.h / 2, 0, this.stage.world.h);
    this.setState(f, 'out');
    f.move = null; f.carried = null; f.respawnT = this.R.match.respawn;
    const r = this.rival(f);
    if (r.holding === f.i) { r.holding = -1; this.setState(r, 'idle'); }
    if (f.holding >= 0) { const h = this.fighters[f.holding]; h.heldBy = -1; this.setState(h, this.free(h)); f.holding = -1; }
    this.emit('out', { f: f.i, x: ex, y: ey, stocks: f.stocks });
  }

  respawn(f) {
    const s = this.stage.respawn ?? { x: 240, y: 70 };
    Object.assign(f, { x: s.x + (f.i === 0 ? -30 : 30), y: s.y, vx: 0, vy: 0, pct: 0, grounded: false, jumps: 1, leapt: false, airDodged: false, fastFall: false, shieldHP: this.R.shield.max, marked: 0, homing: 0 });
    f.invT = this.R.match.invincible;
    this.setState(f, 'respawn');
    this.emit('respawn', { f: f.i });
  }

  onPlatform(f) { return (this.stage.platforms ?? []).some((p) => f.x >= p.x0 && f.x <= p.x1 && Math.abs(f.y - p.y) < 0.01); }
  // Is a fighter in a stage's shallow water? (Lamia moves faster there.)
  onWater(f) { return (this.stage.water ?? []).some((w) => f.x >= w.x0 && f.x <= w.x1 && f.y >= w.y0 && f.y <= w.y1); }
  // The top of whatever is under a point (for the flock and stone shadows).
  surfaceBelow(x, y, mainOnly = false) {
    let best = null;
    // Solid blocks (mainOnly: only these, so stone rain falls through floating platforms).
    for (const s of this.stage.solids) if (x >= s.x0 && x <= s.x1 && s.top >= y - 0.01 && (best === null || s.top < best)) best = s.top;
    if (mainOnly) return best;
    for (const p of this.stage.platforms ?? []) if (x >= p.x0 && x <= p.x1 && p.y >= y - 0.01 && (best === null || p.y < best)) best = p.y;
    return best;
  }
  // Night: Gaueko's super (and, with the stages, darkness phases).
  isDark() { return this.dark > 0; }

  // ---- specials and supers that leave things on the stage ---------------------------------------

  release(f, mv) {
    if (SP.release(this, f, mv)) return;
    const r = this.rival(f), cy = f.y - f.h * 0.6;
    switch (mv.kind) {
      case 'boulder': case 'stone': {
        // An arcing rock aimed to come down near the rival; it stays where it lands.
        const t = (2 * Math.abs(mv.vy)) / mv.grav;
        const vx = clamp((r.x - f.x) / t, -mv.vxMax, mv.vxMax) || f.fx * mv.vxMax * 0.5;
        this.objects.push({ kind: 'boulder', dolmen: mv.kind === 'stone', owner: f.i, x: f.x + f.fx * 8, y: cy, vx, vy: mv.vy, radius: mv.radius, move: mv, landed: false, life: mv.obstacle });
        this.emit('throw', { f: f.i });
        break;
      }
      case 'blink': {
        // "Zer egin?": a short blink along the stick (up too), leaving a decoy behind.
        this.objects.push({ kind: 'decoy', owner: f.i, x: f.x, y: f.y, life: mv.decoy });
        let [dx, dy] = f.aim && Math.hypot(...f.aim) > 0.2 ? unit(...f.aim) : [-f.fx, 0];
        f.x += dx * mv.distance; f.y += dy * mv.distance;
        if (dy < 0) { f.grounded = false; f.vy = 0; }
        this.emit('blink', { f: f.i });
        break;
      }
      case 'stampede': {
        // The flock runs along the surface the rival is on (or the main
        // platform), from Basajaun's side, carrying them toward the edge.
        const y = this.surfaceBelow(r.x, r.y - 2) ?? this.stage.main.top;
        const dir = f.x <= r.x ? 1 : -1;
        const surf = (this.stage.platforms ?? []).find((p) => p.y === y && r.x >= p.x0 && r.x <= p.x1) ?? this.stage.solids.find((S) => S.top === y && r.x >= S.x0 && r.x <= S.x1) ?? this.stage.main;
        this.objects.push({ kind: 'flock', owner: f.i, x: dir > 0 ? surf.x0 + 2 : surf.x1 - 2, y, x0: surf.x0, x1: surf.x1, dir, speed: mv.speed, move: mv, hitsLeft: mv.hits, tick: 0 });
        this.emit('flock', { f: f.i, y, dir });
        break;
      }
      case 'swarm': {
        // Six mini imps pour out of the needle case and chase the rival.
        for (let n = 0; n < mv.imps; n++) {
          const a = (n / mv.imps) * Math.PI * 2;
          this.objects.push({ kind: 'imp', owner: f.i, x: f.x + Math.cos(a) * 12, y: cy + Math.sin(a) * 12, vx: Math.cos(a) * mv.speed, vy: Math.sin(a) * mv.speed, life: mv.life, radius: mv.radius, move: mv });
        }
        this.emit('swarm', { f: f.i });
        break;
      }
      case 'shot': case 'mark': {
        // A projectile: Lamia's golden comb (out and back), Gaueko's night
        // wind, Tartalo's talking ring; a fan of them (`count`, `spread`
        // degrees); one rolling along the ground; one grown by holding B.
        const n = mv.count ?? 1, grow = mv.charge ? 1 + (mv.grow ?? 1) * ((f.charge ?? 0) / mv.charge) : 1;
        for (let k = 0; k < n; k++) {
          const a = n > 1 ? ((k - (n - 1) / 2) * (mv.spread ?? 10) * Math.PI) / 180 : 0;
          const o = this.shot(f, grow > 1 ? { ...mv, damage: mv.damage * grow, kb: mv.kb * grow, radius: mv.radius * grow } : mv, f.fx * Math.cos(a), Math.sin(a));
          if (mv.roll) { o.y = f.y - o.radius; o.vy = 0; }
          this.objects.push(o);
        }
        this.emit('shot', { f: f.i, id: mv.id });
        break;
      }
      case 'burst': {
        // Seven-headed roar: a fireball from every head, all round.
        for (let n = 0; n < mv.count; n++) {
          const a = (n / mv.count) * Math.PI * 2 - Math.PI / 2;
          this.objects.push(this.shot(f, mv, Math.cos(a), Math.sin(a)));
        }
        this.emit('roar', { f: f.i });
        break;
      }
      case 'wall': {
        // Bridge before dawn: a stone wall from the stage to the sky between
        // them, which Lamia can pass and her rival cannot.
        const x = f.x + sign(r.x - f.x || f.fx) * mv.offset;
        this.objects.push({ kind: 'wall', owner: f.i, x, side: sign(r.x - x || f.fx), life: mv.duration, w: mv.thickness });
        this.emit('wall', { f: f.i, x });
        break;
      }
      case 'darkness': {
        // The night is for night-folk.
        this.dark = mv.duration; this.darkOwner = f.i;
        this.emit('dark', { f: f.i });
        break;
      }
      case 'heal': {
        // Healthy herd: damage taken off, the ring's curse gone, a short shield.
        f.pct = Math.max(0, f.pct - mv.restore);
        f.marked = 0;
        f.shield = mv.shield;
        this.emit('heal', { f: f.i, x: f.x, y: f.y });
        break;
      }
      case 'stonerain': {
        // Stone rain: stones fall from the sky round the rival, each shadow first.
        for (let n = 0; n < mv.count; n++) {
          const off = n === 0 ? 0 : (this.rng.next() * 2 - 1) * mv.spread;
          this.objects.push({ kind: 'boulder', fall: true, owner: f.i, x: clamp(r.x + off, 10, this.stage.world.w - 10), y: -20, vx: 0, vy: 0, wait: n * mv.stagger, radius: mv.radius, move: mv, landed: false, life: mv.obstacle, hits: mv.count });
        }
        this.emit('rain', { f: f.i });
        break;
      }
      default: break;
    }
  }

  shot(f, mv, ux, uy) {
    return { kind: 'shot', id: mv.id, owner: f.i, x: f.x + ux * 10, y: f.y - f.h * 0.6 + uy * 10, vx: ux * mv.speed, vy: uy * mv.speed, dist: 0, range: mv.range, radius: mv.radius, move: mv, leg: 0, hitLegs: new Set(), life: 1 };
  }


  stepObjects() {
    const PH = this.R.physics;
    for (const o of this.objects) {
      const owner = this.fighters[o.owner], target = this.rival(owner);
      if (SP.stepObject(this, o, owner, target)) continue;
      if (o.kind === 'flock' && o.single) {
        // Zaldiko gallops through: one knock, then off he goes.
        o.x += o.dir * o.speed;
        if (!o.hitDone && this.canBeHit(target) && Math.abs(target.y - o.y) < 10 && Math.abs(target.x - o.x) < 20) {
          o.hitDone = true;
          if (this.invulnerable(target)) this.perfectCheck(target); else this.hit(owner, target, o.move, 1, { x: o.x, y: o.y, dir: o.dir });
        }
        if (o.dir > 0 ? o.x > o.x1 + 20 : o.x < o.x0 - 20) o.life = 0;
        continue;
      }
      if (o.kind === 'boulder') {
        if (o.landed) { o.life--; continue; }
        if (o.wait > 0) { o.wait--; continue; } // a falling stone still waiting its turn
        o.vy += o.fall ? o.move.grav : o.move.grav;
        o.x += o.vx; o.y += o.vy;
        if (!o.hit && this.canBeHit(target) && this.touchesBody(target, o.x, o.y, o.radius)) {
          o.hit = true;
          if (this.invulnerable(target)) this.perfectCheck(target);
          else this.hit(owner, target, o.move, o.hits ?? 1, { x: o.x, y: o.y, dir: sign(o.vx || target.x - o.x) });
        }
        // It lands on whatever is under it and stays there as an obstacle.
        // (Stone rain comes down through the floating platforms.)
        const top = o.vy > 0 ? (o.fall ? this.surfaceBelow(o.x, o.y - o.vy - o.radius, true) : this.surfaceBelow(o.x, o.y - o.vy - o.radius)) : null;
        if (top !== null && o.y >= top) {
          o.y = top; o.landed = true; o.vx = 0; o.vy = 0;
          this.emit('land', { x: o.x, y: o.y });
          if (o.life <= 1) o.life = 0;
        }
        if (o.y > 330 || o.x < -40 || o.x > 520) o.life = 0;
      } else if (o.kind === 'decoy') {
        o.life--;
      } else if (o.kind === 'wall') {
        o.life--;
        if (o.life <= 0) this.emit('rooster', { x: o.x });
      } else if (o.kind === 'shot') {
        this.stepShot(o, owner, target);
      } else if (o.kind === 'flock') {
        o.x += o.dir * o.speed;
        o.tick++;
        // Anyone standing in its path is carried along, and worn a little.
        const inPath = this.canBeHit(target) && Math.abs(target.y - o.y) < 6 && Math.abs(target.x - o.x) < 26 && (target.carried === o || target.grounded);
        if (inPath && (target.carried === o || !this.invulnerable(target))) {
          target.carried = o; target.state = 'hitstun'; target.hitstun = 2; target.t = 0;
          target.x = o.x + o.dir * 18; target.y = o.y; target.vx = 0; target.vy = 0;
          if (o.hitsLeft > 1 && o.tick % 8 === 0) { o.hitsLeft--; this.hit(owner, target, o.move, o.move.hits, { x: o.x, y: o.y, dir: o.dir }, true); }
        } else if (inPath && this.invulnerable(target)) this.perfectCheck(target);
        // At the far edge the flock stops and the last bump launches whoever it carries.
        const atEdge = o.dir > 0 ? o.x >= o.x1 - 4 : o.x <= o.x0 + 4;
        if (atEdge) {
          if (target.carried === o) {
            target.carried = null;
            this.hit(owner, target, { ...o.move, kb: o.move.finalKb, growth: o.move.finalGrowth }, o.move.hits, { x: o.x, y: o.y, dir: o.dir });
          }
          o.life = 0;
        }
      } else if (o.kind === 'imp') {
        // Each imp steers toward the rival and pops on contact.
        o.life--;
        const [ux, uy] = unit(target.x - o.x, target.y - target.h / 2 - o.y);
        const sp = o.move.speed;
        o.vx += (ux * sp - o.vx) * o.move.turn; o.vy += (uy * sp - o.vy) * o.move.turn;
        o.x += o.vx; o.y += o.vy;
        if (this.canBeHit(target) && this.touchesBody(target, o.x, o.y, o.radius)) {
          if (this.invulnerable(target)) this.perfectCheck(target);
          else { o.life = 0; this.hit(owner, target, o.move, o.move.imps, { x: o.x, y: o.y, dir: sign(o.vx) }); }
        }
      }
    }
    if (this.dark > 0 && --this.dark === 0) this.emit('dawn');
    for (const f of this.fighters) if (f.carried && !this.objects.includes(f.carried)) { f.carried = null; this.setState(f, this.free(f)); }
    this.objects = this.objects.filter((o) => o.life === undefined || o.life > 0);
    void PH;
  }

  stepShot(o, owner, target) {
    const mv = o.move;
    if (mv.return && o.leg === 1) {
      // On the way back to the thrower.
      const [ux, uy] = unit(owner.x - o.x, owner.y - owner.h * 0.6 - o.y);
      o.vx = ux * mv.speed; o.vy = uy * mv.speed;
      if (Math.hypot(owner.x - o.x, owner.y - owner.h * 0.6 - o.y) < 10) { o.life = 0; return; }
    }
    o.x += o.vx; o.y += o.vy;
    if (mv.roll) {
      // Rolling along the ground; off an edge it falls.
      const top = this.surfaceBelow(o.x, o.y + o.radius - 1);
      if (top !== null && top - o.radius - o.y < 4) { o.y = top - o.radius; o.vy = 0; } else o.vy = Math.min(5, (o.vy ?? 0) + 0.3);
    }
    if (o.cool > 0) o.cool--;
    o.dist += mv.speed;
    if (o.leg === 0 && o.dist >= o.range) { if (mv.return) o.leg = 1; else { o.life = 0; return; } }
    if (o.x < -20 || o.x > 500 || o.y < -40 || o.y > 300) { if (mv.return && o.leg === 0) o.leg = 1; else { o.life = 0; return; } }
    // Stopped by a landed stone, the main platform, or a wall that isn't the thrower's.
    const blocked = this.stage.solids.some((S) => o.x > S.x0 && o.x < S.x1 && o.y > S.top && o.y < S.bottom)
      || this.objects.some((b) => (b.kind === 'boulder' && b.landed && Math.hypot(b.x - o.x, b.y - b.radius - o.y) < b.radius + o.radius)
        || (b.kind === 'wall' && b.owner !== o.owner && Math.abs(b.x - o.x) < b.w / 2 + o.radius));
    if (blocked) { if (mv.return && o.leg === 0) o.leg = 1; else o.life = 0; }
    if (o.life <= 0 || o.hitLegs.has(o.leg) || !this.canBeHit(target) || o.cool > 0) return;
    if (!this.touchesBody(target, o.x, o.y, o.radius)) return;
    // A whirlwind keeps hitting every `pierce` frames instead of stopping.
    if (mv.pierce) o.cool = mv.pierce; else o.hitLegs.add(o.leg);
    if (this.invulnerable(target)) { this.perfectCheck(target); return; }
    this.hit(owner, target, mv, 1, { x: o.x, y: o.y, dir: sign(o.vx || target.x - o.x) });
    if (mv.kind === 'mark') {
      target.marked = mv.duration; owner.homing = mv.duration;
      this.emit('marked', { f: target.i, x: target.x, y: target.y });
    }
    if (!mv.return && !mv.pierce) o.life = 0;
  }

  // ---- hits -----------------------------------------------------------------------------------

  // Attacks, grabs aside, and specials that hit with the body (a stomp, a
  // breath, a charge, the recovery leap), hit during their active frames.
  active(f) {
    const mv = f.move;
    if (!mv || f.t <= mv.startup || f.t > mv.startup + mv.active) return false;
    return f.state === 'attack' || ((f.state === 'special' || f.state === 'super') && (MELEE.has(mv.kind) || SP.BODY.has(mv.kind)));
  }

  // Where a move hits: a box (x ahead and y up from the feet), a stomp
  // along the ground both ways, or a cone of breath.
  hitShape(f) {
    const mv = f.move;
    if (mv.kind === 'ring') return { box: true, x: f.x, y: f.y - mv.height / 2, w: mv.radius * 2, h: mv.height };
    if (mv.kind === 'cone') return { cone: true, x: f.x + f.fx * f.w / 2, y: f.y - f.h * 0.6, fx: f.fx, range: mv.range, half: (mv.spread * Math.PI) / 360 };
    return { box: true, x: f.x + f.fx * (mv.x ?? 0), y: f.y - (mv.y ?? f.h / 2), w: mv.w ?? f.w, h: mv.h ?? f.h };
  }

  touches(shape, d) {
    if (shape.cone) {
      const px = clamp(shape.x, d.x - d.w / 2, d.x + d.w / 2), py = clamp(shape.y, d.y - d.h, d.y);
      const tx = d.x - shape.x, ty = d.y - d.h / 2 - shape.y, dist = Math.hypot(px - shape.x, py - shape.y);
      if (dist > shape.range) return false;
      if (dist < 6) return true;
      const ang = Math.acos(clamp((tx * shape.fx) / (Math.hypot(tx, ty) || 1), -1, 1));
      return ang <= shape.half + Math.atan2(d.h / 2, Math.hypot(tx, ty));
    }
    return Math.abs(d.x - shape.x) <= (shape.w + d.w) / 2 && Math.abs(d.y - d.h / 2 - shape.y) <= (shape.h + d.h) / 2;
  }

  // Does a circle touch a fighter's body?
  touchesBody(d, x, y, r) {
    const cx = clamp(x, d.x - d.w / 2, d.x + d.w / 2), cy = clamp(y, d.y - d.h, d.y);
    return Math.hypot(x - cx, y - cy) <= r;
  }
  canBeHit(d) { return !['out', 'bow', 'respawn'].includes(d.state); }

  invulnerable(f) {
    const D = this.R.dodge;
    if (f.invT > 0 || f.state === 'climb' || f.state === 'respawn') return true;
    return f.state === 'dodge' && f.t >= D.iframesFrom && f.t <= D.iframesTo;
  }

  // Avoided something while dodging: early in the dodge, a perfect dodge.
  perfectCheck(d) {
    if (d.state !== 'dodge') return;
    if (d.t - this.R.dodge.iframesFrom <= this.R.dodge.perfectWindow && !d.perfectThisRoll) {
      d.perfectThisRoll = true;
      this.addMeter(d, this.R.meter.perfectDodge);
      d.stats.perfects++;
      d.perfect = 40;
      this.freeze = Math.max(this.freeze, this.R.hitstop.base);
      this.emit('perfect', { f: d.i, x: d.x, y: d.y });
    }
  }

  resolveHits() {
    for (const f of this.fighters) if (f.state !== 'dodge') f.perfectThisRoll = false;
    for (const a of this.fighters) {
      if (!this.active(a) || a.hitDone.has(0)) continue;
      const d = this.rival(a), shape = this.hitShape(a);
      // A decoy in the way takes the blow instead, and pops.
      const decoy = this.objects.find((o) => o.kind === 'decoy' && o.owner === d.i && this.touches(shape, { x: o.x, y: o.y, w: d.w, h: d.h }));
      if (decoy && !this.touches(shape, d)) { decoy.life = 0; a.hitDone.add(0); this.emit('decoy', { x: decoy.x, y: decoy.y, f: d.i }); continue; }
      if (!this.canBeHit(d) || d.state === 'held' || !this.touches(shape, d)) continue;
      a.hitDone.add(0);
      if (this.invulnerable(d)) { this.perfectCheck(d); this.emit('miss', { f: a.i }); continue; }
      const dir = a.move.both ? sign(d.x - a.x) : a.move.back ? -a.fx : a.fx;
      this.hit(a, d, a.move, 1, { x: a.x, y: a.y, dir });
      // Tartalo's grab: the first blow holds the rival right in front of him.
      if (a.move?.grab && d.state === 'hitstun') { d.x = a.x + a.fx * (a.w + d.w) / 2; d.vx = 0; d.vy = 0; d.hitstun = Math.max(d.hitstun, 24); }
    }
  }

  // One hit: on a shield, it wears the shield down; otherwise damage
  // percentage, meters, a launch by weight and toughness, hitstun.
  hit(a, d, mv, hits = 1, from = { x: a.x, y: a.y, dir: a.fx }, hold = false) {
    // Gaueko's night veil: a blow on the guard is answered.
    if (!hold && SP.counterHit(this, a, d)) return;
    // Healthy herd's shield takes the blow.
    if (d.shield > 0) { this.emit('shielded', { f: d.i, x: d.x, y: d.y }); this.freeze = Math.max(this.freeze, this.R.hitstop.base); return; }
    const spread = this.R.stats.spread, Pa = this.passive(a), Pd = this.passive(d);
    let mod = a.chargeMul ?? 1;
    // One eye: hit from behind, Tartalo takes more.
    const behind = (from.x - d.x) * d.fx < -1;
    if (Pd.rearTaken && behind) mod *= Pd.rearTaken;
    // Night-born: stronger in the dark.
    if (Pa.darkDamage && this.isDark()) mod *= Pa.darkDamage;
    // Padded: Ziripot's hay soaks some of it up.
    if (Pd.damageTaken) mod *= Pd.damageTaken;
    // Balance between fighters (data: `tune`).
    mod *= a.kind.tune?.dealt ?? 1;
    const dmg = Math.max(1, Math.round(baseDamage(this.R, mv, a.kind, d.kind, hits) * mod * (1 + (this.rng.next() * 2 - 1) * spread)));
    const dir = from.dir ?? (sign(d.x - from.x) || a.fx);
    if (d.state === 'shield') {
      // The shield takes it: it shrinks, and the defender slides back.
      const SH = this.R.shield;
      d.shieldHP -= dmg * SH.damageMult;
      d.vx = dir * SH.push;
      this.freeze = Math.max(this.freeze, Math.round(dmg * SH.stunPer * 0.5));
      this.addMeter(a, dmg * this.R.meter.perDamageDealt * 0.3);
      this.emit('shieldHit', { a: a.i, d: d.i, x: d.x, y: d.y - d.h / 2 });
      if (d.shieldHP <= 0) this.breakShield(d);
      return;
    }
    d.pct = Math.min(999, d.pct + dmg);
    a.stats.dealt += dmg;
    this.addMeter(a, dmg * this.R.meter.perDamageDealt);
    this.addMeter(d, dmg * this.R.meter.perDamageTaken);
    // Stuns and special grabs instead of a launch.
    if (!hold && (mv.stun || typeof mv.grab === 'object') && SP.onHit(this, a, d, mv)) {
      this.freeze = Math.max(this.freeze, this.R.hitstop.base + 2);
      this.emit('hit', { a: a.i, d: d.i, dmg, pct: d.pct, v: 0, x: d.x, y: d.y - d.h / 2, el: elementModifier(this.R, a.kind.element, d.kind.element) });
      return;
    }
    const PH = this.R.physics;
    const v = hold ? 0 : launchSpeed(this.R, mv, d.kind, d.pct, (Pd.knock ?? 1) * (a.chargeMul ?? 1) * (a.kind.tune?.dealt ?? 1) * (d.kind.tune?.taken ?? 1));
    let angle = mv.angle ?? 40;
    if (angle < 0 && d.grounded) angle = 40; // a downward smash on someone standing pops them up
    const rad = (angle * Math.PI) / 180;
    // A super in progress isn't interrupted, and neither is anything by a
    // hit that holds instead of launching (a pummel, smoke, flames).
    if (d.state !== 'super' && !hold) {
      if (d.state === 'ledge' || d.state === 'climb') d.ledgeCD = 20;
      if (d.holding >= 0) { const h = this.fighters[d.holding]; h.heldBy = -1; this.setState(h, this.free(h)); d.holding = -1; }
      d.move = null; d.combo = 0; d.comboOpen = 0; d.queued = false; d.fastFall = false;
      // As in Super Smash Flash: being hit gives back the recovery and the air dodge.
      d.leapt = false; d.leaps = 0; d.airDodged = false;
      if (v >= PH.tumble) {
        d.vx = Math.cos(rad) * v * dir; d.vy = -Math.sin(rad) * v;
        if (d.vy < 0) d.grounded = false;
        d.hitstun = Math.round(clamp(v * PH.hitstunPer, PH.hitstunMin, PH.hitstunMax));
      } else { d.vx = dir * 0.6; d.hitstun = PH.hitstunMin; }
      if (!hold) this.setState(d, 'hitstun');
    }
    if (!hold && (mv.pull || mv.heal)) SP.onHit(this, a, d, mv);
    const HS = this.R.hitstop;
    this.freeze = Math.max(this.freeze, Math.round(Math.min(HS.max, HS.base + v * HS.perSpeed)));
    this.emit('hit', { a: a.i, d: d.i, dmg, pct: d.pct, v, x: d.x, y: d.y - d.h / 2, el: elementModifier(this.R, a.kind.element, d.kind.element), behind: behind && !!Pd.rearTaken, smash: (a.chargeMul ?? 1) > 1 || !!mv.charge });
  }

  // Bodies on the same footing push apart gently (no hard collisions: you can
  // cross over or under each other, as in the platform fighters).
  separate() {
    const [a, b] = this.fighters;
    if (!a.grounded || !b.grounded || Math.abs(a.y - b.y) > 2 || a.state === 'held' || b.state === 'held') return;
    const min = (a.w + b.w) / 2 * 0.95, dx = b.x - a.x;
    if (Math.abs(dx) >= min) return;
    const s = dx === 0 ? (a.i === 0 ? 1 : -1) : sign(dx), push = Math.min(this.R.physics.push, (min - Math.abs(dx)) / 2);
    const wa = b.weight.mass / (a.weight.mass + b.weight.mass);
    a.x -= s * push * wa * 2; b.x += s * push * (1 - wa) * 2;
  }
}

// Placeholder sound effects synthesised with WebAudio, so the game needs no
// audio files yet. Every cue here has a visual twin on screen (a bell and
// rings for the bell, a note for the whistle, words for everything else).

let ctx = null;
let master = null;
let volume = 0.7;

export function unlockAudio() {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    } else if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}

export function setVolume(level) {
  volume = Math.max(0, Math.min(10, level)) / 10;
  if (master) master.gain.value = volume;
}

function tone(freq, dur, { type = 'square', gain = 0.12, slide = 0, delay = 0 } = {}) {
  if (!ctx || volume === 0) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur, gain = 0.15, delay = 0) {
  if (!ctx || volume === 0) return;
  const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 900;
  s.buffer = buf; g.gain.value = gain;
  s.connect(f).connect(g).connect(master);
  s.start(ctx.currentTime + delay);
}


// A sheep: a wobbling nasal note.
function baa(freq = 330, delay = 0, gain = 0.07) {
  if (!ctx || volume === 0) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t0); o.frequency.linearRampToValueAtTime(freq * 0.9, t0 + 0.5);
  lfo.frequency.value = 22; lg.gain.value = freq * 0.06;
  lfo.connect(lg).connect(o.frequency);
  f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.5;
  g.gain.setValueAtTime(0.001, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
  o.connect(f).connect(g).connect(master);
  o.start(t0); lfo.start(t0); o.stop(t0 + 0.6); lfo.stop(t0 + 0.6);
}

// A little tune, as [frequency, beats] pairs (0 = rest).
function tune(notes, beat = 0.18, type = 'triangle', gain = 0.12) {
  let at = 0;
  for (const [f, b] of notes) { if (f) tone(f, beat * b * 0.95, { type, gain, delay: at }); at += beat * b; }
  return at;
}

const C5 = 523, D5 = 587, E5 = 659, F5 = 698, G5 = 784, A5 = 880, C6 = 1047;

export const sfx = {
  move: () => tone(520, 0.04, { gain: 0.06 }),
  ok: () => { tone(660, 0.06); tone(990, 0.08, { delay: 0.06 }); },
  beep: () => tone(440, 0.12, { type: 'triangle', gain: 0.18 }),
  go: () => tone(880, 0.3, { type: 'triangle', gain: 0.2 }),
  whistle: () => { tone(1500, 0.12, { type: 'sine', gain: 0.1, slide: 600 }); tone(1900, 0.18, { type: 'sine', gain: 0.1, slide: -500, delay: 0.14 }); },
  bell: () => { tone(1320, 0.5, { type: 'triangle', gain: 0.09 }); tone(1980, 0.3, { type: 'sine', gain: 0.04 }); tone(1320, 0.4, { type: 'triangle', gain: 0.06, delay: 0.25 }); },
  baa: (high = false) => baa(high ? 520 : 300 + Math.random() * 60),
  gate: () => { noise(0.12, 0.08); tone(140, 0.15, { type: 'square', gain: 0.05, slide: 60 }); },
  pour: () => { noise(0.5, 0.08); tone(300, 0.4, { type: 'sine', gain: 0.05, slide: 400 }); },
  empty: () => tone(180, 0.2, { gain: 0.06 }),
  fire: () => { noise(0.25, 0.1); tone(220, 0.2, { type: 'triangle', gain: 0.06, slide: 200 }); },
  wolf: () => { tone(330, 0.6, { type: 'sine', gain: 0.1, slide: 220 }); tone(550, 0.7, { type: 'sine', gain: 0.08, slide: -250, delay: 0.6 }); },
  wolfGone: () => tone(700, 0.3, { type: 'sine', gain: 0.07, slide: -400 }),
  thunder: () => { noise(1.4, 0.3); tone(55, 1.2, { type: 'sine', gain: 0.2, slide: -20 }); },
  warn: () => { tone(392, 0.25, { type: 'triangle', gain: 0.14 }); tone(330, 0.35, { type: 'triangle', gain: 0.14, delay: 0.28 }); },
  help: () => tune([[C5, 1], [E5, 1], [G5, 2]], 0.09),
  shelter: () => tune([[G5, 1], [C6, 1], [E5, 1], [G5, 2]], 0.1),
  star: () => tune([[E5, 1], [G5, 1], [C6, 2]], 0.1),
  miss: () => tone(200, 0.2, { type: 'triangle', gain: 0.08, slide: -60 }),
  finish: () => tune([[C5, 1], [E5, 1], [G5, 1], [E5, 1], [G5, 1], [C6, 3]], 0.13),
  // The ceremony: plain for tier 0, a dance for tier 3.
  ceremony: (tier) => {
    if (tier === 0) return tune([[G5, 2], [E5, 2], [C5, 4]], 0.22, 'sine', 0.08);
    const phrase = [[C5, 1], [E5, 1], [G5, 1], [E5, 1], [F5, 1], [A5, 1], [G5, 2], [E5, 1], [D5, 1], [C5, 2]];
    const times = tier >= 3 ? 2 : 1;
    let at = 0;
    for (let i = 0; i < times; i++) { for (const [f, b] of phrase) { tone(f, 0.16 * b * 0.9, { type: 'triangle', gain: 0.11, delay: at }); if (tier >= 2 && b >= 1) tone(f / 2, 0.08, { type: 'square', gain: 0.03, delay: at }); at += 0.16 * b; } }
    return at;
  },
};

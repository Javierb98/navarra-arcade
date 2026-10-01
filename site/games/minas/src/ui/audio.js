// Placeholder sound effects synthesised with WebAudio, so the game needs no
// audio files yet. Every cue here has a visual twin on screen.

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

// Soft, rounded sounds (triangle and sine, not chiptune squares).
const soft = (f, d, o = {}) => tone(f, d, { type: 'triangle', gain: 0.1, ...o });
export const sfx = {
  move: () => soft(620, 0.05, { gain: 0.06 }),
  ok: () => { soft(660, 0.08); soft(990, 0.1, { delay: 0.07 }); },
  ding: () => { soft(1320, 0.15, { gain: 0.07 }); soft(1760, 0.2, { gain: 0.05, delay: 0.06 }); },
  // The tool on rock: a dull knock for stone, a clink for iron and steel,
  // a rattle for the pneumatic hammer.
  dig: (level = 0) => {
    if (level === 0) { noise(0.06, 0.06); tone(140, 0.08, { type: 'sine', gain: 0.07 }); }
    else if (level < 3) { noise(0.04, 0.04); soft(1500 + Math.random() * 300, 0.06, { gain: 0.05 }); }
    else { noise(0.05, 0.04); tone(90, 0.05, { type: 'sine', gain: 0.04 }); }
  },
  creak: () => { tone(220, 0.35, { type: 'sawtooth', gain: 0.025, slide: -60 }); noise(0.2, 0.03, 0.1); },
  ore: () => { noise(0.06, 0.06); soft(880, 0.08, { gain: 0.08 }); soft(1320, 0.1, { gain: 0.07, delay: 0.06 }); },
  gas: () => { noise(0.7, 0.16); tone(90, 0.6, { type: 'sine', gain: 0.16, slide: -40 }); },
  crash: () => { noise(0.2, 0.12); tone(120, 0.15, { type: 'sine', gain: 0.12, slide: -50 }); },
  cash: () => [1319, 1568, 1760, 2093].forEach((f, i) => soft(f, 0.1, { delay: i * 0.05, gain: 0.1 })),
  buy: () => [660, 880, 1320].forEach((f, i) => soft(f, 0.1, { delay: i * 0.06 })),
  layer: () => [392, 523, 659].forEach((f, i) => soft(f, 0.25, { delay: i * 0.1, gain: 0.07 })),
  warn: () => { soft(880, 0.12, { gain: 0.08 }); soft(660, 0.16, { gain: 0.08, delay: 0.14 }); },
  rescue: () => { tone(1200, 0.4, { type: 'sine', gain: 0.08 }); tone(1200, 0.3, { type: 'sine', gain: 0.06, delay: 0.3 }); tone(900, 0.4, { type: 'sine', gain: 0.06, delay: 0.6 }); },
  // The pit whistle at the end of the shift.
  whistle: () => { tone(1046, 0.9, { type: 'sine', gain: 0.07 }); tone(1318, 0.9, { type: 'sine', gain: 0.05 }); },
  miss: () => tone(180, 0.12, { type: 'sine', gain: 0.07 }),
  win: () => { [523, 659, 784, 1047].forEach((f, i) => soft(f, 0.22, { delay: i * 0.14, gain: 0.12 })); },
};

// Placeholder sound effects synthesised with WebAudio, so the game needs no
// audio files yet. Every cue here has a visual twin in the race screen.

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
  splash: () => { noise(0.25, 0.08); tone(500, 0.15, { type: 'sine', gain: 0.05, slide: -200 }); },
  ding: () => { soft(1320, 0.15, { gain: 0.07 }); soft(1760, 0.2, { gain: 0.05, delay: 0.06 }); },
  rake: () => noise(0.18, 0.1),
  pick: () => { noise(0.08, 0.08); soft(440, 0.06, { gain: 0.06 }); },
  coin: () => { soft(1320, 0.08, { gain: 0.09 }); soft(1760, 0.1, { gain: 0.08, delay: 0.07 }); },
  buy: () => [660, 880, 1320].forEach((f, i) => soft(f, 0.1, { delay: i * 0.06 })),
  thunder: (k = 1) => { noise(1.2 * k + 0.3, 0.15 * k + 0.03); tone(55, 1.2 * k, { type: 'sine', gain: 0.18 * k, slide: -15 }); },
  miss: () => tone(180, 0.12, { type: 'sine', gain: 0.07 }),
  flor: () => [1047, 1319, 1568, 2093].forEach((f, i) => soft(f, 0.12, { delay: i * 0.05, gain: 0.08 })),
  streak: (n) => soft(523 * Math.pow(2, Math.min(n, 8) / 12), 0.12, { gain: 0.09 }),
  bell: () => { tone(1200, 0.4, { type: 'sine', gain: 0.08 }); tone(1800, 0.3, { type: 'sine', gain: 0.04, delay: 0.02 }); tone(1200, 0.3, { type: 'sine', gain: 0.06, delay: 0.3 }); },
  cash: () => [1319, 1568, 1760, 2093].forEach((f, i) => soft(f, 0.1, { delay: i * 0.05, gain: 0.1 })),
  bleat: () => tone(520, 0.35, { type: 'sawtooth', gain: 0.03, slide: -120 }),
  shoo: () => { noise(0.1, 0.08); soft(700, 0.08, { gain: 0.06 }); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => soft(f, 0.22, { delay: i * 0.14, gain: 0.12 })); },
};

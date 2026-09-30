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
  tick: () => soft(700, 0.12, { gain: 0.12 }),
  go: () => { soft(880, 0.25, { gain: 0.14 }); soft(1320, 0.3, { gain: 0.1, delay: 0.05 }); },
  // The axe biting into beech: a thock, deeper for a full stroke.
  chop: (power = 1) => { noise(0.08, 0.18 + power * 0.1); tone(140 + power * 40, 0.1, { type: 'sine', gain: 0.22, slide: -60 }); },
  glance: () => { tone(1500, 0.15, { type: 'triangle', gain: 0.07 }); noise(0.05, 0.05); },
  crack: () => { noise(0.4, 0.25); tone(90, 0.3, { type: 'sine', gain: 0.25, slide: -40 }); },
  heave: () => tone(160, 0.25, { type: 'sine', gain: 0.12, slide: 60 }),
  thud: () => { noise(0.2, 0.2); tone(70, 0.25, { type: 'sine', gain: 0.3, slide: -30 }); },
  step: () => noise(0.05, 0.05),
  drum: () => { tone(90, 0.18, { type: 'sine', gain: 0.3, slide: -30 }); noise(0.05, 0.08); },
  pull: (q = 1) => soft(300 + q * 200, 0.08, { gain: 0.07 }),
  miss: () => tone(180, 0.12, { type: 'sine', gain: 0.07 }),
  bell: () => { tone(880, 0.6, { type: 'sine', gain: 0.12 }); tone(1320, 0.5, { type: 'sine', gain: 0.06, delay: 0.02 }); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => soft(f, 0.22, { delay: i * 0.14, gain: 0.12 })); noise(2, 0.12, 0.2); },
};

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
  jump: () => tone(300, 0.14, { type: 'sine', gain: 0.1, slide: 260 }),
  land: () => noise(0.05, 0.05),
  bonk: () => tone(140, 0.08, { type: 'sine', gain: 0.14 }),
  break: () => { noise(0.22, 0.16); tone(110, 0.15, { type: 'sine', gain: 0.18, slide: -50 }); },
  swing: () => noise(0.08, 0.05),
  gold: () => [784, 988, 1175, 1568].forEach((f, i) => soft(f, 0.12, { delay: i * 0.06, gain: 0.09 })),
  orange: () => soft(880, 0.08, { gain: 0.08 }),
  heart: () => { soft(523, 0.12); soft(784, 0.16, { delay: 0.1 }); },
  shoo: () => { soft(700, 0.06); noise(0.12, 0.06, 0.03); },
  stork: () => tone(420, 0.06, { type: 'sine', gain: 0.05, slide: 80 }),
  hurt: () => tone(330, 0.3, { type: 'sine', gain: 0.14, slide: -180 }),
  fall: () => tone(520, 0.6, { type: 'sine', gain: 0.14, slide: -400 }),
  mantle: () => { soft(392, 0.08); soft(523, 0.1, { delay: 0.08 }); },
  reel: () => noise(0.04, 0.025),
  crumble: () => noise(0.35, 0.12),
  wobble: () => tone(200, 0.2, { type: 'sine', gain: 0.05 }),
  gust: () => noise(1.2, 0.07),
  won: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => soft(f, 0.2, { delay: i * 0.13, gain: 0.12 })),
  lost: () => [392, 330, 262].forEach((f, i) => soft(f, 0.3, { delay: i * 0.22 })),
  miss: () => tone(180, 0.1, { type: 'sine', gain: 0.06 }),
};

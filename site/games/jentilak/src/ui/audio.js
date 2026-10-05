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
  // A soft thump: a shove, not a blow.
  hit: (q = 1) => { noise(0.06, 0.12 + q * 0.08); tone(160 + q * 40, 0.08, { type: 'sine', gain: 0.14, slide: -50 }); },
  swing: () => noise(0.07, 0.04),
  dodge: () => tone(520, 0.1, { type: 'sine', gain: 0.05, slide: 300 }),
  perfect: () => [1047, 1568].forEach((f, i) => soft(f, 0.12, { delay: i * 0.05, gain: 0.09 })),
  special: () => { tone(220, 0.25, { type: 'triangle', gain: 0.1, slide: 200 }); noise(0.15, 0.06); },
  super: () => { [262, 330, 392, 523].forEach((f, i) => soft(f, 0.3, { delay: i * 0.06, gain: 0.1 })); noise(0.6, 0.08, 0.2); },
  bow: () => soft(392, 0.25, { gain: 0.07 }),
  // The txalaparta-like knock that opens a round.
  call: () => { tone(300, 0.1, { type: 'sine', gain: 0.16 }); tone(300, 0.1, { type: 'sine', gain: 0.16, delay: 0.14 }); },
  go: () => { soft(523, 0.1); soft(784, 0.18, { delay: 0.08 }); },
  down: () => { tone(330, 0.3, { type: 'sine', gain: 0.12, slide: -120 }); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => soft(f, 0.22, { delay: i * 0.14, gain: 0.12 })); noise(1.4, 0.08, 0.2); },
  miss: () => tone(180, 0.1, { type: 'sine', gain: 0.06 }),
  // Kukurruku: a rooster at dawn, as the lamia's wall crumbles.
  rooster: () => { tone(700, 0.12, { type: 'sawtooth', gain: 0.03, slide: 300 }); tone(1000, 0.3, { type: 'sawtooth', gain: 0.03, slide: -250, delay: 0.13 }); },
};

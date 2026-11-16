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

export const sfx = {
  move: () => tone(520, 0.04, { gain: 0.06 }),
  ok: () => { tone(660, 0.06); tone(990, 0.08, { delay: 0.06 }); },
  beep: () => tone(440, 0.12, { type: 'triangle', gain: 0.18 }),
  go: () => tone(880, 0.3, { type: 'triangle', gain: 0.2 }),
  bump: (p) => { noise(0.18, Math.min(0.35, 0.08 + p / 150)); tone(90, 0.15, { type: 'sine', gain: 0.25, slide: -40 }); },
  stroke: () => noise(0.12, 0.08),
  together: () => { tone(523, 0.08, { type: 'triangle' }); tone(784, 0.12, { type: 'triangle', delay: 0.05 }); },
  order: () => { tone(660, 0.08); tone(880, 0.08, { delay: 0.08 }); tone(1320, 0.14, { delay: 0.16 }); },
  loose: () => { tone(300, 0.2, { slide: -120 }); tone(300, 0.2, { slide: -120, delay: 0.25 }); },
  logLost: () => tone(400, 0.4, { type: 'triangle', slide: -300, gain: 0.16 }),
  lashBeat: () => tone(220, 0.05, { type: 'sine', gain: 0.1 }),
  lashPress: () => tone(700, 0.05, { gain: 0.08 }),
  knot: () => tone(990, 0.1, { type: 'triangle', gain: 0.16 }),
  miss: () => tone(160, 0.1, { gain: 0.06 }),
  lashDone: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, { type: 'triangle', delay: i * 0.08 })),
  weir: (clean) => { noise(0.6, 0.2); if (clean) tone(784, 0.3, { type: 'triangle', delay: 0.3 }); },
  duck: () => { tone(600, 0.08, { type: 'sawtooth', slide: -250, gain: 0.08 }); tone(600, 0.08, { type: 'sawtooth', slide: -250, gain: 0.08, delay: 0.12 }); },
  splash: () => noise(0.3, 0.12),
  cheer: () => {
    for (let i = 0; i < 6; i++) noise(0.25, 0.05 + (i % 2) * 0.03, i * 0.09);
    tone(1200, 0.25, { type: 'sine', gain: 0.06, slide: 500, delay: 0.1 }); // a whistle from the bridge
    tone(1400, 0.2, { type: 'sine', gain: 0.05, slide: -300, delay: 0.4 });
  },
  whirl: () => { tone(300, 0.7, { type: 'triangle', gain: 0.12, slide: -180 }); noise(0.6, 0.1); },
  finish: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'triangle', delay: i * 0.12 })),
};

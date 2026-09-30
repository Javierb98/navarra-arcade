// Records a short loop of real gameplay from each game for the menu's
// preview panel: assets/previews/<id>.webm, plus a still (<id>.jpg) for the
// game's card.
//
// Needs: the games running (./fire-up-arcade --all --no-open), Google Chrome,
// playwright-core (npm i --no-save playwright-core, or point PLAYWRIGHT_CORE at
// one), and the ffmpeg that Playwright installs (npx playwright install ffmpeg).
//
//   node tools/record-previews.mjs            # every game
//   node tools/record-previews.mjs pelota     # just one

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(HERE, 'assets', 'previews');
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FPS = 25, SIZE = [640, 360];

function findFfmpeg() {
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  for (const d of existsSync(cache) ? readdirSync(cache) : []) {
    if (!d.startsWith('ffmpeg')) continue;
    for (const f of readdirSync(join(cache, d))) if (f.startsWith('ffmpeg')) return join(cache, d, f);
  }
  return 'ffmpeg';
}
const FFMPEG = findFfmpeg();

// ---- per-game scripts: get into play, then act while the camera rolls ----------

const wait = (page, ms) => page.waitForTimeout(ms);
const tap = async (page, key, ms = 70) => { await page.keyboard.down(key); await wait(page, ms); await page.keyboard.up(key); await wait(page, 220); };
const hold = async (page, key, ms) => { await page.keyboard.down(key); await wait(page, ms); await page.keyboard.up(key); };

const GAMES = {
  almadia: {
    async setup(page) {
      await page.goto('http://localhost:8710/'); await wait(page, 2500);
      for (let k = 0; k < 5; k++) await tap(page, 'Digit1');
      await wait(page, 3500);
      await page.keyboard.down('ArrowUp');
    },
    async act(page, secs) {
      const end = Date.now() + secs * 1000;
      for (let k = 0; Date.now() < end; k++) await hold(page, k % 2 ? 'ArrowLeft' : 'ArrowRight', 500 + (k % 3) * 250);
    },
  },
  'pax-avant': {
    async setup(page) {
      await page.goto('http://localhost:8720/'); await wait(page, 2500);
      for (let k = 0; k < 5; k++) await tap(page, 'Digit1');
      await tap(page, 'KeyZ'); await wait(page, 2500);
    },
    async act(page, secs) {
      // Both shepherds open their pens and start the flocks up the paths.
      await tap(page, 'KeyC'); await tap(page, 'KeyQ');
      const moves = [['ArrowUp', 'KeyW', 1400], ['ArrowRight', 'KeyA', 700], ['ArrowUp', 'KeyW', 1600], ['KeyC', 'KeyQ', 200], ['ArrowUp', 'KeyW', 1500], ['ArrowRight', 'KeyA', 600], ['ArrowUp', 'KeyW', 2000]];
      const end = Date.now() + secs * 1000;
      for (let k = 0; Date.now() < end; k++) {
        const [a, b, ms] = moves[k % moves.length];
        await page.keyboard.down(a); await page.keyboard.down(b); await wait(page, ms); await page.keyboard.up(a); await page.keyboard.up(b);
      }
    },
  },
  pelota: {
    async setup(page) {
      await page.goto('http://localhost:8750/?debug&light=sunset'); await wait(page, 2500);
      for (let k = 0; k < 20 && !(await page.evaluate(() => !!window.match)); k++) { await tap(page, k < 2 ? 'Digit1' : 'KeyZ'); await wait(page, 450); }
      // Let the computer play both sides, and skip ahead to a good rally.
      await page.evaluate(() => { const m = window.match; m.p[0].ai = true; m.p[0].prof = m.p[1].prof; m.to = 99; });
      await wait(page, 6000);
    },
    async act(page, secs) { await wait(page, secs * 1000); },
  },
  kirolak: {
    async setup(page) {
      await page.goto('http://localhost:8760/?debug&event=aizkolaritza'); await wait(page, 2500);
      for (let k = 0; k < 12 && !(await page.evaluate(() => !!document.querySelector('.event-card'))); k++) { await tap(page, 'Digit1'); await wait(page, 500); }
      await tap(page, 'KeyZ'); await wait(page, 3800);
    },
    async act(page, secs) {
      // Both chop in rhythm, a beat apart.
      const end = Date.now() + secs * 1000;
      for (let k = 0; Date.now() < end; k++) { await tap(page, k % 2 ? 'KeyX' : 'KeyZ'); await wait(page, 60); await tap(page, k % 2 ? 'KeyR' : 'KeyE'); await wait(page, 120); }
    },
  },
  espadas: {
    async setup(page) {
      await page.goto('http://localhost:8740/'); await wait(page, 2000);
      await page.getByText('Play ›').nth(1).click(); await wait(page, 1500);
      for (const n of ['Skip', 'Continue ›', 'Continue ›', 'Auto-deploy', 'Begin the battle']) { await page.getByRole('button', { name: n }).first().click(); await wait(page, 1200); }
      await page.getByRole('button', { name: /Sound the horn/ }).first().click(); await wait(page, 300);
      await page.evaluate(() => scrollTo(0, 0)); // keep the painted battle in view, not the board
      await wait(page, 300);
    },
    async act(page, secs) { await wait(page, secs * 1000); },
  },
};

// ---- recording ------------------------------------------------------------------

async function record(id, secs = 12) {
  const game = GAMES[id];
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await game.setup(page);
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ t: f.metadata.timestamp, data: Buffer.from(f.data, 'base64') });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 960, maxHeight: 540, everyNthFrame: 1 });
  await game.act(page, secs);
  await cdp.send('Page.stopScreencast');
  await browser.close();
  if (frames.length < 2) throw new Error(`${id}: no frames`);

  // Frames arrive when the page changes; lay them out on a steady clock.
  const t0 = frames[0].t, n = Math.floor((frames.at(-1).t - t0) * FPS);
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-vf', `scale=${SIZE[0]}:${SIZE[1]}`, '-c:v', 'vp8', '-b:v', '1100k', '-quality', 'good', '-cpu-used', '2', '-an', join(OUT, `${id}.webm`)], { stdio: ['pipe', 'inherit', 'inherit'] });
  let j = 0;
  for (let k = 0; k < n; k++) {
    while (j + 1 < frames.length && frames[j + 1].t - t0 <= k / FPS) j++;
    if (!ff.stdin.write(frames[j].data)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((r, x) => ff.on('close', (code) => (code ? x(new Error(`ffmpeg ${code}`)) : r())));
  // A still for the card, from a third of the way in (the frames are JPEGs already).
  writeFileSync(join(OUT, `${id}.jpg`), frames[Math.floor(frames.length / 3)].data);
  console.log(`${id}: ${n} frames (${(n / FPS).toFixed(1)} s) -> assets/previews/${id}.webm`);
}

mkdirSync(OUT, { recursive: true });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(GAMES);
const games = JSON.parse(readFileSync(join(HERE, 'games.json'), 'utf8'));
for (const id of ids) {
  if (!GAMES[id]) { console.error(`no recording script for ${id}`); continue; }
  if (!(games.games ?? games).some((g) => g.id === id)) console.warn(`${id} is not in games.json`);
  await record(id);
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('games.json', root), 'utf8'));
const strings = JSON.parse(readFileSync(new URL('data/strings.json', root), 'utf8'));

test('every port is unique and outside 8000-8010', () => {
  const ports = [config.menuPort, ...config.games.map((g) => g.port)];
  assert.equal(new Set(ports).size, ports.length, 'two servers on one port');
  for (const p of ports) assert.ok(p < 8000 || p > 8010, `port ${p} is in the forbidden range`);
});

test('every listed game has a folder, a title and blurb in all three languages, and its picture', () => {
  for (const g of config.games) {
    assert.ok(['ready', 'soon', 'hidden'].includes(g.status), `${g.id}: bad status`);
    if (g.status === 'hidden') continue;
    assert.ok(existsSync(new URL(g.folder + '/index.html', root)), `${g.id}: no index.html in ${g.folder}`);
    for (const l of ['es', 'eu', 'en']) {
      for (const f of ['title', 'blurb', 'lesson', 'era', 'place', 'controls']) assert.ok(g[f]?.[l], `${g.id}: missing ${f} in ${l}`);
    }
    if (g.thumb && !g.thumb.startsWith('art:')) assert.ok(existsSync(new URL(g.thumb, root)), `${g.id}: thumbnail missing`);
  }
});

test('every game has an online address', () => {
  for (const g of config.games.filter((x) => x.status !== 'hidden')) assert.equal(g.url, `games/${g.id}/`, `${g.id}: url should be games/<id>/`);
});

test('ready games know how to come back to the menu', () => {
  for (const g of config.games.filter((x) => x.status === 'ready')) {
    assert.ok(existsSync(new URL(g.folder + '/src/ui/arcade.js', root)), `${g.id}: no src/ui/arcade.js exit hook`);
  }
});

test('menu strings exist in every language', () => {
  const keys = Object.keys(strings.es);
  for (const l of ['eu', 'en']) for (const k of keys) assert.ok(strings[l][k], `${l}: missing ${k}`);
});

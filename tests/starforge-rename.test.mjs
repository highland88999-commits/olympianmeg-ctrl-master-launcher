// tests/starforge-rename.test.mjs — pins the Starforge reskin rename.
//
// The classic look is gone outright: no "Settlers of Olympus" / "Catan"
// strings remain in the game files, the old route redirects, the new
// registry seat exists in both registries, and the background is Myriad's.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  RESOURCES, DEV_LABEL, createGame, aiStep,
} from '../lib/starforge/engine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

function placedGame(seed, expansions) {
  const g = createGame(seed, 'You', { allAI: true, expansions });
  let guard = 0;
  while (g.phase === 'placement' && guard++ < 200) aiStep(g);
  assert.equal(g.phase, 'roll');
  return g;
}

const GAME_FILES = [
  'lib/starforge/engine.js',
  'lib/starforge/rooms-server.js',
  'app/starforge/page.jsx',
  'components/starforge/graphics.jsx',
  'tests/starforge.test.mjs',
  'tests/starforge-expansions.test.mjs',
  'tests/starforge-pvp.test.mjs',
];

test('rename: no "Settlers of Olympus" or "Catan" strings remain in the game files', () => {
  for (const f of GAME_FILES) {
    const src = read(f);
    assert.ok(!src.includes('Settlers of Olympus'), `${f} still names Settlers of Olympus`);
    assert.ok(!/catan/i.test(src), `${f} still mentions Catan`);
  }
});

test('rename: resources, terrains and dev cards are all Starforge names', () => {
  assert.deepEqual(RESOURCES, ['iron', 'waterIce', 'silicon', 'titanium', 'gold']);
  const g = createGame(42);
  for (const h of g.hexes) {
    assert.ok(
      ['iron', 'silicon', 'titanium', 'waterIce', 'gold', 'void'].includes(h.terrain),
      `old terrain on the board: ${h.terrain}`,
    );
  }
  assert.equal(g.hexes[g.voidPirateHex].terrain, 'void');
  assert.deepEqual(
    Object.values(DEV_LABEL).sort(),
    ['Discovery', 'Market Corner', 'Starfighter', 'Supply Drop', 'Warp Lane Rush'].sort(),
  );
  // No old resource keys survive as resource keys.
  for (const old of ['wood', 'sheep', 'wheat', 'brick', 'ore']) {
    assert.ok(!RESOURCES.includes(old), `old resource still listed: ${old}`);
  }
  // Starfarers: the sea is deep space, the gold choice hex is a gold vein.
  const sf = placedGame(11, { starfarers: true });
  assert.ok(sf.hexes.some((h) => h.terrain === 'sea'), 'starfarers board has sea hexes');
  assert.ok(sf.hexes.some((h) => h.terrain === 'goldVein'), 'starfarers board has a gold vein hex');
});

test('rename: registry seat is starforge in both files, old seat gone', () => {
  const menus = read('lib/god-menus.js');
  const sats = read('lib/i18n/satellites.ts');
  assert.ok(menus.includes("'starforge'"), 'god-menus has no starforge seat');
  assert.ok(!menus.includes('settlers-of-olympus'), 'god-menus still lists settlers-of-olympus');
  assert.ok(
    sats.includes('{ key: "starforge", route: "/starforge", pos: "ARES", section: "GAMES", constellation: "ZEUS" }'),
    'satellites.ts has no starforge seat (ARES / GAMES / ZEUS)',
  );
  assert.ok(!sats.includes('settlers-of-olympus'), 'satellites.ts still lists settlers-of-olympus');
});

test('rename: old route redirects to /starforge; new route file exists', () => {
  const cfg = read('next.config.js');
  assert.ok(cfg.includes("source: '/settlers-of-olympus'"), 'no redirect source for the old route');
  assert.ok(cfg.includes("destination: '/starforge'"), 'redirect does not land on /starforge');
  assert.ok(existsSync(path.join(root, 'app/starforge/page.jsx')), 'app/starforge/page.jsx missing');
  assert.ok(!existsSync(path.join(root, 'app/settlers-of-olympus')), 'old route directory still exists');
});

test('rename: page background is Myriad’s universe, not a generic starfield', () => {
  const page = read('app/starforge/page.jsx');
  assert.ok(page.includes("url('/images/myriad/bg.webp')"), 'page does not use the Myriad sky asset');
  assert.ok(page.includes('#0b1026'), 'page background is not in the Myriad palette');
  assert.ok(existsSync(path.join(root, 'public/images/myriad/bg.webp')), 'Myriad bg.webp asset missing');
  assert.ok(page.includes('Starforge'), 'page does not say Starforge');
});

test('rename: graphics carry the new art, not the old (pine/sheep/wheat) art', () => {
  const gfx = read('components/starforge/graphics.jsx');
  for (const old of ['Pine', 'WheatStalk', 'function Silicon']) {
    assert.ok(!gfx.includes(old), `old art helper still present: ${old}`);
  }
  for (const art of ['Asteroid', 'Crystal', 'Ridge', 'IceShard', 'OutpostPiece', 'StationPiece', 'WarpLanePiece', 'StarfighterPiece', 'VoidPiratePiece', 'CorsairPiece', 'MenuArt', 'TradeHubArt']) {
    assert.ok(gfx.includes(art), `missing art export: ${art}`);
  }
  assert.ok(gfx.includes('Starforge'), 'MenuArt does not say Starforge');
});

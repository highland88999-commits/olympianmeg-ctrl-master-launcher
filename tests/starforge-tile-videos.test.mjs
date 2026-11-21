// tests/starforge-tile-videos.test.mjs — Starforge hex-tile videos, action-orb
// button images, and golden dice with silver pips.
// Run: node --test tests/starforge-tile-videos.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGame } from '../lib/starforge/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const graphicsSrc = readFileSync(join(root, 'components/starforge/graphics.jsx'), 'utf8');
const pageSrc = readFileSync(join(root, 'app/starforge/page.jsx'), 'utf8');
const tilesDir = join(root, 'public/videos/starforge/tiles');
const buttonsDir = join(root, 'public/images/starforge/buttons');

// --- Tile videos on disk ---------------------------------------------------

const EXPECTED_TILE_VIDEOS = ['iron', 'silicon', 'titanium', 'water-ice', 'gold', 'void'];

test('all six tile videos exist on disk with sane sizes', () => {
  const onDisk = readdirSync(tilesDir).filter((f) => f.endsWith('.mp4')).sort();
  assert.deepEqual(onDisk, [...EXPECTED_TILE_VIDEOS].sort().map((n) => `${n}.mp4`));
  let total = 0;
  for (const name of EXPECTED_TILE_VIDEOS) {
    const p = join(tilesDir, `${name}.mp4`);
    const size = statSync(p).size;
    assert.ok(size > 10_000, `${name}.mp4 is suspiciously small: ${size}`);
    assert.ok(size < 200_000, `${name}.mp4 is too big for a hex-face loop: ${size}`);
    // MP4 magic: 'ftyp' at byte 4.
    const head = readFileSync(p).subarray(0, 12);
    assert.equal(head.subarray(4, 8).toString('ascii'), 'ftyp', `${name}.mp4 is not an MP4`);
    total += size;
  }
  // 19 hexes share 6 files; the whole tile-video set must stay in the same
  // weight class as the card videos (~1.4 MB for 6) — far under it, in fact.
  assert.ok(total < 1_000_000, `total tile video weight too big: ${total}`);
});

test('terrain mapping: every terrain key maps to one of the 6 tile videos', () => {
  const mapBlock = graphicsSrc.slice(
    graphicsSrc.indexOf('const TILE_VIDEO'),
    graphicsSrc.indexOf('};', graphicsSrc.indexOf('const TILE_VIDEO')) + 2,
  );
  // Base terrains map to their own video; expansion terrains reuse the closest.
  const expected = {
    iron: 'iron', silicon: 'silicon', titanium: 'titanium',
    waterIce: 'water-ice', gold: 'gold', void: 'void',
    goldVein: 'gold', lake: 'water-ice', sea: 'void', oasis: 'gold',
  };
  for (const [terrain, video] of Object.entries(expected)) {
    assert.ok(mapBlock.includes(`${terrain}: '${video}'`), `${terrain} must map to ${video}`);
    assert.ok(EXPECTED_TILE_VIDEOS.includes(video), `${video} is one of the 6 tile videos`);
  }
  // No other terrain key sneaks in.
  assert.ok(!mapBlock.includes('desert'), 'no invented desert terrain key');
});

test('tile video wiring: foreignObject clip, lazy loop, SVG fallback underneath', () => {
  assert.ok(graphicsSrc.includes('<foreignObject'), 'tile video rides in a foreignObject inside the board SVG');
  assert.ok(graphicsSrc.includes('clipPath: HEX_CLIP'), 'video is clipped to the hex shape');
  assert.ok(graphicsSrc.includes("polygon(93.3% 25%, 50% 0%, 6.7% 25%, 6.7% 75%, 50% 100%, 93.3% 75%)"), 'hex clip polygon is the pointy-top hex');
  assert.ok(graphicsSrc.includes('src={`/videos/starforge/tiles/${video}.mp4`}'), 'tile video src');
  for (const attr of ['autoPlay', 'muted', 'loop', 'playsInline', 'preload="none"']) {
    assert.ok(graphicsSrc.includes(attr), `tile video must carry ${attr}`);
  }
  // SVG art stays underneath as the poster/fallback: HexTileArt still draws
  // the hex polygon + HexArt before the video layer.
  const hexFn = graphicsSrc.slice(graphicsSrc.indexOf('export function HexTileArt'));
  assert.ok(hexFn.indexOf('<polygon points={HEX_POINTS}') < hexFn.indexOf('<HexTileVideo'), 'SVG hex renders before the video layer');
  assert.ok(hexFn.indexOf('<HexArt terrain={terrain} />') < hexFn.indexOf('<HexTileVideo'), 'SVG art renders before the video layer');
});

test('tokens and pirate stay on top of the tile videos', () => {
  // Token disc is opaque (#f5eeda, no opacity) and renders after HexTileArt
  // in the page's hex <g>; same for the void pirate piece.
  const hexBlock = pageSrc.slice(pageSrc.indexOf('{game.hexes.map((h) => {'));
  const tileAt = hexBlock.indexOf('<HexTileArt');
  const tokenAt = hexBlock.indexOf('r={13} fill="#f5eeda"');
  const pirateAt = hexBlock.indexOf('<VoidPiratePiece');
  assert.ok(tileAt > -1 && tokenAt > tileAt, 'number token renders after (on top of) the tile video');
  assert.ok(pirateAt > tileAt, 'void pirate renders after (on top of) the tile video');
  assert.ok(!hexBlock.slice(tokenAt, tokenAt + 80).includes('opacity'), 'token disc stays fully opaque');
});

test('base board still deals 19 hexes in the 6-video terrain counts', () => {
  const g = createGame(42);
  const counts = {};
  for (const h of g.hexes) counts[h.terrain] = (counts[h.terrain] || 0) + 1;
  assert.equal(g.hexes.length, 19);
  assert.deepEqual(counts, { iron: 4, silicon: 4, titanium: 4, waterIce: 3, gold: 3, void: 1 });
});

// --- Button images ---------------------------------------------------------

const EXPECTED_BUTTONS = {
  Roll: 'roll', Build: 'build', Trade: 'trade', Cards: 'cards', 'End turn': 'end-turn',
};

test('all five action-orb images exist on disk with sane sizes', () => {
  const onDisk = readdirSync(buttonsDir).filter((f) => f.endsWith('.webp')).sort();
  assert.deepEqual(onDisk, Object.values(EXPECTED_BUTTONS).sort().map((n) => `${n}.webp`));
  let total = 0;
  for (const name of Object.values(EXPECTED_BUTTONS)) {
    const size = statSync(join(buttonsDir, `${name}.webp`)).size;
    assert.ok(size > 500, `${name}.webp is suspiciously small: ${size}`);
    assert.ok(size < 50_000, `${name}.webp is too big for a 56px orb: ${size}`);
    total += size;
  }
  assert.ok(total < 100_000, `total button image weight too big: ${total}`);
});

test('button images wrap exactly the five action orbs', () => {
  // Orb renders an <img> when given an image; otherwise the emoji symbol.
  assert.ok(pageSrc.includes('function Orb({ symbol, label, onClick, disabled, active, small, image })'), 'Orb takes an image prop');
  assert.ok(pageSrc.includes('<img src={image}'), 'Orb renders the image');
  assert.ok(pageSrc.includes("objectFit: 'cover'"), 'orb image covers the circle');
  for (const [label, name] of Object.entries(EXPECTED_BUTTONS)) {
    assert.ok(pageSrc.includes(`label="${label}"`), `${label} orb exists`);
    assert.ok(pageSrc.includes(`image="/images/starforge/buttons/${name}.webp"`), `${label} orb carries the ${name} image`);
  }
  // No other orb gets an image: exactly five image= props on Orb call sites.
  const imageProps = pageSrc.match(/image="\/images\/starforge\/buttons\/[a-z-]+\.webp"/g) || [];
  assert.equal(imageProps.length, 5, `exactly 5 orbs carry images, found ${imageProps.length}`);
  // Dice-result display and trade/bank buttons are NOT part of this: the
  // dice row still uses DiceFace, not images.
  assert.ok(pageSrc.includes('<DiceFace value={game.dice[0]}'), 'dice display still uses DiceFace');
});

// --- Golden dice -----------------------------------------------------------

test('dice are golden with silver pips; event die keeps its themed faces', () => {
  const diceBlock = graphicsSrc.slice(graphicsSrc.indexOf('export function DiceFace'));
  // Gold gradient on the face, silver pips — no red/yellow die left.
  assert.ok(diceBlock.includes('sfDiceGold'), 'dice use the gold gradient');
  assert.ok(diceBlock.includes("fill=\"url(#sfDiceGold)\""), 'die face is gold');
  assert.ok(diceBlock.includes("const pipColor = '#e5e7eb'"), 'pips are silver');
  assert.ok(!diceBlock.includes('#dc2626'), 'no red die fill remains');
  assert.ok(!diceBlock.includes('#eab308'), 'no yellow die fill remains');
  assert.ok(diceBlock.includes('gold die:'), 'aria label names the gold die');
  // Event die: themed faces kept, only the base went gold.
  assert.ok(diceBlock.includes('<EventFaceArt face={face} />'), 'event die still renders its themed face');
  assert.ok(graphicsSrc.includes("face === 'fleet'") && graphicsSrc.includes("face === 'research'")
    && graphicsSrc.includes("face === 'commerce'"), 'all event faces still exist');
  // Commerce face's gold disc went silver-white so it reads on the gold base.
  const commerce = graphicsSrc.slice(graphicsSrc.indexOf("face === 'commerce'"));
  assert.ok(commerce.slice(0, 400).includes('fill="#e5e7eb"'), 'commerce disc is silver on gold');
});
